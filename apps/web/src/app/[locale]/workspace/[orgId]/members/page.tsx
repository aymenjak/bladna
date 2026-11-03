import { notFound, redirect } from 'next/navigation';
import { isAppError, type LocaleCode } from '@bladna/types';
import { Card } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { organizationRoutes } from '@/server/modules/organizations';
import type { AppRoute } from '@/server/router';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import { WorkspaceNoAccess } from '@/ui/components/workspace-no-access';
import { formatDate } from '@/ui/format';
import {
  InviteForm,
  InvitationRevokeButton,
  MemberRemoveButton,
  MemberRowActions,
} from '@/ui/components/workspace-members';
import { StatusBadge } from '@/ui/status';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;
const ROUTE_TABLES: AppRoute[][] = [organizationRoutes];

/** Look up a handler from the module route table so SSR can call it in-process. */
function requireHandler(method: string, path: string): Handler {
  const handler = ROUTE_TABLES.flatMap((table) => table).find(
    (route) => route.method === method && route.path === path,
  )?.handler;
  if (!handler) throw new Error(`Missing route handler for ${method} ${path}`);
  return handler;
}

interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type MemberRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'STAFF' | 'VIEWER';
type MemberStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'REMOVED';

interface MemberRow {
  id: string;
  role: MemberRole;
  status: MemberStatus;
  title: string | null;
  joinedAt: string | Date | null;
  createdAt: string | Date;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    profileImage: string | null;
    preferredLanguage: string;
  };
}

interface InvitationRow {
  id: string;
  email: string;
  role: MemberRole;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
  expiresAt: string | Date | null;
  createdAt: string | Date;
  acceptedAt: string | Date | null;
  invitedBy: { firstName: string; lastName: string } | null;
}

interface MembersResult {
  items: MemberRow[];
  meta: PageMeta;
}

interface InvitationsResult {
  items: InvitationRow[];
  meta: PageMeta;
}

interface Filters {
  q: string;
  status: string;
}

/** Preserve the active filters when moving between pages. */
function pageHref(locale: LocaleCode, orgId: string, page: number, filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.status) params.set('status', filters.status);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return `/${locale}/workspace/${orgId}/members${qs ? `?${qs}` : ''}`;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.workspace.tabs.members, robots: { index: false, follow: false } };
}

