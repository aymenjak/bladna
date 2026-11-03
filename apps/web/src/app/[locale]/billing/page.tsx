import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isAppError } from '@bladna/types';
import { Card, buttonClasses } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { billingRoutes } from '@/server/modules/billing';
import { organizationRoutes } from '@/server/modules/organizations';
import { pageSession } from '@/server/page-session';
import type { AppRoute } from '@/server/router';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import {
  BillingConsole,
  type BillingData,
  type BillingOrgRow,
  type InvoiceRow,
  type ListResult,
  type PaymentRow,
  type PlanRow,
} from '@/ui/billing-console';

export const dynamic = 'force-dynamic';

const ROUTE_TABLES: AppRoute[][] = [billingRoutes, organizationRoutes];

/** Look up a handler from a module route table so SSR can call it in-process. */
function requireHandler(method: string, path: string): Handler {
  const handler = ROUTE_TABLES.flatMap((table) => table).find(
    (route) => route.method === method && route.path === path,
  )?.handler;
  if (!handler) throw new Error(`Missing route handler for ${method} ${path}`);
  return handler;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return {
    title: dict.billing.title,
    robots: { index: false, follow: false },
  };
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="space-y-1">
      <h1 className="text-3xl font-bold text-sand-900">{title}</h1>
      <p className="text-sm text-sand-600">{subtitle}</p>
    </header>
  );
}

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ org?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { dict } = getDictionary(locale);
  const { org: orgParam } = await searchParams;

  await pageSession(locale, `/${locale}/billing`);
  const next = encodeURIComponent(`/${locale}/billing`);

  // 1. Memberships — the tenancy source for every billing call below. A
  //    foreign `?org=` id is ignored, never dereferenced.
  let orgs: ListResult<BillingOrgRow>;
  try {
    orgs = await invoke<ListResult<BillingOrgRow>>(requireHandler('GET', '/me/organizations'), {
      path: '/me/organizations',
      locale,
      query: { page: 1, limit: 100 },
    });
  } catch (error) {
    if (isAppError(error) && error.code === 'UNAUTHORIZED') {
      redirect(`/${locale}/login?next=${next}`);
    }
    if (isAppError(error) && error.code === 'MFA_REQUIRED') {
      redirect(`/${locale}/mfa?next=${next}`);
    }
    throw error;
  }

  if (orgs.items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <PageHeader title={dict.billing.title} subtitle={dict.billing.subtitle} />
        <div className="rounded-xl border border-dashed border-sand-300 px-6 py-10 text-center">
          <p className="text-sm text-sand-600">{dict.billing.noOrgs}</p>
          <Link
            href={`/${locale}/register?accountType=ORGANIZATION`}
            className={buttonClasses({ className: 'mt-4' })}
          >
            {dict.billing.noOrgsCta}
          </Link>
        </div>
      </div>
    );
  }

  const selected = orgs.items.find((row) => row.organization.id === orgParam) ?? orgs.items[0];
  const orgId = selected.organization.id;

  // 2. Billing data — every route below runs requireOrgMembership with
  //    `organization.billing.manage`; a member without it gets an honest panel.
  let plans: ListResult<PlanRow>;
  let billing: BillingData;
  let invoices: ListResult<InvoiceRow>;
  let payments: ListResult<PaymentRow>;
  try {
    [plans, billing, invoices, payments] = await Promise.all([
      invoke<ListResult<PlanRow>>(requireHandler('GET', '/plans'), {
        path: '/plans',
        locale,
        query: { page: 1, limit: 100 },
      }),
      invoke<BillingData>(requireHandler('GET', '/orgs/:orgId/billing'), {
        path: `/orgs/${orgId}/billing`,
        locale,
        params: { orgId },
      }),
      invoke<ListResult<InvoiceRow>>(requireHandler('GET', '/orgs/:orgId/invoices'), {
        path: `/orgs/${orgId}/invoices`,
        locale,
        params: { orgId },
        query: { page: 1, limit: 10 },
      }),
      invoke<ListResult<PaymentRow>>(requireHandler('GET', '/orgs/:orgId/payments'), {
        path: `/orgs/${orgId}/payments`,
        locale,
        params: { orgId },
        query: { page: 1, limit: 10 },
      }),
    ]);
  } catch (error) {
    if (isAppError(error) && error.code === 'UNAUTHORIZED') {
      redirect(`/${locale}/login?next=${next}`);
    }
    if (isAppError(error) && error.code === 'MFA_REQUIRED') {
      redirect(`/${locale}/mfa?next=${next}`);
    }
    if (isAppError(error) && error.code === 'FORBIDDEN') {
      return (
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
          <PageHeader title={dict.billing.title} subtitle={dict.billing.subtitle} />
          <Card className="px-6 py-8 text-center">
            <p className="text-sm text-sand-600">{dict.billing.noAccess}</p>
            <Link
              href={`/${locale}/dashboard`}
              className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:text-brand-800"
            >
              {dict.nav.dashboard} →
            </Link>
          </Card>
        </div>
      );
    }
    throw error;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <PageHeader title={dict.billing.title} subtitle={dict.billing.subtitle} />
      <BillingConsole
        locale={locale}
        orgs={orgs.items}
        selectedOrgId={orgId}
        plans={plans.items}
        billing={billing}
        initialInvoices={invoices}
        initialPayments={payments}
      />
    </div>
  );
}
