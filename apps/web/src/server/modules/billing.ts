// Billing module: plans, organization subscriptions (upgrade/downgrade/cancel),
// invoices, payments, plus the admin payment lifecycle surface.
//
// Invariants:
//  - Payments are an append-only ledger: rows only ever TRANSITION status via
//    PAYMENT_TRANSITIONS; nothing rewrites amount/reference of a settled row.
//  - Only the two real methods exist: `free` (zero-amount, settles immediately)
//    and `bank_transfer` (creates a real intent first, then a PENDING row that
//    an admin confirms). Card/gateway methods are rejected by zod; missing
//    gateway credentials surface CONFIG_ERROR / NOT_IMPLEMENTED — never a fake
//    success, and never a half-created row (intent is created BEFORE the row).
//  - Invoice and subscription lifecycles go through their own transition maps.
//  - Tenancy comes from the :orgId guard (`organization.billing.manage`),
//    never from the body — the body organizationId must match the path.
//  - `payment.read` is not org-grantable, so org-scoped billing reads use
//    `organization.billing.manage` instead (documented deviation).

import { randomUUID } from 'node:crypto';
import { getPrisma, type Prisma } from '@bladna/database';
import { assertTransition, canTransition, type TransitionMap } from '@bladna/domain';
import { AppError } from '@bladna/types';
import { buildPageMeta, normalizePageParams } from '@bladna/utils';
import {
  adminPaymentsQuerySchema,
  billingActionSchema,
  createPaymentSchema,
  idParamsSchema,
  paginationQuerySchema,
  paymentActionSchema,
} from '@bladna/validation';
import { z } from 'zod';
import { requireOrgMembership, requireSystemPermission } from '../guards';
import { body, pathParams, query, type RequestContext } from '../http';
import { createIntent } from '../infra/payments';
import { isForeignKeyViolation, isUniqueViolation } from '../lib/prisma-errors';
import { audit } from '../services/audit';
import type { AppRoute } from '../router';

type PaymentStatusLiteral =
  'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED' | 'CANCELLED';

type SubscriptionStatusLiteral = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';

type InvoiceStatusLiteral = 'DRAFT' | 'ISSUED' | 'PAID' | 'OVERDUE' | 'VOID';

/** Payment lifecycle: pending work moves forward, settled rows only refund. */
const PAYMENT_TRANSITIONS: TransitionMap<PaymentStatusLiteral> = {
  PENDING: ['PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED'],
  PROCESSING: ['SUCCEEDED', 'FAILED', 'CANCELLED'],
  SUCCEEDED: ['REFUNDED'],
  FAILED: [],
  REFUNDED: [],
  CANCELLED: [],
};

/**
 * Subscription lifecycle: active states interoperate, cancellation/expiry can
 * be resurrected by a new paid period (CANCELLED/EXPIRED → ACTIVE).
 */
const SUBSCRIPTION_TRANSITIONS: TransitionMap<SubscriptionStatusLiteral> = {
  TRIALING: ['ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED'],
  ACTIVE: ['PAST_DUE', 'CANCELLED', 'EXPIRED'],
  PAST_DUE: ['ACTIVE', 'CANCELLED', 'EXPIRED'],
  CANCELLED: ['ACTIVE', 'EXPIRED'],
  EXPIRED: ['ACTIVE'],
};

/** Invoice lifecycle: draft → issued → paid/overdue/void (PAID only voids). */
const INVOICE_TRANSITIONS: TransitionMap<InvoiceStatusLiteral> = {
  DRAFT: ['ISSUED'],
  ISSUED: ['PAID', 'OVERDUE', 'VOID'],
  OVERDUE: ['PAID', 'VOID'],
  PAID: ['VOID'],
  VOID: [],
};

/** Plan tier ordering — upgrade = strictly higher tier, downgrade = strictly lower. */
const TIER_ORDER: Record<'FREE' | 'BASIC' | 'PROFESSIONAL' | 'ENTERPRISE', number> = {
  FREE: 0,
  BASIC: 1,
  PROFESSIONAL: 2,
  ENTERPRISE: 3,
};

