'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, useConfirm } from '@bladna/ui';
import { api, errorMessageFor } from '@/ui/api/client';
import { getDictionary, type LocaleCode } from '@/ui/i18n';

/**
 * Withdraw one international application — `POST
 * /international/applications/:id/withdraw`. The endpoint allows the action
 * only from DRAFT…WAITLISTED (the page renders this button only then); any
 * 422/409 rejection surfaces the typed server message, success shows the
 * committed copy and refreshes the server-rendered list.
 */
export function WithdrawInternationalApplicationButton({
  locale,
  applicationId,
}: {
  locale: LocaleCode;
  applicationId: string;
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [withdrawn, setWithdrawn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw(): Promise<void> {
    if (!(await confirm(dict.applications.withdrawConfirm))) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/international/applications/${encodeURIComponent(applicationId)}/withdraw`);
      setWithdrawn(true);
      router.refresh();
    } catch (cause) {
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  if (withdrawn) {
    return (
      <span className="max-w-56 text-xs font-semibold text-sand-700">
        {dict.international.withdrawnOk}
      </span>
    );
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="text-red-700 hover:border-red-300 hover:bg-red-50 focus-visible:outline-red-700"
        onClick={() => void withdraw()}
        disabled={busy}
      >
        {dict.international.withdrawLabel}
      </Button>
      {error ? <span className="max-w-56 text-xs text-red-700">{error}</span> : null}
    </span>
  );
}
