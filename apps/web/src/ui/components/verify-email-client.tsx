'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, buttonClasses } from '@bladna/ui';
import { api, errorMessageFor } from '@/ui/api/client';
import { getDictionary, type LocaleCode } from '@/ui/i18n';

type Step = 'confirming' | 'done' | 'error' | 'idle';

/**
 * Email confirmation. With `?token=` the verification runs automatically
 * (the link from the email); without it the page offers a resend for the
 * signed-in session.
 */
export function VerifyEmailClient({ locale }: { locale: LocaleCode }) {
  const { dict } = getDictionary(locale);
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [step, setStep] = useState<Step>(token ? 'confirming' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        await api.post('/auth/verify-email', { token });
        if (!cancelled) setStep('done');
      } catch (cause) {
        if (!cancelled) {
          setError(
            errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
          );
          setStep('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, dict.errors, dict.errors.generic]);

  async function resend(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setResending(true);
    setError(null);
    try {
      await api.post('/auth/verify-email/resend');
      setResent(true);
    } catch (cause) {
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setResending(false);
    }
  }

  if (step === 'confirming') {
    return (
      <p role="status" className="text-sm text-sand-600">
        {dict.common.loading}
      </p>
    );
  }

  if (step === 'done') {
    return (
      <div className="space-y-4">
        <Alert tone="success">{dict.auth.verifySuccess}</Alert>
        <Link href={`/${locale}/dashboard`} className={buttonClasses({ className: 'w-full' })}>
          {dict.nav.dashboard}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {resent ? <Alert tone="success">{dict.auth.resendSent}</Alert> : null}

      <p className="text-sm text-sand-700">{dict.auth.verifySubtitle}</p>

      <form onSubmit={resend}>
        <Button type="submit" loading={resending} className="w-full" size="lg" variant="outline">
          {dict.auth.verifyResend}
        </Button>
      </form>

      <Link
        href={`/${locale}/dashboard`}
        className="block text-center text-sm font-medium text-brand-700 hover:text-brand-800"
      >
        {dict.nav.dashboard}
      </Link>
    </div>
  );
}
