'use client';

import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  INVOICE_STATUSES,
  type InvoiceStatus,
  type LocaleCode,
  type OrgMemberRole,
  type PaymentMethod,
  type PaymentStatus,
  type PlanTier,
  type SubscriptionStatus,
} from '@bladna/types';
import { Alert, Badge, Button, Card, CardTitle, EmptyState, Input, Select, cn } from '@bladna/ui';
import { ApiClientError, api, errorMessageFor } from '@/ui/api/client';
import { getDictionary } from '@/ui/i18n';
import { badgeLabel, formatDate, formatNumber } from '@/ui/format';
import { planActionFor, planName } from './billing-utils';
import { ListPager, type PageMeta } from '@/ui/components/list-pager';
import { StatusBadge } from '@/ui/status';

// ── Response shapes (mirrors the module SELECTs in server/modules/billing) ──

export interface ListResult<T> {
  items: T[];
  meta: PageMeta;
}

export interface BadgeLabels {
  code: string;
  labelAr: string;
  labelFr: string;
  labelEn: string;
}

export interface BillingOrgRow {
  role: OrgMemberRole;
  status: string;
  joinedAt: string | Date;
  organization: {
    id: string;
    name: string;
    slug: string;
    badge: BadgeLabels;
  };
}

export interface PlanRow {
  id: string;
  code: string;
  tier: PlanTier;
  nameAr: string;
  nameFr: string;
  nameEn: string;
  priceDzd: number;
  currency: string;
  periodDays: number;
  features: string[];
  maxSeats: number;
  maxPublishedOpportunities: number;
  active: boolean;
  sortOrder: number;
}

export interface SubscriptionRow {
  id: string;
  organizationId: string;
  planId: string;
  status: SubscriptionStatus;
  currentPeriodStart: string | Date;
  currentPeriodEnd: string | Date;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  plan: PlanRow;
}

export interface BillingData {
  subscription: SubscriptionRow | null;
  outstandingInvoices: number;
}

export interface InvoiceItemRow {
  id: string;
  description: string;
  quantity: number;
  unitPriceDzd: number;
  totalDzd: number;
}

export interface InvoiceRow {
  id: string;
  organizationId: string;
  subscriptionId: string | null;
  number: string;
  status: InvoiceStatus;
  amountDzd: number;
  taxRate: number;
  totalDzd: number;
  periodStart: string | Date | null;
  periodEnd: string | Date | null;
  dueAt: string | Date | null;
  paidAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  items: InvoiceItemRow[];
}