const PLAN_SELECT = {
  id: true,
  code: true,
  tier: true,
  nameAr: true,
  nameFr: true,
  nameEn: true,
  priceDzd: true,
  currency: true,
  periodDays: true,
  features: true,
  maxSeats: true,
  maxPublishedOpportunities: true,
  active: true,
  sortOrder: true,
} as const;

const SUBSCRIPTION_SELECT = {
  id: true,
  organizationId: true,
  planId: true,
  status: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  plan: { select: PLAN_SELECT },
} as const;

const INVOICE_SELECT = {
  id: true,
  organizationId: true,
  subscriptionId: true,
  number: true,
  status: true,
  amountDzd: true,
  taxRate: true,
  totalDzd: true,
  periodStart: true,
  periodEnd: true,
  dueAt: true,
  paidAt: true,
  createdAt: true,
  updatedAt: true,
  items: {
    select: { id: true, description: true, quantity: true, unitPriceDzd: true, totalDzd: true },
  },
} as const;

const PAYMENT_SELECT = {
  id: true,
  organizationId: true,
  invoiceId: true,
  provider: true,
  method: true,
  amountDzd: true,
  currency: true,
  status: true,
  reference: true,
  occurredAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const PAYMENT_DETAIL_SELECT = {
  ...PAYMENT_SELECT,
  payload: true,
} as const;

const orgParams = z.object({ orgId: z.string().uuid() });
const orgInvoiceParams = z.object({ orgId: z.string().uuid(), id: z.string().uuid() });

const invoiceStatusFilter = z.enum(['DRAFT', 'ISSUED', 'PAID', 'OVERDUE', 'VOID']);
const paymentStatusFilter = z.enum([
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'REFUNDED',
  'CANCELLED',
]);
const subscriptionStatusFilter = z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED']);

const orgInvoiceQuery = paginationQuerySchema.extend({ status: invoiceStatusFilter.optional() });
const orgPaymentQuery = paginationQuerySchema.extend({ status: paymentStatusFilter.optional() });
const adminInvoiceQuery = paginationQuerySchema.extend({
  status: invoiceStatusFilter.optional(),
  organizationId: z.string().uuid().optional(),
});
const adminSubscriptionQuery = paginationQuerySchema.extend({
  status: subscriptionStatusFilter.optional(),
  organizationId: z.string().uuid().optional(),
});
const platformInvoiceQuery = paginationQuerySchema.extend({
  organizationId: z.string().uuid(),
  status: invoiceStatusFilter.optional(),
});

/** Monotonic invoice number: INV-YYYY-###### (global counter — see schema gap notes). */
async function nextInvoiceNumber(tx: Prisma.TransactionClient): Promise<string> {
  const counter = await tx.counter.upsert({
    where: { name: 'invoice_number' },
    create: { name: 'invoice_number', value: 1 },
    update: { value: { increment: 1 } },
  });
  return `INV-${new Date().getFullYear()}-${String(counter.value).padStart(6, '0')}`;
}

// ── Plans ──────────────────────────────────────────────────────

async function listPlans(ctx: RequestContext): Promise<unknown> {
  const f = query(ctx, paginationQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where = { active: true };
  const [total, items] = await Promise.all([
    prisma.plan.count({ where }),
    prisma.plan.findMany({
      where,
      select: PLAN_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { priceDzd: 'asc' }],
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

// ── Organization: subscription lifecycle ───────────────────────

async function getBilling(ctx: RequestContext): Promise<unknown> {
  const { orgId } = pathParams(ctx, orgParams);
  const org = await requireOrgMembership(ctx, 'organization.billing.manage', { orgId });

  const [subscription, outstanding] = await Promise.all([
    getPrisma().subscription.findUnique({
      where: { organizationId: org.orgId },
      select: SUBSCRIPTION_SELECT,
    }),
    getPrisma().invoice.count({
      where: { organizationId: org.orgId, status: { in: ['ISSUED', 'OVERDUE'] } },
    }),
  ]);
  return { subscription: subscription ?? null, outstandingInvoices: outstanding };
}

async function billingAction(ctx: RequestContext): Promise<unknown> {
  const { orgId } = pathParams(ctx, orgParams);
  const org = await requireOrgMembership(ctx, 'organization.billing.manage', { orgId });
  const input = await body(ctx, billingActionSchema);
  const prisma = getPrisma();

  // ── CANCEL: effective immediately, resurrectable by a later upgrade. ──
  if (input.action === 'CANCEL') {
    const existing = await prisma.subscription.findUnique({
      where: { organizationId: org.orgId },
      select: { id: true, status: true, planId: true },
    });
    if (!existing) throw AppError.businessRule('No subscription to cancel.');
    assertTransition(SUBSCRIPTION_TRANSITIONS, existing.status, 'CANCELLED', 'subscription');

    const now = new Date();
    const subscription = await prisma.subscription.update({
      where: { id: existing.id },
      data: { status: 'CANCELLED', cancelAtPeriodEnd: true, cancelledAt: now },
      select: SUBSCRIPTION_SELECT,
    });
    await audit({
      actorUserId: org.user.userId,
      organizationId: org.orgId,
      action: 'subscription.cancel',
      entityType: 'subscription',
      entityId: subscription.id,
      before: { status: existing.status },
      after: { status: 'CANCELLED', effectiveAt: now.toISOString() },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return { subscription };
  }

  // ── UPGRADE / DOWNGRADE ──────────────────────────────────────
  if (!input.planId) {
    throw AppError.validation('planId is required.', [
      { path: 'planId', code: 'required', message: 'Choose a plan.' },
    ]);
  }
  const plan = await prisma.plan.findUnique({ where: { id: input.planId } });
  if (!plan) throw AppError.notFound('Plan not found.');
  if (!plan.active) throw AppError.businessRule('That plan is not available.');

  const existing = await prisma.subscription.findUnique({
    where: { organizationId: org.orgId },
    include: { plan: { select: { tier: true, code: true } } },
  });

  const targetOrder = TIER_ORDER[plan.tier];
  if (existing) {
    const currentOrder = TIER_ORDER[existing.plan.tier];
    if (targetOrder === currentOrder) {
      throw AppError.businessRule('Your organization is already on a plan of that tier.');
    }
    if (input.action === 'UPGRADE' && targetOrder < currentOrder) {
      throw AppError.businessRule('That plan is a downgrade — use action DOWNGRADE.');
    }
    if (input.action === 'DOWNGRADE' && targetOrder > currentOrder) {
      throw AppError.businessRule('That plan is an upgrade — use action UPGRADE.');
    }
  } else if (input.action === 'DOWNGRADE') {
    throw AppError.businessRule('There is no current subscription to downgrade.');
  }

  // A resurrected (CANCELLED/EXPIRED/PAST_DUE…) subscription must pass its
  // state machine on the way back to ACTIVE; an already-ACTIVE row just gets
  // its period moved (assertTransition would reject same→same).
  if (existing && existing.status !== 'ACTIVE') {
    assertTransition(SUBSCRIPTION_TRANSITIONS, existing.status, 'ACTIVE', 'subscription');
  }

  const now = new Date();
  const periodEnd = new Date(now.getTime() + plan.periodDays * 24 * 60 * 60 * 1000);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.upsert({
        where: { organizationId: org.orgId },
        create: {
          organizationId: org.orgId,
          planId: plan.id,
          status: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
        },
        update: {
          planId: plan.id,
          status: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          cancelledAt: null,
        },
        select: { id: true },
      });

      // Invoice: DRAFT → ISSUED (→ PAID immediately for zero-price plans).
      const number = await nextInvoiceNumber(tx);
      const created = await tx.invoice.create({
        data: {
          organizationId: org.orgId,
          subscriptionId: subscription.id,
          number,
          status: 'DRAFT',
          amountDzd: plan.priceDzd,
          taxRate: 0,
          totalDzd: plan.priceDzd,
          periodStart: now,
          periodEnd,
          dueAt: plan.priceDzd > 0 ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) : null,
        },
      });
      assertTransition(INVOICE_TRANSITIONS, 'DRAFT', 'ISSUED', 'invoice');
      let invoice = await tx.invoice.update({
        where: { id: created.id },
        data: { status: 'ISSUED' },
      });
      if (plan.priceDzd === 0) {
        assertTransition(INVOICE_TRANSITIONS, 'ISSUED', 'PAID', 'invoice');
        invoice = await tx.invoice.update({
          where: { id: created.id },
          data: { status: 'PAID', paidAt: now },
        });
      }
      await tx.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          description: `Plan ${plan.code} — ${plan.nameEn} (${plan.periodDays} days)`,
          quantity: 1,
          unitPriceDzd: plan.priceDzd,
          totalDzd: plan.priceDzd,
        },
      });

      const full = await tx.subscription.findUnique({
        where: { id: subscription.id },
        select: SUBSCRIPTION_SELECT,
      });
      const billed = await tx.invoice.findUnique({
        where: { id: invoice.id },
        select: INVOICE_SELECT,
      });
      return { subscription: full, invoice: billed };
    });

    await audit({
      actorUserId: org.user.userId,
      organizationId: org.orgId,
      action: input.action === 'UPGRADE' ? 'subscription.upgrade' : 'subscription.downgrade',
      entityType: 'subscription',
      entityId: result.subscription?.id ?? null,
      before: existing ? { planId: existing.planId, status: existing.status } : undefined,
      after: {
        planId: plan.id,
        planCode: plan.code,
        status: 'ACTIVE',
        invoiceNumber: result.invoice?.number ?? null,
        totalDzd: plan.priceDzd,
      },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return result;
  } catch (error) {
    if (isUniqueViolation(error))
      throw AppError.conflict('A subscription or invoice already exists.');
    if (isForeignKeyViolation(error)) throw AppError.validation('Referenced records do not exist.');
    throw error;
  }
}

// ── Organization: invoices ─────────────────────────────────────

async function listOrgInvoices(ctx: RequestContext): Promise<unknown> {
  const { orgId } = pathParams(ctx, orgParams);
  const org = await requireOrgMembership(ctx, 'organization.billing.manage', { orgId });
  const f = query(ctx, orgInvoiceQuery);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.InvoiceWhereInput = { organizationId: org.orgId };
  if (f.status) where.status = f.status;

  const [total, items] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      select: INVOICE_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function getOrgInvoice(ctx: RequestContext): Promise<unknown> {
  const { orgId, id } = pathParams(ctx, orgInvoiceParams);
  const org = await requireOrgMembership(ctx, 'organization.billing.manage', { orgId });

  const invoice = await getPrisma().invoice.findFirst({
    where: { id, organizationId: org.orgId },
    select: INVOICE_SELECT,
  });
  if (!invoice) throw AppError.notFound('Invoice not found.');
  return { invoice };
}

/** Platform-neutral invoice listing (`/billing/invoices?organizationId=…`). */
async function listPlatformInvoices(ctx: RequestContext): Promise<unknown> {
  const f = query(ctx, platformInvoiceQuery);
  const org = await requireOrgMembership(ctx, 'organization.billing.manage', {
    orgId: f.organizationId,
  });
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.InvoiceWhereInput = { organizationId: org.orgId };
  if (f.status) where.status = f.status;

  const [total, items] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      select: INVOICE_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

// ── Organization: payments ─────────────────────────────────────

async function listOrgPayments(ctx: RequestContext): Promise<unknown> {
  const { orgId } = pathParams(ctx, orgParams);
  const org = await requireOrgMembership(ctx, 'organization.billing.manage', { orgId });
  const f = query(ctx, orgPaymentQuery);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.PaymentWhereInput = { organizationId: org.orgId };
  if (f.status) where.status = f.status;

  const [total, items] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      select: PAYMENT_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function createOrgPayment(ctx: RequestContext): Promise<unknown> {
  const { orgId } = pathParams(ctx, orgParams);
  const org = await requireOrgMembership(ctx, 'organization.billing.manage', { orgId });
  const input = await body(ctx, createPaymentSchema);
  const prisma = getPrisma();

  // Tenancy comes from the guard — the body must agree with the path.
  if (input.organizationId !== org.orgId) {
    throw AppError.forbidden('organizationId does not match the path organization.');
  }

  let invoice: {
    id: string;
    number: string;
    status: InvoiceStatusLiteral;
    totalDzd: number;
  } | null = null;
  let plan: { id: string; code: string; nameEn: string; priceDzd: number; active: boolean } | null =
    null;
  let targetPrice = 0;
  let orderDescription = '';

  if (input.invoiceId) {
    const found = await prisma.invoice.findFirst({
      where: { id: input.invoiceId, organizationId: org.orgId },
      select: { id: true, number: true, status: true, totalDzd: true },
    });
    if (!found) throw AppError.notFound('Invoice not found.');
    invoice = found;
    if (found.status === 'PAID') throw AppError.conflict('That invoice is already paid.');
    if (found.status !== 'ISSUED') {
      throw AppError.businessRule('Only ISSUED invoices can be paid.');
    }
    const duplicate = await prisma.payment.findFirst({
      where: { invoiceId: found.id, status: { in: ['PENDING', 'PROCESSING'] } },
      select: { id: true },
    });
    if (duplicate) throw AppError.conflict('A payment is already in progress for that invoice.');
    targetPrice = found.totalDzd;
    orderDescription = `Invoice ${found.number}`;
  } else if (input.planId) {
    const found = await prisma.plan.findUnique({
      where: { id: input.planId },
      select: { id: true, code: true, nameEn: true, priceDzd: true, active: true },
    });
    if (!found) throw AppError.notFound('Plan not found.');
    if (!found.active) throw AppError.businessRule('That plan is not available.');
    plan = found;
    targetPrice = found.priceDzd;
    orderDescription = `Subscription plan ${found.code}`;
  }

  // ── free: zero-amount orders settle immediately, no intent needed. ──
  if (input.method === 'free') {
    if (input.amountDzd !== 0) {
      throw AppError.validation('A free payment must have amountDzd = 0.', [
        { path: 'amountDzd', code: 'invalid', message: 'amountDzd must be 0 for free payments.' },
      ]);
    }
    if (targetPrice !== 0) {
      throw AppError.businessRule('Free payment method only applies to zero-amount orders.');
    }

    const now = new Date();
    try {
      const payment = await prisma.$transaction(async (tx) => {
        const created = await tx.payment.create({
          data: {
            organizationId: org.orgId,
            invoiceId: invoice?.id ?? null,
            provider: 'free',
            method: 'MANUAL_PAYMENT',
            amountDzd: 0,
            currency: input.currency,
            status: 'SUCCEEDED',
            reference: null,
            payload: {
              method: 'free',
              planId: plan?.id ?? null,
              description: input.description ?? orderDescription,
            } as Prisma.InputJsonValue,
            occurredAt: now,
          },
          select: PAYMENT_SELECT,
        });
        if (invoice) {
          assertTransition(INVOICE_TRANSITIONS, invoice.status, 'PAID', 'invoice');
          await tx.invoice.update({
            where: { id: invoice.id },
            data: { status: 'PAID', paidAt: now },
          });
        }
        return created;
      });

      await audit({
        actorUserId: org.user.userId,
        organizationId: org.orgId,
        action: 'payment.create',
        entityType: 'payment',
        entityId: payment.id,
        after: {
          status: payment.status,
          method: 'free',
          amountDzd: 0,
          invoiceId: invoice?.id ?? null,
        },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      });
      return { payment, instructions: null };
    } catch (error) {
      if (isForeignKeyViolation(error))
        throw AppError.validation('Referenced records do not exist.');
      throw error;
    }
  }

  // ── bank_transfer: amount must match the target exactly (≥ 1). ──
  if (input.amountDzd !== targetPrice) {
    throw AppError.validation('amountDzd does not match the amount due.', [
      {
        path: 'amountDzd',
        code: 'mismatch',
        message: `amountDzd must equal ${targetPrice}.`,
      },
    ]);
  }
  if (input.amountDzd < 1) {
    throw AppError.validation('A bank transfer payment must be at least 1 DZD.', [
      { path: 'amountDzd', code: 'invalid', message: 'amountDzd must be >= 1.' },
    ]);
  }

  // The intent is created BEFORE any row: a gateway/config failure must not
  // leave a half-created payment behind.
  const intent = await createIntent({
    orderReference: randomUUID(),
    amountMinor: input.amountDzd,
    currency: input.currency,
    description: input.description ?? orderDescription,
    locale: ctx.locale,
  });

  try {
    const payment = await getPrisma().payment.create({
      data: {
        organizationId: org.orgId,
        invoiceId: invoice?.id ?? null,
        provider: intent.provider,
        method: 'BANK_TRANSFER',
        amountDzd: input.amountDzd,
        currency: input.currency,
        status: intent.status === 'PROCESSING' ? 'PROCESSING' : 'PENDING',
        reference: intent.reference,
        payload: {
          method: 'bank_transfer',
          planId: plan?.id ?? null,
          description: input.description ?? orderDescription,
          instructions: intent.instructions ?? null,
        } as Prisma.InputJsonValue,
      },
      select: PAYMENT_SELECT,
    });
    await audit({
      actorUserId: org.user.userId,
      organizationId: org.orgId,
      action: 'payment.create',
      entityType: 'payment',
      entityId: payment.id,
      after: {
        status: payment.status,
        method: 'bank_transfer',
        amountDzd: payment.amountDzd,
        reference: payment.reference,
        invoiceId: invoice?.id ?? null,
      },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return { payment, instructions: intent.instructions ?? null };
  } catch (error) {
    if (isUniqueViolation(error)) throw AppError.conflict('That payment reference already exists.');
    if (isForeignKeyViolation(error)) throw AppError.validation('Referenced records do not exist.');
    throw error;
  }
}

// ── Admin: payment lifecycle / billing reads ───────────────────

async function listAdminPayments(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'payment.read');
  const f = query(ctx, adminPaymentsQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.PaymentWhereInput = {};
  if (f.status) where.status = f.status;
  if (f.organizationId) where.organizationId = f.organizationId;
  if (f.from || f.to) {
    where.createdAt = {
      ...(f.from ? { gte: f.from } : {}),
      ...(f.to ? { lte: f.to } : {}),
    };
  }

  const [total, items] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      select: PAYMENT_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function getAdminPayment(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  await requireSystemPermission(ctx, 'payment.read');

  const payment = await getPrisma().payment.findUnique({
    where: { id },
    select: {
      ...PAYMENT_DETAIL_SELECT,
      invoice: { select: { id: true, number: true, status: true, totalDzd: true } },
      organization: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!payment) throw AppError.notFound('Payment not found.');
  return { payment };
}

async function adminPaymentAction(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const user = await requireSystemPermission(ctx, 'payment.manage');
  const input = await body(ctx, paymentActionSchema);
  const prisma = getPrisma();

  const payment = await prisma.payment.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      invoiceId: true,
      payload: true,
      organizationId: true,
      occurredAt: true,
    },
  });
  if (!payment) throw AppError.notFound('Payment not found.');

  // Append-only ledger: status only moves forward through the state machine.
  assertTransition(PAYMENT_TRANSITIONS, payment.status, input.status, 'payment');

  const now = new Date();
  const previousPayload = (payment.payload ?? {}) as Record<string, unknown>;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id },
        data: {
          status: input.status,
          occurredAt: payment.occurredAt ?? now,
          payload: {
            ...previousPayload,
            lastTransition: {
              from: payment.status,
              to: input.status,
              reason: input.reason ?? null,
              by: user.userId,
              at: now.toISOString(),
            },
          } as Prisma.InputJsonValue,
        },
        select: PAYMENT_SELECT,
      });

      // A confirmed payment settles its invoice (ISSUED/OVERDUE → PAID);
      // any other invoice state is left alone rather than force-moved.
      if (input.status === 'SUCCEEDED' && payment.invoiceId) {
        const invoice = await tx.invoice.findUnique({
          where: { id: payment.invoiceId },
          select: { id: true, status: true },
        });
        if (invoice && canTransition(INVOICE_TRANSITIONS, invoice.status, 'PAID')) {
          await tx.invoice.update({
            where: { id: invoice.id },
            data: { status: 'PAID', paidAt: now },
          });
        }
      }
      return updated;
    });

    await audit({
      actorUserId: user.userId,
      organizationId: payment.organizationId,
      action: `payment.${input.status.toLowerCase()}`,
      entityType: 'payment',
      entityId: id,
      before: { status: payment.status },
      after: { status: input.status, reason: input.reason ?? null },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return { payment: result };
  } catch (error) {
    if (isForeignKeyViolation(error)) throw AppError.validation('Referenced records do not exist.');
    throw error;
  }
}

async function listAdminInvoices(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'payment.read');
  const f = query(ctx, adminInvoiceQuery);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.InvoiceWhereInput = {};
  if (f.status) where.status = f.status;
  if (f.organizationId) where.organizationId = f.organizationId;

  const [total, items] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      select: INVOICE_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function listAdminSubscriptions(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'payment.read');
  const f = query(ctx, adminSubscriptionQuery);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.SubscriptionWhereInput = {};
  if (f.status) where.status = f.status;
  if (f.organizationId) where.organizationId = f.organizationId;

  const [total, items] = await Promise.all([
    prisma.subscription.count({ where }),
    prisma.subscription.findMany({
      where,
      select: SUBSCRIPTION_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

// ── Route table (literals before :params per method) ───────────

export const billingRoutes: AppRoute[] = [
  // public
  {
    method: 'GET',
    path: '/plans',
    handler: listPlans,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'Active subscription plans (pricing from data)',
  },
  // organization — billing (literals first)
  {
    method: 'GET',
    path: '/orgs/:orgId/billing',
    handler: getBilling,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Subscription + outstanding invoice count',
  },
  {
    method: 'POST',
    path: '/orgs/:orgId/billing/action',
    handler: billingAction,
    options: { rateLimit: 'auth' },
    auth: 'org',
    summary: 'Upgrade/downgrade/cancel subscription (state machine + audited invoice)',
  },
  {
    method: 'GET',
    path: '/orgs/:orgId/invoices',
    handler: listOrgInvoices,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: "Organization's invoices",
  },
  {
    method: 'GET',
    path: '/orgs/:orgId/invoices/:id',
    handler: getOrgInvoice,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Invoice detail with line items',
  },
  {
    method: 'GET',
    path: '/orgs/:orgId/payments',
    handler: listOrgPayments,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: "Organization's payments (append-only ledger)",
  },
  {
    method: 'POST',
    path: '/orgs/:orgId/payments',
    handler: createOrgPayment,
    options: { rateLimit: 'auth' },
    auth: 'org',
    summary: 'Pay an invoice/plan (free | bank_transfer only)',
  },
  // platform-neutral billing reads
  {
    method: 'GET',
    path: '/billing/invoices',
    handler: listPlatformInvoices,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Invoice list by explicit organizationId',
  },
  // admin (literals first)
  {
    method: 'GET',
    path: '/admin/payments',
    handler: listAdminPayments,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'All payments (filterable)',
  },
  {
    method: 'POST',
    path: '/admin/payments/:id/action',
    handler: adminPaymentAction,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Confirm/fail/refund a payment (transition + invoice settlement)',
  },
  {
    method: 'GET',
    path: '/admin/payments/:id',
    handler: getAdminPayment,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'Payment detail with payload/invoice/org',
  },
  {
    method: 'GET',
    path: '/admin/invoices',
    handler: listAdminInvoices,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'All invoices (filterable)',
  },
  {
    method: 'GET',
    path: '/admin/subscriptions',
    handler: listAdminSubscriptions,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'All subscriptions (filterable)',
  },
];
