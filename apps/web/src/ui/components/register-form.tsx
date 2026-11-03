'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { Alert, Button, Input } from '@bladna/ui';
import { AuthFormSkeleton } from './auth-form-skeleton';
import { PasswordInput } from './password-input';
import { ApiClientError, api, errorMessageFor, safeNext } from '@/ui/api/client';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { getDictionary, type LocaleCode } from '@/ui/i18n';

type AccountType = 'VOLUNTEER' | 'ORGANIZATION';

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
    if (!consentTerms || !consentPrivacy) {
      setError(dict.auth.consentRequired);
      return;
    }

    const consents: Array<'terms' | 'privacy_policy' | 'data_processing' | 'marketing_email'> = [
      'terms',
      'privacy_policy',
      'data_processing',
    ];
    if (consentMarketing) consents.push('marketing_email');

    setBusy(true);
    try {
      await api.post('/auth/register', {
        email,
        password,
        firstName,
        lastName,
        ...(phone ? { phone } : {}),
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
          if (issue.path) errors[issue.path] = issue.message ?? dict.errors.validation;
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
