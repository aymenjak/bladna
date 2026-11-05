// Authentication module (spec §14, §52, §145).
//
// Lifecycle: register → verify email → login (TOTP step-up when enabled) →
// refresh (rotating tokens) → logout; plus password reset/change, MFA
// setup/enable/disable with recovery codes, session management and profile.
//
// Contract notes for other modules:
//  - handlers validated with body()/query()/pathParams() and return plain data
//    (auto-wrapped in the success envelope) or a Response when cookies/status
//    must be set (setAuthCookies/clearAuthCookies append Set-Cookie headers).
//  - every write emits an audit row; account-sensitive events also notify.

import {
  checkPasswordPolicy,
  createTotpSetup,
  generateOpaqueSecret,
  generateRecoveryCodes,
  hashToken,
  passwordHasher,
  rateLimiter,
  verifyTotp,
} from '@bladna/auth';
import { getPrisma } from '@bladna/database';
import { parseVolunteerIdFormat, renderVolunteerId } from '@bladna/domain';
import { AppError, type LocaleCode, type SystemRole } from '@bladna/types';
import { buildPageMeta, normalizePageParams, resolveLocale } from '@bladna/utils';
import {
  AGE_OF_MAJORITY,
  ageOn,
  changePasswordSchema,
  enableTwoFactorSchema,
  forgotPasswordSchema,
  idParamsSchema,
  loginSchema,
  mfaVerifySchema,
  paginationQuerySchema,
  registerSchema,
  refreshTokenSchema,
  resetPasswordSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from '@bladna/validation';
import { clearAuthCookies, readCookie, REFRESH_COOKIE, setAuthCookies } from '../cookies';
import { env } from '../env';
import { sendEmail } from '../infra/email';
import { renderResetEmail, renderVerifyEmail } from '../email/templates';
import { body, json, pathParams, query, type RequestContext } from '../http';
import { getSessionUser, requireAuth } from '../guards';
import { encryptSecret, decryptSecret } from '../lib/crypto';
import { isUniqueViolation } from '../lib/prisma-errors';
import { audit } from '../services/audit';
import { notify } from '../services/notifications';
import {
  createSession,
  markMfaSatisfied,
  revokeSession,
  revokeUserSessions,
  rotateSession,
} from '../services/sessions';
import type { AppRoute } from '../router';

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

/** Per-account throttle on top of the per-IP tier (password-spraying defense). */
const LOGIN_ATTEMPT_RULE = { limit: 10, windowMs: 15 * 60_000 };

const INVALID_CREDENTIALS = 'Invalid email or password.';

const USER_SELECT = {
  id: true,
  email: true,
  phone: true,
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  profileImage: true,
  preferredLanguage: true,
  roles: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
} as const;

/** Structural shape of a user row fetched with USER_SELECT (keeps handlers decoupled from Prisma generics). */
interface UserRecord {
  id: string;
  email: string;
  phone: string | null;
  firstName: string;
  lastName: string;
  dateOfBirth: Date | null;
  profileImage: string | null;
  preferredLanguage: string;
  roles: string[];
  status: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

function publicUser(row: UserRecord) {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    firstName: row.firstName,
    lastName: row.lastName,
    dateOfBirth: row.dateOfBirth,
    profileImage: row.profileImage,
    preferredLanguage: resolveLocale(row.preferredLanguage.toLowerCase()),
    roles: row.roles as SystemRole[],
    status: row.status,
    emailVerified: row.emailVerifiedAt !== null,
    createdAt: row.createdAt,
  };
}

function localeOf(preferredLanguage: string): LocaleCode {
  return resolveLocale(preferredLanguage.toLowerCase());
}

function auditAuth(
  ctx: RequestContext,
  action: string,
  actorUserId: string,
  extra: { entityType?: string; entityId?: string; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  return audit({
    actorUserId,
    action,
    entityType: extra.entityType ?? 'user',
    entityId: extra.entityId ?? actorUserId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
    ...(extra.metadata ? { metadata: extra.metadata } : {}),
  });
}

/** Equalizes timing for unknown accounts so email existence cannot be probed. */
let timingEqualizerHash: string | undefined;
async function equalizeTiming(password: string): Promise<void> {
  timingEqualizerHash ??= await passwordHasher.hash('bladna-timing-equalizer');
  await passwordHasher.verify(password, timingEqualizerHash);
}

/** Issues a fresh email-verification token (previous outstanding ones are consumed). */
async function issueEmailVerification(userId: string): Promise<string> {
  const prisma = getPrisma();
  const token = generateOpaqueSecret();
  await prisma.authToken.updateMany({
    where: { userId, type: 'EMAIL_VERIFICATION', consumedAt: null },
    data: { consumedAt: new Date() },
  });
  await prisma.authToken.create({
    data: {
      userId,
      type: 'EMAIL_VERIFICATION',
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
    },
  });
  return token;
}

/** Renders + sends the verification email. Failures are logged, never swallowed silently. */
async function dispatchVerificationEmail(row: UserRecord, token: string): Promise<boolean> {
  const locale = localeOf(row.preferredLanguage);
  const rendered = renderVerifyEmail(locale, token, `${row.firstName} ${row.lastName}`);
  try {
    await sendEmail({
      to: row.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      locale,
      tags: ['email_verification'],
    });
    return true;
  } catch (error) {
    console.error('[auth] verification email failed', error);
    return false;
  }
}

const SECURITY_NOTICE: Record<LocaleCode, { title: string; body: string }> = {
  ar: {
    title: 'تم تغيير كلمة المرور',
    body: 'تم تغيير كلمة المرور لحسابك على بلادنا. إذا لم تكن أنت من فعل ذلك، تواصل مع الدعم فورًا.',
  },
  fr: {
    title: 'Mot de passe modifié',
    body: 'Le mot de passe de votre compte BLADNA a été modifié. Si ce n’est pas vous, contactez le support immédiatement.',
  },
  en: {
    title: 'Password changed',
    body: 'Your BLADNA account password was changed. If this was not you, contact support immediately.',
  },
};

async function notifySecurity(
  userId: string,
  preferredLanguage: string,
  event: string,
): Promise<void> {
  const copy = SECURITY_NOTICE[localeOf(preferredLanguage)];
  await notify({
    userId,
    type: 'SECURITY_ALERT',
    title: copy.title,
    body: copy.body,
    data: { event },
  });
}

// ── Handlers ────────────────────────────────────────────────────

async function register(ctx: RequestContext): Promise<unknown> {
  const input = await body(ctx, registerSchema);

  const policy = checkPasswordPolicy(input.password, { email: input.email });
  if (!policy.ok) {
    throw AppError.validation(
      'Password does not meet the security policy.',
      policy.problems.map((code) => ({ path: 'password', code, message: code })),
    );
  }

  const prisma = getPrisma();
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, deletedAt: true },
  });
  if (existing && !existing.deletedAt) {
    throw AppError.conflict('An account with this email already exists.');
  }

  const isMinor = ageOn(input.dateOfBirth) < AGE_OF_MAJORITY;
  const passwordHash = await passwordHasher.hash(input.password);
  const roles: SystemRole[] = input.accountType === 'VOLUNTEER' ? ['USER', 'VOLUNTEER'] : ['USER'];
  const preferredLanguage = input.preferredLanguage.toUpperCase() as 'AR' | 'FR' | 'EN';

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone ?? null,
          dateOfBirth: input.dateOfBirth,
          preferredLanguage,
          roles,
        },
        select: USER_SELECT,
      });

      // Minor (Law 18-07): the schema already required a guardian and the
      // `guardian_consent` purpose; keep who consented next to the ledger row.
      if (isMinor && input.guardian) {
        await tx.guardianConsent.create({
          data: {
            userId: user.id,
            guardianName: input.guardian.fullName,
            relationship: input.guardian.relationship,
            guardianEmail: input.guardian.email ?? null,
            guardianPhone: input.guardian.phone ?? null,
            policyVersion: env.policyVersion,
            ipAddress: ctx.ip === 'local' ? null : ctx.ip,
          },
        });
      }

      // Consent ledger: purpose + policy version + IP, per §54.
      await tx.privacyConsent.createMany({
        data: input.consents.map((purpose) => ({
          userId: user.id,
          purpose,
          policyVersion: env.policyVersion,
          ipAddress: ctx.ip === 'local' ? null : ctx.ip,
        })),
      });

      if (input.accountType === 'VOLUNTEER') {
        const counter = await tx.counter.upsert({
          where: { name: 'volunteer_id' },
          update: { value: { increment: 1 } },
          create: { name: 'volunteer_id', value: 1 },
        });
        const formatSetting = await tx.setting.findUnique({ where: { key: 'volunteerId.format' } });
        const format = parseVolunteerIdFormat(
          typeof formatSetting?.value === 'string' ? formatSetting.value : null,
        );
        await tx.volunteerProfile.create({
          data: {
            userId: user.id,
            volunteerId: renderVolunteerId(format, counter.value),
            publicToken: generateOpaqueSecret(24),
          },
        });
      }

      return user;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AppError.conflict('This email or phone number is already registered.');
    }
    throw error;
  }

  const verificationToken = await issueEmailVerification(created.id);
  const emailVerificationSent = await dispatchVerificationEmail(created, verificationToken);

  const tokens = await createSession(created.id, roles, {
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    mfaSatisfied: false,
  });
  await auditAuth(ctx, 'auth.register', created.id, {
    metadata: { accountType: input.accountType, minor: isMinor },
  });

  const response = json(
    { user: created, emailVerificationSent },
    { requestId: ctx.requestId },
    { status: 201 },
  );
  setAuthCookies(response, tokens);
  return response;
}