export interface PaymentRow {
  id: string;
  organizationId: string;
  invoiceId: string | null;
  provider: string;
  method: PaymentMethod;
  amountDzd: number;
  currency: string;
  status: PaymentStatus;
  reference: string | null;
  occurredAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

const CANCELABLE: readonly SubscriptionStatus[] = ['TRIALING', 'ACTIVE', 'PAST_DUE'];

const TABLE = 'w-full text-sm' as const; // table base; direction handled by dir attr

/**
 * Billing console: subscription, plans, invoices and the payment ledger for
 * ONE organization. Payments are bank-transfer only — the form records an
 * offline transfer that stays PENDING until an admin confirms it; there is no
 * online checkout in this deployment and none is simulated.
 */
export function BillingConsole({
  locale,
  orgs,
  selectedOrgId,
  plans,
  billing,
  initialInvoices,
  initialPayments,
}: {
  locale: LocaleCode;
  orgs: BillingOrgRow[];
  selectedOrgId: string;
  plans: PlanRow[];
  billing: BillingData;
  initialInvoices: ListResult<InvoiceRow>;
  initialPayments: ListResult<PaymentRow>;
}) {
  const router = useRouter();
  const { dict } = getDictionary(locale);
  const { subscription, outstandingInvoices } = billing;
  const selected = orgs.find((row) => row.organization.id === selectedOrgId) ?? orgs[0];

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Lists keep their own server-driven state; a router.refresh() (after an
  // action) replaces the props and the effect below re-syncs to page 1.
  const [invoices, setInvoices] = useState<ListResult<InvoiceRow>>(initialInvoices);
  const [invPage, setInvPage] = useState(initialInvoices.meta.page);
  const [invStatus, setInvStatus] = useState<'' | InvoiceStatus>('');
  const [invBusy, setInvBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [payments, setPayments] = useState<ListResult<PaymentRow>>(initialPayments);
  const [payPage, setPayPage] = useState(initialPayments.meta.page);
  const [payBusy, setPayBusy] = useState(false);

  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [planBusy, setPlanBusy] = useState<string | null>(null);

  const [recordOpen, setRecordOpen] = useState(false);
  const [recordBusy, setRecordBusy] = useState(false);
  const [issued, setIssued] = useState<InvoiceRow[] | null>(null);
  const [invoiceId, setInvoiceId] = useState('');
  const [recordResult, setRecordResult] = useState<{ instructions: string | null } | null>(null);

  useEffect(() => {
    setInvoices(initialInvoices);
    setInvPage(initialInvoices.meta.page);
    setInvStatus('');
    setExpanded(null);
    setPayments(initialPayments);
    setPayPage(initialPayments.meta.page);
  }, [initialInvoices, initialPayments]);

  function fail(cause: unknown): string | null {
    if (cause instanceof ApiClientError && cause.code === 'UNAUTHORIZED') {
      router.push(`/${locale}/login?next=${encodeURIComponent(`/${locale}/billing`)}`);
      return null;
    }
    if (cause instanceof ApiClientError && cause.code === 'MFA_REQUIRED') {
      router.push(`/${locale}/mfa?next=${encodeURIComponent(`/${locale}/billing`)}`);
      return null;
    }
    return errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic });
  }

  function switchOrg(orgId: string): void {
    if (orgId === selectedOrgId) return;
    router.push(`/${locale}/billing?org=${encodeURIComponent(orgId)}`);
  }

  async function loadInvoices(page: number, status: '' | InvoiceStatus): Promise<void> {
    setInvBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10' });
      if (status) params.set('status', status);
      const result = await api.get<ListResult<InvoiceRow>>(
        `/orgs/${selectedOrgId}/invoices?${params.toString()}`,
      );
      setInvoices(result.data);
      setInvPage(page);
    } catch (cause) {
      const message = fail(cause);
      if (message) setError(message);
    } finally {
      setInvBusy(false);
    }
  }

  async function loadPayments(page: number): Promise<void> {
    setPayBusy(true);
    setError(null);
    try {
      const result = await api.get<ListResult<PaymentRow>>(
        `/orgs/${selectedOrgId}/payments?page=${page}&limit=10`,
      );
      setPayments(result.data);
      setPayPage(page);
    } catch (cause) {
      const message = fail(cause);
      if (message) setError(message);
    } finally {
      setPayBusy(false);
    }
  }

