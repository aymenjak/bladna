'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Input } from '@bladna/ui';
import { PasswordInput } from './password-input';
import { api, errorMessageFor } from '@/ui/api/client';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { getDictionary, type LocaleCode } from '@/ui/i18n';

/** POST /auth/forgot-password — always succeeds (no account enumeration). */
export function ForgotPasswordForm({ locale }: { locale: LocaleCode }) {
  const { dict } = getDictionary(locale);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (cause) {
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <Alert tone="success">{dict.auth.resetSent}</Alert>
        <Link
          href={`/${locale}/login`}
          className="block text-center text-sm font-medium text-brand-700 hover:text-brand-800"
        >
          {dict.common.signIn}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Input
        label={dict.auth.email}
        type="email"
        name="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <Button type="submit" loading={busy} className="w-full" size="lg">
        {dict.auth.sendReset}
      </Button>
      <p className="text-center text-sm text-sand-600">
        <Link href={`/${locale}/login`} className="font-medium text-brand-700 hover:text-brand-800">
          {dict.common.signIn}
        </Link>
      </p>
    </form>
  );
}

/** POST /auth/reset-password with the token from the email link. */
export function ResetPasswordForm({ locale, token }: { locale: LocaleCode; token: string }) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
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
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
    } catch (cause) {
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <Alert tone="success">{dict.auth.resetDone}</Alert>
        <Button className="w-full" size="lg" onClick={() => router.push(`/${locale}/login`)}>
          {dict.common.signIn}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <PasswordInput
        locale={locale}
        label={dict.auth.newPassword}
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
      <Button type="submit" loading={busy} className="w-full" size="lg">
        {dict.auth.savePassword}
      </Button>
    </form>
  );
}
