'use client';

import { useState } from 'react';
import { Alert, Button } from '@bladna/ui';
import { ApiClientError, api, errorMessageFor } from '@/ui/api/client';
import { getDictionary, type LocaleCode } from '@/ui/i18n';

/**
 * `POST /attendance/check-in { token }` (authenticated). A replayed scan comes
 * back as a CONFLICT AppError ("You have already checked in to this session.")
 * from the [sessionId, volunteerProfileId] guard — surfaced with the dedicated
 * `checkin.already` copy; everything else uses the localized error message.
 */
export function CheckInActions({ locale, token }: { locale: LocaleCode; token: string }) {
  const { dict } = getDictionary(locale);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'success' | 'already' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkIn(): Promise<void> {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await api.post('/attendance/check-in', { token });
      setStatus('success');
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.code === 'CONFLICT') {
        setStatus('already');
        return;
      }
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {status === 'success' ? (
        <Alert tone="success" role="status">
          {dict.checkin.success}
        </Alert>
      ) : null}
      {status === 'already' ? (
        <Alert tone="warning" role="status">
          {dict.checkin.already}
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}
      <Button type="button" disabled={busy} onClick={() => void checkIn()}>
        {busy ? dict.checkin.checking : dict.checkin.checkIn}
      </Button>
    </div>
  );
}
