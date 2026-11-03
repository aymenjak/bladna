'use client';

// Reviews & ratings (P24) — the social-proof section of an initiative page.
//
// The server hands over the full payload (list + stats + viewer eligibility /
// own review) so the section renders complete on first paint; this client owns
// only the interactions: write a review (eligible, none yet), edit/delete your
// own, and the anonymous sign-in CTA. Mutations go through the v1 API and end
// with `router.refresh()` so the *server* re-invokes the list handler — state
// (new review, edited body, stats) never has to be reconciled client-side.
//
// Trust details baked into the render:
//   * author names appear only when the API returned one (opt-in public
//     profile) — everyone else is the neutral verified-participant label,
//   * every row carries its provenance badge (accepted participant vs
//     verified hours), which is why the review counts at all,
//   * the eligibility note is always visible, signed-in or not.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Textarea,
  cn,
  useConfirm,
} from '@bladna/ui';
import { ApiClientError, api, errorMessageFor, fieldErrors } from '@/ui/api/client';
import { formatDate, formatNumber } from '@/ui/format';
import { getDictionary, type LocaleCode } from '@/ui/i18n';
import type { ReviewItem, ReviewsPayload } from '@/ui/opportunity';
import { SectionHeading } from '@/ui/components/section-heading';
import { useFocusFirstError } from '@/ui/use-focus-first-error';