async function verifyEmail(ctx: RequestContext): Promise<unknown> {
  const input = await body(ctx, verifyEmailSchema);
  const prisma = getPrisma();

  const record = await prisma.authToken.findUnique({
    where: { tokenHash: hashToken(input.token) },
    include: { user: { select: { id: true, emailVerifiedAt: true } } },
  });
  if (
    !record ||
    record.type !== 'EMAIL_VERIFICATION' ||
    record.consumedAt !== null ||
    record.expiresAt.getTime() <= Date.now()
  ) {
    throw AppError.validation('This verification link is invalid or has expired.');
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: record.user.emailVerifiedAt ?? new Date() },
    }),
    prisma.authToken.updateMany({
      where: { userId: record.userId, type: 'EMAIL_VERIFICATION', consumedAt: null },
      data: { consumedAt: new Date() },
    }),
  ]);

  await auditAuth(ctx, 'auth.verify_email', record.userId);
  return { verified: true };
}

async function resendVerification(ctx: RequestContext): Promise<unknown> {
  const sessionUser = await requireAuth(ctx);
  if (sessionUser.emailVerified) {
    return { sent: false, alreadyVerified: true };
  }
  const prisma = getPrisma();
  const row = await prisma.user.findUnique({
    where: { id: sessionUser.userId },
    select: USER_SELECT,
  });
  if (!row) throw AppError.notFound('Account not found.');

  const token = await issueEmailVerification(sessionUser.userId);
  const sent = await dispatchVerificationEmail(row, token);
  await auditAuth(ctx, 'auth.verification_resent', sessionUser.userId, { metadata: { sent } });
  return { sent };
}

