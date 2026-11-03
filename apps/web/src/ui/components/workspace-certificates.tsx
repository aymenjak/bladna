'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CERTIFICATE_TRANSITIONS, canTransition } from '@bladna/domain';
import type { CertificateStatus, LocaleCode } from '@bladna/types';
import { Alert, Button, Card, useConfirm, usePrompt } from '@bladna/ui';
import { api, errorMessageFor, fieldErrors } from '@/ui/api/client';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { getDictionary } from '@/ui/i18n';
import { formatDate } from '@/ui/format';

/** A VERIFIED hour row with an activity — the input for issuance. */
export interface EligibleHourView {
  id: string;
  activityId: string;
  volunteerProfileId: string;
  hours: number;
  date: string | Date;
  volunteerName: string;
}

/**
 * Issue form — `POST /orgs/:orgId/certificates` with `createCertificateSchema`
 * `{activityId, volunteerProfileId, hours, title, description?}`. The activity
 * and its participant come from the selected VERIFIED hour row, so the pair is
 * always consistent; `templateId` is omitted (no template picker exists).
 */
export function IssueCertificateForm({
  locale,
  orgId,
  candidates,
}: {
  locale: LocaleCode;
  orgId: string;
  candidates: EligibleHourView[];
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const [hourId, setHourId] = useState(candidates[0]?.id ?? '');
  const selected = candidates.find((item) => item.id === hourId) ?? candidates[0];
  const [title, setTitle] = useState('');
  const [hours, setHours] = useState(selected ? String(selected.hours) : '');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  useFocusFirstError(fields);

  function pick(id: string): void {
    setHourId(id);
    const candidate = candidates.find((item) => item.id === id);
    if (candidate) setHours(String(candidate.hours));
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!selected) return;
    setError(null);
    setMessage(null);
    setFields({});
    setBusy(true);
    try {
      await api.post(`/orgs/${orgId}/certificates`, {
        activityId: selected.activityId,
        volunteerProfileId: selected.volunteerProfileId,
        hours: Number.parseFloat(hours),
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      setMessage(dict.workspace.certificates.issued);
      setTitle('');
      setDescription('');
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
        {dict.workspace.certificates.issueTitle}
      </h2>
      <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="cert-hour" className="block text-sm font-medium text-sand-700">
            {dict.workspace.certificates.fromHour}
          </label>
          <select
            id="cert-hour"
            required
            value={hourId}
            onChange={(event) => pick(event.target.value)}
            className={inputClass}
          >
            {candidates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.volunteerName} · {item.hours} {dict.common.hours} ·{' '}
                {formatDate(item.date, locale)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cert-title" className="block text-sm font-medium text-sand-700">
            {dict.workspace.certificates.title}
          </label>
          <input
            id="cert-title"
            required
            minLength={3}
            maxLength={200}
            aria-invalid={!!fields.title || undefined}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={inputClass}
          />
          {fields.title ? (
            <p role="alert" className="mt-1 text-sm text-red-700">
              {fields.title}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor="cert-hours" className="block text-sm font-medium text-sand-700">
            {dict.workspace.certificates.hoursLabel}
          </label>
          <input
            id="cert-hours"
            type="number"
            required
            min={0.25}
            max={168}
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
        <div className="sm:col-span-2">
          <label htmlFor="cert-description" className="block text-sm font-medium text-sand-700">
            {dict.common.description} ({dict.common.optional})
          </label>
          <textarea
            id="cert-description"
            maxLength={2000}
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy}>
            {dict.workspace.certificates.issue}
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
 * Revoke one certificate — `POST /certificates/:certificateId/revoke` with
 * `{reason}` (min 3 chars). Gated with CERTIFICATE_TRANSITIONS: only
 * VALID/EXPIRED rows can move to REVOKED.
 */
export function RevokeCertificateButton({
  locale,
  certificateId,
  status,
}: {
  locale: LocaleCode;
  certificateId: string;
  status: CertificateStatus;
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const canRevoke = canTransition(CERTIFICATE_TRANSITIONS, status, 'REVOKED');

  async function revoke(): Promise<void> {
    if (!(await confirm(dict.workspace.certificates.confirmRevoke))) return;
    const reason = await prompt(dict.workspace.certificates.reasonLabel);
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setError(dict.errors.validation);
      return;
    }
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await api.post(`/certificates/${certificateId}/revoke`, { reason: reason.trim() });
      setMessage(dict.workspace.certificates.revoked);
      router.refresh();
    } catch (cause) {
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!canRevoke) return null;

  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="text-red-700 hover:border-red-300 hover:bg-red-50 focus-visible:outline-red-700"
        disabled={busy}
        onClick={revoke}
      >
        {dict.workspace.certificates.revoke}
      </Button>
      {error ? (
        <span role="alert" className="max-w-64 text-end text-xs text-red-700">
          {error}
        </span>
      ) : null}
      {message ? (
        <span role="status" className="text-xs text-brand-800">
          {message}
        </span>
      ) : null}
    </span>
  );
}
