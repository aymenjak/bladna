'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { APPLICATION_TRANSITIONS, canTransition } from '@bladna/domain';
import type { ApplicationStatus, LocaleCode } from '@bladna/types';
import { Alert, Avatar, Button, useConfirm } from '@bladna/ui';
import { api, errorMessageFor } from '@/ui/api/client';
import { getDictionary } from '@/ui/i18n';
import { formatDate } from '@/ui/format';
import { StatusBadge } from '@/ui/status';

export interface ApplicationRowView {
  id: string;
  status: ApplicationStatus;
  submittedAt: string | Date | null;
  motivation: string | null;
  volunteerName: string;
  volunteerEmail: string;
  volunteerId: string;
}

/**
 * Review list for one opportunity: per-row accept/reject through
 * `POST /orgs/:orgId/applications/:applicationId/status` and bulk decisions
 * through `POST /orgs/:orgId/applications/bulk`. Buttons are gated with
 * APPLICATION_TRANSITIONS so the UI never offers a transition the server
 * would reject; the server stays the source of truth either way.
 */
export function ApplicationsTable({
  locale,
  orgId,
  rows,
}: {
  locale: LocaleCode;
  orgId: string;
  rows: ApplicationRowView[];
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const confirm = useConfirm();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const selectableIds = rows.map((row) => row.id);
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
    setNote('');
  }

  function fail(cause: unknown, id?: string): void {
    const text = errorMessageFor(cause, {
      errors: dict.errors,
      genericFallback: dict.errors.generic,
    });
    if (id) setRowErrors((prev) => ({ ...prev, [id]: text }));
    else setError(text);
  }

  async function setStatus(id: string, status: 'ACCEPTED' | 'REJECTED'): Promise<void> {
    const accepted = status === 'ACCEPTED';
    if (
      !(await confirm(
        accepted
          ? dict.workspace.applications.confirmAccept
          : dict.workspace.applications.confirmReject,
      ))
    ) {
      return;
    }
    setError(null);
    setMessage(null);
    setRowErrors((prev) => {
      const nextErrors = { ...prev };
      delete nextErrors[id];
      return nextErrors;
    });
    setBusy(true);
    try {
      await api.post(`/orgs/${orgId}/applications/${id}/status`, { status });
      setMessage(dict.workspace.applications.updated);
      router.refresh();
    } catch (cause) {
      fail(cause, id);
    } finally {
      setBusy(false);
    }
  }

  async function bulk(action: 'ACCEPTED' | 'REJECTED'): Promise<void> {
    const applicationIds = rows.map((row) => row.id).filter((id) => selected.has(id));
    if (applicationIds.length === 0) return;
    const accepted = action === 'ACCEPTED';
    if (
      !(await confirm(
        accepted
          ? dict.workspace.applications.confirmAccept
          : dict.workspace.applications.confirmReject,
      ))
    ) {
      return;
    }
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await api.post(`/orgs/${orgId}/applications/bulk`, {
        action,
        applicationIds,
        ...(note.trim() ? { decisionNote: note.trim() } : {}),
      });
      setMessage(dict.workspace.applications.updated);
      clear();
      router.refresh();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}

      {/* Bulk toolbar — selection only, decisions confirm first. */}
      <div className="space-y-2 rounded-lg border border-sand-200 bg-sand-50 p-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2 text-sand-700">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="size-4" />
            {dict.workspace.applications.selectAll}
          </label>
          <span className="text-sand-600">
            {selected.size} {dict.workspace.applications.selected}
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
        <p className="text-xs text-sand-500">{dict.workspace.applications.bulkHint}</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <label htmlFor="bulk-note" className="block text-sm font-medium text-sand-700">
              {dict.workspace.applications.noteLabel}
            </label>
            <textarea
              id="bulk-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={2000}
              rows={2}
              className="mt-1 w-full rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <Button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => bulk('ACCEPTED')}
          >
            {dict.workspace.applications.markAccepted}
          </Button>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => bulk('REJECTED')}
            className="rounded-lg border border-sand-200 bg-white inline-flex min-h-11 items-center px-4 text-sm font-semibold text-sand-700 hover:bg-sand-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {dict.workspace.applications.markRejected}
          </button>
        </div>
      </div>

      <ul className="divide-y divide-sand-100">
        {rows.map((row) => {
          const canAccept = canTransition(APPLICATION_TRANSITIONS, row.status, 'ACCEPTED');
          const canReject = canTransition(APPLICATION_TRANSITIONS, row.status, 'REJECTED');
          // Decorative identity chip: initials only, the name below is the
          // real accessible content (and the checkbox's aria-label).
          const initials = row.volunteerName
            .split(/\s+/)
            .map((part) => part.charAt(0))
            .join('')
            .slice(0, 2);
          return (
            <li
              key={row.id}
              className="flex flex-wrap items-start gap-3 py-4 transition-colors hover:bg-sand-50/60"
            >
              <input
                type="checkbox"
                checked={selected.has(row.id)}
                onChange={() => toggle(row.id)}
                aria-label={row.volunteerName}
                className="mt-1 size-4"
              />
              <Avatar size="sm" className="mt-0.5 shrink-0" aria-hidden="true">
                {initials}
              </Avatar>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sand-900">{row.volunteerName}</span>
                  <StatusBadge
                    status={row.status}
                    label={dict.statuses[row.status] ?? row.status}
                  />
                </div>
                <p className="break-all text-sm text-sand-500">
                  {row.volunteerEmail} · {row.volunteerId}
                </p>
                <p className="text-xs text-sand-500">
                  {dict.workspace.applications.appliedOn}: {formatDate(row.submittedAt, locale)}
                </p>
                {row.motivation ? (
                  <div className="text-sm text-sand-600">
                    <span className="font-semibold text-sand-700">
                      {dict.workspace.applications.coverLetter}:
                    </span>
                    <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap">{row.motivation}</p>
                  </div>
                ) : null}
                {rowErrors[row.id] ? (
                  <p role="alert" className="text-sm text-red-700">
                    {rowErrors[row.id]}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-2">
                {canAccept ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() => setStatus(row.id, 'ACCEPTED')}
                  >
                    {dict.workspace.applications.markAccepted}
                  </Button>
                ) : null}
                {canReject ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setStatus(row.id, 'REJECTED')}
                  >
                    {dict.workspace.applications.markRejected}
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
