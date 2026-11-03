'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, Input, Textarea } from '@bladna/ui';
import { ApiClientError, api, errorMessageFor, fieldErrors } from '@/ui/api/client';
import { ChevronLeftIcon } from '@/ui/components/icons';
import { NeedProgressBar } from '@/ui/components/need-progress';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { getDictionary, type LocaleCode } from '@/ui/i18n';
import { formatNumber } from '@/ui/format';
import { needLabelFor, type SupportNeedItem } from '@/ui/opportunity';

type AuthState = { kind: 'anonymous' } | { kind: 'needs-email' } | { kind: 'ready' };

/**
 * Declared-need rows + support-offer forms (spec §5/§9/§13) →
 * POST /opportunities/:slug/support-offers. Financial offers carry an amount
 * (bank transfer happens outside the platform; we only record the pledge);
 * equipment/material/service offers carry a quantity. The server enforces the
 * kind rules — this form mirrors them only for immediate feedback.
 */
export function InitiativeSupport({
  locale,
  slug,
  needs,
  initialAuth,
}: {
  locale: LocaleCode;
  slug: string;
  needs: SupportNeedItem[];
  initialAuth: AuthState;
}) {
  const { dict } = getDictionary(locale);
  const [auth, setAuth] = useState<AuthState>(initialAuth);
  const [openNeedId, setOpenNeedId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [amount, setAmount] = useState('');
  const [contactNote, setContactNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [doneFor, setDoneFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // DESIGN §8: failed submit focuses the first invalid control (RESEARCH M4).
  useFocusFirstError(errors);

  const kindLabels = dict.opportunity.needKinds;

  function openForm(need: SupportNeedItem): void {
    setOpenNeedId((current) => (current === need.id ? null : need.id));
    setDescription('');
    setQuantity('');
    setAmount('');
    setContactNote('');
    setError(null);
    setErrors({});
    setDoneFor(null);
  }

  async function submit(need: SupportNeedItem, event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setErrors({});

    // Mirror the server's kind rules for instant feedback.
    const localErrors: Record<string, string> = {};
    if (description.trim().length < 3) {
      localErrors.description = dict.opportunity.offerDescription;
    }
    if (need.kind === 'FINANCIAL') {
      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0) localErrors.amount = dict.opportunity.offerAmount;
    } else {
      const value = Number(quantity);
      if (!Number.isInteger(value) || value < 1) {
        localErrors.quantity = dict.opportunity.offerQuantity;
      }
    }
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }

    setBusy(true);
    try {
      await api.post(`/opportunities/${slug}/support-offers`, {
        supportNeedId: need.id,
        description: description.trim(),
        ...(need.kind === 'FINANCIAL'
          ? { amount: Number(amount) }
          : { quantity: Number(quantity) }),
        ...(contactNote.trim() ? { contactNote: contactNote.trim() } : {}),
      });
      setDoneFor(need.id);
      setOpenNeedId(null);
    } catch (cause) {
      if (cause instanceof ApiClientError) {
        if (cause.code === 'UNAUTHORIZED') {
          setAuth({ kind: 'anonymous' });
          setBusy(false);
          return;
        }
        if (cause.code === 'FORBIDDEN') {
          setAuth({ kind: 'needs-email' });
          setBusy(false);
          return;
        }
        const fields = fieldErrors(cause);
        if (Object.keys(fields).length > 0) {
          setErrors(fields);
          setBusy(false);
          return;
        }
      }
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {needs.map((need) => {
        const label = needLabelFor(need, locale);
        const kindLabel = kindLabels[need.kind as keyof typeof kindLabels] ?? (need.kind as string);
        const filled = need.quantity !== null && need.fulfilled >= need.quantity;
        const goalReached = need.targetAmount !== null && need.acceptedAmount >= need.targetAmount;
        const closed = filled || goalReached;
        const isOpen = openNeedId === need.id;
        const justDone = doneFor === need.id;

        return (
          <Card key={need.id} className="flex h-full flex-col p-5">
            {/* Type chips first — the same kit-chip language as the org profile
                and the workspace console's kind pill. */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{kindLabel}</Badge>
              {closed ? <Badge tone="success">{dict.opportunity.needComplete}</Badge> : null}
            </div>

            <h3 className="mt-2.5 text-base font-semibold leading-snug text-sand-900">{label}</h3>

            {/* dir="auto": demo copy is English inside an RTL page — without it,
                lines break mid-phrase and periods land at the wrong edge. */}
            {need.description ? (
              <p dir="auto" className="mt-1.5 text-sm leading-relaxed text-sand-600">
                {need.description}
              </p>
            ) : null}

            {/* Honest progress: the two-tone quantity bar (received solid +
                accepted-pledged lighter — P18), or accepted amount vs target. */}
            <div className="mt-4 space-y-1.5">
              {need.quantity !== null ? (
                <>
                  <NeedProgressBar
                    quantity={need.quantity}
                    received={need.fulfilled}
                    acceptedQuantity={need.acceptedQuantity}
                    locale={locale}
                  />
                  <p className="text-xs text-sand-500">
                    {dict.opportunity.acceptedOffers}: {formatNumber(need.acceptedOffers, locale)}
                  </p>
                </>
              ) : null}
              {need.targetAmount !== null ? (
                <>
                  <div
                    className="h-2 w-full overflow-hidden rounded-full bg-sand-100"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={Number(need.targetAmount)}
                    aria-valuenow={Math.min(need.acceptedAmount, Number(need.targetAmount))}
                    aria-label={dict.opportunity.progressLabel}
                  >
                    <div
                      className="h-2 rounded-full bg-brand-600"
                      style={{
                        width: `${Math.round(
                          (Math.min(need.acceptedAmount, Number(need.targetAmount)) /
                            Number(need.targetAmount)) *
                            100,
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs">
                    <span className="text-sand-500">
                      {dict.opportunity.acceptedAmount}:{' '}
                      <span className="font-semibold tabular-nums text-sand-900">
                        {formatNumber(need.acceptedAmount, locale)} /{' '}
                        {formatNumber(Number(need.targetAmount), locale)} {need.currency}
                      </span>
                    </span>
                    <span className="text-sand-500">
                      {dict.opportunity.acceptedOffers}: {formatNumber(need.acceptedOffers, locale)}
                    </span>
                  </div>
                </>
              ) : null}
            </div>

            {justDone ? (
              <Alert tone="success" className="mt-3">
                {dict.opportunity.offerSuccess}
              </Alert>
            ) : null}

            {/* Hairline footer pinned to the card bottom — the CTA/status row
                shared with the directory and campaign cards. */}
            <div className="mt-auto border-t border-sand-100 pt-3">
              {auth.kind === 'anonymous' ? (
                <Link
                  href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/opportunities/${slug}`)}`}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800"
                >
                  <ChevronLeftIcon className="size-4 rtl:rotate-180" />
                  {dict.opportunity.supportLogin}
                </Link>
              ) : closed ? (
                <p className="text-sm text-sand-500">{dict.opportunity.offerClosed}</p>
              ) : auth.kind === 'needs-email' ? (
                <p className="text-sm text-sand-600">{dict.opportunity.applyVerifyEmail}</p>
              ) : (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openForm(need)}
                    aria-expanded={isOpen}
                  >
                    {dict.opportunity.helpTitle} — {dict.opportunity.offerFormTitle}
                  </Button>

                  {isOpen ? (
                    <form
                      onSubmit={(event) => void submit(need, event)}
                      className="mt-3 space-y-3"
                      noValidate
                    >
                      {error ? <Alert tone="danger">{error}</Alert> : null}

                      <Textarea
                        label={dict.opportunity.offerDescription}
                        name="description"
                        required
                        maxLength={500}
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        error={errors.description}
                      />

                      {need.kind === 'FINANCIAL' ? (
                        <Input
                          label={dict.opportunity.offerAmount}
                          name="amount"
                          type="number"
                          min={1}
                          step="0.01"
                          required
                          value={amount}
                          onChange={(event) => setAmount(event.target.value)}
                          error={errors.amount}
                        />
                      ) : (
                        <Input
                          label={dict.opportunity.offerQuantity}
                          name="quantity"
                          type="number"
                          min={1}
                          step="1"
                          required
                          value={quantity}
                          onChange={(event) => setQuantity(event.target.value)}
                          error={errors.quantity}
                        />
                      )}

                      <Input
                        label={dict.opportunity.offerContactNote}
                        name="contactNote"
                        maxLength={300}
                        value={contactNote}
                        onChange={(event) => setContactNote(event.target.value)}
                      />

                      {need.kind === 'FINANCIAL' ? (
                        <p className="text-xs text-sand-500">{dict.opportunity.offerBankNote}</p>
                      ) : null}

                      <Button type="submit" loading={busy} size="sm">
                        {busy ? dict.opportunity.offerSending : dict.opportunity.offerSubmit}
                      </Button>
                    </form>
                  ) : null}
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
