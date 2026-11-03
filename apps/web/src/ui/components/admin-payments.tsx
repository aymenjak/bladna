'use client';

import { Fragment, useState, type FormEvent } from 'react';
import {
  INVOICE_STATUSES,
  PAYMENT_STATUSES,
  SUBSCRIPTION_STATUSES,
  type InvoiceStatus,
  type PaymentMethod,
  type PaymentStatus,
  type PlanTier,
  type SubscriptionStatus,
} from '@bladna/types';
import { Alert, Badge, Button, Card, EmptyState, Select, Textarea, cn } from '@bladna/ui';
import { api, fieldErrors } from '@/ui/api/client';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { getDictionary, type Dictionary, type LocaleCode } from '@/ui/i18n';
import { formatDate, formatNumber } from '@/ui/format';
import { planName } from '@/ui/billing-utils';
import { ListPager } from '@/ui/components/list-pager';
import { StatusBadge } from '@/ui/status';
import { NoticeBar, td, th, useFail, usePagedList } from '@/ui/admin-shared';

/**
 * Billing & payments section — the platform-wide read of
 * `GET /admin/payments`, `GET /admin/invoices` and `GET /admin/subscriptions`
 * (modules/billing.ts), all gated by `payment.read`. Payment lifecycle moves
 * only through `POST /admin/payments/:id/action` (`paymentActionSchema`:
 * `{ status, reason? }`) and its control renders solely for callers holding
 * `payment.manage`; the server's PAYMENT_TRANSITIONS map stays the source of
 * truth, so an illegal move surfaces its business-rule error right here.
 * Row shapes mirror the module's PAYMENT/INVOICE/SUBSCRIPTION SELECTs.
 */

/** `paymentActionSchema` targets — PENDING is never a transition target. */
const PAYMENT_TARGETS: readonly PaymentStatus[] = PAYMENT_STATUSES.filter(
  (status) => status !== 'PENDING',
);

const pagerLabels = (dict: Dictionary) => ({
  page: dict.common.page,
  of: dict.common.of,
  previous: dict.common.previous,
  next: dict.common.next,
});