async function login(ctx: RequestContext): Promise<unknown> {
  const input = await body(ctx, loginSchema);

  const accountKey = `login:${input.email}`;
  if (!rateLimiter.consume(accountKey, LOGIN_ATTEMPT_RULE).allowed) {
    throw AppError.rateLimited(
      'Too many sign-in attempts for this account. Try again in a few minutes.',
    );
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { twoFactor: { select: { enabledAt: true, secretEnc: true } } },
  });

  if (!user || user.deletedAt) {
    await equalizeTiming(input.password);
    throw AppError.unauthorized(INVALID_CREDENTIALS);
  }

  const validPassword = await passwordHasher.verify(input.password, user.passwordHash);
  if (!validPassword) {
    await auditAuth(ctx, 'auth.login_failed', user.id, {
      metadata: { reason: 'invalid_password' },
    });
    throw AppError.unauthorized(INVALID_CREDENTIALS);
  }

  if (['SUSPENDED', 'BANNED', 'DELETED'].includes(user.status)) {
    const until =
      user.suspendedUntil && user.suspendedUntil.getTime() > Date.now()
        ? ` until ${user.suspendedUntil.toISOString().slice(0, 10)}`
        : '';
    throw AppError.forbidden(`This account is not active${until}.`);
  }

  const totp = user.twoFactor?.enabledAt ? user.twoFactor : null;

  // TOTP enabled but no code yet: establish an MFA-pending session. requireAuth
  // keeps it locked to the MFA endpoints until the code is verified (step-up).
  if (totp && !input.totpCode) {
    const tokens = await createSession(user.id, user.roles, {
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      mfaSatisfied: false,
    });
    await auditAuth(ctx, 'auth.login_mfa_pending', user.id, {
      entityType: 'session',
      entityId: tokens.sessionId,
    });
    const response = json(
      { user: publicUser(user), mfaRequired: true },
      { requestId: ctx.requestId },
    );
    setAuthCookies(response, tokens);
    return response;
  }

  let mfaSatisfied = false;
  if (totp) {
    if (
      !verifyTotp({ secretBase32: decryptSecret(totp.secretEnc), token: input.totpCode ?? '' })
        .valid
    ) {
      await auditAuth(ctx, 'auth.login_failed', user.id, { metadata: { reason: 'invalid_totp' } });
      throw AppError.unauthorized('Invalid two-factor authentication code.');
    }
    mfaSatisfied = true;
  }

  rateLimiter.reset(accountKey);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const tokens = await createSession(user.id, user.roles, {
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    mfaSatisfied,
  });
  await auditAuth(ctx, 'auth.login', user.id, {
    entityType: 'session',
    entityId: tokens.sessionId,
    metadata: { mfa: mfaSatisfied },
  });

  const response = json(
    { user: publicUser(user), mfaRequired: false },
    { requestId: ctx.requestId },
  );
  setAuthCookies(response, tokens);
  return response;
}

