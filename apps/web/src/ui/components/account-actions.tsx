'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, buttonClasses, useConfirm } from '@bladna/ui';
import { api, errorMessageFor } from '@/ui/api/client';
import { getDictionary, type LocaleCode } from '@/ui/i18n';

/**
 * Mutation components for the volunteer's own records (applications,
 * notifications, invitations). Every call goes through the API client so the
 * envelope is parsed and failures surface the typed server message; success
 * revalidates the router so the server-rendered list shows committed state.
 */

export function WithdrawApplicationButton({
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
      await api.post(`/me/applications/${encodeURIComponent(applicationId)}/withdraw`);
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
      <span className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-semibold text-sand-700">
        {dict.applications.withdrawn}
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
        {dict.applications.withdraw}
      </Button>
      {error ? <span className="max-w-56 text-xs text-red-700">{error}</span> : null}
    </span>
  );
}

/**
 * Mark notifications read — `all: true` for the inbox-wide action, otherwise
 * the single row's id. The endpoint is idempotent (already-read rows skip).
 */
export function MarkReadButton({
  locale,
  notificationIds,
  all,
  label,
}: {
  locale: LocaleCode;
  notificationIds?: string[];
  all?: boolean;
  label: string;
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mark(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.post('/me/notifications/read', all ? { all: true } : { notificationIds });
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
    <span className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="hover:border-brand-300 hover:text-brand-700"
        onClick={() => void mark()}
        disabled={busy}
      >
        {label}
      </Button>
      {error ? <span className="max-w-56 text-xs text-red-700">{error}</span> : null}
    </span>
  );
}

/**
 * Accept an organization invitation from the emailed link
 * (`POST /me/invitations/:token/accept`). The server validates token, expiry,
 * email match and membership — every rejection surfaces as its message.
 */
export function AcceptInvitationButton({ locale, token }: { locale: LocaleCode; token: string }) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/me/invitations/${encodeURIComponent(token)}/accept`);
      setAccepted(true);
      router.refresh();
    } catch (cause) {
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  if (accepted) {
    return (
      <section className="rounded-xl border border-brand-200 bg-brand-50 p-6">
        <h2 className="text-lg font-semibold text-brand-900">{dict.invitations.accepted}</h2>
        <p className="mt-1 text-sm text-brand-800">{dict.invitations.acceptedBody}</p>
        <Link href={`/${locale}/dashboard`} className={buttonClasses({ className: 'mt-4' })}>
          {dict.dashboard.title}
        </Link>
      </section>
    );
  }

  return (
    <Card className="space-y-3 p-6">
      <Button type="button" onClick={() => void accept()} disabled={busy} className="w-full">
        {busy ? dict.invitations.accepting : dict.invitations.accept}
      </Button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </Card>
  );
}
