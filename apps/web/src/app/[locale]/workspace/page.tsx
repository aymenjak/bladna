import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isAppError } from '@bladna/types';
import { Card, buttonClasses } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { organizationRoutes } from '@/server/modules/organizations';
import { pageSession } from '@/server/page-session';
import type { AppRoute } from '@/server/router';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import { CreateOrganizationForm } from '@/ui/components/create-org-form';

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

interface OrgsResult {
  items: Array<{
    role: string;
    joinedAt: string | Date;
    organization: { id: string; name: string; verificationStatus: string };
  }>;
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.workspace.title, robots: { index: false, follow: false } };
}

/**
 * Workspace entry — pick which of your organizations to manage. Members with a
 * single organization land on the list too (one honest click, no magic
 * redirect that would mask multi-membership).
 */
export default async function WorkspaceIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { dict } = getDictionary(locale);

  const sessionPath = `/${locale}/workspace`;
  await pageSession(locale, sessionPath);
  const next = encodeURIComponent(sessionPath);

  let result: OrgsResult = { items: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } };
  try {
    result = await invoke<OrgsResult>(requireHandler('GET', '/me/organizations'), {
      path: '/me/organizations',
      locale,
      query: { page: 1, limit: 20 },
    });
  } catch (error) {
    if (isAppError(error) && error.code === 'UNAUTHORIZED') {
      redirect(`/${locale}/login?next=${next}`);
    }
    if (isAppError(error) && error.code === 'MFA_REQUIRED') redirect(`/${locale}/mfa?next=${next}`);
    throw error;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold text-sand-900">{dict.workspace.title}</h1>
        <p className="text-sm text-sand-600">{dict.workspace.subtitle}</p>
      </header>

      {result.items.length === 0 ? (
        <section className="rounded-xl border border-dashed border-sand-300 bg-white p-8">
          <div className="text-center">
            <h2 className="text-lg font-semibold text-sand-900">{dict.workspace.noOrgs}</h2>
            <p className="mt-1 text-sm text-sand-600">{dict.workspace.noOrgsBody}</p>
          </div>
          <div className="mx-auto mt-6 max-w-xl">
            <CreateOrganizationForm locale={locale} />
          </div>
        </section>
      ) : (
        <section className="space-y-3">
          <p className="text-sm text-sand-500">{dict.workspace.selectOrgHint}</p>
          <ul className="divide-y divide-sand-100 rounded-xl border border-sand-200 bg-white px-5">
            {result.items.map((row) => (
              <li
                key={row.organization.id}
                className="flex items-center justify-between gap-3 py-4"
              >
                <div className="min-w-0">
                  <Link
                    href={`/${locale}/workspace/${row.organization.id}`}
                    className="block truncate font-medium text-sand-900 hover:text-brand-700"
                  >
                    {row.organization.name}
                  </Link>
                  <p className="text-sm text-sand-500">
                    {(dict.billing.memberRoles as Record<string, string>)[row.role] ?? row.role}
                    {row.organization.verificationStatus === 'VERIFIED' ? (
                      <span className="ms-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-800">
                        {dict.common.verified}
                      </span>
                    ) : null}
                  </p>
                </div>
                <Link
                  href={`/${locale}/workspace/${row.organization.id}`}
                  className={buttonClasses({
                    variant: 'outline',
                    size: 'sm',
                    className: 'shrink-0 hover:border-brand-300 hover:text-brand-700',
                  })}
                >
                  {dict.workspace.tabs.overview} →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Multi-membership: create another organization from the same picker. */}
      {result.items.length > 0 ? (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-sand-900">{dict.workspace.createOrg}</h2>
          <div className="mt-4">
            <CreateOrganizationForm locale={locale} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