async function mfaVerify(ctx: RequestContext): Promise<unknown> {
  const sessionUser = await requireAuth(ctx);
  const input = await body(ctx, mfaVerifySchema);
  const prisma = getPrisma();

  const twoFactor = await prisma.twoFactorSecret.findUnique({
    where: { userId: sessionUser.userId },
  });
  if (!twoFactor?.enabledAt) {
    throw AppError.businessRule(
      'Two-factor authentication is not enabled for this account. Complete the setup first.',
    );
  }

  if (/^\d{6}$/.test(input.code)) {
    if (
      !verifyTotp({ secretBase32: decryptSecret(twoFactor.secretEnc), token: input.code }).valid
    ) {
      throw AppError.unauthorized('Invalid two-factor authentication code.');
    }
    await markMfaSatisfied(sessionUser.sessionId);
    await auditAuth(ctx, 'auth.mfa_verified', sessionUser.userId, {
      entityType: 'session',
      entityId: sessionUser.sessionId,
      metadata: { method: 'totp' },
    });
    return { verified: true, method: 'TOTP' };
  }

  const codeHash = hashToken(input.code.toUpperCase());
  const recovery = await prisma.recoveryCode.findFirst({
    where: { userId: sessionUser.userId, codeHash, usedAt: null },
  });
  if (!recovery) {
    throw AppError.unauthorized('Invalid two-factor authentication code.');
  }
  await prisma.recoveryCode.update({ where: { id: recovery.id }, data: { usedAt: new Date() } });
  await markMfaSatisfied(sessionUser.sessionId);
  const remaining = await prisma.recoveryCode.count({
    where: { userId: sessionUser.userId, usedAt: null },
  });
  await auditAuth(ctx, 'auth.mfa_verified', sessionUser.userId, {
    entityType: 'session',
    entityId: sessionUser.sessionId,
    metadata: { method: 'recovery_code', remaining },
  });
  return { verified: true, method: 'RECOVERY_CODE', remainingRecoveryCodes: remaining };
}

async function twoFactorSetup(ctx: RequestContext): Promise<unknown> {
  const sessionUser = await requireAuth(ctx);
  const prisma = getPrisma();

  const existing = await prisma.twoFactorSecret.findUnique({
    where: { userId: sessionUser.userId },
  });
  if (existing?.enabledAt) {
    throw AppError.conflict('Two-factor authentication is already enabled. Disable it first.');
  }

  const setup = createTotpSetup({ userId: sessionUser.userId, email: sessionUser.email });
  const secretEnc = encryptSecret(setup.secret);
  await prisma.twoFactorSecret.upsert({
    where: { userId: sessionUser.userId },
    update: { secretEnc },
    create: { userId: sessionUser.userId, secretEnc },
  });
  await auditAuth(ctx, 'auth.mfa_setup', sessionUser.userId);
  // The provisioning URI (which embeds the secret) is returned exactly once per
  // setup so the client can render the QR code; it is never readable afterwards.
  return { otpauthUri: setup.otpauthUri };
}