export default async function MembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; orgId: string }>;
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { locale, orgId } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const { dict } = getDictionary(locale);
  const next = encodeURIComponent(`/${locale}/workspace/${orgId}/members`);

  const q = (sp.q ?? '').trim().slice(0, 120);
  const status = (['INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED'] as const).includes(
    sp.status as MemberStatus,
  )
    ? (sp.status as string)
    : '';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const filters: Filters = { q, status };

  let members: MembersResult = {
    items: [],
    meta: { page, limit: PAGE_SIZE, total: 0, totalPages: 0 },
  };
  let invitations: InvitationsResult | null = null;

  try {
    members = await invoke<MembersResult>(requireHandler('GET', '/orgs/:orgId/members'), {
      path: `/orgs/${orgId}/members`,
      locale,
      params: { orgId },
      query: { page, limit: PAGE_SIZE, q: q || undefined, status: status || undefined },
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

  // Optional enrichment: invitations (and the invite form) need
  // organization.members.manage — degrade to hiding both when unavailable.
  try {
    invitations = await invoke<InvitationsResult>(
      requireHandler('GET', '/orgs/:orgId/members/invitations'),
      {
        path: `/orgs/${orgId}/members/invitations`,
        locale,
        params: { orgId },
        query: { page: 1, limit: 50 },
      },
    );
  } catch (error) {
    if (!isAppError(error)) throw error;
    invitations = null;
  }

  const { items, meta } = members;
  const canManage = invitations !== null;

  return (
    <div className="space-y-6">
      {canManage ? <InviteForm locale={locale} orgId={orgId} /> : null}

      {/* Member filter — plain GET form, works without JS. */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-sand-200 bg-white p-6"
        action={`/${locale}/workspace/${orgId}/members`}
      >
        <div className="min-w-64 flex-1">
          <label htmlFor="q" className="block text-sm font-medium text-sand-700">
            {dict.common.search}
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={120}
            className="mt-1 w-full h-10 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
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
            <option value="ACTIVE">{dict.workspace.members.statuses.ACTIVE}</option>
            <option value="SUSPENDED">{dict.workspace.members.statuses.SUSPENDED}</option>
            <option value="REMOVED">{dict.workspace.members.statuses.REMOVED}</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg border border-sand-200 bg-white inline-flex min-h-11 items-center px-4 text-sm font-semibold text-sand-900 hover:bg-sand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sand-900"
        >
          {dict.common.search}
        </button>
      </form>

      <Card className="p-6">
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-sand-500">{dict.workspace.members.none}</p>
        ) : (
          <ul className="divide-y divide-sand-100">
            {items.map((row) => (
              <li key={row.id} className="flex flex-wrap items-start gap-3 py-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sand-900">
                      {`${row.user.firstName} ${row.user.lastName}`.trim()}
                    </span>
                    <span className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-semibold text-sand-700">
                      {dict.workspace.members.roles[row.role] ?? row.role}
                    </span>
                    <StatusBadge
                      status={row.status}
                      label={
                        dict.workspace.members.statuses[
                          row.status as 'ACTIVE' | 'SUSPENDED' | 'REMOVED'
                        ] ?? row.status
                      }
                    />
                  </div>
                  <p className="break-all text-sm text-sand-500">{row.user.email}</p>
                  <p className="text-xs text-sand-500">
                    {dict.common.createdAt}: {formatDate(row.joinedAt ?? row.createdAt, locale)}
                  </p>
                </div>
                {canManage && row.status !== 'REMOVED' ? (
                  <div className="flex shrink-0 flex-wrap items-start gap-2">
                    <MemberRowActions
                      locale={locale}
                      orgId={orgId}
                      memberId={row.id}
                      role={row.role}
                    />
                    <MemberRemoveButton
                      locale={locale}
                      orgId={orgId}
                      memberId={row.id}
                      memberName={`${row.user.firstName} ${row.user.lastName}`.trim()}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Pagination — filters preserved across pages. */}
      {meta.totalPages > 1 ? (
        <nav
          className="flex items-center justify-center gap-4 text-sm"
          aria-label={dict.common.page}
        >
          {meta.page > 1 ? (
            <a
              href={pageHref(locale, orgId, meta.page - 1, filters)}
              className="rounded-lg border border-sand-200 bg-white inline-flex min-h-11 items-center px-4 font-medium text-sand-700 hover:bg-sand-100"
            >
              {dict.common.previous}
            </a>
          ) : (
            <span className="rounded-lg border border-sand-100 inline-flex min-h-11 items-center px-4 text-sand-400">
              {dict.common.previous}
            </span>
          )}
          <span className="text-sand-600">
            {dict.common.page} {meta.page} {dict.common.of} {meta.totalPages} · {meta.total}
          </span>
          {meta.page < meta.totalPages ? (
            <a
              href={pageHref(locale, orgId, meta.page + 1, filters)}
              className="rounded-lg border border-sand-200 bg-white inline-flex min-h-11 items-center px-4 font-medium text-sand-700 hover:bg-sand-100"
            >
              {dict.common.next}
            </a>
          ) : (
            <span className="rounded-lg border border-sand-100 inline-flex min-h-11 items-center px-4 text-sand-400">
              {dict.common.next}
            </span>
          )}
        </nav>
      ) : null}

      {/* Pending invitations — needs organization.members.manage. */}
      {canManage && invitations ? (
        <Card className="p-6">
          <h2 className="text-base font-semibold text-sand-900">
            {dict.workspace.members.pendingInvites}
          </h2>
          {invitations.items.length === 0 ? (
            <p className="mt-3 text-sm text-sand-500">{dict.workspace.members.noPendingInvites}</p>
          ) : (
            <ul className="mt-3 divide-y divide-sand-100">
              {invitations.items.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-all text-sm font-medium text-sand-900">{row.email}</p>
                    <p className="text-xs text-sand-500">
                      {dict.workspace.members.roles[row.role] ?? row.role}
                      {row.expiresAt ? (
                        <>
                          {' · '}
                          {dict.workspace.members.expiresAt}: {formatDate(row.expiresAt, locale)}
                        </>
                      ) : null}
                    </p>
                  </div>
                  <span className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-semibold text-sand-700">
                    {row.status}
                  </span>
                  {row.status === 'PENDING' ? (
                    <InvitationRevokeButton locale={locale} orgId={orgId} invitationId={row.id} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </div>
  );
}
