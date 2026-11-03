'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { HOUR_TRANSITIONS, canTransition } from '@bladna/domain';
import type { HourStatus, LocaleCode } from '@bladna/types';
import { Alert, Button, useConfirm, usePrompt } from '@bladna/ui';
import { api, errorMessageFor } from '@/ui/api/client';
import { getDictionary } from '@/ui/i18n';
import { formatDate, formatDateTime } from '@/ui/format';
import { StatusBadge } from '@/ui/status';

export interface HourRowView {
  id: string;
  status: HourStatus;
  hours: number;
  date: string | Date;
  source: string;
  rejectReason: string | null;
  revokeReason: string | null;
  verifiedAt: string | Date | null;
  volunteerName: string;
  volunteerEmail: string;
  volunteerId: string;
}

/**
 * Verification queue: bulk decisions through `POST /orgs/:orgId/hours/verify`
 * (`{hourIds, action, reason?}`), single decisions through
 * `POST /orgs/:orgId/hours/:hourId/verify`, and revocation through
 * `POST /orgs/:orgId/hours/:hourId/revoke` (reason required, min 3 chars).
 * Every button is gated with HOUR_TRANSITIONS so the UI never offers a
 * transition the server would reject; the server stays the source of truth.
 */
export function HoursTable({
  locale,
  orgId,
  rows,
}: {
  locale: LocaleCode;
  orgId: string;
  rows: HourRowView[];
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const selectableIds = rows
    .filter((row) => canTransition(HOUR_TRANSITIONS, row.status, 'VERIFIED'))
    .map((row) => row.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggle(id: string): void {
    setSelected((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(id)) nextSet.delete(id);
      else nextSet.add(id);
      return nextSet;
    });
  }

  function toggleAll(): void {
    setSelected(allSelected ? new Set() : new Set(selectableIds));
  }

  function clear(): void {
    setSelected(new Set());
  }

  function fail(cause: unknown, id?: string): void {
    const text = errorMessageFor(cause, {
      errors: dict.errors,
      genericFallback: dict.errors.generic,
    });
    if (id) setRowErrors((prev) => ({ ...prev, [id]: text }));
    else setError(text);
  }

  function dropRowError(id: string): void {
    setRowErrors((prev) => {
      const nextErrors = { ...prev };
      delete nextErrors[id];
      return nextErrors;
    });
  }

  async function bulk(action: 'VERIFY' | 'REJECT'): Promise<void> {
    const hourIds = rows.map((row) => row.id).filter((id) => selected.has(id));
    if (hourIds.length === 0) return;
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const trimmed = reason.trim();
      await api.post(`/orgs/${orgId}/hours/verify`, {
        hourIds,
        action,
        ...(trimmed ? { reason: trimmed } : {}),
      });
      setMessage(
        action === 'VERIFY' ? dict.workspace.hours.verified : dict.workspace.hours.rejected,
      );
      clear();
      setReason('');
      router.refresh();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, action: 'VERIFY' | 'REJECT'): Promise<void> {
    setError(null);
    setMessage(null);
    dropRowError(id);
    let reasonValue: string | undefined;
    if (action === 'REJECT') {
      const input = await prompt(dict.workspace.hours.reasonOptional);
      if (input === null) return;
      if (!input.trim()) {
        setRowErrors((prev) => ({ ...prev, [id]: dict.errors.validation }));
        return;
      }
      reasonValue = input.trim();
    }
    setBusy(true);
    try {
      await api.post(`/orgs/${orgId}/hours/${id}/verify`, {
        action,
        ...(reasonValue ? { reason: reasonValue } : {}),
      });
      setMessage(
        action === 'VERIFY' ? dict.workspace.hours.verified : dict.workspace.hours.rejected,
      );
      router.refresh();
    } catch (cause) {
      fail(cause, id);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string): Promise<void> {
    if (!(await confirm(dict.workspace.hours.confirmRevoke))) return;
    // The server requires a reason (min 3 chars) on revocation.
    const input = await prompt(dict.workspace.attendance.reasonLabel);
    if (input === null) return;
    if (input.trim().length < 3) {
      setRowErrors((prev) => ({ ...prev, [id]: dict.errors.validation }));
      return;
    }
    setError(null);
    setMessage(null);
    dropRowError(id);
    setBusy(true);
    try {
      await api.post(`/orgs/${orgId}/hours/${id}/revoke`, { reason: input.trim() });
      setMessage(dict.workspace.hours.revoked);
      router.refresh();
    } catch (cause) {
      fail(cause, id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}

      {/* Bulk toolbar — only PENDING rows are selectable. */}
      {selectableIds.length > 0 ? (
        <div className="space-y-2 rounded-lg border border-sand-200 bg-sand-50 p-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2 text-sand-700">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="size-4"
              />
              {dict.workspace.applications.selectAll}
            </label>
            <span className="text-sand-600">
              {selected.size} {dict.workspace.hours.selected}
            </span>
            {selected.size > 0 ? (
              <button
                type="button"
                onClick={clear}
                className="text-sm font-semibold text-brand-700 hover:text-brand-800"
              >
                {dict.workspace.applications.clearSelection}
              </button>
            ) : null}
          </div>
          <p className="text-xs text-sand-500">{dict.workspace.hours.selectHint}</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <label htmlFor="hours-reason" className="block text-sm font-medium text-sand-700">
                {dict.workspace.hours.reasonOptional}
              </label>
              <textarea
                id="hours-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={1000}
                rows={2}
                className="mt-1 w-full rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <Button
              type="button"
              disabled={busy || selected.size === 0}
              onClick={() => bulk('VERIFY')}
            >
              {dict.workspace.hours.verifySelected}
            </Button>
            <button
              type="button"
              disabled={busy || selected.size === 0}
              onClick={() => bulk('REJECT')}
              className="rounded-lg border border-sand-200 bg-white inline-flex min-h-11 items-center px-4 text-sm font-semibold text-sand-700 hover:bg-sand-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {dict.workspace.hours.rejectSelected}
            </button>
          </div>
        </div>
      ) : null}

      <ul className="divide-y divide-sand-100">
        {rows.map((row) => {
          const canVerify = canTransition(HOUR_TRANSITIONS, row.status, 'VERIFIED');
          const canReject = canTransition(HOUR_TRANSITIONS, row.status, 'REJECTED');
          const canRevoke = canTransition(HOUR_TRANSITIONS, row.status, 'REVOKED');
          const selectable = selectableIds.includes(row.id);
          return (
            <li key={row.id} className="flex flex-wrap items-start gap-3 py-4">
              {selectable ? (
                <input
                  type="checkbox"
                  checked={selected.has(row.id)}
                  onChange={() => toggle(row.id)}
                  aria-label={row.volunteerName}
                  className="mt-1 size-4"
                />
              ) : null}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sand-900">{row.volunteerName}</span>
                  <StatusBadge
                    status={row.status}
                    label={dict.workspace.hours.statuses[row.status] ?? row.status}
                  />
                  <span className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-semibold text-sand-700">
                    {row.hours} {dict.common.hours}
                  </span>
                </div>
                <p className="break-all text-sm text-sand-500">
                  {row.volunteerEmail} · {row.volunteerId}
                </p>
                <p className="text-xs text-sand-500">
                  {dict.workspace.hours.dateLabel}: {formatDate(row.date, locale)}
                  {row.verifiedAt ? (
                    <>
                      {' · '}
                      {dict.common.verified}: {formatDateTime(row.verifiedAt, locale)}
                    </>
                  ) : null}
                </p>
                {row.rejectReason ? (
                  <p className="text-xs text-red-700">{row.rejectReason}</p>
                ) : null}
                {row.revokeReason ? (
                  <p className="text-xs text-red-700">{row.revokeReason}</p>
                ) : null}
                {rowErrors[row.id] ? (
                  <p role="alert" className="text-sm text-red-700">
                    {rowErrors[row.id]}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-2">
                {canVerify ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() => decide(row.id, 'VERIFY')}
                  >
                    {dict.workspace.hours.verify}
                  </Button>
                ) : null}
                {canReject ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => decide(row.id, 'REJECT')}
                  >
                    {dict.workspace.hours.reject}
                  </Button>
                ) : null}
                {canRevoke ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-red-200 text-red-700 hover:bg-red-50"
                    disabled={busy}
                    onClick={() => revoke(row.id)}
                  >
                    {dict.workspace.hours.revoke}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