async function twoFactorEnable(ctx: RequestContext): Promise<unknown> {
  const sessionUser = await requireAuth(ctx);
  const input = await body(ctx, enableTwoFactorSchema);
  const prisma = getPrisma();

  const twoFactor = await prisma.twoFactorSecret.findUnique({
    where: { userId: sessionUser.userId },
  });
  if (twoFactor?.enabledAt) {
    throw AppError.conflict('Two-factor authentication is already enabled.');
  }
  if (!twoFactor) {
    throw AppError.businessRule('Run the two-factor setup step first.');
  }
  if (!verifyTotp({ secretBase32: decryptSecret(twoFactor.secretEnc), token: input.code }).valid) {
    throw AppError.unauthorized('Invalid two-factor authentication code.');
  }

  const recoveryCodes = generateRecoveryCodes(8);
  await prisma.$transaction([
    prisma.twoFactorSecret.update({
      where: { userId: sessionUser.userId },
      data: { enabledAt: new Date() },
    }),
    prisma.recoveryCode.deleteMany({ where: { userId: sessionUser.userId } }),
    prisma.recoveryCode.createMany({
      data: recoveryCodes.map((code) => ({
        userId: sessionUser.userId,
        codeHash: hashToken(code),
      })),
    }),
  ]);

  // Enabling 2FA signs out every other session (spec §145).
  await revokeUserSessions(sessionUser.userId, 'two_factor_enabled', sessionUser.sessionId);
  await markMfaSatisfied(sessionUser.sessionId);
  await auditAuth(ctx, 'auth.mfa_enabled', sessionUser.userId);

  // Shown exactly once — stored only as hashes.
  return { enabled: true, recoveryCodes };
}

async function twoFactorDisable(ctx: RequestContext): Promise<unknown> {
  const sessionUser = await requireAuth(ctx);
  const input = await body(ctx, mfaVerifySchema);
  const prisma = getPrisma();

  const twoFactor = await prisma.twoFactorSecret.findUnique({
    where: { userId: sessionUser.userId },
  });
  if (!twoFactor?.enabledAt) {
    throw AppError.businessRule('Two-factor authentication is not enabled.');
  }

  let method: 'TOTP' | 'RECOVERY_CODE';
  if (/^\d{6}$/.test(input.code)) {
    if (
      !verifyTotp({ secretBase32: decryptSecret(twoFactor.secretEnc), token: input.code }).valid
    ) {
      throw AppError.unauthorized('Invalid two-factor authentication code.');
    }
    method = 'TOTP';
  } else {
    const recovery = await prisma.recoveryCode.findFirst({
      where: {
        userId: sessionUser.userId,
        codeHash: hashToken(input.code.toUpperCase()),
        usedAt: null,
      },
    });
    if (!recovery) throw AppError.unauthorized('Invalid two-factor authentication code.');
    await prisma.recoveryCode.update({ where: { id: recovery.id }, data: { usedAt: new Date() } });
    method = 'RECOVERY_CODE';
  }

  await prisma.$transaction([
    prisma.twoFactorSecret.deleteMany({ where: { userId: sessionUser.userId } }),
    prisma.recoveryCode.deleteMany({ where: { userId: sessionUser.userId } }),
    // Privileged sessions must re-prove MFA after 2FA is removed.
    prisma.session.updateMany({
      where: { userId: sessionUser.userId, revokedAt: null },
      data: { mfaSatisfiedAt: null },
    }),
  ]);

  await auditAuth(ctx, 'auth.mfa_disabled', sessionUser.userId, { metadata: { method } });
  return { ok: true };
}

async function twoFactorStatus(ctx: RequestContext): Promise<unknown> {
  const sessionUser = await requireAuth(ctx);
  const twoFactor = await getPrisma().twoFactorSecret.findUnique({
    where: { userId: sessionUser.userId },
    select: { enabledAt: true },
  });
  return { enabled: twoFactor?.enabledAt != null, satisfied: sessionUser.mfaSatisfied };
}

async function forgotPassword(ctx: RequestContext): Promise<unknown> {
  const input = await body(ctx, forgotPasswordSchema);
  const prisma = getPrisma();

  // Always the same response — never reveals whether the email exists.
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { ...USER_SELECT, deletedAt: true },
  });
  if (user && !user.deletedAt && !['SUSPENDED', 'BANNED', 'DELETED'].includes(user.status)) {
    await prisma.authToken.updateMany({
      where: { userId: user.id, type: 'PASSWORD_RESET', consumedAt: null },
      data: { consumedAt: new Date() },
    });
    const token = generateOpaqueSecret();
    await prisma.authToken.create({
      data: {
        userId: user.id,
        type: 'PASSWORD_RESET',
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });

    const locale = localeOf(user.preferredLanguage);
    const rendered = renderResetEmail(locale, token, `${user.firstName} ${user.lastName}`);
    try {
      await sendEmail({
        to: user.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        locale,
        tags: ['password_reset'],
      });
    } catch (error) {
      console.error('[auth] password reset email failed', error);
    }
    await auditAuth(ctx, 'auth.password_reset_requested', user.id);
  }
  return { ok: true };
}