  async function cancelSubscription(): Promise<void> {
    setCancelBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.post(`/orgs/${selectedOrgId}/billing/action`, { action: 'CANCEL' });
      setCancelConfirm(false);
      setNotice(dict.billing.cancelDone);
      router.refresh();
    } catch (cause) {
      const message = fail(cause);
      if (message) setError(message);
    } finally {
      setCancelBusy(false);
    }
  }

  async function changePlan(action: 'UPGRADE' | 'DOWNGRADE', planId: string): Promise<void> {
    setPlanBusy(planId);
    setError(null);
    setNotice(null);
    try {
      await api.post(`/orgs/${selectedOrgId}/billing/action`, { action, planId });
      router.refresh();
    } catch (cause) {
      const message = fail(cause);
      if (message) setError(message);
    } finally {
      setPlanBusy(null);
    }
  }

  async function openRecord(): Promise<void> {
    setRecordOpen(true);
    setRecordResult(null);
    if (issued !== null) return;
    setRecordBusy(true);
    setError(null);
    try {
      const result = await api.get<ListResult<InvoiceRow>>(
        `/orgs/${selectedOrgId}/invoices?status=ISSUED&limit=100`,
      );
      setIssued(result.data.items);
      setInvoiceId(result.data.items[0]?.id ?? '');
    } catch (cause) {
      const message = fail(cause);
      if (message) setError(message);
      setRecordOpen(false);
    } finally {
      setRecordBusy(false);
    }
  }

  async function submitRecord(event: FormEvent): Promise<void> {
    event.preventDefault();
    const invoice = issued?.find((row) => row.id === invoiceId);
    if (!invoice) return;
    setRecordBusy(true);
    setError(null);
    try {
      const result = await api.post<{ payment: PaymentRow; instructions: string | null }>(
        `/orgs/${selectedOrgId}/payments`,
        {
          organizationId: selectedOrgId,
          invoiceId: invoice.id,
          method: 'bank_transfer',
          amountDzd: invoice.totalDzd,
          currency: 'DZD',
        },
      );
      setRecordResult({ instructions: result.data.instructions });
      setRecordOpen(false);
      setIssued(null);
      setInvoiceId('');
      await loadPayments(1);
    } catch (cause) {
      const message = fail(cause);
      if (message) setError(message);
    } finally {
      setRecordBusy(false);
    }
  }

  const showCancel =
    subscription !== null &&
    !subscription.cancelAtPeriodEnd &&
    CANCELABLE.includes(subscription.status);

  const th = 'px-3 py-2 text-start text-xs font-medium uppercase text-sand-500';
  const td = 'px-3 py-2 align-top';

  return (
    <div className="space-y-6">
      {error ? <Alert>{error}</Alert> : null}
      {notice ? (
        <Alert tone="success" role="status">
          {notice}
        </Alert>
      ) : null}

      {/* Organization selector — only the caller's own memberships appear. */}
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            id="billing-org"
            label={dict.billing.orgLabel}
            value={selectedOrgId}
            onChange={(event) => switchOrg(event.target.value)}
          >
            {orgs.map((row) => (
              <option key={row.organization.id} value={row.organization.id}>
                {row.organization.name}
              </option>
            ))}
          </Select>
          {selected ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-sand-700">{dict.billing.myRole}</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-sand-900">
                  {dict.billing.memberRoles[selected.role] ?? selected.role}
                </span>
                <Badge tone="neutral">{badgeLabel(selected.organization.badge, locale)}</Badge>
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      {/* Subscription */}
      <Card>
        <CardTitle>{dict.billing.subscriptionTitle}</CardTitle>
        {subscription === null ? (
          <p className="mt-3 text-sm text-sand-500">{dict.billing.noSubscription}</p>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-sand-900">
                {planName(subscription.plan, locale)}
              </span>
              <Badge tone="info">{dict.billing.tiers[subscription.plan.tier]}</Badge>
              <StatusBadge
                status={subscription.status}
                label={dict.billing.statuses.subscription[subscription.status]}
              />
            </div>
            <p className="text-sm text-sand-600">
              {dict.billing.planLabel}: {planName(subscription.plan, locale)} ·{' '}
              {dict.billing.periodLabel}: {formatDate(subscription.currentPeriodStart, locale)} →{' '}
              {formatDate(subscription.currentPeriodEnd, locale)}
            </p>
            {subscription.cancelAtPeriodEnd ? (
              <p className="text-sm text-amber-700">
                {dict.billing.cancelAtPeriodEnd}
                {subscription.cancelledAt
                  ? ` · ${dict.billing.cancelledOn} ${formatDate(subscription.cancelledAt, locale)}`
                  : ''}
              </p>
            ) : null}
            {outstandingInvoices > 0 ? (
              <p className="text-sm text-amber-700">
                {dict.billing.outstandingLabel}: {outstandingInvoices}
              </p>
            ) : null}
            {showCancel ? (
              cancelConfirm ? (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm text-sand-700">{dict.billing.cancelConfirm}</p>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={cancelBusy}
                    onClick={() => void cancelSubscription()}
                  >
                    {dict.billing.cancelLabel}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setCancelConfirm(false)}>
                    {dict.common.cancel}
                  </Button>
                </div>
              ) : (
                <div>
                  <Button size="sm" variant="outline" onClick={() => setCancelConfirm(true)}>
                    {dict.billing.cancelLabel}
                  </Button>
                </div>
              )
            ) : null}
          </div>
        )}
      </Card>

      {/* Plans — pricing comes from data, never hardcoded. */}
      <Card>
        <CardTitle>{dict.billing.plansTitle}</CardTitle>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => {
            const action = planActionFor(subscription?.plan.tier ?? null, plan.tier);
            return (
              <div
                key={plan.id}
                className="flex flex-col gap-2 rounded-lg border border-sand-200 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sand-900">{planName(plan, locale)}</span>
                  <Badge tone="neutral">{dict.billing.tiers[plan.tier]}</Badge>
                </div>
                <p className="text-lg font-bold text-sand-900">
                  {plan.priceDzd === 0
                    ? dict.billing.priceFree
                    : `${formatNumber(plan.priceDzd, locale)} ${plan.currency} ${dict.billing.pricePer} ${plan.periodDays} ${dict.billing.daysUnit}`}
                </p>
                {plan.features.length > 0 ? (
                  <ul className="list-inside list-disc space-y-0.5 text-xs text-sand-600">
                    {plan.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-auto pt-2">
                  {action === null ? (
                    <Badge tone="success">{dict.billing.planActionCurrent}</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      loading={planBusy === plan.id}
                      onClick={() => void changePlan(action, plan.id)}
                    >
                      {action === 'UPGRADE'
                        ? subscription
                          ? dict.billing.planActionUpgrade
                          : dict.billing.planActionSubscribe
                        : dict.billing.planActionDowngrade}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Invoices */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{dict.billing.invoicesTitle}</CardTitle>
          <Select
            id="invoice-filter"
            label={dict.billing.invoiceFilter}
            className="w-auto min-w-40"
            value={invStatus}
            onChange={(event) => {
              const next = event.target.value as '' | InvoiceStatus;
              setInvStatus(next);
              void loadInvoices(1, next);
            }}
          >
            <option value="">{dict.common.all}</option>
            {INVOICE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {dict.billing.statuses.invoice[status]}
              </option>
            ))}
          </Select>
        </div>

        {invoices.items.length === 0 ? (
          <EmptyState className="mt-3">{dict.billing.noInvoices}</EmptyState>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-sand-200">
            <table className={cn(TABLE)}>
              <thead className="bg-sand-50">
                <tr>
                  <th className={th}>{dict.billing.invoiceNumber}</th>
                  <th className={th}>{dict.common.status}</th>
                  <th className={th}>{dict.billing.invoiceDue}</th>
                  <th className={cn(th, 'text-end')}>{dict.billing.invoiceTotal}</th>
                  <th className={th}>
                    <span className="sr-only">{dict.billing.invoiceItems}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.items.map((invoice) => (
                  <Fragment key={invoice.id}>
                    <tr className="border-t border-sand-100">
                      <td className={cn(td, 'font-medium text-sand-900')}>{invoice.number}</td>
                      <td className={td}>
                        <StatusBadge
                          status={invoice.status}
                          label={dict.billing.statuses.invoice[invoice.status]}
                        />
                      </td>
                      <td className={cn(td, 'text-sand-600')}>
                        {formatDate(invoice.dueAt, locale)}
                      </td>
                      <td className={cn(td, 'text-end font-semibold text-sand-900')}>
                        {formatNumber(invoice.totalDzd, locale)} DZD
                      </td>
                      <td className={cn(td, 'text-end')}>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-expanded={expanded === invoice.id}
                          onClick={() => setExpanded(expanded === invoice.id ? null : invoice.id)}
                        >
                          {dict.billing.invoiceItems}
                        </Button>
                      </td>
                    </tr>
                    {expanded === invoice.id ? (
                      <tr className="border-t border-sand-100 bg-sand-50">
                        <td colSpan={5} className="px-3 py-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr>
                                <th className={cn(th, 'text-xs')}>{dict.billing.invoiceItem}</th>
                                <th className={cn(th, 'text-xs')}>
                                  {dict.billing.invoiceQuantity}
                                </th>
                                <th className={cn(th, 'text-xs')}>
                                  {dict.billing.invoiceUnitPrice}
                                </th>
                                <th className={cn(th, 'text-xs', 'text-end')}>
                                  {dict.billing.invoiceLineTotal}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {invoice.items.map((item) => (
                                <tr key={item.id} className="border-t border-sand-100">
                                  <td className={cn(td, 'text-xs')}>{item.description}</td>
                                  <td className={cn(td, 'text-xs')}>{item.quantity}</td>
                                  <td className={cn(td, 'text-xs')}>
                                    {formatNumber(item.unitPriceDzd, locale)}
                                  </td>
                                  <td className={cn(td, 'text-xs', 'text-end')}>
                                    {formatNumber(item.totalDzd, locale)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="mt-2 flex flex-wrap justify-end gap-4 text-xs text-sand-600">
                            <span>
                              {dict.billing.invoiceSubtotal}:{' '}
                              {formatNumber(invoice.amountDzd, locale)} DZD
                            </span>
                            <span>
                              {dict.billing.invoiceTax}: {invoice.taxRate}%
                            </span>
                            <span className="font-semibold text-sand-900">
                              {dict.billing.invoiceTotal}: {formatNumber(invoice.totalDzd, locale)}{' '}
                              DZD
                            </span>
                          </div>
                          {invoice.paidAt ? (
                            <p className="mt-1 text-end text-xs text-sand-600">
                              {dict.billing.invoicePaid}: {formatDate(invoice.paidAt, locale)}
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <ListPager
          meta={invoices.meta}
          busy={invBusy}
          onPrev={() => void loadInvoices(invPage - 1, invStatus)}
          onNext={() => void loadInvoices(invPage + 1, invStatus)}
          labels={{
            page: dict.common.page,
            of: dict.common.of,
            previous: dict.common.previous,
            next: dict.common.next,
          }}
        />
      </Card>

      {/* Payments ledger + record form */}
      <Card>
        <CardTitle>{dict.billing.paymentsTitle}</CardTitle>

        {payments.items.length === 0 ? (
          <EmptyState className="mt-3">{dict.billing.noPayments}</EmptyState>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-sand-200">
            <table className={cn(TABLE)}>
              <thead className="bg-sand-50">
                <tr>
                  <th className={th}>{dict.billing.paymentReference}</th>
                  <th className={th}>{dict.billing.recordMethodLabel}</th>
                  <th className={th}>{dict.common.status}</th>
                  <th className={cn(th, 'text-end')}>{dict.billing.invoiceTotal}</th>
                  <th className={th}>{dict.billing.paymentOccurred}</th>
                </tr>
              </thead>
              <tbody>
                {payments.items.map((payment) => (
                  <tr key={payment.id} className="border-t border-sand-100">
                    <td className={cn(td, 'font-mono text-xs text-sand-700')}>
                      {payment.reference ?? '—'}
                    </td>
                    <td className={td}>{dict.billing.methods[payment.method] ?? payment.method}</td>
                    <td className={td}>
                      <StatusBadge
                        status={payment.status}
                        label={dict.billing.statuses.payment[payment.status]}
                      />
                    </td>
                    <td className={cn(td, 'text-end font-semibold text-sand-900')}>
                      {formatNumber(payment.amountDzd, locale)} {payment.currency}
                    </td>
                    <td className={cn(td, 'text-sand-600')}>
                      {formatDate(payment.occurredAt ?? payment.createdAt, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <ListPager
          meta={payments.meta}
          busy={payBusy}
          onPrev={() => void loadPayments(payPage - 1)}
          onNext={() => void loadPayments(payPage + 1)}
          labels={{
            page: dict.common.page,
            of: dict.common.of,
            previous: dict.common.previous,
            next: dict.common.next,
          }}
        />

        <div className="mt-4 border-t border-sand-100 pt-4">
          {recordResult ? (
            <Alert tone="warning">
              <p className="font-semibold">{dict.billing.instructionsTitle}</p>
              <p className="mt-1 whitespace-pre-wrap">
                {recordResult.instructions ?? dict.billing.noInstructions}
              </p>
              <p className="mt-2">{dict.billing.recordDone}</p>
            </Alert>
          ) : recordOpen ? (
            <form onSubmit={(event) => void submitRecord(event)} className="space-y-3">
              <Alert tone="info">{dict.billing.recordHint}</Alert>
              <Select
                id="record-invoice"
                label={dict.billing.recordInvoiceLabel}
                required
                value={invoiceId}
                onChange={(event) => setInvoiceId(event.target.value)}
              >
                {issued === null ? null : issued.length === 0 ? (
                  <option value="">{dict.billing.noInvoices}</option>
                ) : (
                  issued.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.number} — {formatNumber(invoice.totalDzd, locale)} DZD
                    </option>
                  ))
                )}
              </Select>
              <Input
                label={dict.billing.recordMethodLabel}
                value={dict.billing.recordMethodFixed}
                readOnly
                disabled
              />
              <Input
                label={dict.billing.invoiceTotal}
                readOnly
                disabled
                value={
                  invoiceId
                    ? `${formatNumber(
                        issued?.find((row) => row.id === invoiceId)?.totalDzd ?? 0,
                        locale,
                      )} DZD`
                    : ''
                }
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  size="sm"
                  loading={recordBusy}
                  disabled={!invoiceId || issued === null || issued.length === 0}
                >
                  {dict.billing.recordSubmit}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setRecordOpen(false)}
                >
                  {dict.common.cancel}
                </Button>
              </div>
            </form>
          ) : (
            <Button
              size="sm"
              variant="outline"
              loading={recordBusy}
              onClick={() => void openRecord()}
            >
              {dict.billing.recordTitle}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
