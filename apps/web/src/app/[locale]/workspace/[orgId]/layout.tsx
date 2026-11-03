import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isAppError } from '@bladna/types';
import { Badge } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { organizationRoutes } from '@/server/modules/organizations';
import { pageSession } from '@/server/page-session';
import type { AppRoute } from '@/server/router';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import { WorkspaceTabs } from '@/ui/components/workspace-nav';
import { WorkspaceNoAccess } from '@/ui/components/workspace-no-access';
import { ArrowRightIcon } from '@/ui/components/icons';

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

/** Cheap shape gate — malformed ids 404 before they reach the guard. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface OrgResult {
  organization: { id: string; name: string; verificationStatus: string; trustLevel: string };
}

/**
 * Shared shell for every workspace tab: session gate + membership guard in
 * one place. `GET /orgs/:orgId` requires `organization.read` membership: a
 * signed-in non-member gets the explicit access panel (P31 — for a `FORBIDDEN`
 * they used to get an "honest 404" that the tabs then contradicted; a missing
 * organization is still a real 404 via `NOT_FOUND`), and every tab page below
 * can assume the caller belongs to this organization — individual endpoints
 * still re-check their own permissions server-side.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string; orgId: string }>;
}) {
  const { locale, orgId } = await params;
  if (!isLocale(locale)) notFound();
  if (!UUID_RE.test(orgId)) notFound();
  const { dict } = getDictionary(locale);

  const sessionPath = `/${locale}/workspace/${orgId}`;
  await pageSession(locale, sessionPath);
  const next = encodeURIComponent(sessionPath);

  let org: OrgResult['organization'];
  try {
    const data = await invoke<OrgResult>(requireHandler('GET', '/orgs/:orgId'), {
      path: `/orgs/${orgId}`,
      params: { orgId },
      locale,
    });
    org = data.organization;
  } catch (error) {
    // Signed in, but this account cannot read the workspace (no membership,
    // a suspended membership, or a role without `organization.read`) — say so
    // instead of the misleading "page not found".
    if (isAppError(error) && error.code === 'FORBIDDEN') {
      return <WorkspaceNoAccess locale={locale} standalone />;
    }
    if (isAppError(error) && error.code === 'NOT_FOUND') notFound();
    if (isAppError(error) && error.code === 'UNAUTHORIZED') {
      redirect(`/${locale}/login?next=${next}`);
    }
    if (isAppError(error) && error.code === 'MFA_REQUIRED') redirect(`/${locale}/mfa?next=${next}`);
    throw error;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-10">
      <header className="rise flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold text-sand-900">{org.name}</h1>
            {org.verificationStatus === 'VERIFIED' ? (
              <Badge tone="success">{dict.common.verified}</Badge>
            ) : null}
          </div>
          <p className="text-sm text-sand-600">{dict.workspace.subtitle}</p>
        </div>
        <Link
          href={`/${locale}/dashboard`}
          className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800"
        >
          {dict.nav.dashboard}
          <ArrowRightIcon className="size-4 rtl:rotate-180" />
        </Link>
      </header>
      <WorkspaceTabs locale={locale} orgId={org.id} />
      {children}
    </div>
  );
}
