'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { Alert, Button, Input, Select } from '@bladna/ui';
import { AGE_OF_MAJORITY, MIN_REGISTRATION_AGE, ageOn } from '@bladna/validation';
import { AuthFormSkeleton } from './auth-form-skeleton';
import { PasswordInput } from './password-input';
import { ApiClientError, api, errorMessageFor, safeNext } from '@/ui/api/client';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { getDictionary, type LocaleCode } from '@/ui/i18n';

type AccountType = 'VOLUNTEER' | 'ORGANIZATION';
type GuardianRelationship = 'PARENT' | 'LEGAL_GUARDIAN';

/** Age from a yyyy-mm-dd input value, or null when empty, invalid or in the future. */
function ageFromInput(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.getTime() > Date.now()) return null;
  return ageOn(date);
}

/**
 * Registration form → POST /auth/register (201 + session cookies, then the
 * verify-email step). The server is the authority on password policy and
 * consents; client checks mirror them only for immediate feedback.
 */
export function RegisterForm({
  locale,
  defaultAccountType,
}: {
  locale: LocaleCode;
  defaultAccountType?: AccountType;
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'), `/${locale}/verify-email`);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [accountType, setAccountType] = useState<AccountType>(
    defaultAccountType === 'ORGANIZATION' ? 'ORGANIZATION' : 'VOLUNTEER',
  );
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentPrivacy, setConsentPrivacy] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianRelationship, setGuardianRelationship] = useState<GuardianRelationship>('PARENT');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [consentGuardian, setConsentGuardian] = useState(false);
  const age = ageFromInput(dateOfBirth);
  // Law 18-07: under the age of majority the guardian section appears and is required.
  const isMinor = age !== null && age >= MIN_REGISTRATION_AGE && age < AGE_OF_MAJORITY;
  // Server issue codes (registerSchema) → readable messages.
  const issueMessages: Record<string, string> = {
    DATE_OF_BIRTH_INVALID: dict.auth.dateOfBirthInvalid,
    BELOW_MINIMUM_AGE: dict.auth.belowMinimumAge,
    GUARDIAN_REQUIRED: dict.auth.guardianRequired,
    GUARDIAN_CONTACT_REQUIRED: dict.auth.guardianContactRequired,
    GUARDIAN_CONSENT_REQUIRED: dict.auth.guardianConsentRequired,
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // DESIGN §8: failed submit focuses the first invalid control (RESEARCH M4).
  useFocusFirstError(fieldErrors);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (password !== confirm) {
      setFieldErrors({ confirm: dict.auth.passwordMismatch });
      return;
    }
    if (age === null) {
      setFieldErrors({ dateOfBirth: dict.auth.dateOfBirthInvalid });
      return;
    }
    if (age < MIN_REGISTRATION_AGE) {
      setFieldErrors({ dateOfBirth: dict.auth.belowMinimumAge });
      return;
    }
    if (isMinor) {
      if (guardianName.trim().length < 2) {
        setFieldErrors({ 'guardian.fullName': dict.auth.guardianRequired });
        return;
      }
      if (!guardianEmail.trim() && !guardianPhone.trim()) {
        setFieldErrors({ 'guardian.email': dict.auth.guardianContactRequired });
        return;
      }
    }
    if (!consentTerms || !consentPrivacy) {
      setError(dict.auth.consentRequired);
      return;
    }
    if (isMinor && !consentGuardian) {
      setError(dict.auth.guardianConsentRequired);
      return;
    }

    const consents: Array<
      'terms' | 'privacy_policy' | 'data_processing' | 'marketing_email' | 'guardian_consent'
    > = ['terms', 'privacy_policy', 'data_processing'];
    if (consentMarketing) consents.push('marketing_email');
    if (isMinor) consents.push('guardian_consent');

    setBusy(true);
    try {
      await api.post('/auth/register', {
        email,
        password,
        firstName,
        lastName,
        ...(phone ? { phone } : {}),
        dateOfBirth,
        ...(isMinor
          ? {
              guardian: {
                fullName: guardianName,
                relationship: guardianRelationship,
                ...(guardianEmail.trim() ? { email: guardianEmail } : {}),
                ...(guardianPhone.trim() ? { phone: guardianPhone } : {}),
              },
            }
          : {}),
        preferredLanguage: locale,
        consents,
        accountType,
      });
      router.push(next);
      router.refresh();
    } catch (cause) {
      if (
        cause instanceof ApiClientError &&
        cause.code === 'VALIDATION_ERROR' &&
        Array.isArray(cause.details)
      ) {
        const errors: Record<string, string> = {};
        for (const issue of cause.details as Array<{ path?: string; message?: string }>) {
          const message =
            (issue.message && issueMessages[issue.message]) ??
            issue.message ??
            dict.errors.validation;
          if (issue.path === 'consents' || issue.path === 'guardian') {
            setError(message);
            setBusy(false);
            return;
          }
          if (issue.path) errors[issue.path] = message;
        }
        if (Object.keys(errors).length > 0) {
          setFieldErrors(errors);
          setBusy(false);
          return;
        }
      }
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <fieldset className="rounded-lg border border-sand-200 p-3">
        <legend className="px-1 text-sm font-medium text-sand-700">{dict.auth.accountType}</legend>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="accountType"
              value="VOLUNTEER"
              checked={accountType === 'VOLUNTEER'}
              onChange={() => setAccountType('VOLUNTEER')}
            />
            {dict.auth.volunteerAccount}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="accountType"
              value="ORGANIZATION"
              checked={accountType === 'ORGANIZATION'}
              onChange={() => setAccountType('ORGANIZATION')}
            />
            {dict.auth.organizationAccount}
          </label>
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label={dict.auth.firstName}
          name="firstName"
          autoComplete="given-name"
          required
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          error={fieldErrors.firstName}
        />
        <Input
          label={dict.auth.lastName}
          name="lastName"
          autoComplete="family-name"
          required
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
          error={fieldErrors.lastName}
        />
      </div>

      <Input
        label={dict.auth.email}
        type="email"
        name="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={fieldErrors.email}
      />
      <Input
        label={`${dict.auth.phone} (${dict.common.optional})`}
        type="tel"
        name="phone"
        autoComplete="tel"
        placeholder="+213 …"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        error={fieldErrors.phone}
      />
      <Input
        label={dict.auth.dateOfBirth}
        type="date"
        name="dateOfBirth"
        autoComplete="bday"
        required
        max={new Date().toISOString().slice(0, 10)}
        hint={dict.auth.dateOfBirthHint}
        value={dateOfBirth}
        onChange={(event) => setDateOfBirth(event.target.value)}
        error={fieldErrors.dateOfBirth}
      />
      {isMinor ? (
        <fieldset className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <legend className="px-1 text-sm font-semibold text-sand-800">
            {dict.auth.guardianTitle}
          </legend>
          <p className="text-sm text-sand-700">{dict.auth.guardianIntro}</p>
          <Input
            label={dict.auth.guardianName}
            name="guardianName"
            required
            value={guardianName}
            onChange={(event) => setGuardianName(event.target.value)}
            error={fieldErrors['guardian.fullName']}
          />
          <Select
            label={dict.auth.guardianRelationship}
            name="guardianRelationship"
            value={guardianRelationship}
            onChange={(event) =>
              setGuardianRelationship(event.target.value as GuardianRelationship)
            }
          >
            <option value="PARENT">{dict.auth.guardianParent}</option>
            <option value="LEGAL_GUARDIAN">{dict.auth.guardianLegal}</option>
          </Select>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label={dict.auth.guardianEmail}
              type="email"
              name="guardianEmail"
              value={guardianEmail}
              onChange={(event) => setGuardianEmail(event.target.value)}
              error={fieldErrors['guardian.email']}
            />
            <Input
              label={dict.auth.guardianPhone}
              type="tel"
              name="guardianPhone"
              placeholder="+213 …"
              value={guardianPhone}
              onChange={(event) => setGuardianPhone(event.target.value)}
              error={fieldErrors['guardian.phone']}
            />
          </div>
        </fieldset>
      ) : null}
      <PasswordInput
        locale={locale}
        label={dict.auth.password}
        name="password"
        autoComplete="new-password"
        required
        hint={dict.auth.passwordHint}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={fieldErrors.password}
      />
      <PasswordInput
        locale={locale}
        label={dict.auth.confirmPassword}
        name="confirm"
        autoComplete="new-password"
        required
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
        error={fieldErrors.confirm}
      />

      <div className="space-y-2 text-sm">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            name="consentTerms"
            className="mt-1"
            checked={consentTerms}
            onChange={(event) => setConsentTerms(event.target.checked)}
          />
          <span>
            {dict.auth.consentTerms}{' '}
            <Link
              href={`/${locale}/terms`}
              className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
              /* Stop the click from also toggling the parent label's checkbox. */
              onClick={(event) => event.stopPropagation()}
            >
              {dict.legal.terms.title}
            </Link>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            name="consentPrivacy"
            className="mt-1"
            checked={consentPrivacy}
            onChange={(event) => setConsentPrivacy(event.target.checked)}
          />
          <span>
            {dict.auth.consentPrivacy}{' '}
            <Link
              href={`/${locale}/privacy`}
              className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
              onClick={(event) => event.stopPropagation()}
            >
              {dict.legal.privacy.title}
            </Link>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sand-600">
          <input
            type="checkbox"
            name="consentMarketing"
            className="mt-1"
            checked={consentMarketing}
            onChange={(event) => setConsentMarketing(event.target.checked)}
          />
          <span>{dict.auth.consentMarketing}</span>
        </label>
        {isMinor ? (
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="consentGuardian"
              className="mt-1"
              checked={consentGuardian}
              onChange={(event) => setConsentGuardian(event.target.checked)}
            />
            <span>{dict.auth.consentGuardian}</span>
          </label>
        ) : null}
      </div>

      <Button type="submit" loading={busy} className="w-full" size="lg">
        {busy ? dict.auth.creatingAccount : dict.auth.createAccount}
      </Button>

      <p className="text-center text-sm text-sand-600">
        {dict.auth.haveAccount}{' '}
        <Link href={`/${locale}/login`} className="font-medium text-brand-700 hover:text-brand-800">
          {dict.common.signIn}
        </Link>
      </p>
    </form>
  );
}

export function RegisterFormSuspense(props: {
  locale: LocaleCode;
  defaultAccountType?: AccountType;
}) {
  const { dict } = getDictionary(props.locale);
  return (
    <Suspense fallback={<AuthFormSkeleton label={dict.common.loading} />}>
      <RegisterForm {...props} />
    </Suspense>
  );
}
