'use client';

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Select, Textarea } from '@bladna/ui';
import { ApiClientError, api, errorMessageFor } from '@/ui/api/client';
import { getDictionary, type LocaleCode } from '@/ui/i18n';
import type { PageMeta } from '@/ui/components/list-pager';

export interface ListResult<T> {
  items: T[];
  meta: PageMeta;
}

/** Shared table cell classes (direction-neutral; the document sets direction). */
export const th = 'px-3 py-2 text-start text-xs font-medium uppercase text-sand-500';
export const td = 'px-3 py-2 align-top';

/**
 * Auth-aware error mapping for admin calls: UNAUTHORIZED/MFA_REQUIRED bounce
 * to the right page (the console itself already guarded MFA at page level),
 * everything else maps to localized copy.
 */
export function useFail(locale: LocaleCode): (cause: unknown) => string | null {
  const router = useRouter();
  const { dict } = getDictionary(locale);
  return useCallback(
    (cause: unknown) => {
      const next = encodeURIComponent(`/${locale}/admin`);
      if (cause instanceof ApiClientError && cause.code === 'UNAUTHORIZED') {
        router.push(`/${locale}/login?next=${next}`);
        return null;
      }
      if (cause instanceof ApiClientError && cause.code === 'MFA_REQUIRED') {
        router.push(`/${locale}/mfa?next=${next}`);
        return null;
      }
      return errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic });
    },
    [router, dict, locale],
  );
}

/** Query string builder that drops empty values. */
export function toQuery(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Paged list state for one admin panel. `query` may be an inline object — the
 * effect keys on its JSON so re-renders don't refetch; mutations call
 * `reload()`.
 */
export function usePagedList<T, Extra = unknown>(
  locale: LocaleCode,
  path: string,
  query: Record<string, string | number | undefined>,
): {
  rows: (ListResult<T> & Extra) | null;
  busy: boolean;
  error: string | null;
  setError: (message: string | null) => void;
  reload: () => void;
} {
  const fail = useFail(locale);
  const [rows, setRows] = useState<(ListResult<T> & Extra) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const queryKey = JSON.stringify(query);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(null);
    api
      .get<ListResult<T> & Extra>(`${path}${toQuery(query)}`)
      .then((result) => {
        if (!cancelled) setRows(result.data);
      })
      .catch((cause) => {
        if (cancelled) return;
        const message = fail(cause);
        if (message) setError(message);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
    // `queryKey` is a deterministic serialization of `query` (inline objects
    // are fine); `fail` is memoized by useFail.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, queryKey, tick, fail]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { rows, busy, error, setError, reload };
}

/** Filter toolbar — children are fields; Apply submits, Clear resets. */
export function FilterBar({
  children,
  onApply,
  onClear,
  busy,
  labels,
}: {
  children: ReactNode;
  onApply: () => void;
  onClear: () => void;
  busy: boolean;
  labels: { apply: string; clear: string };
}) {
  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-xl border border-sand-200 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onApply();
      }}
    >
      {children}
      <div className="flex gap-2 pb-0.5">
        <Button type="submit" size="sm" loading={busy}>
          {labels.apply}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClear}>
          {labels.clear}
        </Button>
      </div>
    </form>
  );
}

export interface ActionOption {
  value: string;
  label: string;
}

/**
 * Inline row-action form: action select + reason textarea + submit. The
 * submit button carries the selected action's own label; `requireReason`
 * pre-validates the same rule the server enforces.
 */
export function ActionForm({
  actionLabel,
  options,
  requireReason,
  labels,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  actionLabel: string;
  options: readonly ActionOption[];
  requireReason: ReadonlySet<string>;
  labels: { reason: string; hint: string; required: string; cancel: string };
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (action: string, reason: string) => void;
}) {
  const [action, setAction] = useState(options[0]?.value ?? '');
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const submitLabel = options.find((option) => option.value === action)?.label ?? actionLabel;

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (requireReason.has(action) && !reason.trim()) {
      setLocalError(labels.required);
      return;
    }
    setLocalError(null);
    onSubmit(action, reason.trim());
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-sand-200 bg-sand-50 p-3"
    >
      <div className="w-44">
        <Select
          label={actionLabel}
          value={action}
          onChange={(event) => {
            setAction(event.target.value);
            setLocalError(null);
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="min-w-56 flex-1">
        <Textarea
          label={labels.reason}
          hint={labels.hint}
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      <div className="flex items-center gap-2 pb-0.5">
        <Button type="submit" size="sm" loading={busy}>
          {submitLabel}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {labels.cancel}
        </Button>
      </div>
      {(localError ?? error) ? (
        <p role="alert" className="w-full text-sm text-red-700">
          {localError ?? error}
        </p>
      ) : null}
    </form>
  );
}

/** Success banner used after mutations. */
export function NoticeBar({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert tone="success" role="status">
      {message}
    </Alert>
  );
}
