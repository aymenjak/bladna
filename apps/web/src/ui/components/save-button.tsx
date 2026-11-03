'use client';

// Save/remove toggle for opportunities (P5) — the first UI caller of the
// `SavedOpportunity` model. Initial state is either supplied by a server
// surface that already knows it (recommendations strip/page) or fetched once
// through the list endpoint's exact-id membership check (`?opportunityId=`),
// so no dedicated status route exists. Pages render this button only for
// signed-in sessions; a failed toggle rolls back with `saved.error` copy —
// no phantom saves, no silent failures.

import { useEffect, useState } from 'react';
import { Button } from '@bladna/ui';
import { api, errorMessageFor } from '@/ui/api/client';
import { getDictionary, type LocaleCode } from '@/ui/i18n';
import { BookmarkIcon } from './icons';

interface SaveResult {
  saved: boolean;
}

interface SavedListResult {
  items: unknown[];
}

export interface SaveButtonProps {
  opportunityId: string;
  locale: LocaleCode;
  /** Skip the membership fetch when the server surface already knows. */
  initialSaved?: boolean;
  className?: string;
}

export function SaveButton({ opportunityId, locale, initialSaved, className }: SaveButtonProps) {
  const { dict } = getDictionary(locale);
  const [saved, setSaved] = useState<boolean | null>(initialSaved ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One membership lookup when no surface passed the state (detail page).
  useEffect(() => {
    if (initialSaved !== undefined) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await api.get<SavedListResult>(
          `/me/saved-opportunities?opportunityId=${opportunityId}&limit=1`,
        );
        if (!cancelled) setSaved(data.items.length > 0);
      } catch {
        // Unauthenticated/expired session: show the unsaved state — the click
        // itself surfaces the real error copy.
        if (!cancelled) setSaved(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialSaved, opportunityId]);

  async function toggle(): Promise<void> {
    if (saved === null || busy) return;
    const next = !saved;
    const path = `/me/saved-opportunities/${opportunityId}`;
    setBusy(true);
    setError(null);
    setSaved(next);
    try {
      const result = next ? await api.post<SaveResult>(path) : await api.delete<SaveResult>(path);
      setSaved(result.data.saved);
    } catch (cause) {
      setSaved(!next);
      setError(
        errorMessageFor(cause, {
          errors: dict.errors,
          genericFallback: dict.saved.error,
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        type="button"
        data-testid="save-button"
        variant={saved ? 'secondary' : 'outline'}
        aria-pressed={saved ?? undefined}
        aria-busy={busy}
        disabled={busy || saved === null}
        onClick={() => void toggle()}
        className={`gap-2 ${className ?? ''}`}
      >
        <BookmarkIcon className="size-4" />
        {saved ? dict.saved.savedState : dict.common.save}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </span>
  );
}