async function resetPassword(ctx: RequestContext): Promise<unknown> {
  const input = await body(ctx, resetPasswordSchema);
  const prisma = getPrisma();

  const record = await prisma.authToken.findUnique({
    where: { tokenHash: hashToken(input.token) },
    include: {
      user: {
        select: { id: true, email: true, status: true, deletedAt: true, preferredLanguage: true },
      },
    },
  });
  if (
    !record ||
    record.type !== 'PASSWORD_RESET' ||
    record.consumedAt !== null ||
    record.expiresAt.getTime() <= Date.now()
  ) {
    throw AppError.validation('This reset link is invalid or has expired.');
  }
  if (record.user.deletedAt || ['SUSPENDED', 'BANNED', 'DELETED'].includes(record.user.status)) {
    throw AppError.forbidden('This account is not active.');
  }

  const policy = checkPasswordPolicy(input.password, { email: record.user.email });
  if (!policy.ok) {
    throw AppError.validation(
      'Password does not meet the security policy.',
      policy.problems.map((code) => ({ path: 'password', code, message: code })),
    );
  }

  const passwordHash = await passwordHasher.hash(input.password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.authToken.updateMany({
      where: { userId: record.userId, type: 'PASSWORD_RESET', consumedAt: null },
      data: { consumedAt: new Date() },
    }),
  ]);
  // A reset means the old credentials are gone: end every session.
  await revokeUserSessions(record.userId, 'password_reset');

  await auditAuth(ctx, 'auth.password_reset', record.userId);
  await notifySecurity(record.userId, record.user.preferredLanguage, 'password_reset');
  return { ok: true };
}

async function changePassword(ctx: RequestContext): Promise<unknown> {
  const sessionUser = await requireAuth(ctx);
  const input = await body(ctx, changePasswordSchema);
  const prisma = getPrisma();

  const row = await prisma.user.findUnique({
    where: { id: sessionUser.userId },
    select: { id: true, email: true, passwordHash: true, preferredLanguage: true },
  });
  if (!row) throw AppError.notFound('Account not found.');

  const currentOk = await passwordHasher.verify(input.currentPassword, row.passwordHash);
  if (!currentOk) {
    throw AppError.validation('Current password is incorrect.', [
      { path: 'currentPassword', code: 'invalid', message: 'Current password is incorrect.' },
    ]);
  }
  if (input.newPassword === input.currentPassword) {
    throw AppError.validation('The new password must be different from the current one.', [
      { path: 'newPassword', code: 'same_password', message: 'Choose a different password.' },
    ]);
  }
  const policy = checkPasswordPolicy(input.newPassword, { email: row.email });
  if (!policy.ok) {
    throw AppError.validation(
      'Password does not meet the security policy.',
      policy.problems.map((code) => ({ path: 'newPassword', code, message: code })),
    );
  }

  await prisma.user.update({
    where: { id: row.id },
    data: { passwordHash: await passwordHasher.hash(input.newPassword) },
  });
  const revokedSessions = input.logoutEverywhere
    ? await revokeUserSessions(row.id, 'password_change', sessionUser.sessionId)
    : 0;

  await auditAuth(ctx, 'auth.password_changed', row.id, { metadata: { revokedSessions } });
  await notifySecurity(row.id, row.preferredLanguage, 'password_change');
  return { ok: true, revokedSessions };
}

async function refresh(ctx: RequestContext): Promise<unknown> {
  // Cookie first (browser flow); body variant exists for mobile clients.
  let presented = readCookie(ctx.request, REFRESH_COOKIE);
  if (!presented) {
    let payload: unknown = null;
    try {
      payload = await ctx.request.json();
    } catch {
      payload = null;
    }
    const parsed = refreshTokenSchema.safeParse(payload ?? {});
    presented = parsed.success ? (parsed.data.refreshToken ?? null) : null;
  }
  if (!presented) {
    throw AppError.unauthorized('No active session.');
  }

  const tokens = await rotateSession(presented, { ip: ctx.ip, userAgent: ctx.userAgent });
  const prisma = getPrisma();
  const session = await prisma.session.findUnique({
    where: { id: tokens.sessionId },
    select: { user: { select: USER_SELECT } },
  });

  const response = json(
    {
      ok: true,
      expiresIn: tokens.accessTtl,
      ...(session ? { user: publicUser(session.user) } : {}),
    },
    { requestId: ctx.requestId },
  );
  setAuthCookies(response, tokens);
  return response;
}

