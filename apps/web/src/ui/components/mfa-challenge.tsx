'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Button } from '@bladna/ui';
import { errorMessageFor, api } from '@/ui/api/client';
import { getDictionary, type LocaleCode } from '@/ui/i18n';

/**
 * Standalone MFA challenge (arrived via ?mfa=1 from a protected page, or after
 * a login that established an MFA-pending session). On success the session is
 * upgraded and the visitor continues to `next`.
 */
export function MfaChallenge({ locale }: { locale: LocaleCode }) {
  const { dict } = getDictionary(locale);
  const searchParams = useSearchParams();
  const nextRaw = searchParams.get('next');
  const next =
    nextRaw && nextRaw.startsWith('/') && !nextRaw.startsWith('//')
      ? nextRaw
      : `/${locale}/dashboard`;

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify(): Promise<void> {
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/mfa/verify', { code: code.trim() });
      window.location.assign(next);
    } catch (cause) {
      setError(
        errorMessageFor(cause, {
          errors: dict.errors,
          genericFallback: dict.errors.unauthorized,
        }),
      );
      setBusy(false);
    }
  }

  // Clear the transient error once the visitor starts typing a new code.
  useEffect(() => {
    if (error) setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void verify();
      }}
      noValidate
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="space-y-1.5">
        <label htmlFor="mfa-code" className="block text-sm font-medium text-sand-700">
          {dict.auth.totpCode}
        </label>
        <input
          id="mfa-code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          required
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className="w-full rounded-lg border border-sand-200 bg-white px-3 py-2 text-center text-lg tracking-[0.4em] text-sand-900 placeholder:text-sand-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <p className="text-sm text-sand-500">{dict.auth.recoveryHint}</p>
      </div>

      <Button type="submit" disabled={busy || !code.trim()} className="w-full">
        {busy ? dict.common.loading : dict.auth.mfaVerify}
      </Button>
    </form>
  );
}
