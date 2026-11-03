'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Avatar,
  Button,
  EmptyState,
  Input,
  TabPanel,
  Tabs,
  TabsRoot,
  Textarea,
  useConfirm,
} from '@bladna/ui';
import {
  METRIC_TYPES,
  SUPPORT_NEED_KINDS,
  type MetricType,
  type SupportNeedKind,
} from '@bladna/types';
import { ApiClientError, api, errorMessageFor } from '@/ui/api/client';
import { ImpactMetricCard } from '@/ui/components/impact-metric-card';
import { NeedProgressBar } from '@/ui/components/need-progress';
import { getDictionary, type LocaleCode } from '@/ui/i18n';
import { formatDate } from '@/ui/format';
import { needLabelFor } from '@/ui/opportunity';
import { StatusBadge } from '@/ui/status';

type Tab = 'narrative' | 'needs' | 'offers' | 'metrics';
type OfferStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

/** `GET /orgs/:orgId/opportunities/:id` — the narrative/contact slice. */
interface DetailNarrative {
  opportunity: {
    problemAr: string | null;
    problemFr: string | null;
    problemEn: string | null;
    objectiveAr: string | null;
    objectiveFr: string | null;
    objectiveEn: string | null;
    coverImage: string | null;
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
  };
}

interface NeedItem {
  id: string;
  kind: SupportNeedKind;
  labelAr: string;
  labelFr: string;
  labelEn: string;
  description: string | null;
  quantity: number | null;
  fulfilled: number;
  targetAmount: number | null;
  currency: string;
  progress: number | null;
  pendingOffers: number;
  acceptedOffers: number;
  acceptedAmount: number;
  /** Sum of ACCEPTED offer quantities — the pledged segment of the P18 bar. */
  acceptedQuantity: number;
}

interface OfferItem {
  id: string;
  status: OfferStatus;
  quantity: number | null;
  amount: number | null;
  currency: string | null;
  description: string | null;
  contactNote: string | null;
  reason: string | null;
  createdAt: string;
  decidedAt: string | null;
  offerer: { id: string; name: string; email: string };
  need: { id: string; kind: SupportNeedKind; labelAr: string; labelFr: string; labelEn: string };
}

interface MetricItem {
  id: string;
  metricType: MetricType;
  name: string;
  // Decimal columns arrive as JSON strings from the raw metric select.
  target: string | null;
  actual: string;
  unit: string;
  source: string;
  verified: boolean;
  createdAt: string;
}

interface NarrativeValues {
  problemAr: string;
  problemFr: string;
  problemEn: string;
  objectiveAr: string;
  objectiveFr: string;
  objectiveEn: string;
  coverImage: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
}

const EMPTY_NARRATIVE: NarrativeValues = {
  problemAr: '',
  problemFr: '',
  problemEn: '',
  objectiveAr: '',
  objectiveFr: '',
  objectiveEn: '',
  coverImage: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
};

function failMessage(cause: unknown, dict: ReturnType<typeof getDictionary>['dict']): string {
  if (
    cause instanceof ApiClientError &&
    cause.code === 'VALIDATION_ERROR' &&
    Array.isArray(cause.details)
  ) {
    const messages = (cause.details as Array<{ message?: string }>)
      .map((issue) => issue.message)
      .filter((message): message is string => Boolean(message));
    if (messages.length > 0) return messages.join(' · ');
  }
  return errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic });
}

/** Display initials for an offerer's (already masked) name — P18 avatar tile. */
function initialsOf(name: string): string {
  return name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => [...part][0] ?? '')
    .join('')
    .toUpperCase();
}

/**
 * Org-side initiative console (spec §5/§9/§13/§14): the flagship detail page's
 * counterpart — narrative + organizer contact (PATCH), support-need CRUD,
 * support-offer decisions (accept / reject with reason) and self-reported
 * initiative-level impact metrics. Everything is fetched on open and refetched
 * after each mutation so the four panels stay traceable.
 */
