'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LocaleCode } from '@bladna/types';
import { Alert, Button, Card, useConfirm, usePrompt } from '@bladna/ui';
import { api, errorMessageFor, fieldErrors } from '@/ui/api/client';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { getDictionary } from '@/ui/i18n';
import { toast } from 'sonner';

interface OpportunityOption {
  id: string;
  titleAr: string;
  titleFr: string;
  titleEn: string;
}

interface VolunteerOption {
  id: string;
  volunteerId: string;
  firstName: string;
  lastName: string;
}

/** POST /attendance/sessions — body per `createAttendanceSessionSchema`. */
export function CreateSessionForm({
  locale,
  opportunities,
}: {
  locale: LocaleCode;
  opportunities: OpportunityOption[];
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const [name, setName] = useState('');
  const [opportunityId, setOpportunityId] = useState(opportunities[0]?.id ?? '');
  const [startsAt, setStartsAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [ttlSeconds, setTtlSeconds] = useState('900');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  useFocusFirstError(fields);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setFields({});
    setBusy(true);
    try {
      await api.post(`/attendance/sessions`, {
        name: name.trim(),
        opportunityId,
        startsAt,
        expiresAt,
        ttlSeconds: Number.parseInt(ttlSeconds, 10) || 900,
      });
      setMessage(dict.workspace.attendance.created);
      setName('');
      router.refresh();
    } catch (cause) {
      const parsed = fieldErrors(cause);
      if (Object.keys(parsed).length > 0) setFields(parsed);
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'h-10 mt-1 w-full rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100';

  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold text-sand-900">
        {dict.workspace.attendance.createSession}
      </h2>
      <p className="mt-1 text-sm text-sand-500">{dict.workspace.attendance.qrHint}</p>
      <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-1">
          <label htmlFor="session-name" className="block text-sm font-medium text-sand-700">
            {dict.workspace.attendance.name}
          </label>
          <input
            id="session-name"
            required
            minLength={2}
            maxLength={160}
            aria-invalid={!!fields.name || undefined}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={inputClass}
          />
          {fields.name ? (
            <p role="alert" className="mt-1 text-sm text-red-700">
              {fields.name}
            </p>
          ) : null}
        </div>
        <div className="sm:col-span-2 lg:col-span-1">
          <label htmlFor="session-opp" className="block text-sm font-medium text-sand-700">
            {dict.workspace.attendance.opportunity}
          </label>
          <select
            id="session-opp"
            required
            aria-invalid={!!fields.opportunityId || undefined}
            value={opportunityId}
            onChange={(event) => setOpportunityId(event.target.value)}
            className={inputClass}
          >
            {opportunities.map((item) => (
              <option key={item.id} value={item.id}>
                {item.titleAr || item.titleFr || item.titleEn}
              </option>
            ))}
          </select>
          {fields.opportunityId ? (
            <p role="alert" className="mt-1 text-sm text-red-700">
              {fields.opportunityId}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor="session-start" className="block text-sm font-medium text-sand-700">
            {dict.workspace.attendance.startsAt}
          </label>
          <input
            id="session-start"
            type="datetime-local"
            required
            aria-invalid={!!fields.startsAt || undefined}
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
            className={inputClass}
          />
          {fields.startsAt ? (
            <p role="alert" className="mt-1 text-sm text-red-700">
              {fields.startsAt}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor="session-expires" className="block text-sm font-medium text-sand-700">
            {dict.workspace.attendance.expiresAt}
          </label>
          <input
            id="session-expires"
            type="datetime-local"
            required
            aria-invalid={!!fields.expiresAt || undefined}
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            className={inputClass}
          />
          {fields.expiresAt ? (
            <p role="alert" className="mt-1 text-sm text-red-700">
              {fields.expiresAt}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor="session-ttl" className="block text-sm font-medium text-sand-700">
            {dict.workspace.attendance.ttlSeconds}
          </label>
          <input
            id="session-ttl"
            type="number"
            min={30}
            max={86400}
            aria-invalid={!!fields.ttlSeconds || undefined}
            value={ttlSeconds}
            onChange={(event) => setTtlSeconds(event.target.value)}
            className={inputClass}
          />
          {fields.ttlSeconds ? (
            <p role="alert" className="mt-1 text-sm text-red-700">
              {fields.ttlSeconds}
            </p>
          ) : null}
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <Button type="submit" disabled={busy}>
            {dict.workspace.attendance.createSession}
          </Button>
        </div>
      </form>
      {error ? (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      ) : null}
      {message ? (
        <Alert tone="success" className="mt-3">
          {message}
        </Alert>
      ) : null}
    </Card>
  );
}

/**
 * Per-session QR actions.
 *
 * `POST /attendance/sessions/:sessionId/qr` is the only QR endpoint and it
 * always rotates the secret (reissue), so "show" and "reissue" both hit it;
 * "show" simply renders the freshly issued image while "reissue" also toasts.
 * The QR payload is a token string, not a URL, so there is no check-in link
 * to copy — `copyLink`/`linkCopied` from the dictionary are intentionally
 * unused here (see REPORT).
 */
export function SessionActions({
  locale,
  sessionId,
  revoked,
}: {
  locale: LocaleCode;
  sessionId: string;
  revoked: boolean;
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [checkInUrl, setCheckInUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function issue(showMessage: boolean): Promise<void> {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const result = await api.post<{ qrDataUrl: string; checkInUrl?: string }>(
        `/attendance/sessions/${sessionId}/qr`,
        {},
      );
      setQr(result.data.qrDataUrl);
      setCheckInUrl(result.data.checkInUrl ?? null);
      if (showMessage) setMessage(dict.workspace.attendance.reissued);
      router.refresh();
    } catch (cause) {
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  async function revoke(): Promise<void> {
    if (!(await confirm(dict.workspace.attendance.confirmRevoke))) return;
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await api.post(`/attendance/sessions/${sessionId}/revoke`, {});
      setMessage(dict.workspace.attendance.revoked);
      setQr(null);
      setCheckInUrl(null);
      router.refresh();
    } catch (cause) {
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(): Promise<void> {
    if (!checkInUrl) return;
    try {
      await navigator.clipboard.writeText(checkInUrl);
      toast.success(dict.workspace.attendance.linkCopied);
    } catch {
      // Clipboard unavailable — the URL stays selectable above.
    }
  }

  return (
    <div className="flex w-full max-w-md shrink-0 flex-col items-end gap-2 sm:w-auto">
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" size="sm" disabled={busy || revoked} onClick={() => issue(false)}>
          {dict.workspace.attendance.showQr}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || revoked}
          onClick={() => issue(true)}
        >
          {dict.workspace.attendance.reissue}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="text-red-700 hover:border-red-300 hover:bg-red-50 focus-visible:outline-red-700"
          disabled={busy || revoked}
          onClick={revoke}
        >
          {dict.workspace.attendance.revoke}
        </Button>
      </div>
      {qr ? (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-sand-200 bg-white p-3">
          <img src={qr} alt={dict.workspace.attendance.showQr} className="size-40" />
          <p className="max-w-40 text-center text-xs text-sand-500">
            {dict.workspace.attendance.qrHint}
          </p>
          {checkInUrl ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-1 hover:border-brand-300 hover:text-brand-700"
              onClick={() => void copyLink()}
            >
              {dict.workspace.attendance.copyLink}
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="max-w-64 text-end text-xs text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-xs text-brand-800">
          {message}
        </p>
      ) : null}
    </div>
  );
}

/** POST /attendance/manual — body per `manualAttendanceSchema`. */
export function ManualAttendanceForm({
  locale,
  opportunities,
  volunteers,
}: {
  locale: LocaleCode;
  opportunities: OpportunityOption[];
  volunteers: VolunteerOption[];
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const [volunteerProfileId, setVolunteerProfileId] = useState(volunteers[0]?.id ?? '');
  const [opportunityId, setOpportunityId] = useState(opportunities[0]?.id ?? '');
  const [date, setDate] = useState('');
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  useFocusFirstError(fields);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setFields({});
    setBusy(true);
    try {
      await api.post(`/attendance/manual`, {
        volunteerProfileId,
        opportunityId,
        date,
        ...(hours.trim() ? { hours: Number.parseFloat(hours) } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setMessage(dict.workspace.attendance.manualDone);
      setDate('');
      setHours('');
      setNote('');
      router.refresh();
    } catch (cause) {
      const parsed = fieldErrors(cause);
      if (Object.keys(parsed).length > 0) setFields(parsed);
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'h-10 mt-1 w-full rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100';

  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold text-sand-900">
        {dict.workspace.attendance.manualTitle}
      </h2>
      <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="manual-volunteer" className="block text-sm font-medium text-sand-700">
            {dict.workspace.attendance.volunteerLabel}
          </label>
          <select
            id="manual-volunteer"
            required
            aria-invalid={!!fields.volunteerProfileId || undefined}
            value={volunteerProfileId}
            onChange={(event) => setVolunteerProfileId(event.target.value)}
            className={inputClass}
          >
            {volunteers.map((item) => (
              <option key={item.id} value={item.id}>
                {`${item.firstName} ${item.lastName}`.trim() || item.volunteerId}
              </option>
            ))}
          </select>
          {fields.volunteerProfileId ? (
            <p role="alert" className="mt-1 text-sm text-red-700">
              {fields.volunteerProfileId}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor="manual-opp" className="block text-sm font-medium text-sand-700">
            {dict.workspace.attendance.opportunity}
          </label>
          <select
            id="manual-opp"
            required
            aria-invalid={!!fields.opportunityId || undefined}
            value={opportunityId}
            onChange={(event) => setOpportunityId(event.target.value)}
            className={inputClass}
          >
            {opportunities.map((item) => (
              <option key={item.id} value={item.id}>
                {item.titleAr || item.titleFr || item.titleEn}
              </option>
            ))}
          </select>
          {fields.opportunityId ? (
            <p role="alert" className="mt-1 text-sm text-red-700">
              {fields.opportunityId}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor="manual-date" className="block text-sm font-medium text-sand-700">
            {dict.workspace.attendance.dateLabel}
          </label>
          <input
            id="manual-date"
            type="date"
            required
            aria-invalid={!!fields.date || undefined}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className={inputClass}
          />
          {fields.date ? (
            <p role="alert" className="mt-1 text-sm text-red-700">
              {fields.date}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor="manual-hours" className="block text-sm font-medium text-sand-700">
            {dict.workspace.attendance.hoursLabel} ({dict.common.optional})
          </label>
          <input
            id="manual-hours"
            type="number"
            min={0}
            max={24}
            step="0.25"
            aria-invalid={!!fields.hours || undefined}
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            className={inputClass}
          />
          {fields.hours ? (
            <p role="alert" className="mt-1 text-sm text-red-700">
              {fields.hours}
            </p>
          ) : null}
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label htmlFor="manual-note" className="block text-sm font-medium text-sand-700">
            {dict.workspace.attendance.noteLabel} ({dict.common.optional})
          </label>
          <textarea
            id="manual-note"
            maxLength={1000}
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={busy} className="w-full">
            {dict.workspace.attendance.manualSubmit}
          </Button>
        </div>
      </form>
      {error ? (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      ) : null}
      {message ? (
        <Alert tone="success" className="mt-3">
          {message}
        </Alert>
      ) : null}
    </Card>
  );
}

/**
 * Per-row decisions — `POST /attendance/:id/confirm` with
 * `confirmAttendanceSchema`: CONFIRM optionally carries verified hours,
 * REJECT requires a reason (the server rejects an empty one).
 */
export function RecordActions({
  locale,
  attendanceId,
  hours,
  decided,
}: {
  locale: LocaleCode;
  attendanceId: string;
  hours: number | null;
  decided: boolean;
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const prompt = usePrompt();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function confirm(): Promise<void> {
    setError(null);
    setMessage(null);
    const raw = await prompt(dict.workspace.attendance.hoursLabel, {
      defaultValue: hours !== null ? String(hours) : '',
    });
    if (raw === null) return;
    const trimmed = raw.trim();
    let value: number | undefined;
    if (trimmed) {
      const parsed = Number.parseFloat(trimmed);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 24) {
        setError(dict.errors.validation);
        return;
      }
      value = parsed;
    }
    setBusy(true);
    try {
      await api.post(`/attendance/${attendanceId}/confirm`, {
        action: 'CONFIRM',
        ...(value !== undefined ? { hours: value } : {}),
      });
      setMessage(dict.workspace.attendance.confirmed);
      router.refresh();
    } catch (cause) {
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  async function reject(): Promise<void> {
    setError(null);
    setMessage(null);
    const reason = await prompt(dict.workspace.attendance.reasonLabel);
    if (reason === null) return;
    if (!reason.trim()) {
      setError(dict.errors.validation);
      return;
    }
    setBusy(true);
    try {
      await api.post(`/attendance/${attendanceId}/confirm`, {
        action: 'REJECT',
        reason: reason.trim(),
      });
      setMessage(dict.workspace.attendance.rejected);
      router.refresh();
    } catch (cause) {
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  if (decided) return null;

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={confirm}>
          {dict.workspace.attendance.confirmRow}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="text-red-700 hover:border-red-300 hover:bg-red-50 focus-visible:outline-red-700"
          disabled={busy}
          onClick={reject}
        >
          {dict.workspace.attendance.rejectRow}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="max-w-64 text-end text-xs text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-xs text-brand-800">
          {message}
        </p>
      ) : null}
    </div>
  );
}
