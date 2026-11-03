'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@bladna/ui';
import { errorMessageFor, api } from '@/ui/api/client';
import { getDictionary, type LocaleCode } from '@/ui/i18n';

/**
 * `POST /auth/logout` from the header — revokes the current session server-side
 * and applies the cookie-clearing response, then returns to the login screen.
 */
export function SignOutButton({ locale }: { locale: LocaleCode }) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/logout', {});
      router.push(`/${locale}/login`);
      router.refresh();
    } catch (cause) {
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      {error ? (
        <span role="alert" className="text-xs text-red-700">
          {error}
        </span>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => void signOut()}
        disabled={busy}
      >
        {busy ? dict.common.loading : dict.nav.logout}
      </Button>
    </span>
  );
}