async function logout(ctx: RequestContext): Promise<unknown> {
  const sessionUser = await getSessionUser(ctx);
  let sessionId = sessionUser?.sessionId ?? null;

  if (!sessionId) {
    // No valid access token — resolve the session straight from the refresh cookie.
    const presented = readCookie(ctx.request, REFRESH_COOKIE);
    if (presented) {
      const found = await getPrisma().session.findUnique({
        where: { refreshTokenHash: hashToken(presented) },
        select: { id: true },
      });
      sessionId = found?.id ?? null;
    }
  }

  if (sessionId) {
    await revokeSession(sessionId, 'logout');
    if (sessionUser) {
      await auditAuth(ctx, 'auth.logout', sessionUser.userId, {
        entityType: 'session',
        entityId: sessionId,
      });
    }
  }

  const response = json({ ok: true }, { requestId: ctx.requestId });
  clearAuthCookies(response);
  return response;
}

async function logoutAll(ctx: RequestContext): Promise<unknown> {
  const sessionUser = await requireAuth(ctx);
  const revokedSessions = await revokeUserSessions(sessionUser.userId, 'logout_all');
  await auditAuth(ctx, 'auth.sessions_revoked', sessionUser.userId, {
    metadata: { revokedSessions },
  });

  const response = json({ ok: true, revokedSessions }, { requestId: ctx.requestId });
  clearAuthCookies(response);
  return response;
}

export async function me(ctx: RequestContext): Promise<unknown> {
  const sessionUser = await requireAuth(ctx);
  const row = await getPrisma().user.findUnique({
    where: { id: sessionUser.userId },
    select: { ...USER_SELECT, twoFactor: { select: { enabledAt: true } } },
  });
  if (!row) throw AppError.notFound('Account not found.');

  const mfaEnabled = row.twoFactor?.enabledAt != null;
  return {
    user: publicUser(row),
    mfa: { enabled: mfaEnabled, satisfied: sessionUser.mfaSatisfied },
    mfaRequired: mfaEnabled && !sessionUser.mfaSatisfied,
  };
}

async function updateMe(ctx: RequestContext): Promise<unknown> {
  const sessionUser = await requireAuth(ctx);
  const input = await body(ctx, updateProfileSchema);
  const prisma = getPrisma();

  const before = await prisma.user.findUnique({
    where: { id: sessionUser.userId },
    select: USER_SELECT,
  });
  if (!before) throw AppError.notFound('Account not found.');

  try {
    const updated = await prisma.user.update({
      where: { id: sessionUser.userId },
      data: {
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.dateOfBirth !== undefined ? { dateOfBirth: input.dateOfBirth } : {}),
        ...(input.preferredLanguage !== undefined
          ? { preferredLanguage: input.preferredLanguage.toUpperCase() as 'AR' | 'FR' | 'EN' }
          : {}),
      },
      select: USER_SELECT,
    });
    await audit({
      actorUserId: sessionUser.userId,
      action: 'user.profile_updated',
      entityType: 'user',
      entityId: sessionUser.userId,
      before: publicUser(before),
      after: publicUser(updated),
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return { user: publicUser(updated) };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AppError.conflict('This phone number is already in use.');
    }
    throw error;
  }
}

async function listSessions(ctx: RequestContext): Promise<unknown> {
  const sessionUser = await requireAuth(ctx);
  const f = query(ctx, paginationQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where = {
    userId: sessionUser.userId,
    revokedAt: null,
    expiresAt: { gt: new Date() },
  } as const;

  const [total, rows] = await Promise.all([
    prisma.session.count({ where }),
    prisma.session.findMany({
      where,
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        lastUsedAt: true,
        createdAt: true,
        expiresAt: true,
        mfaSatisfiedAt: true,
      },
      orderBy: { lastUsedAt: 'desc' },
      skip,
      take,
    }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      current: row.id === sessionUser.sessionId,
      ip: row.ipAddress,
      userAgent: row.userAgent,
      lastUsedAt: row.lastUsedAt,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      mfaSatisfied: row.mfaSatisfiedAt !== null,
    })),
    meta: buildPageMeta(total, { page, limit }),
  };
}

