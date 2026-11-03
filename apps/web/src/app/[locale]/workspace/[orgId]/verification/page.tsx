import { notFound, redirect } from 'next/navigation';
import { isAppError, type LocaleCode, type VerificationStatus } from '@bladna/types';
import { Card } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { verificationRoutes } from '@/server/modules/verification';
import { documentRoutes } from '@/server/modules/documents';
import type { AppRoute } from '@/server/router';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import { WorkspaceNoAccess } from '@/ui/components/workspace-no-access';
import { formatDateTime } from '@/ui/format';
import { SubmitVerificationForm } from '@/ui/components/workspace-verification';
import { StatusBadge } from '@/ui/status';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 10;
const ROUTE_TABLES: AppRoute[][] = [verificationRoutes, documentRoutes];

/** Trust levels an organization can actually request (LEVEL_0 is the default). */
const TARGET_LEVELS = [
  'LEVEL_1_BASIC_VERIFIED',
  'LEVEL_2_ORGANIZATION_VERIFIED',
  'LEVEL_3_TRUSTED_PARTNER',
  'LEVEL_4_STRATEGIC_PARTNER',
] as const;

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

interface VerificationRow {
  id: string;
  level: string;
  status: VerificationStatus;
  submittedAt: string | Date | null;
  reviewedAt: string | Date | null;
  notes: string | null;
  rejectReason: string | null;
  expiresAt: string | Date | null;
  documents: Array<{ id: string; label: string | null; status: string }>;
}

interface VerificationsResult {
  items: VerificationRow[];
  meta: PageMeta;
}

interface DocumentOption {
  id: string;
  fileName: string;
  type: string;
  sizeBytes: number;
}

interface DocumentsResult {
  items: DocumentOption[];
  meta: PageMeta;
}

/** Preserve the page number across navigation. */
function pageHref(locale: LocaleCode, orgId: string, page: number): string {
  const qs = page > 1 ? `?page=${page}` : '';
  return `/${locale}/workspace/${orgId}/verification${qs}`;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.workspace.tabs.verification, robots: { index: false, follow: false } };
}

export default async function VerificationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; orgId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale, orgId } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const { dict } = getDictionary(locale);
  const next = encodeURIComponent(`/${locale}/workspace/${orgId}/verification`);

  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  let history: VerificationsResult = {
    items: [],
    meta: { page, limit: PAGE_SIZE, total: 0, totalPages: 0 },
  };
  let documents: DocumentOption[] = [];
  let documentsLoaded = false;

  try {
    history = await invoke<VerificationsResult>(
      requireHandler('GET', '/orgs/:orgId/verifications'),
      {
        path: `/orgs/${orgId}/verifications`,
        locale,
        params: { orgId },
        query: { page, limit: PAGE_SIZE },
      },
    );
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

  // Optional enrichment: tenant documents feed the evidence select.
  // AppError → hide the submit form; success + empty → `noDocuments`.
  try {
    const result = await invoke<DocumentsResult>(requireHandler('GET', '/orgs/:orgId/documents'), {
      path: `/orgs/${orgId}/documents`,
      locale,
      params: { orgId },
      query: { page: 1, limit: 100 },
    });
    documents = result.items;
    documentsLoaded = true;
  } catch (error) {
    if (!isAppError(error)) throw error;
    documentsLoaded = false;
  }

  const { items, meta } = history;

  return (
    <div className="space-y-6">
      {documentsLoaded ? (
        documents.length > 0 ? (
          <SubmitVerificationForm
            locale={locale}
            orgId={orgId}
            levels={TARGET_LEVELS}
            documents={documents}
          />
        ) : (
          <section className="rounded-xl border border-dashed border-sand-300 bg-white p-8 text-center">
            <p className="text-sm text-sand-600">{dict.workspace.verification.noDocuments}</p>
          </section>
        )
      ) : null}

      <Card className="p-6">
        <h2 className="text-base font-semibold text-sand-900">
          {dict.workspace.verification.historyTitle}
        </h2>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-sand-500">
            {dict.workspace.verification.none}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-sand-100">
            {items.map((row) => (
              <li key={row.id} className="flex flex-wrap items-start gap-3 py-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sand-900">
                      {(dict.workspace.verification.levels as Record<string, string>)[row.level] ??
                        row.level}
                    </span>
                    <StatusBadge
                      status={row.status}
                      label={dict.admin.verificationStatuses[row.status] ?? row.status}
                    />
                  </div>
                  <p className="text-xs text-sand-500">
                    {dict.common.createdAt}:{' '}
                    {row.submittedAt ? formatDateTime(row.submittedAt, locale) : '—'}
                    {row.reviewedAt ? (
                      <>
                        {' · '}
                        {formatDateTime(row.reviewedAt, locale)}
                      </>
                    ) : null}
                    {row.expiresAt ? (
                      <>
                        {' · '}
                        {formatDateTime(row.expiresAt, locale)}
                      </>
                    ) : null}
                  </p>
                  {row.notes ? <p className="text-sm text-sand-600">{row.notes}</p> : null}
                  {row.rejectReason ? (
                    <p className="text-sm text-red-700">
                      {dict.workspace.certificates.reasonLabel}: {row.rejectReason}
                    </p>
                  ) : null}
                  {row.documents.length > 0 ? (
                    <p className="break-all text-xs text-sand-500">
                      {row.documents
                        .map((document) => document.label)
                        .filter((label): label is string => Boolean(label))
                        .join(' · ')}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Pagination. */}
      {meta.totalPages > 1 ? (
        <nav
          className="flex items-center justify-center gap-4 text-sm"
          aria-label={dict.common.page}
        >
          {meta.page > 1 ? (
            <a
              href={pageHref(locale, orgId, meta.page - 1)}
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
              href={pageHref(locale, orgId, meta.page + 1)}
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
    </div>
  );
}
