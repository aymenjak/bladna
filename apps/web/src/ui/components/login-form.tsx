'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { Alert, Button, Input } from '@bladna/ui';
import { AuthFormSkeleton } from './auth-form-skeleton';
import { DemoAccessCard } from './demo-access-card';
import { PasswordInput } from './password-input';
import type { DemoAccessData } from '@/server/lib/demo-access';
import { ApiClientError, api, errorMessageFor, safeNext } from '@/ui/api/client';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { getDictionary, type LocaleCode } from '@/ui/i18n';

/**
 * Sign-in form.
 *
 * Server contract (POST /auth/login):
 *  - `{ user, mfaRequired: false }` → session established, redirect.
 *  - `{ user, mfaRequired: true }`  → an MFA-pending session cookie was set;
 *    show the code step and POST /auth/mfa/verify before anything else.
 *
 * `demo` carries the demo-access card data (null unless DEMO_MODE=true) —
 * see server/lib/demo-access.ts.
 */
export function LoginForm({ locale, demo }: { locale: LocaleCode; demo?: DemoAccessData | null }) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'), `/${locale}/dashboard`);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mfaStep, setMfaStep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // DESIGN §8: failed submit focuses the first invalid control (RESEARCH M4).
  useFocusFirstError(fieldErrors);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      if (!mfaStep) {
        const { data } = await api.post<{ mfaRequired: boolean }>('/auth/login', {
          email,
          password,
        });
        if (data.mfaRequired) {
          setMfaStep(true);
          setBusy(false);
          return;
        }
      } else {
        await api.post('/auth/mfa/verify', { code: code.trim() });
      }
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
      if (cause instanceof ApiClientError && cause.code === 'UNAUTHORIZED') {
        // Never reveal whether the account exists.
        setError(dict.auth.invalidCredentials);
      } else {
        setError(
          errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
        );
      }
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}

        {!mfaStep ? (
          <>
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
            <PasswordInput
              locale={locale}
              label={dict.auth.password}
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={fieldErrors.password}
            />
            <div className="flex items-center justify-between text-sm">
              <Link
                href={`/${locale}/forgot-password`}
                className="font-medium text-brand-700 hover:text-brand-800"
              >
                {dict.auth.forgotPassword}
              </Link>
            </div>
          </>
        ) : (
          <>
            <Input
              label={dict.auth.totpCode}
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}|BLD-[A-Z0-9]{4}-[A-Z0-9]{4}"
              placeholder="000000"
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              error={fieldErrors.code}
              hint={dict.auth.recoveryHint}
            />
          </>
        )}

        <Button type="submit" loading={busy} className="w-full" size="lg">
          {mfaStep ? dict.auth.mfaVerify : busy ? dict.auth.signingIn : dict.common.signIn}
        </Button>

        {!mfaStep ? (
          <p className="text-center text-sm text-sand-600">
            {dict.auth.noAccount}{' '}
            <Link
              href={`/${locale}/register${searchParams.get('next') ? `?next=${encodeURIComponent(searchParams.get('next') ?? '')}` : ''}`}
              className="font-medium text-brand-700 hover:text-brand-800"
            >
              {dict.auth.createAccount}
            </Link>
          </p>
        ) : null}
      </form>
      {demo && !mfaStep ? (
        <DemoAccessCard locale={locale} data={demo} onPickEmail={setEmail} />
      ) : null}
    </>
  );
}

export function LoginFormSuspense({
  locale,
  demo,
}: {
  locale: LocaleCode;
  demo?: DemoAccessData | null;
}) {
  const { dict } = getDictionary(locale);
  return (
    <Suspense fallback={<AuthFormSkeleton label={dict.common.loading} />}>
      <LoginForm locale={locale} demo={demo} />
    </Suspense>
  );
}
