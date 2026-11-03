'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { CampaignStatus } from '@bladna/types';
import { Alert, Button } from '@bladna/ui';
import {
  ApiClientError,
  api,
  errorMessageFor,
  fieldErrors as extractFieldErrors,
} from '@/ui/api/client';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { getDictionary, type LocaleCode } from '@/ui/i18n';

/**
 * Record a bank-transfer contribution to a campaign (spec §33).
 *
 * POST /campaigns/:id/contributions `{ amount, currency, reference?, note? }`
 * stores the donor's pledge as PENDING; the money moves bank → organization
 * directly, the organization confirms or rejects it in its workspace, and the
 * platform never processes an electronic payment (billing stays
 * bank_transfer | free) — the copy says exactly that. Contributions are only
 * accepted while the campaign is ACTIVE. After a successful record we keep the
 * returned id so the donor can cancel their own still-PENDING pledge
 * (POST /campaigns/:id/contributions/:cid/cancel); any decision the
 * organization already made surfaces as the server's honest message.
 */
export function CampaignContribute({
  locale,
  campaignId,
  campaignStatus,
  currency,
}: {
  locale: LocaleCode;
  campaignId: string;
  campaignStatus: CampaignStatus;
  currency: string;
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const pathname = usePathname();
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrs, setFieldErrs] = useState<Record<string, string>>({});
  // DESIGN §8: failed submit focuses the first invalid control (RESEARCH M4).
  useFocusFirstError(fieldErrs);
  const [busy, setBusy] = useState(false);

  // The server only accepts contributions on ACTIVE campaigns — never show a
  // control that cannot work.
  const canContribute = campaignStatus === 'ACTIVE';

  /** UNAUTHORIZED / MFA_REQUIRED → bounce to login with next=current path. */
  function bounced(cause: unknown): boolean {
    if (
      cause instanceof ApiClientError &&
      (cause.code === 'UNAUTHORIZED' || cause.code === 'MFA_REQUIRED')
    ) {
      router.push(`/${locale}/login?next=${encodeURIComponent(pathname)}`);
      return true;
    }
    return false;
  }

  function messageFor(cause: unknown): string {
    return errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic });
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setFieldErrs({});
    setBusy(true);
    try {
      const result = await api.post<{ contribution: { id: string } }>(
        `/campaigns/${campaignId}/contributions`,
        {
          amount: Number(amount),
          currency,
          ...(reference.trim() ? { reference: reference.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      );
      setPendingId(result.data.contribution.id);
      setAmount('');
      setReference('');
      setNote('');
      setNotice(dict.campaigns.contributeSuccess);
      router.refresh();
    } catch (cause) {
      if (bounced(cause)) return;
      setFieldErrs(extractFieldErrors(cause));
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(): Promise<void> {
    if (!pendingId) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await api.post(
        `/campaigns/${campaignId}/contributions/${encodeURIComponent(pendingId)}/cancel`,
      );
      setPendingId(null);
      setNotice(dict.campaigns.contributionCancelled);
      router.refresh();
    } catch (cause) {
      if (bounced(cause)) return;
      // Already decided by the organization (422/404) — show the server's
      // reason and drop the cancel affordance.
      if (
        cause instanceof ApiClientError &&
        (cause.code === 'BUSINESS_RULE_ERROR' || cause.code === 'NOT_FOUND')
      ) {
        setPendingId(null);
      }
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-3 border-t border-sand-100 pt-4">
      {!canContribute ? (
        <p className="text-sm text-sand-500">{dict.campaigns.contributeClosed}</p>
      ) : (
        <>
          <h3 className="text-sm font-semibold text-sand-800">{dict.campaigns.contributeTitle}</h3>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {notice ? <Alert tone="success">{notice}</Alert> : null}
          <form onSubmit={submit} noValidate className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="text-sm font-medium text-sand-700">
                  {dict.campaigns.contributeAmount} ({currency})
                </span>
                <input
                  type="number"
                  min={100}
                  max={1000000000}
                  step="1"
                  required
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="mt-1 w-full h-10 rounded-lg border border-sand-300 px-3 py-2 text-sm text-sand-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                {fieldErrs.amount ? (
                  <span className="mt-1 block text-xs text-red-700">{fieldErrs.amount}</span>
                ) : null}
              </label>
              <label className="block">
                <span className="text-sm font-medium text-sand-700">
                  {dict.campaigns.contributeReference}
                </span>
                <input
                  type="text"
                  maxLength={80}
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  className="mt-1 w-full h-10 rounded-lg border border-sand-300 px-3 py-2 text-sm text-sand-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <span className="mt-1 block text-xs text-sand-500">
                  {dict.campaigns.contributeReferenceHint}
                </span>
                {fieldErrs.reference ? (
                  <span className="mt-1 block text-xs text-red-700">{fieldErrs.reference}</span>
                ) : null}
              </label>
              <label className="block">
                <span className="text-sm font-medium text-sand-700">
                  {dict.campaigns.contributeNote}
                </span>
                <input
                  type="text"
                  maxLength={500}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="mt-1 w-full h-10 rounded-lg border border-sand-300 px-3 py-2 text-sm text-sand-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                {fieldErrs.note ? (
                  <span className="mt-1 block text-xs text-red-700">{fieldErrs.note}</span>
                ) : null}
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={busy}>
                {dict.campaigns.contributeSubmit}
              </Button>
              {pendingId ? (
                <button
                  type="button"
                  onClick={() => void cancel()}
                  disabled={busy}
                  className="rounded-lg border border-sand-200 bg-white inline-flex min-h-11 items-center px-4 text-sm font-semibold text-sand-700 hover:bg-sand-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {dict.campaigns.cancelContribution}
                </button>
              ) : null}
            </div>
          </form>
          <p className="text-xs text-sand-500">{dict.campaigns.contributeLogin}</p>
        </>
      )}
    </div>
  );
}