/** Mirrors PAYMENT_SELECT in modules/billing.ts. */
interface AdminPaymentRow {
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

/** Mirrors INVOICE_SELECT in modules/billing.ts (no currency field — totals
 * are `*Dzd` columns, so they render as plain numbers, never with a guessed
 * currency code). */
interface AdminInvoiceItemRow {
  id: string;
  description: string;
  quantity: number;
  unitPriceDzd: number;
  totalDzd: number;
}

interface AdminInvoiceRow {
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
  items: AdminInvoiceItemRow[];
}

/** Mirrors PLAN_SELECT / SUBSCRIPTION_SELECT in modules/billing.ts. */
interface AdminPlanRow {
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

interface AdminSubscriptionRow {
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
  plan: AdminPlanRow;
}

export function PaymentsSection({ locale, canManage }: { locale: LocaleCode; canManage: boolean }) {
  const { dict } = getDictionary(locale);
  const fail = useFail(locale);

  // Payments ledger + (payment.manage) status-action row.
  const [payStatus, setPayStatus] = useState('');
  const [payPage, setPayPage] = useState(1);
  const payments = usePagedList<AdminPaymentRow>(locale, '/admin/payments', {
    page: payPage,
    limit: 10,
    status: payStatus,
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [rowBusy, setRowBusy] = useState(false);
  const [rowFieldErr, setRowFieldErr] = useState<Record<string, string>>({});
  useFocusFirstError(rowFieldErr);

  // Read-only billing lists.
  const [invStatus, setInvStatus] = useState('');
  const [invPage, setInvPage] = useState(1);
  const invoices = usePagedList<AdminInvoiceRow>(locale, '/admin/invoices', {
    page: invPage,
    limit: 10,
    status: invStatus,
  });
  const [subStatus, setSubStatus] = useState('');
  const [subPage, setSubPage] = useState(1);
  const subscriptions = usePagedList<AdminSubscriptionRow>(locale, '/admin/subscriptions', {
    page: subPage,
    limit: 10,
    status: subStatus,
  });

  function toggleAction(row: AdminPaymentRow): void {
    if (openRow === row.id) {
      setOpenRow(null);
      return;
    }
    setOpenRow(row.id);
    setTarget(PAYMENT_TARGETS.find((status) => status !== row.status) ?? '');
    setReason('');
    setRowFieldErr({});
  }

  async function submitAction(row: AdminPaymentRow): Promise<void> {
    if (!target) return;
    setRowBusy(true);
    setNotice(null);
    setRowFieldErr({});
    payments.setError(null);
    try {
      await api.post(`/admin/payments/${row.id}/action`, {
        status: target,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      setNotice(dict.admin.payments.updated);
      setOpenRow(null);
      payments.reload();
    } catch (cause) {
      setRowFieldErr(fieldErrors(cause));
      const message = fail(cause);
      if (message) payments.setError(message);
    } finally {
      setRowBusy(false);
    }
  }

  const payRows = payments.rows;
  const invRows = invoices.rows;
  const subRows = subscriptions.rows;
  const paymentColumns = canManage ? 7 : 6;

  return (
    <section className="space-y-6">
      <p className="text-xs text-sand-500">{dict.admin.payments.hint}</p>

      {/* Payments ledger (+ status transitions for payment.manage) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-base font-semibold text-sand-900">{dict.admin.payments.title}</h2>
          <div className="w-48">
            <Select
              label={dict.common.status}
              value={payStatus}
              onChange={(event) => {
                setPayStatus(event.target.value);
                setPayPage(1);
              }}
            >
              <option value="">{dict.common.all}</option>
              {PAYMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {dict.admin.payments.statuses[status]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <NoticeBar message={notice} />
        {payments.error ? <Alert>{payments.error}</Alert> : null}

        <Card className="overflow-x-auto p-0">
          {!payRows ? (
            <p className="px-4 py-6 text-sm text-sand-500">{dict.common.loading}</p>
          ) : payRows.items.length === 0 ? (
            <EmptyState className="m-4">{dict.billing.noPayments}</EmptyState>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-sand-50">
                  <th className={th}>{dict.billing.paymentReference}</th>
                  <th className={th}>{dict.admin.columns.organization}</th>
                  <th className={th}>{dict.billing.recordMethodLabel}</th>
                  <th className={th}>{dict.common.status}</th>
                  <th className={th}>{dict.billing.invoiceTotal}</th>
                  <th className={th}>{dict.billing.paymentOccurred}</th>
                  {canManage ? <th className={th}>{dict.admin.columns.action}</th> : null}
                </tr>
              </thead>
              <tbody>
                {payRows.items.map((payment) => (
                  <Fragment key={payment.id}>
                    <tr className="border-t border-sand-100">
                      <td className={cn(td, 'font-mono text-xs text-sand-700')}>
                        {payment.reference ?? '—'}
                      </td>
                      <td className={cn(td, 'max-w-32 truncate font-mono text-xs text-sand-500')}>
                        {payment.organizationId}
                      </td>
                      <td className={td}>
                        {dict.billing.methods[payment.method] ?? payment.method}
                      </td>
                      <td className={td}>
                        <StatusBadge
                          status={payment.status}
                          label={dict.admin.payments.statuses[payment.status]}
                        />
                      </td>
                      <td className={cn(td, 'font-semibold text-sand-900')}>
                        {formatNumber(payment.amountDzd, locale)} {payment.currency}
                      </td>
                      <td className={cn(td, 'whitespace-nowrap text-sand-600')}>
                        {formatDate(payment.occurredAt ?? payment.createdAt, locale)}
                      </td>
                      {canManage ? (
                        <td className={td}>
                          <Button
                            size="sm"
                            variant="outline"
                            aria-expanded={openRow === payment.id}
                            onClick={() => toggleAction(payment)}
                          >
                            {dict.admin.columns.action}
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                    {canManage && openRow === payment.id ? (
                      <tr className="border-t border-sand-100 bg-sand-50">
                        <td colSpan={paymentColumns} className="px-3 py-3">
                          <form
                            className="flex flex-wrap items-end gap-3"
                            onSubmit={(event: FormEvent) => {
                              event.preventDefault();
                              void submitAction(payment);
                            }}
                          >
                            <div className="w-52">
                              <Select
                                label={dict.admin.payments.newStatus}
                                value={target}
                                onChange={(event) => setTarget(event.target.value)}
                                error={rowFieldErr.status ?? null}
                              >
                                {PAYMENT_TARGETS.filter((status) => status !== payment.status).map(
                                  (status) => (
                                    <option key={status} value={status}>
                                      {dict.admin.payments.statuses[status]}
                                    </option>
                                  ),
                                )}
                              </Select>
                            </div>
                            <div className="min-w-56 flex-1">
                              <Textarea
                                label={dict.admin.reasonLabel}
                                hint={dict.admin.reasonHint}
                                rows={2}
                                value={reason}
                                onChange={(event) => setReason(event.target.value)}
                                error={rowFieldErr.reason ?? null}
                              />
                            </div>
                            <div className="flex gap-2 pb-0.5">
                              <Button type="submit" size="sm" loading={rowBusy} disabled={!target}>
                                {dict.admin.payments.updateStatus}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setOpenRow(null)}
                              >
                                {dict.common.cancel}
                              </Button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {payRows ? (
          <ListPager
            meta={payRows.meta}
            busy={payments.busy}
            onPrev={() => setPayPage(payPage - 1)}
            onNext={() => setPayPage(payPage + 1)}
            labels={pagerLabels(dict)}
          />
        ) : null}
      </div>

      {/* Invoices (read-only) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-base font-semibold text-sand-900">
            {dict.admin.payments.invoicesTitle}
          </h2>
          <div className="w-48">
            <Select
              label={dict.billing.invoiceFilter}
              value={invStatus}
              onChange={(event) => {
                setInvStatus(event.target.value);
                setInvPage(1);
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
        </div>

        {invoices.error ? <Alert>{invoices.error}</Alert> : null}

        <Card className="overflow-x-auto p-0">
          {!invRows ? (
            <p className="px-4 py-6 text-sm text-sand-500">{dict.common.loading}</p>
          ) : invRows.items.length === 0 ? (
            <EmptyState className="m-4">{dict.billing.noInvoices}</EmptyState>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-sand-50">
                  <th className={th}>{dict.billing.invoiceNumber}</th>
                  <th className={th}>{dict.admin.columns.organization}</th>
                  <th className={th}>{dict.common.status}</th>
                  <th className={th}>{dict.billing.invoiceDue}</th>
                  <th className={th}>{dict.billing.invoiceTotal}</th>
                </tr>
              </thead>
              <tbody>
                {invRows.items.map((invoice) => (
                  <tr key={invoice.id} className="border-t border-sand-100">
                    <td className={cn(td, 'font-medium text-sand-900')}>{invoice.number}</td>
                    <td className={cn(td, 'max-w-32 truncate font-mono text-xs text-sand-500')}>
                      {invoice.organizationId}
                    </td>
                    <td className={td}>
                      <StatusBadge
                        status={invoice.status}
                        label={dict.billing.statuses.invoice[invoice.status]}
                      />
                    </td>
                    <td className={cn(td, 'whitespace-nowrap text-sand-600')}>
                      {formatDate(invoice.dueAt, locale)}
                    </td>
                    <td className={cn(td, 'font-semibold text-sand-900')}>
                      {formatNumber(invoice.totalDzd, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {invRows ? (
          <ListPager
            meta={invRows.meta}
            busy={invoices.busy}
            onPrev={() => setInvPage(invPage - 1)}
            onNext={() => setInvPage(invPage + 1)}
            labels={pagerLabels(dict)}
          />
        ) : null}
      </div>

      {/* Subscriptions (read-only) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-base font-semibold text-sand-900">
            {dict.admin.payments.subscriptionsTitle}
          </h2>
          <div className="w-48">
            <Select
              label={dict.common.status}
              value={subStatus}
              onChange={(event) => {
                setSubStatus(event.target.value);
                setSubPage(1);
              }}
            >
              <option value="">{dict.common.all}</option>
              {SUBSCRIPTION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {dict.billing.statuses.subscription[status]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {subscriptions.error ? <Alert>{subscriptions.error}</Alert> : null}

        <Card className="overflow-x-auto p-0">
          {!subRows ? (
            <p className="px-4 py-6 text-sm text-sand-500">{dict.common.loading}</p>
          ) : subRows.items.length === 0 ? (
            <EmptyState className="m-4">{dict.common.empty}</EmptyState>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-sand-50">
                  <th className={th}>{dict.admin.columns.organization}</th>
                  <th className={th}>{dict.billing.planLabel}</th>
                  <th className={th}>{dict.common.status}</th>
                  <th className={th}>{dict.billing.periodLabel}</th>
                </tr>
              </thead>
              <tbody>
                {subRows.items.map((subscription) => (
                  <tr key={subscription.id} className="border-t border-sand-100">
                    <td className={cn(td, 'max-w-32 truncate font-mono text-xs text-sand-500')}>
                      {subscription.organizationId}
                    </td>
                    <td className={td}>
                      <span className="block font-medium text-sand-900">
                        {planName(subscription.plan, locale)}
                      </span>
                      <span className="mt-1 block">
                        <Badge tone="neutral">{dict.billing.tiers[subscription.plan.tier]}</Badge>
                      </span>
                      <p className="mt-1 text-xs text-sand-500">
                        {formatNumber(subscription.plan.priceDzd, locale)}{' '}
                        {subscription.plan.currency}
                      </p>
                    </td>
                    <td className={td}>
                      <StatusBadge
                        status={subscription.status}
                        label={dict.billing.statuses.subscription[subscription.status]}
                      />
                      {subscription.cancelAtPeriodEnd ? (
                        <p className="mt-1 text-xs text-amber-700">
                          {dict.billing.cancelAtPeriodEnd}
                          {subscription.cancelledAt
                            ? ` · ${dict.billing.cancelledOn} ${formatDate(subscription.cancelledAt, locale)}`
                            : ''}
                        </p>
                      ) : null}
                    </td>
                    <td className={cn(td, 'whitespace-nowrap text-sand-600')}>
                      {formatDate(subscription.currentPeriodStart, locale)} →{' '}
                      {formatDate(subscription.currentPeriodEnd, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {subRows ? (
          <ListPager
            meta={subRows.meta}
            busy={subscriptions.busy}
            onPrev={() => setSubPage(subPage - 1)}
            onNext={() => setSubPage(subPage + 1)}
            labels={pagerLabels(dict)}
          />
        ) : null}
      </div>
    </section>
  );
}
