'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, useConfirm } from '@bladna/ui';
import { api, errorMessageFor } from '@/ui/api/client';
import { getDictionary, type LocaleCode } from '@/ui/i18n';

/**
 * `POST /me/card` — issues the caller's volunteer card (409 when one already
 * exists; the server owns the uniqueness). A refresh re-runs the page fetch so
 * the card details replace the "missing" state.
 */
export function CardIssueButton({ locale }: { locale: LocaleCode }) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function issue(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.post('/me/card');
      router.refresh();
    } catch (cause) {
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button type="button" disabled={busy} onClick={() => void issue()}>
        {dict.profile.cardIssue}
      </Button>
    </div>
  );
}

type DataRequestType = 'EXPORT' | 'DEACTIVATE' | 'DELETE';

/**
 * `POST /me/data-request` — the exact body is `{ type, reason? }` (dataRequest
 * schema); no reason input is offered, so none is sent. DEACTIVATE and DELETE
 * are destructive requests: they ask for confirmation using the button label.
 */
export function DataRights({ locale }: { locale: LocaleCode }) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<DataRequestType | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(type: DataRequestType, label: string): Promise<void> {
    if (type !== 'EXPORT' && !(await confirm(label))) return;
    setBusy(type);
    setError(null);
    setSent(false);
    try {
      await api.post('/me/data-request', { type });
      setSent(true);
      router.refresh();
    } catch (cause) {
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(null);
    }
  }

  const buttons: Array<{ type: DataRequestType; label: string }> = [
    { type: 'EXPORT', label: dict.profile.dataExport },
    { type: 'DEACTIVATE', label: dict.profile.dataDeactivate },
    { type: 'DELETE', label: dict.profile.dataDelete },
  ];

  return (
    <div className="space-y-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {sent ? <Alert tone="success">{dict.profile.dataSent}</Alert> : null}
      <div className="flex flex-wrap gap-3">
        {buttons.map((button) => (
          <Button
            key={button.type}
            type="button"
            variant={button.type === 'DELETE' ? 'danger' : 'outline'}
            disabled={busy !== null}
            onClick={() => void submit(button.type, button.label)}
          >
            {busy === button.type ? dict.common.loading : button.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