/** 5-slot display row (aria-hidden glyphs; the parent carries the label). */
function StarGlyphs({ filled, className }: { filled: number; className?: string }) {
  return (
    <span className={cn('inline-flex gap-0.5', className)} aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= filled ? 'text-amber-500' : 'text-sand-300'}>
          ★
        </span>
      ))}
    </span>
  );
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function ReviewsSection({
  locale,
  slug,
  initial,
}: {
  locale: LocaleCode;
  slug: string;
  initial: ReviewsPayload;
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const confirm = useConfirm();

  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useFocusFirstError(errors);

  const { items, stats, viewer } = initial;
  const own = viewer.review;
  const showForm = viewer.eligible && !expired && (own === null || editing);
  const showSignIn = (expired || !viewer.authenticated) && !showForm;

  function resetComposer(): void {
    setEditing(false);
    setRating(0);
    setBody('');
    setError(null);
    setErrors({});
  }

  function startEdit(): void {
    if (!own) return;
    setEditing(true);
    setRating(own.rating);
    setBody(own.body ?? '');
    setError(null);
    setErrors({});
  }

  function failure(cause: unknown): void {
    if (cause instanceof ApiClientError && cause.code === 'UNAUTHORIZED') {
      // Session died mid-write: stop offering the form, point at sign-in.
      setExpired(true);
      return;
    }
    const fields = fieldErrors(cause);
    if (fields.rating !== undefined || fields.body !== undefined) {
      setErrors({
        ...(fields.rating !== undefined ? { rating: fields.rating } : {}),
        ...(fields.body !== undefined ? { body: fields.body } : {}),
      });
      return;
    }
    setError(errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }));
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setErrors({});
    if (rating < 1) {
      // The star group has no field slot — surface it right below the stars.
      setErrors({ rating: dict.opportunity.reviewRatingLabel });
      return;
    }
    const text = body.trim();
    setBusy(true);
    try {
      if (own && editing) {
        await api.patch(`/opportunities/${slug}/reviews/${own.id}`, {
          rating,
          body: text || null, // `null` clears the text server-side
        });
      } else {
        await api.post(`/opportunities/${slug}/reviews`, {
          rating,
          ...(text ? { body: text } : {}),
        });
      }
      setBusy(false);
      resetComposer();
      router.refresh();
    } catch (cause) {
      setBusy(false);
      failure(cause);
    }
  }

  async function removeOwn(): Promise<void> {
    if (!own || busy) return;
    const ok = await confirm(dict.opportunity.reviewDeleteConfirm, {
      confirmLabel: dict.opportunity.reviewDelete,
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.delete(`/opportunities/${slug}/reviews/${own.id}`);
      setBusy(false);
      resetComposer();
      router.refresh();
    } catch (cause) {
      setBusy(false);
      failure(cause);
    }
  }

  const signInHref = `/${locale}/login?next=${encodeURIComponent(`/${locale}/opportunities/${slug}`)}`;

  return (
    <section>
      <SectionHeading title={dict.opportunity.reviewsTitle} />

      {stats.count > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-3xl font-bold tabular-nums text-sand-900">
            {stats.average.toFixed(1)}
          </span>
          <span
            role="img"
            aria-label={`${stats.average} / 5`}
            className="flex items-center gap-0.5 text-lg"
          >
            <StarGlyphs filled={Math.round(stats.average)} />
          </span>
          <span className="text-sm text-sand-500">
            {dict.opportunity.reviewsCount.replace('{count}', formatNumber(stats.count, locale))}
          </span>
        </div>
      ) : null}

      {error ? (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      ) : null}

      {items.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {items.map((review: ReviewItem) => (
            <Card as="li" key={review.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                {review.author.name ? (
                  <Avatar size="sm" aria-hidden>
                    {initialsOf(review.author.name)}
                  </Avatar>
                ) : null}
                <span className="text-sm font-semibold text-sand-800">
                  {review.author.name ?? dict.opportunity.reviewAnonymous}
                </span>
                <Badge tone={review.source === 'HOURS' ? 'success' : 'info'}>
                  {review.source === 'HOURS'
                    ? dict.opportunity.reviewSources.hours
                    : dict.opportunity.reviewSources.participant}
                </Badge>
                {review.isMine ? <Badge tone="neutral">{dict.opportunity.reviewYour}</Badge> : null}
                <span className="ml-auto text-xs text-sand-500">
                  {formatDate(review.createdAt, locale)}
                  {review.updatedAt !== review.createdAt
                    ? ` · ${dict.opportunity.reviewEdited}`
                    : ''}
                </span>
              </div>

              <div
                role="img"
                aria-label={`${review.rating} / 5`}
                className="mt-2 flex items-center"
              >
                <StarGlyphs filled={review.rating} />
              </div>

              {review.body ? (
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-sand-700">
                  {review.body}
                </p>
              ) : null}

              {review.isMine && !showForm ? (
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="sm" onClick={startEdit} disabled={busy}>
                    {dict.opportunity.reviewEdit}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => void removeOwn()}
                    disabled={busy}
                  >
                    {dict.opportunity.reviewDelete}
                  </Button>
                </div>
              ) : null}
            </Card>
          ))}
        </ul>
      ) : (
        <EmptyState className="mt-4">{dict.opportunity.reviewsEmpty}</EmptyState>
      )}

      {/* Who may review — provenance rules, always on the page. */}
      <p className="mt-4 text-xs leading-relaxed text-sand-500">{dict.opportunity.reviewsNote}</p>

      {showForm ? (
        <Card className="mt-4 p-5">
          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            <div>
              <span className="block text-sm font-medium text-sand-700">
                {dict.opportunity.reviewRatingLabel}
              </span>
              <div
                role="radiogroup"
                aria-label={dict.opportunity.reviewRatingLabel}
                className="mt-1 flex gap-1"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    aria-label={dict.opportunity.reviewRate.replace('{n}', String(n))}
                    onClick={() => setRating(n)}
                    className={cn(
                      'min-h-11 min-w-11 rounded-lg text-2xl leading-none transition-colors',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700',
                      n <= rating ? 'text-amber-500' : 'text-sand-300 hover:text-amber-300',
                    )}
                  >
                    <span aria-hidden>★</span>
                  </button>
                ))}
              </div>
              {errors.rating ? <p className="mt-1 text-xs text-red-700">{errors.rating}</p> : null}
            </div>

            <Textarea
              label={dict.opportunity.reviewBodyLabel}
              placeholder={dict.opportunity.reviewBodyPlaceholder}
              rows={4}
              maxLength={2000}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              error={errors.body ?? null}
            />

            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={busy} disabled={rating < 1}>
                {own && editing ? dict.common.save : dict.opportunity.reviewPublish}
              </Button>
              {own && editing ? (
                <Button type="button" variant="outline" onClick={resetComposer} disabled={busy}>
                  {dict.common.cancel}
                </Button>
              ) : null}
            </div>
          </form>
        </Card>
      ) : null}

      {showSignIn ? (
        <p className="mt-3 text-sm text-sand-600">
          <Link
            href={signInHref}
            className="font-medium text-brand-700 underline hover:text-brand-800"
          >
            {dict.opportunity.reviewSignin}
          </Link>
        </p>
      ) : null}
    </section>
  );
}
