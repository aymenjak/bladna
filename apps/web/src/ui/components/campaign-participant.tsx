'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import type { CampaignStatus } from '@bladna/types';
import { Alert, Button, Card } from '@bladna/ui';
import { ApiClientError, api, errorMessageFor } from '@/ui/api/client';
import { getDictionary, type LocaleCode } from '@/ui/i18n';

/**
 * Join/leave controls for the public campaign page.
 *
 * POST /campaigns/:id/participants (body: `{}`, optional opportunityId) —
 * requires auth, an ACTIVE campaign and a volunteer profile; joining twice
 * returns CONFLICT "You have already joined this campaign." which we surface
 * honestly and answer by offering the leave control. POST
 * /campaigns/:id/participants/leave withdraws (NOT_FOUND when not a
 * participant). The detail response carries no per-user joined flag, so state
 * starts as "not joined"; after `router.refresh()` the page's `_count` is
 * re-read from the server.
 */
export function CampaignParticipant({
  locale,
  campaignId,
  campaignStatus,
}: {
  locale: LocaleCode;
  campaignId: string;
  campaignStatus: CampaignStatus;
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const pathname = usePathname();
  const [joined, setJoined] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The server only allows joining ACTIVE campaigns — never show a control
  // that cannot work.
  const canJoin = campaignStatus === 'ACTIVE';
  const showLeave = joined || conflict;
  if (!canJoin && !showLeave) return null;

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

  async function join(): Promise<void> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      // joinCampaignSchema: every field optional, but the body must be JSON.
      await api.post(`/campaigns/${campaignId}/participants`, {});
      setJoined(true);
      setConflict(false);
      setNotice(dict.campaigns.joinSuccess);
      router.refresh();
    } catch (cause) {
      if (bounced(cause)) return;
      if (cause instanceof ApiClientError && cause.code === 'CONFLICT') {
        // Already a participant — say so and offer the leave control.
        setConflict(true);
      }
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  async function leave(): Promise<void> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.post(`/campaigns/${campaignId}/participants/leave`);
      setJoined(false);
      setConflict(false);
      setNotice(dict.campaigns.leaveSuccess);
      router.refresh();
    } catch (cause) {
      if (bounced(cause)) return;
      if (cause instanceof ApiClientError && cause.code === 'NOT_FOUND') {
        // Not a participant (e.g. withdrawn elsewhere) — offer join again.
        setJoined(false);
        setConflict(false);
      }
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3 p-6">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      <div className="flex flex-wrap gap-3">
        {canJoin && !showLeave ? (
          <Button type="button" onClick={() => void join()} disabled={busy}>
            {dict.campaigns.join}
          </Button>
        ) : null}
        {showLeave ? (
          <button
            type="button"
            onClick={() => void leave()}
            disabled={busy}
            className="rounded-lg border border-sand-200 bg-white inline-flex min-h-11 items-center px-4 text-sm font-semibold text-sand-700 hover:bg-sand-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {dict.campaigns.leave}
          </button>
        ) : null}
      </div>
    </Card>
  );
}
