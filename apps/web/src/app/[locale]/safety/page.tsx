import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  isAppError,
  type ReportReason,
  type ReportStatus,
  type ReportTargetType,
} from '@bladna/types';
import { Card, CardTitle, EmptyState } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { formatDate } from '@/ui/format';
import { reportRoutes } from '@/server/modules/reports';
import { pageSession } from '@/server/page-session';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import { ReportForm } from '@/ui/components/report-form';
import { StatusBadge } from '@/ui/status';
import { PageMasthead } from '@/ui/components/page-masthead';

export const dynamic = 'force-dynamic';

/** Look up a handler from the module route table so SSR can call it in-process. */
function handlerOf(method: string, path: string): Handler | null {
  return (
    reportRoutes.find((route) => route.method === method && route.path === path)?.handler ?? null
  );
}

interface ReportItem {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description: string | null;
  status: ReportStatus;
  createdAt: string | Date;
}

interface MyReportsResult {
  items: ReportItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.safety.title, robots: { index: false, follow: false } };
}

export default async function SafetyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; target?: string }>;
}) {
  const { locale } = await params;
  const { page: pageRaw, target } = await searchParams;
  if (!isLocale(locale)) notFound();
  const { dict } = getDictionary(locale);
  const page = Math.max(1, Number(pageRaw) || 1);
  // P20: `/safety?target=<page link>` prefills the report form, and the
  // value rides along the sign-in bounce so anonymous reporters keep it.
  const initialTarget = target?.trim() ?? '';

  await pageSession(locale, `/${locale}/safety`);
  const next = encodeURIComponent(
    initialTarget
      ? `/${locale}/safety?target=${encodeURIComponent(initialTarget)}`
      : `/${locale}/safety`,
  );

  const handler = handlerOf('GET', '/me/reports');
  if (!handler) throw new Error('Missing route handler for GET /me/reports');

  let reports: MyReportsResult;
  try {
    reports = await invoke<MyReportsResult>(handler, {
      path: '/me/reports',
      locale,
      query: { page, limit: 10 },
    });
  } catch (error) {
    if (isAppError(error) && error.code === 'UNAUTHORIZED') {
      redirect(`/${locale}/login?next=${next}`);
    }
    if (isAppError(error) && error.code === 'MFA_REQUIRED') redirect(`/${locale}/mfa?next=${next}`);
    throw error;
  }

  return (
    <>
      <PageMasthead
        title={dict.safety.title}
        subtitle={dict.safety.subtitle}
        inner="mx-auto max-w-3xl px-4 py-10"
      />
      <div className="mx-auto max-w-3xl space-y-6 px-4 pt-6 pb-10">
        <ReportForm locale={locale} initialTarget={initialTarget} />

        <Card>
          <CardTitle>{dict.safety.myReportsTitle}</CardTitle>
          {reports.items.length === 0 ? (
            <div className="mt-3">
              <EmptyState>{dict.safety.noReports}</EmptyState>
            </div>
          ) : (
            <>
              <ul className="mt-3 divide-y divide-sand-100 rounded-lg border border-sand-200">
                {reports.items.map((report) => (
                  <li
                    key={report.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="font-medium text-sand-900">
                        {dict.safety.targetTypes[report.targetType]} —{' '}
                        {dict.safety.reasons[report.reason]}
                      </p>
                      <p className="truncate text-xs text-sand-500" title={report.targetId}>
                        <code className="font-mono">{report.targetId}</code> ·{' '}
                        {formatDate(report.createdAt, locale)}
                      </p>
                    </div>
                    <StatusBadge
                      status={report.status}
                      label={dict.safety.statuses[report.status]}
                    />
                  </li>
                ))}
              </ul>
              {reports.meta.totalPages > 1 ? (
                <nav
                  className="mt-3 flex items-center justify-between text-sm"
                  aria-label={dict.safety.myReportsTitle}
                >
                  {page > 1 ? (
                    <Link
                      href={`/${locale}/safety?page=${page - 1}`}
                      className="font-medium text-brand-700 hover:text-brand-800"
                    >
                      {dict.common.previous}
                    </Link>
                  ) : (
                    <span />
                  )}
                  <span className="text-sand-600">
                    {dict.common.page} {reports.meta.page} {dict.common.of}{' '}
                    {reports.meta.totalPages}
                  </span>
                  {page < reports.meta.totalPages ? (
                    <Link
                      href={`/${locale}/safety?page=${page + 1}`}
                      className="font-medium text-brand-700 hover:text-brand-800"
                    >
                      {dict.common.next}
                    </Link>
                  ) : (
                    <span />
                  )}
                </nav>
              ) : null}
            </>
          )}
        </Card>

        <Card>
          <CardTitle>{dict.safety.guidanceTitle}</CardTitle>
          <ol className="mt-3 list-decimal space-y-2 ps-5 text-sm text-sand-700">
            {dict.safety.guidance.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
          <p className="mt-3 text-sm">
            <Link
              href={`/${locale}/verify`}
              className="font-medium text-brand-700 hover:text-brand-800"
            >
              {dict.landing.verifyTitle}
            </Link>
          </p>
        </Card>
      </div>
    </>
  );
}
