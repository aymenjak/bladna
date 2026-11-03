import type { ReactNode } from 'react';
import { notFound, redirect } from 'next/navigation';
import { CERTIFICATE_STATUSES, isAppError } from '@bladna/types';
import { Badge, Card } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { formatNumber } from '@/ui/format';
import { organizationRoutes } from '@/server/modules/organizations';
import { SectionHeading } from '@/ui/components/section-heading';
import { StatGrid } from '@/ui/components/stat-grid';
import { ClipboardCheckIcon, ClockIcon, UsersIcon } from '@/ui/components/icons';
import type { AppRoute } from '@/server/router';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import { WorkspaceNoAccess } from '@/ui/components/workspace-no-access';

export const dynamic = 'force-dynamic';

const ROUTE_TABLES: AppRoute[][] = [organizationRoutes];

/** Look up a handler from a module route table so SSR can call it in-process. */
function requireHandler(method: string, path: string): Handler {
  const handler = ROUTE_TABLES.flatMap((table) => table).find(
    (route) => route.method === method && route.path === path,
  )?.handler;
  if (!handler) throw new Error(`Missing route handler for ${method} ${path}`);
  return handler;
}

/** Exact shape of `GET /orgs/:orgId/analytics` (organizations.ts → analytics()). */
interface AnalyticsResult {
  analytics: {
    opportunities: Record<string, number>;
    applications: Record<string, number>;
    members: Record<string, number>;
    certificates: Record<string, number>;
    verifiedHours: number;
    verifiedHourRecords: number;
    attendanceRecords: number;
    attendanceVolunteers: number;
    range: { from: string | Date | null; to: string | Date | null };
  };
}

/** Sum a `groupBy` status record into one honest total. */
function total(record: Record<string, number>): number {
  return Object.values(record).reduce((sum, count) => sum + count, 0);
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.workspace.tabs.overview, robots: { index: false, follow: false } };
}

/**
 * Workspace overview: the analytics aggregates the server actually computes
 * (status groupBys + verified hours + attendance). The page never passes a
 * `from`/`to` range, so `rangeAll` states that the numbers cover all recorded
 * activity.
 */
export default async function WorkspaceOverviewPage({
  params,
}: {
  params: Promise<{ locale: string; orgId: string }>;
}) {
  const { locale, orgId } = await params;
  if (!isLocale(locale)) notFound();
  const { dict } = getDictionary(locale);

  const path = `/${locale}/workspace/${orgId}`;
  const next = encodeURIComponent(path);

  let result: AnalyticsResult;
  try {
    result = await invoke<AnalyticsResult>(requireHandler('GET', '/orgs/:orgId/analytics'), {
      path: `/orgs/${orgId}/analytics`,
      params: { orgId },
      locale,
    });
  } catch (error) {
    // P31: the shell proved membership — FORBIDDEN is this page's permission,
    // shown as the access panel instead of a "page not found" the tabs link to.
    if (isAppError(error) && error.code === 'FORBIDDEN') {
      return <WorkspaceNoAccess locale={locale} orgId={orgId} />;
    }
    if (isAppError(error) && error.code === 'NOT_FOUND') notFound();
    if (isAppError(error) && error.code === 'UNAUTHORIZED') {
      redirect(`/${locale}/login?next=${next}`);
    }
    if (isAppError(error) && error.code === 'MFA_REQUIRED') redirect(`/${locale}/mfa?next=${next}`);
    throw error;
  }

  const a = result.analytics;
  const isAllTime = a.range.from == null && a.range.to == null;

  const stats: Array<{ key: string; label: string; value: string; icon: ReactNode }> = [
    {
      key: 'verifiedHours',
      label: dict.workspace.overview.verifiedHours,
      value: formatNumber(a.verifiedHours, locale),
      icon: <ClockIcon className="size-4" />,
    },
    {
      key: 'hourRecords',
      label: dict.workspace.overview.hourRecords,
      value: formatNumber(a.verifiedHourRecords, locale),
      icon: <ClipboardCheckIcon className="size-4" />,
    },
    {
      key: 'attendanceRecords',
      label: dict.workspace.overview.attendanceRecords,
      value: formatNumber(a.attendanceRecords, locale),
      icon: <ClipboardCheckIcon className="size-4" />,
    },
    {
      key: 'attendanceVolunteers',
      label: dict.workspace.overview.attendanceVolunteers,
      value: formatNumber(a.attendanceVolunteers, locale),
      icon: <UsersIcon className="size-4" />,
    },
  ];

  const counts: Array<{ key: string; label: string; value: number }> = [
    {
      key: 'opportunities',
      label: dict.workspace.tabs.opportunities,
      value: total(a.opportunities),
    },
    { key: 'applications', label: dict.workspace.tabs.applications, value: total(a.applications) },
    { key: 'members', label: dict.workspace.tabs.members, value: total(a.members) },
    { key: 'certificates', label: dict.workspace.tabs.certificates, value: total(a.certificates) },
  ];

  const certificateRows = CERTIFICATE_STATUSES.map((status) => ({
    status,
    label: dict.workspace.certificates.statuses[status],
    count: a.certificates[status] ?? 0,
  }));

  /** Kit Badge tone per certificate lifecycle state (VALID→success, …). */
  function certificateTone(status: (typeof CERTIFICATE_STATUSES)[number]) {
    if (status === 'VALID') return 'success';
    if (status === 'REVOKED') return 'danger';
    return 'warning';
  }

  return (
    <div className="space-y-5">
      <Card className="rise p-6">
        <SectionHeading
          eyebrow={dict.workspace.overview.eyebrow}
          title={dict.workspace.tabs.overview}
        />
        <StatGrid className="mt-4" items={stats} />
        <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-sand-100 pt-4 sm:grid-cols-4">
          {counts.map((count) => (
            <div key={count.key}>
              <dt className="text-xs font-medium text-sand-500">{count.label}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-sand-900">
                {formatNumber(count.value, locale)}
              </dd>
            </div>
          ))}
        </dl>
        {isAllTime ? (
          <p className="mt-4 text-xs text-sand-500">{dict.workspace.overview.rangeAll}</p>
        ) : null}
      </Card>

      <Card className="rise p-6 [animation-delay:60ms]">
        <SectionHeading title={dict.workspace.tabs.certificates} />
        <h3 className="mt-4 text-sm font-semibold text-sand-700">
          {dict.workspace.overview.byStatus}
        </h3>
        <dl className="mt-2 divide-y divide-sand-100">
          {certificateRows.map((row) => (
            <div key={row.status} className="flex items-center justify-between py-2 text-sm">
              <dt className="text-sand-600">{row.label}</dt>
              <dd>
                <Badge tone={certificateTone(row.status)} className="tabular-nums">
                  {formatNumber(row.count, locale)}
                </Badge>
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
