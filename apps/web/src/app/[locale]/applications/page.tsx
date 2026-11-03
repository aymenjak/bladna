import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { APPLICATION_STATUSES, isAppError, type ApplicationStatus } from '@bladna/types';
import { EmptyState } from '@bladna/ui';
import { getDictionary, isLocale, type LocaleCode } from '@/ui/i18n';
import { formatDate } from '@/ui/format';
import { titleFor } from '@/ui/opportunity';
import { myApplications } from '@/server/modules/applications';
import { pageSession } from '@/server/page-session';
import { invoke } from '@/server/ssr';
import { WithdrawApplicationButton } from '@/ui/components/account-actions';
import { StatusBadge } from '@/ui/status';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

/** Statuses from which APPLICATION_TRANSITIONS still allows WITHDRAWN (§107). */
const WITHDRAWABLE: readonly ApplicationStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'WAITLISTED',
];

interface ApplicationItem {
  id: string;
  status: ApplicationStatus;
  submittedAt: string | Date | null;
  decisionNote: string | null;
  opportunity: {
    id: string;
    slug: string;
    titleAr: string;
    titleFr: string;
    titleEn: string;
    organization: { id: string; name: string; slug: string; verificationStatus: string };
  };
}

interface ApplicationsResult {
  items: ApplicationItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** Preserve the active filter when moving between pages. */
function pageHref(locale: LocaleCode, page: number, status: string): string {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return `/${locale}/applications${qs ? `?${qs}` : ''}`;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.applications.title, robots: { index: false, follow: false } };
}

export default async function ApplicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const { dict } = getDictionary(locale);

  const status = (APPLICATION_STATUSES as readonly string[]).includes(sp.status ?? '')
    ? (sp.status as string)
    : '';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  const sessionPath = `/${locale}/applications`;
  await pageSession(locale, sessionPath);
  const next = encodeURIComponent(sessionPath);

  let result: ApplicationsResult = {
    items: [],
    meta: { page, limit: PAGE_SIZE, total: 0, totalPages: 0 },
  };
  try {
    result = await invoke<ApplicationsResult>(myApplications, {
      path: '/me/applications',
      locale,
      query: { page, limit: PAGE_SIZE, status: status || undefined },
    });
  } catch (error) {
    if (isAppError(error) && error.code === 'UNAUTHORIZED') {
      redirect(`/${locale}/login?next=${next}`);
    }
    if (isAppError(error) && error.code === 'MFA_REQUIRED') redirect(`/${locale}/mfa?next=${next}`);
    throw error;
  }

  const { items, meta } = result;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold text-sand-900">{dict.applications.title}</h1>
        <p className="text-sm text-sand-600">{dict.applications.subtitle}</p>
      </header>

      {/* Status filter — plain GET form, works without JS */}
      <form method="get" action={sessionPath} className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-sand-700">
            {dict.common.status}
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status}
            className="mt-1 h-10 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="">{dict.common.all}</option>
            {APPLICATION_STATUSES.map((value) => (
              <option key={value} value={value}>
                {dict.statuses[value] ?? value}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg border border-sand-200 bg-white inline-flex min-h-11 items-center px-4 text-sm font-semibold text-sand-900 hover:bg-sand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sand-900"
        >
          {dict.common.search}
        </button>
      </form>

      {items.length === 0 ? (
        <EmptyState>
          {dict.applications.empty}{' '}
          <Link
            href={`/${locale}/opportunities`}
            className="font-semibold text-brand-700 hover:text-brand-800"
          >
            {dict.nav.opportunities} →
          </Link>
        </EmptyState>
      ) : (
        <ul className="divide-y divide-sand-100 rounded-xl border border-sand-200 bg-white px-5">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
              <div className="min-w-0">
                <Link
                  href={`/${locale}/opportunities/${item.opportunity.slug}`}
                  className="block truncate font-medium text-sand-900 hover:text-brand-700"
                >
                  {titleFor(item.opportunity, locale)}
                </Link>
                <p className="text-sm text-sand-500">
                  {item.opportunity.organization.name} · {dict.applications.submittedOn}{' '}
                  {formatDate(item.submittedAt, locale)}
                </p>
                {item.decisionNote ? (
                  <p className="mt-1 text-xs text-sand-600">{item.decisionNote}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <StatusBadge
                  data-testid="application-status"
                  status={item.status}
                  label={dict.statuses[item.status] ?? item.status}
                />
                {WITHDRAWABLE.includes(item.status) ? (
                  <WithdrawApplicationButton locale={locale} applicationId={item.id} />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Pagination */}
      {meta.totalPages > 1 ? (
        <nav
          className="flex items-center justify-center gap-4 text-sm"
          aria-label={dict.common.page}
        >
          {meta.page > 1 ? (
            <Link
              href={pageHref(locale, meta.page - 1, status)}
              className="rounded-lg border border-sand-200 bg-white inline-flex min-h-11 items-center px-4 font-medium text-sand-700 hover:bg-sand-100"
            >
              {dict.common.previous}
            </Link>
          ) : (
            <span className="rounded-lg border border-sand-100 inline-flex min-h-11 items-center px-4 text-sand-400">
              {dict.common.previous}
            </span>
          )}
          <span className="text-sand-600">
            {dict.common.page} {meta.page} {dict.common.of} {meta.totalPages} · {meta.total}
          </span>
          {meta.page < meta.totalPages ? (
            <Link
              href={pageHref(locale, meta.page + 1, status)}
              className="rounded-lg border border-sand-200 bg-white inline-flex min-h-11 items-center px-4 font-medium text-sand-700 hover:bg-sand-100"
            >
              {dict.common.next}
            </Link>
          ) : (
            <span className="rounded-lg border border-sand-100 inline-flex min-h-11 items-center px-4 text-sand-400">
              {dict.common.next}
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
