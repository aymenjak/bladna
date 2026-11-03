import { notFound, redirect } from 'next/navigation';
import { isAppError, type LocaleCode } from '@bladna/types';
import { Card } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { documentRoutes } from '@/server/modules/documents';
import type { AppRoute } from '@/server/router';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import { WorkspaceNoAccess } from '@/ui/components/workspace-no-access';
import { formatDateTime } from '@/ui/format';
import { DeleteDocumentButton, UploadDocumentForm } from '@/ui/components/workspace-documents';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;
const ROUTE_TABLES: AppRoute[][] = [documentRoutes];

/** Mirrors the Prisma DocumentType enum (packages/database/schema.prisma). */
const DOCUMENT_TYPES = [
  'AVATAR',
  'LOGO',
  'COVER_IMAGE',
  'IDENTITY',
  'ORGANIZATION_REGISTRATION',
  'VERIFICATION_EVIDENCE',
  'CERTIFICATE',
  'ATTACHMENT',
  'OTHER',
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

interface DocumentRow {
  id: string;
  type: (typeof DOCUMENT_TYPES)[number];
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  visibility: 'PRIVATE' | 'ORGANIZATION' | 'PUBLIC';
  createdAt: string | Date;
}

interface DocumentsResult {
  items: DocumentRow[];
  meta: PageMeta;
}

interface Filters {
  type: string;
}

/** Preserve the active filter when moving between pages. */
function pageHref(locale: LocaleCode, orgId: string, page: number, filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.type) params.set('type', filters.type);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return `/${locale}/workspace/${orgId}/documents${qs ? `?${qs}` : ''}`;
}

function formatBytes(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  if (sizeBytes >= 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${sizeBytes} B`;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.workspace.tabs.documents, robots: { index: false, follow: false } };
}

export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; orgId: string }>;
  searchParams: Promise<{ type?: string; page?: string }>;
}) {
  const { locale, orgId } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const { dict } = getDictionary(locale);
  const next = encodeURIComponent(`/${locale}/workspace/${orgId}/documents`);

  const type = (DOCUMENT_TYPES as readonly string[]).includes(sp.type ?? '')
    ? (sp.type as string)
    : '';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const filters: Filters = { type };

  let documents: DocumentsResult = {
    items: [],
    meta: { page, limit: PAGE_SIZE, total: 0, totalPages: 0 },
  };

  try {
    documents = await invoke<DocumentsResult>(requireHandler('GET', '/orgs/:orgId/documents'), {
      path: `/orgs/${orgId}/documents`,
      locale,
      params: { orgId },
      query: { page, limit: PAGE_SIZE, type: type || undefined },
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

  const { items, meta } = documents;

  return (
    <div className="space-y-6">
      <UploadDocumentForm locale={locale} orgId={orgId} />

      {/* Type filter — plain GET form, works without JS. */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-sand-200 bg-white p-6"
        action={`/${locale}/workspace/${orgId}/documents`}
      >
        <div className="min-w-64 flex-1">
          <label htmlFor="doc-type" className="block text-sm font-medium text-sand-700">
            {dict.workspace.documents.typeLabel}
          </label>
          <select
            id="doc-type"
            name="type"
            defaultValue={type}
            className="mt-1 w-full h-10 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="">{dict.common.all}</option>
            {DOCUMENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {value}
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

      <Card className="p-6">
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-sand-500">{dict.workspace.documents.none}</p>
        ) : (
          <ul className="divide-y divide-sand-100">
            {items.map((row) => (
              <li key={row.id} className="flex flex-wrap items-start gap-3 py-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="break-all font-medium text-sand-900">{row.fileName}</span>
                    <span className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-semibold text-sand-700">
                      {row.type}
                    </span>
                    <span className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-semibold text-sand-700">
                      {row.visibility}
                    </span>
                  </div>
                  <p className="text-xs text-sand-500">
                    {row.mimeType} · {formatBytes(row.sizeBytes)} · {row.status} ·{' '}
                    {formatDateTime(row.createdAt, locale)}
                  </p>
                </div>
                <DeleteDocumentButton
                  locale={locale}
                  orgId={orgId}
                  documentId={row.id}
                  fileName={row.fileName}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Pagination — filter preserved across pages. */}
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
    </div>
  );
}