async function revokeOwnSession(ctx: RequestContext): Promise<unknown> {
  const sessionUser = await requireAuth(ctx);
  const { id } = pathParams(ctx, idParamsSchema);

  const target = await getPrisma().session.findFirst({
    where: { id, userId: sessionUser.userId },
    select: { id: true },
  });
  if (!target) throw AppError.notFound('Session not found.');

  await revokeSession(id, 'revoked_by_user');
  await auditAuth(ctx, 'auth.session_revoked', sessionUser.userId, {
    entityType: 'session',
    entityId: id,
  });

  const revokedCurrent = id === sessionUser.sessionId;
  if (revokedCurrent) {
    const response = json({ ok: true, revokedCurrent: true }, { requestId: ctx.requestId });
    clearAuthCookies(response);
    return response;
  }
  return { ok: true, revokedCurrent: false };
}

// ── Route table ─────────────────────────────────────────────────

export const authRoutes: AppRoute[] = [
  {
    method: 'POST',
    path: '/auth/register',
    handler: register,
    options: { rateLimit: 'auth' },
    auth: 'public',
    summary: 'Create an account',
  },
  {
    method: 'POST',
    path: '/auth/login',
    handler: login,
    options: { rateLimit: 'auth' },
    auth: 'public',
    summary: 'Sign in (MFA step-up when enabled)',
  },
  {
    method: 'POST',
    path: '/auth/mfa/verify',
    handler: mfaVerify,
    options: { rateLimit: 'auth' },
    auth: 'authenticated',
    summary: 'Verify TOTP or a recovery code',
  },
  {
    method: 'POST',
    path: '/auth/refresh',
    handler: refresh,
    options: { rateLimit: 'authenticated' },
    auth: 'public',
    summary: 'Rotate the refresh token',
  },
  {
    method: 'POST',
    path: '/auth/logout',
    handler: logout,
    options: { rateLimit: 'authenticated' },
    auth: 'public',
    summary: 'Revoke the current session',
  },
  {
    method: 'POST',
    path: '/auth/logout-all',
    handler: logoutAll,
    options: { rateLimit: 'auth' },
    auth: 'authenticated',
    summary: 'Revoke every session',
  },
  {
    method: 'POST',
    path: '/auth/verify-email',
    handler: verifyEmail,
    options: { rateLimit: 'auth' },
    auth: 'public',
    summary: 'Confirm email via token',
  },
  {
    method: 'POST',
    path: '/auth/verify-email/resend',
    handler: resendVerification,
    options: { rateLimit: 'passwordReset' },
    auth: 'authenticated',
    summary: 'Resend the confirmation email',
  },
  {
    method: 'POST',
    path: '/auth/forgot-password',
    handler: forgotPassword,
    options: { rateLimit: 'passwordReset' },
    auth: 'public',
    summary: 'Request a password reset link',
  },
  {
    method: 'POST',
    path: '/auth/reset-password',
    handler: resetPassword,
    options: { rateLimit: 'passwordReset' },
    auth: 'public',
    summary: 'Reset password via token',
  },
  {
    method: 'POST',
    path: '/auth/change-password',
    handler: changePassword,
    options: { rateLimit: 'auth' },
    auth: 'authenticated',
    summary: 'Change password while signed in',
  },
  {
    method: 'POST',
    path: '/auth/two-factor/setup',
    handler: twoFactorSetup,
    options: { rateLimit: 'auth' },
    auth: 'authenticated',
    summary: 'Begin TOTP enrolment',
  },
  {
    method: 'POST',
    path: '/auth/two-factor/enable',
    handler: twoFactorEnable,
    options: { rateLimit: 'auth' },
    auth: 'authenticated',
    summary: 'Confirm TOTP and issue recovery codes',
  },
  {
    method: 'POST',
    path: '/auth/two-factor/disable',
    handler: twoFactorDisable,
    options: { rateLimit: 'auth' },
    auth: 'authenticated',
    summary: 'Disable TOTP',
  },
  {
    method: 'GET',
    path: '/auth/two-factor/status',
    handler: twoFactorStatus,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'MFA status',
  },
  {
    method: 'GET',
    path: '/auth/me',
    handler: me,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Current identity',
  },
  {
    method: 'PATCH',
    path: '/auth/me',
    handler: updateMe,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Update basic profile',
  },
  {
    method: 'GET',
    path: '/auth/sessions',
    handler: listSessions,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'List active sessions',
  },
  {
    method: 'DELETE',
    path: '/auth/sessions/:id',
    handler: revokeOwnSession,
    options: { rateLimit: 'auth' },
    auth: 'authenticated',
    summary: 'Revoke one session',
  },
];
