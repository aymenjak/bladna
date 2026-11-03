import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Card, EmptyState } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { formatDate } from '@/ui/format';
import { cmsRoutes } from '@/server/modules/cms';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import { PageMasthead } from '@/ui/components/page-masthead';

// Articles render live from the CMS — a publish in the admin console shows up
// on the next request, never at build time.
export const dynamic = 'force-dynamic';

/** Look up a handler from the module route table so SSR can call it in-process. */
function handlerOf(method: string, path: string): Handler | null {
  return cmsRoutes.find((route) => route.method === method && route.path === path)?.handler ?? null;
}

type ContentPageType = 'PAGE' | 'FAQ' | 'GUIDE' | 'SAFETY' | 'LEGAL';

interface ContentPageRow {
  id: string;
  slug: string;
  type: ContentPageType;
  titleAr: string;
  titleFr: string;
  titleEn: string;
  seoDescription: string | null;
  updatedAt: string;
}

interface PagesResult {
  items: ContentPageRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.help.title, description: dict.help.subtitle };
}

/**
 * The public face of the CMS (P12): published content pages — FAQ, guides,
 * policies — collected in one help centre. Drafts never leave the admin
 * console, so this list only ever shows PUBLISHED rows.
 */
export default async function HelpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { dict } = getDictionary(locale);

  let items: ContentPageRow[] = [];
  const handler = handlerOf('GET', '/content/pages');
  if (handler) {
    const result = await invoke<PagesResult>(handler, {
      path: '/content/pages',
      locale,
      query: { page: 1, limit: 50 },
    });
    items = result.items;
  }

  const titleFor = (row: ContentPageRow): string =>
    locale === 'ar' ? row.titleAr : locale === 'fr' ? row.titleFr : row.titleEn;

  return (
    <>
      <PageMasthead title={dict.help.title} subtitle={dict.help.subtitle} />
      <div className="mx-auto max-w-6xl px-4 pt-6 pb-10">
        {items.length === 0 ? (
          <EmptyState className="mt-8" data-testid="help-empty">
            <p>{dict.help.empty}</p>
            <p className="mt-1">{dict.help.emptyBody}</p>
          </EmptyState>
        ) : (
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="help-articles">
            {items.map((row) => (
              <Card
                as="li"
                key={row.id}
                className="flex flex-col p-5 transition motion-safe:hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
              >
                <div>
                  <Badge tone="success">{dict.help.types[row.type]}</Badge>
                </div>
                <h2 className="mt-3 text-base font-semibold text-sand-900">
                  <Link href={`/${locale}/help/${row.slug}`} className="hover:text-brand-800">
                    {titleFor(row)}
                  </Link>
                </h2>
                {row.seoDescription ? (
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-sand-600">
                    {row.seoDescription}
                  </p>
                ) : null}
                <p className="mt-4 text-xs text-sand-500">
                  {dict.help.updated} {formatDate(row.updatedAt, locale)}
                </p>
              </Card>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
