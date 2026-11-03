import { describe, expect, it } from 'vitest';
import { AppError } from '@bladna/types';
import {
  MFA_PROTECTED_ROLES,
  requireVerifiedEmail,
  resolveOrgId,
  unauthorized,
  type SessionUser,
} from './guards';
import { buildContext, type RequestContext } from './http';

/**
 * Guard unit tests for the DB-free halves of `guards.ts` (spec §19/§145):
 * org-scope resolution, the verified-email gate and the MFA-protected role
 * set. The prisma-backed lookups themselves are policy-wrapped logic tested
 * against @bladna/domain's RBAC matrix (admin-access.test.ts, rbac.test.ts).
 */

function makeCtx(search = '', params: Record<string, string> = {}): RequestContext {
  return buildContext(new Request(`http://local.test/api/v1/orgs${search}`), ['orgs'], params);
}

function makeUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    userId: 'user-1',
    sessionId: 'session-1',
    roles: ['VOLUNTEER'],
    email: 'v@example.dz',
    emailVerified: true,
    mfaSatisfied: false,
    totpEnabled: false,
    locale: 'ar',
    status: 'ACTIVE',
    ...overrides,
  };
}

describe('resolveOrgId', () => {
  const uuid = '3f1d2a4c-6b7e-4f8a-9c0d-1e2f3a4b5c6d';
  const other = '11111111-2222-3333-4444-555555555555';

  it('prefers the explicit argument over path and query', () => {
    const ctx = makeCtx(`?orgId=${other}`, { orgId: uuid });
    expect(resolveOrgId(ctx, uuid)).toBe(uuid);
  });

  it('falls back to the :orgId path param, then the orgId query param', () => {
    expect(resolveOrgId(makeCtx('', { orgId: uuid }))).toBe(uuid);
    expect(resolveOrgId(makeCtx(`?orgId=${other}`))).toBe(other);
  });

  it('rejects a missing orgId with VALIDATION_ERROR', () => {
    let thrown: unknown;
    try {
      resolveOrgId(makeCtx());
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe('VALIDATION_ERROR');
    expect((thrown as AppError).message).toBe('orgId is required.');
  });

  it('rejects a non-UUID orgId before it can reach a uuid column', () => {
    let thrown: unknown;
    try {
      resolveOrgId(makeCtx('?orgId=not-a-uuid'));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).message).toBe('orgId must be a valid identifier.');
  });
});

describe('requireVerifiedEmail', () => {
  it('passes for a confirmed account', () => {
    expect(() => requireVerifiedEmail(makeUser({ emailVerified: true }))).not.toThrow();
  });

  it('throws FORBIDDEN for an unconfirmed account', () => {
    let thrown: unknown;
    try {
      requireVerifiedEmail(makeUser({ emailVerified: false }));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe('FORBIDDEN');
    expect((thrown as AppError).message).toBe('Please confirm your email address first.');
  });
});

describe('unauthorized()', () => {
  it('builds a 401 UNAUTHORIZED AppError with the custom message', () => {
    const error = unauthorized('Sign in first.');
    expect(error.code).toBe('UNAUTHORIZED');
    expect(error.status).toBe(401);
    expect(error.message).toBe('Sign in first.');
  });
});

describe('MFA_PROTECTED_ROLES (§145)', () => {
  it('covers exactly the privileged staff roles', () => {
    expect([...MFA_PROTECTED_ROLES]).toEqual([
      'MODERATOR',
      'VERIFICATION_OFFICER',
      'SUPPORT',
      'SUPER_ADMIN',
    ]);
  });
});