export function InitiativeConsole({
  locale,
  orgId,
  opportunityId,
  onClose,
}: {
  locale: LocaleCode;
  orgId: string;
  opportunityId: string;
  onClose?: () => void;
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const confirm = useConfirm();
  const c = dict.initiativeConsole;
  const base = `/orgs/${orgId}/opportunities/${encodeURIComponent(opportunityId)}`;

  const [tab, setTab] = useState<Tab>('narrative');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [narrative, setNarrative] = useState<NarrativeValues>(EMPTY_NARRATIVE);
  const [needs, setNeeds] = useState<NeedItem[]>([]);
  const [offers, setOffers] = useState<OfferItem[]>([]);
  /** P18: instant status chip over the loaded offers (no refetch needed). */
  const [offerFilter, setOfferFilter] = useState<'ALL' | OfferStatus>('ALL');
  const [metrics, setMetrics] = useState<MetricItem[]>([]);

  // Add-need form
  const [needKind, setNeedKind] = useState<SupportNeedKind>('EQUIPMENT');
  const [needLabelAr, setNeedLabelAr] = useState('');
  const [needLabelFr, setNeedLabelFr] = useState('');
  const [needLabelEn, setNeedLabelEn] = useState('');
  const [needDescription, setNeedDescription] = useState('');
  const [needQuantity, setNeedQuantity] = useState('');
  const [needTarget, setNeedTarget] = useState('');
  const [needCurrency, setNeedCurrency] = useState('DZD');

  // Per-need "fulfilled" drafts
  const [fulfilledDrafts, setFulfilledDrafts] = useState<Record<string, string>>({});

  // Reject flow
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Metric form
  const [metricType, setMetricType] = useState<MetricType>('VOLUNTEERS');
  const [metricName, setMetricName] = useState('');
  const [metricUnit, setMetricUnit] = useState('');
  const [metricActual, setMetricActual] = useState('');
  const [metricTarget, setMetricTarget] = useState('');
  const [metricSource, setMetricSource] = useState('');

  const load = useCallback(async (): Promise<void> => {
    const [detail, needList, offerList, metricList] = await Promise.all([
      api.get<DetailNarrative>(base),
      api.get<{ items: NeedItem[] }>(`${base}/support-needs?page=1&limit=50`),
      api.get<{ items: OfferItem[] }>(`${base}/support-offers?page=1&limit=20`),
      api.get<{ items: MetricItem[] }>(
        `/impact/metrics?opportunityId=${encodeURIComponent(opportunityId)}&page=1&limit=20`,
      ),
    ]);
    const o = detail.data.opportunity;
    setNarrative({
      problemAr: o.problemAr ?? '',
      problemFr: o.problemFr ?? '',
      problemEn: o.problemEn ?? '',
      objectiveAr: o.objectiveAr ?? '',
      objectiveFr: o.objectiveFr ?? '',
      objectiveEn: o.objectiveEn ?? '',
      coverImage: o.coverImage ?? '',
      contactName: o.contactName ?? '',
      contactPhone: o.contactPhone ?? '',
      contactEmail: o.contactEmail ?? '',
    });
    setNeeds(needList.data.items);
    setOffers(offerList.data.items);
    setMetrics(metricList.data.items);
    const drafts: Record<string, string> = {};
    for (const need of needList.data.items) drafts[need.id] = String(need.fulfilled);
    setFulfilledDrafts(drafts);
  }, [base, opportunityId]);

  useEffect(() => {
    let cancelled = false;
    void load()
      .catch((cause: unknown) => {
        if (!cancelled) setError(failMessage(cause, dict));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load, dict]);

  function fail(cause: unknown): void {
    setError(failMessage(cause, dict));
  }

  function flash(message: string): void {
    setError(null);
    setNotice(message);
  }

  // ── Narrative (spec §4) ────────────────────────────────────────

  async function saveNarrative(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setNotice(null);
    const triplets: Array<Array<keyof NarrativeValues>> = [
      ['problemAr', 'problemFr', 'problemEn'],
      ['objectiveAr', 'objectiveFr', 'objectiveEn'],
    ];
    for (const triplet of triplets) {
      const filled = triplet.filter((key) => narrative[key].trim() !== '');
      if (filled.length > 0 && filled.length < triplet.length) {
        setError(c.tripletRequired);
        return;
      }
    }
    setBusy(true);
    try {
      await api.patch(base, {
        problemAr: narrative.problemAr,
        problemFr: narrative.problemFr,
        problemEn: narrative.problemEn,
        objectiveAr: narrative.objectiveAr,
        objectiveFr: narrative.objectiveFr,
        objectiveEn: narrative.objectiveEn,
        coverImage: narrative.coverImage,
        contactName: narrative.contactName,
        // Phone/email are strict formats — empty means "unchanged", not "".
        ...(narrative.contactPhone ? { contactPhone: narrative.contactPhone } : {}),
        ...(narrative.contactEmail ? { contactEmail: narrative.contactEmail } : {}),
      });
      flash(c.saved);
      router.refresh();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  // ── Support needs (spec §13) ───────────────────────────────────

  async function createNeed(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setNotice(null);
    if (!needLabelAr.trim() || !needLabelFr.trim() || !needLabelEn.trim()) {
      setError(dict.common.required);
      return;
    }
    const target = Number(needTarget.replace(',', '.'));
    const quantity = Number(needQuantity);
    if (needKind === 'FINANCIAL') {
      if (!Number.isFinite(target) || target <= 0) {
        setError(dict.common.required);
        return;
      }
    } else if (needQuantity.trim() !== '' && (!Number.isInteger(quantity) || quantity < 1)) {
      setError(dict.common.required);
      return;
    }
    setBusy(true);
    try {
      await api.post(`${base}/support-needs`, {
        kind: needKind,
        labelAr: needLabelAr.trim(),
        labelFr: needLabelFr.trim(),
        labelEn: needLabelEn.trim(),
        ...(needDescription.trim() ? { description: needDescription.trim() } : {}),
        ...(needKind === 'FINANCIAL'
          ? { targetAmount: target, currency: needCurrency.trim().toUpperCase() || 'DZD' }
          : needQuantity.trim()
            ? { quantity }
            : {}),
      });
      flash(c.needCreated);
      setNeedLabelAr('');
      setNeedLabelFr('');
      setNeedLabelEn('');
      setNeedDescription('');
      setNeedQuantity('');
      setNeedTarget('');
      await load();
      router.refresh();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  async function saveFulfilled(need: NeedItem): Promise<void> {
    setNotice(null);
    const value = Number(fulfilledDrafts[need.id] ?? need.fulfilled);
    if (!Number.isInteger(value) || value < 0) {
      setError(dict.errors.validation);
      return;
    }
    setBusy(true);
    try {
      await api.patch(`${base}/support-needs/${need.id}`, { fulfilled: value });
      flash(c.needUpdated);
      await load();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  async function removeNeed(need: NeedItem): Promise<void> {
    if (!(await confirm(c.needDeleteConfirm))) return;
    setNotice(null);
    setBusy(true);
    try {
      await api.delete(`${base}/support-needs/${need.id}`);
      flash(c.needDeleted);
      await load();
      router.refresh();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  // ── Support offers (spec §13) ──────────────────────────────────

  async function decide(
    offerId: string,
    action: 'ACCEPT' | 'REJECT',
    reason?: string,
  ): Promise<void> {
    setNotice(null);
    setBusy(true);
    try {
      await api.post(`${base}/support-offers/${offerId}`, reason ? { action, reason } : { action });
      flash(c.decideSuccess);
      setRejectingId(null);
      setRejectReason('');
      await load();
      router.refresh();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  function confirmReject(offerId: string): void {
    if (rejectReason.trim().length < 3) {
      setError(dict.admin.reasonRequired);
      return;
    }
    void decide(offerId, 'REJECT', rejectReason.trim());
  }

  // ── Impact metrics (spec §14) ──────────────────────────────────

  async function createMetric(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setNotice(null);
    const actual = Number(metricActual.replace(',', '.'));
    const target = metricTarget.trim() === '' ? null : Number(metricTarget.replace(',', '.'));
    if (
      metricName.trim().length < 2 ||
      metricUnit.trim() === '' ||
      metricSource.trim().length < 3
    ) {
      setError(dict.common.required);
      return;
    }
    if (!Number.isFinite(actual) || actual < 0) {
      setError(dict.errors.validation);
      return;
    }
    if (target !== null && !Number.isFinite(target)) {
      setError(dict.errors.validation);
      return;
    }
    setBusy(true);
    try {
      await api.post(`${base}/metrics`, {
        metricType,
        name: metricName.trim(),
        actual,
        unit: metricUnit.trim(),
        source: metricSource.trim(),
        ...(target !== null ? { target } : {}),
      });
      flash(c.addMetricDone);
      setMetricName('');
      setMetricUnit('');
      setMetricActual('');
      setMetricTarget('');
      setMetricSource('');
      await load();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'narrative', label: c.tabs.narrative },
    { key: 'needs', label: c.tabs.needs },
    { key: 'offers', label: c.tabs.offers },
    { key: 'metrics', label: c.tabs.metrics },
  ];

  // One selection handler for the tab set (state + transient feedback reset).
  const selectTab = (id: Tab): void => {
    setTab(id);
    setError(null);
    setNotice(null);
  };

  const inputCls = 'block w-full h-10 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm';

  // ── P18 offers view: headline counts, status chips, per-need groups ──
  const visibleOffers =
    offerFilter === 'ALL' ? offers : offers.filter((offer) => offer.status === offerFilter);
  const offerCounts = {
    ALL: offers.length,
    PENDING: offers.filter((offer) => offer.status === 'PENDING').length,
    ACCEPTED: offers.filter((offer) => offer.status === 'ACCEPTED').length,
    REJECTED: offers.filter((offer) => offer.status === 'REJECTED').length,
  };
  // Bucket the visible offers per need, ordered like the needs page
  // (sortOrder); an offer whose need sits outside the loaded page still gets
  // its own standalone group instead of disappearing.
  const buckets = new Map<string, OfferItem[]>();
  for (const offer of visibleOffers) {
    const bucket = buckets.get(offer.need.id);
    if (bucket) bucket.push(offer);
    else buckets.set(offer.need.id, [offer]);
  }
  const groupOrder = [
    ...needs.map((need) => need.id),
    ...[...buckets.keys()].filter((id) => !needs.some((need) => need.id === id)),
  ];
  const offerGroups: Array<{
    key: string;
    kind: SupportNeedKind;
    label: string;
    meta: NeedItem | undefined;
    items: OfferItem[];
  }> = [];
  for (const needId of groupOrder) {
    const items = buckets.get(needId);
    const first = items?.[0];
    if (!items || !first) continue;
    const meta = needs.find((need) => need.id === needId);
    offerGroups.push({
      key: needId,
      kind: meta?.kind ?? first.need.kind,
      label: meta ? needLabelFor(meta, locale) : needLabelFor(first.need, locale),
      meta,
      items,
    });
  }

  return (
    <section className="rounded-xl border border-brand-200 bg-white p-4" aria-label={c.title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-sand-900">{c.title}</h3>
          <p className="text-xs text-sand-500">{c.hint}</p>
        </div>
        {onClose ? (
          <Button variant="ghost" size="sm" onClick={onClose}>
            {dict.common.close}
          </Button>
        ) : null}
      </div>

      <TabsRoot active={tab} onSelect={selectTab}>
        <Tabs
          items={tabs.map((item) => ({ id: item.key, label: item.label }))}
          active={tab}
          onSelect={selectTab}
          ariaLabel={c.tabsLabel}
          className="mt-3"
        />

        {error ? (
          <Alert role="alert" tone="danger" className="mt-3">
            {error}
          </Alert>
        ) : null}
        {notice ? (
          <Alert role="status" tone="success" className="mt-3">
            {notice}
          </Alert>
        ) : null}

        {loading ? (
          <p className="mt-4 text-sm text-sand-500">{dict.common.loading}</p>
        ) : (
          <div className="mt-4">
            {/* ── Narrative ── */}
            <TabPanel id="narrative" active={tab}>
              <form
                onSubmit={(event) => void saveNarrative(event)}
                className="space-y-4"
                noValidate
              >
                <p className="text-sm text-sand-600">{c.narrativeHint}</p>

                <h4 className="text-sm font-semibold text-sand-900">
                  {dict.opportunity.problemTitle}
                </h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Textarea
                    label={dict.workspace.opportunities.form.labelAr}
                    value={narrative.problemAr}
                    maxLength={2000}
                    onChange={(event) =>
                      setNarrative({ ...narrative, problemAr: event.target.value })
                    }
                  />
                  <Textarea
                    label={dict.workspace.opportunities.form.labelFr}
                    value={narrative.problemFr}
                    maxLength={2000}
                    onChange={(event) =>
                      setNarrative({ ...narrative, problemFr: event.target.value })
                    }
                  />
                  <Textarea
                    label={dict.workspace.opportunities.form.labelEn}
                    value={narrative.problemEn}
                    maxLength={2000}
                    onChange={(event) =>
                      setNarrative({ ...narrative, problemEn: event.target.value })
                    }
                  />
                </div>

                <h4 className="text-sm font-semibold text-sand-900">
                  {dict.opportunity.objectiveTitle}
                </h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Textarea
                    label={dict.workspace.opportunities.form.labelAr}
                    value={narrative.objectiveAr}
                    maxLength={2000}
                    onChange={(event) =>
                      setNarrative({ ...narrative, objectiveAr: event.target.value })
                    }
                  />
                  <Textarea
                    label={dict.workspace.opportunities.form.labelFr}
                    value={narrative.objectiveFr}
                    maxLength={2000}
                    onChange={(event) =>
                      setNarrative({ ...narrative, objectiveFr: event.target.value })
                    }
                  />
                  <Textarea
                    label={dict.workspace.opportunities.form.labelEn}
                    value={narrative.objectiveEn}
                    maxLength={2000}
                    onChange={(event) =>
                      setNarrative({ ...narrative, objectiveEn: event.target.value })
                    }
                  />
                </div>

                <Input
                  label={c.coverLabel}
                  type="url"
                  placeholder="https://…"
                  value={narrative.coverImage}
                  maxLength={500}
                  onChange={(event) =>
                    setNarrative({ ...narrative, coverImage: event.target.value })
                  }
                />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Input
                    label={c.contactNameLabel}
                    value={narrative.contactName}
                    maxLength={120}
                    onChange={(event) =>
                      setNarrative({ ...narrative, contactName: event.target.value })
                    }
                  />
                  <Input
                    label={c.contactPhoneLabel}
                    type="tel"
                    placeholder="+213 …"
                    value={narrative.contactPhone}
                    maxLength={32}
                    onChange={(event) =>
                      setNarrative({ ...narrative, contactPhone: event.target.value })
                    }
                  />
                  <Input
                    label={c.contactEmailLabel}
                    type="email"
                    value={narrative.contactEmail}
                    maxLength={254}
                    onChange={(event) =>
                      setNarrative({ ...narrative, contactEmail: event.target.value })
                    }
                  />
                </div>
                <p className="text-xs text-sand-500">{c.contactHint}</p>

                <Button type="submit" loading={busy}>
                  {dict.common.save}
                </Button>
              </form>
            </TabPanel>

            {/* ── Support needs ── */}
            <TabPanel id="needs" active={tab}>
              <div className="space-y-5">
                {needs.length === 0 ? (
                  <EmptyState>{c.needsEmpty}</EmptyState>
                ) : (
                  <ul className="space-y-3">
                    {needs.map((need) => (
                      <li key={need.id} className="rounded-lg border border-sand-200 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-sand-100 px-2 py-0.5 text-xs font-semibold text-sand-700">
                            {dict.opportunity.needKinds[need.kind]}
                          </span>
                          <span className="text-sm font-medium text-sand-900">
                            {needLabelFor(need, locale)}
                          </span>
                        </div>
                        {need.description ? (
                          <p dir="auto" className="mt-1 text-sm text-sand-600">
                            {need.description}
                          </p>
                        ) : null}
                        {/* P18: quantity needs get the two-tone bar — received
                            solid, accepted offers lighter — so a decision on
                            the offers tab visibly moves progress right here. */}
                        {need.kind !== 'FINANCIAL' && need.quantity != null ? (
                          <div className="mt-2 max-w-md">
                            <NeedProgressBar
                              quantity={need.quantity}
                              received={need.fulfilled}
                              acceptedQuantity={need.acceptedQuantity}
                              locale={locale}
                            />
                          </div>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-sand-600">
                          {need.kind === 'FINANCIAL' ? (
                            <span>
                              {dict.opportunity.acceptedAmount}:{' '}
                              {need.acceptedAmount.toLocaleString(locale)} /{' '}
                              {(need.targetAmount ?? 0).toLocaleString(locale)} {need.currency}
                            </span>
                          ) : need.quantity != null ? null : (
                            <span>
                              {c.needFulfilledLabel}: {need.fulfilled}
                            </span>
                          )}
                          <span>
                            {c.pendingOffers}: {need.pendingOffers}
                          </span>
                          <span>
                            {dict.opportunity.acceptedOffers}: {need.acceptedOffers}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-end gap-2">
                          {need.kind !== 'FINANCIAL' ? (
                            <label className="text-xs text-sand-600">
                              {c.needFulfilledLabel}
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={fulfilledDrafts[need.id] ?? String(need.fulfilled)}
                                onChange={(event) =>
                                  setFulfilledDrafts({
                                    ...fulfilledDrafts,
                                    [need.id]: event.target.value,
                                  })
                                }
                                className={`${inputCls} mt-1 w-28`}
                              />
                            </label>
                          ) : null}
                          <Button
                            size="sm"
                            variant="outline"
                            loading={busy}
                            onClick={() => void saveFulfilled(need)}
                          >
                            {dict.common.save}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={busy}
                            onClick={() => void removeNeed(need)}
                          >
                            {dict.workspace.members.remove}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <form
                  onSubmit={(event) => void createNeed(event)}
                  className="space-y-3 rounded-lg border border-sand-200 bg-sand-50 p-4"
                  noValidate
                >
                  <h4 className="text-sm font-semibold text-sand-900">{c.addNeed}</h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block text-sm font-medium text-sand-700">
                      {c.needKind}
                      <select
                        value={needKind}
                        onChange={(event) => setNeedKind(event.target.value as SupportNeedKind)}
                        className={`${inputCls} mt-1`}
                      >
                        {SUPPORT_NEED_KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {dict.opportunity.needKinds[kind]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Input
                      label={c.needDescription}
                      value={needDescription}
                      maxLength={1000}
                      onChange={(event) => setNeedDescription(event.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Input
                      label={dict.workspace.opportunities.form.labelAr}
                      required
                      value={needLabelAr}
                      maxLength={200}
                      onChange={(event) => setNeedLabelAr(event.target.value)}
                    />
                    <Input
                      label={dict.workspace.opportunities.form.labelFr}
                      required
                      value={needLabelFr}
                      maxLength={200}
                      onChange={(event) => setNeedLabelFr(event.target.value)}
                    />
                    <Input
                      label={dict.workspace.opportunities.form.labelEn}
                      required
                      value={needLabelEn}
                      maxLength={200}
                      onChange={(event) => setNeedLabelEn(event.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {needKind === 'FINANCIAL' ? (
                      <>
                        <Input
                          label={c.needTargetLabel}
                          type="number"
                          min={0.01}
                          step="0.01"
                          required
                          value={needTarget}
                          onChange={(event) => setNeedTarget(event.target.value)}
                        />
                        <Input
                          label={c.needCurrency}
                          value={needCurrency}
                          maxLength={3}
                          onChange={(event) => setNeedCurrency(event.target.value)}
                        />
                      </>
                    ) : (
                      <Input
                        label={`${c.needQuantityLabel} (${dict.common.optional})`}
                        type="number"
                        min={1}
                        step={1}
                        value={needQuantity}
                        onChange={(event) => setNeedQuantity(event.target.value)}
                      />
                    )}
                  </div>
                  <Button type="submit" loading={busy}>
                    {c.needCreate}
                  </Button>
                </form>
              </div>
            </TabPanel>

            {/* ── Support offers (P18: summary + status chips + per-need
                groups) — the decision room reads against each need's target,
                and a decision visibly moves status, counts and bar in place. */}
            <TabPanel id="offers" active={tab}>
              <div className="space-y-4">
                {offers.length === 0 ? (
                  <EmptyState>{c.offersEmpty}</EmptyState>
                ) : (
                  <>
                    {/* Headline counts, colour-coded per status. */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="rounded-lg border border-sand-200 p-4">
                        <p className="text-xs text-sand-500">{c.offersTotal}</p>
                        <p className="mt-0.5 text-2xl font-semibold tabular-nums text-sand-900">
                          {offerCounts.ALL}
                        </p>
                      </div>
                      <div className="rounded-lg border border-sand-200 p-4">
                        <p className="text-xs text-sand-500">{c.offerStatuses.PENDING}</p>
                        <p className="mt-0.5 text-2xl font-semibold tabular-nums text-amber-700">
                          {offerCounts.PENDING}
                        </p>
                      </div>
                      <div className="rounded-lg border border-sand-200 p-4">
                        <p className="text-xs text-sand-500">{c.offerStatuses.ACCEPTED}</p>
                        <p className="mt-0.5 text-2xl font-semibold tabular-nums text-brand-700">
                          {offerCounts.ACCEPTED}
                        </p>
                      </div>
                    </div>

                    {/* Status chips filter the loaded offers instantly. */}
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          ['ALL', c.offersAll],
                          ['PENDING', c.offerStatuses.PENDING],
                          ['ACCEPTED', c.offerStatuses.ACCEPTED],
                          ['REJECTED', c.offerStatuses.REJECTED],
                        ] as const
                      ).map(([key, label]) => {
                        const active = offerFilter === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setOfferFilter(key)}
                            className={`min-h-11 rounded-full px-4 text-sm font-medium transition-colors ${
                              active
                                ? 'bg-brand-600 text-white'
                                : 'bg-sand-100 text-sand-700 hover:bg-sand-200'
                            }`}
                          >
                            {label} ({offerCounts[key]})
                          </button>
                        );
                      })}
                    </div>

                    {visibleOffers.length === 0 ? (
                      <EmptyState>{c.offersEmpty}</EmptyState>
                    ) : (
                      <ul className="space-y-4">
                        {offerGroups.map((group) => (
                          <li
                            key={group.key}
                            className="overflow-hidden rounded-lg border border-sand-200 bg-white"
                          >
                            {/* Group header = the need itself: kind pill, label,
                                offer counts and the two-tone progress bar. */}
                            <div className="space-y-2 border-b border-sand-100 bg-sand-50 p-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-sand-700">
                                  {dict.opportunity.needKinds[group.kind]}
                                </span>
                                <span className="text-sm font-semibold text-sand-900">
                                  {group.label}
                                </span>
                                <span className="text-xs text-sand-500">
                                  {c.pendingOffers}: {group.meta?.pendingOffers ?? 0} ·{' '}
                                  {dict.opportunity.acceptedOffers}:{' '}
                                  {group.meta?.acceptedOffers ?? 0}
                                </span>
                              </div>
                              {group.meta && group.meta.quantity != null ? (
                                <NeedProgressBar
                                  quantity={group.meta.quantity}
                                  received={group.meta.fulfilled}
                                  acceptedQuantity={group.meta.acceptedQuantity}
                                  locale={locale}
                                />
                              ) : group.meta && group.meta.kind === 'FINANCIAL' ? (
                                <p className="text-xs text-sand-600">
                                  {dict.opportunity.acceptedAmount}:{' '}
                                  <span className="font-semibold tabular-nums text-sand-900">
                                    {group.meta.acceptedAmount.toLocaleString(locale)} /{' '}
                                    {(group.meta.targetAmount ?? 0).toLocaleString(locale)}{' '}
                                    {group.meta.currency}
                                  </span>
                                </p>
                              ) : null}
                            </div>

                            <ul className="divide-y divide-sand-100">
                              {group.items.map((offer) => (
                                <li key={offer.id} className="p-4">
                                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <StatusBadge
                                        status={offer.status}
                                        label={c.offerStatuses[offer.status]}
                                      />
                                      {/* The offer's own weight — large, tabular. */}
                                      {offer.amount != null ? (
                                        <span className="text-base font-semibold tabular-nums text-sand-900">
                                          {Number(offer.amount).toLocaleString(locale)}{' '}
                                          {offer.currency ?? 'DZD'}
                                        </span>
                                      ) : offer.quantity != null ? (
                                        <span className="text-base font-semibold tabular-nums text-sand-900">
                                          ×{offer.quantity}
                                        </span>
                                      ) : null}
                                    </div>
                                    <span className="text-xs text-sand-500">
                                      {c.offerSubmittedAt} {formatDate(offer.createdAt, locale)}
                                    </span>
                                  </div>

                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <Avatar size="sm" aria-hidden="true">
                                      {initialsOf(offer.offerer.name)}
                                    </Avatar>
                                    <span className="text-sm font-medium text-sand-800">
                                      {c.offerFrom}: {offer.offerer.name}
                                    </span>
                                    <span className="text-xs text-sand-500" dir="ltr">
                                      {offer.offerer.email}
                                    </span>
                                  </div>

                                  {offer.description ? (
                                    <p
                                      dir="auto"
                                      className="mt-2 border-s-2 border-sand-200 ps-3 text-sm leading-relaxed text-sand-700"
                                    >
                                      {offer.description}
                                    </p>
                                  ) : null}
                                  {offer.contactNote ? (
                                    <p dir="auto" className="mt-1.5 text-xs text-sand-600">
                                      {dict.opportunity.offerContactNote}: {offer.contactNote}
                                    </p>
                                  ) : null}
                                  <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-sand-500">
                                    {offer.decidedAt ? (
                                      <span>
                                        {c.offerDecidedAt} {formatDate(offer.decidedAt, locale)}
                                      </span>
                                    ) : null}
                                    {offer.reason ? (
                                      <span className="text-red-700">
                                        {c.rejectReason}: {offer.reason}
                                      </span>
                                    ) : null}
                                  </p>

                                  {offer.status === 'PENDING' ? (
                                    <div className="mt-3 space-y-2">
                                      <div className="flex flex-wrap gap-2">
                                        <Button
                                          size="sm"
                                          loading={busy}
                                          onClick={() => void decide(offer.id, 'ACCEPT')}
                                        >
                                          {c.accept}
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => {
                                            setRejectingId(
                                              rejectingId === offer.id ? null : offer.id,
                                            );
                                            setRejectReason('');
                                            setError(null);
                                          }}
                                        >
                                          {c.reject}
                                        </Button>
                                      </div>
                                      {rejectingId === offer.id ? (
                                        <div className="space-y-2">
                                          <Textarea
                                            label={c.rejectReason}
                                            required
                                            maxLength={500}
                                            value={rejectReason}
                                            onChange={(event) =>
                                              setRejectReason(event.target.value)
                                            }
                                          />
                                          <Button
                                            size="sm"
                                            variant="danger"
                                            loading={busy}
                                            onClick={() => confirmReject(offer.id)}
                                          >
                                            {c.reject}
                                          </Button>
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </TabPanel>

            {/* ── Impact metrics ── */}
            <TabPanel id="metrics" active={tab}>
              <div className="space-y-5">
                <p className="text-xs text-sand-500">{dict.opportunity.impactSelfReported}</p>
                {metrics.length === 0 ? (
                  <EmptyState>{c.metricsEmpty}</EmptyState>
                ) : (
                  <ul className="space-y-3">
                    {metrics.map((metric) => (
                      <li key={metric.id} className="rounded-lg border border-sand-200 p-4">
                        <ImpactMetricCard
                          locale={locale}
                          name={metric.name}
                          typeLabel={c.metricTypes[metric.metricType]}
                          actual={metric.actual}
                          target={metric.target}
                          unit={metric.unit}
                          source={metric.source}
                          verified={metric.verified}
                          date={metric.createdAt}
                          labels={{
                            actual: c.metricActual,
                            target: c.metricTarget,
                            source: c.metricSource,
                            verified: dict.common.verified,
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                )}

                <form
                  onSubmit={(event) => void createMetric(event)}
                  className="space-y-3 rounded-lg border border-sand-200 bg-sand-50 p-4"
                  noValidate
                >
                  <h4 className="text-sm font-semibold text-sand-900">{c.addMetric}</h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block text-sm font-medium text-sand-700">
                      {c.metricType}
                      <select
                        value={metricType}
                        onChange={(event) => setMetricType(event.target.value as MetricType)}
                        className={`${inputCls} mt-1`}
                      >
                        {METRIC_TYPES.map((kind) => (
                          <option key={kind} value={kind}>
                            {c.metricTypes[kind]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Input
                      label={c.metricName}
                      required
                      value={metricName}
                      maxLength={160}
                      onChange={(event) => setMetricName(event.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Input
                      label={c.metricActual}
                      type="number"
                      min={0}
                      required
                      value={metricActual}
                      onChange={(event) => setMetricActual(event.target.value)}
                    />
                    <Input
                      label={`${c.metricTarget} (${dict.common.optional})`}
                      type="number"
                      min={0}
                      value={metricTarget}
                      onChange={(event) => setMetricTarget(event.target.value)}
                    />
                    <Input
                      label={c.metricUnit}
                      required
                      value={metricUnit}
                      maxLength={40}
                      onChange={(event) => setMetricUnit(event.target.value)}
                    />
                  </div>
                  <Input
                    label={c.metricSource}
                    required
                    value={metricSource}
                    maxLength={300}
                    onChange={(event) => setMetricSource(event.target.value)}
                  />
                  <Button type="submit" loading={busy}>
                    {c.addMetric}
                  </Button>
                </form>
              </div>
            </TabPanel>
          </div>
        )}
      </TabsRoot>
    </section>
  );
}
