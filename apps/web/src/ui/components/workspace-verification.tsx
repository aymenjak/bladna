'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LocaleCode } from '@bladna/types';
import { Alert, Button, Card } from '@bladna/ui';
import { api, errorMessageFor, fieldErrors } from '@/ui/api/client';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { getDictionary } from '@/ui/i18n';

export interface DocumentOption {
  id: string;
  fileName: string;
  type: string;
  sizeBytes: number;
}

/**
 * Submit form — `POST /orgs/:orgId/verifications` with
 * `submitVerificationSchema` `{targetLevel, documentIds (1..10), notes?}`.
 * LEVEL_0 is never offered (it is the unverified default), and the server
 * rejects evidence documents that do not belong to this tenant.
 */
export function SubmitVerificationForm({
  locale,
  orgId,
  levels,
  documents,
}: {
  locale: LocaleCode;
  orgId: string;
  levels: readonly string[];
  documents: DocumentOption[];
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const [targetLevel, setTargetLevel] = useState(levels[0] ?? 'LEVEL_1_BASIC_VERIFIED');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  // DESIGN §8: failed submit focuses the first invalid control (RESEARCH M4).
  useFocusFirstError(fields);

  function toggle(id: string): void {
    setSelected((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(id)) nextSet.delete(id);
      else if (nextSet.size < 10) nextSet.add(id);
      return nextSet;
    });
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setFields({});
    const documentIds = Array.from(selected);
    if (documentIds.length === 0) {
      setFields({ documentIds: dict.errors.validation });
      return;
    }
    setBusy(true);
    try {
      await api.post(`/orgs/${orgId}/verifications`, {
        targetLevel,
        documentIds,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      setMessage(dict.workspace.verification.submitted);
      setSelected(new Set());
      setNotes('');
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
    'mt-1 w-full h-10 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100';

  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold text-sand-900">{dict.workspace.verification.title}</h2>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <div className="max-w-96">
          <label htmlFor="verif-level" className="block text-sm font-medium text-sand-700">
            {dict.workspace.verification.levelLabel}
          </label>
          <select
            id="verif-level"
            value={targetLevel}
            onChange={(event) => setTargetLevel(event.target.value)}
            className={inputClass}
          >
            {levels.map((value) => (
              <option key={value} value={value}>
                {(dict.workspace.verification.levels as Record<string, string>)[value] ?? value}
              </option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-sand-700">
            {dict.workspace.documents.typeLabel}
          </legend>
          <p className="mt-1 text-xs text-sand-500">
            {dict.workspace.verification.documentIdsHint}
          </p>
          <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {documents.map((document) => (
              <li key={document.id}>
                <label className="flex min-h-11 items-center gap-2 rounded-lg border border-sand-200 bg-sand-50 px-3 py-2 text-sm text-sand-700">
                  <input
                    type="checkbox"
                    checked={selected.has(document.id)}
                    onChange={() => toggle(document.id)}
                    className="size-4"
                  />
                  <span className="min-w-0 flex-1 truncate" title={document.fileName}>
                    {document.fileName}
                  </span>
                  <span className="shrink-0 text-xs text-sand-500">{document.type}</span>
                </label>
              </li>
            ))}
          </ul>
          {fields.documentIds ? (
            <p role="alert" className="mt-1 text-sm text-red-700">
              {fields.documentIds}
            </p>
          ) : null}
        </fieldset>

        <div>
          <label htmlFor="verif-notes" className="block text-sm font-medium text-sand-700">
            {dict.workspace.verification.notesLabel} ({dict.common.optional})
          </label>
          <textarea
            id="verif-notes"
            maxLength={4000}
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className={inputClass}
          />
        </div>

        <Button type="submit" disabled={busy}>
          {dict.workspace.verification.submit}
        </Button>
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
