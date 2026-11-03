import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAppError } from '@bladna/types';
import { Badge } from '@bladna/ui';
import { getDictionary, isLocale, type LocaleCode } from '@/ui/i18n';
import { formatDate } from '@/ui/format';
import { cmsRoutes } from '@/server/modules/cms';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import { ChevronLeftIcon } from '@/ui/components/icons';

export const dynamic = 'force-dynamic';

/** Look up a handler from the module route table so SSR can call it in-process. */
function handlerOf(method: string, path: string): Handler | null {
  return cmsRoutes.find((route) => route.method === method && route.path === path)?.handler ?? null;
}

type ContentPageType = 'PAGE' | 'FAQ' | 'GUIDE' | 'SAFETY' | 'LEGAL';

interface Article {
  id: string;
  slug: string;
  type: ContentPageType;
  titleAr: string;
  titleFr: string;
  titleEn: string;
  bodyAr: string;
  bodyFr: string;
  bodyEn: string;
  seoDescription: string | null;
  updatedAt: string;
}

interface ArticleResult {
  page: Article;
}

const titleOf = (locale: LocaleCode, article: Article): string =>
  locale === 'ar' ? article.titleAr : locale === 'fr' ? article.titleFr : article.titleEn;

const bodyOf = (locale: LocaleCode, article: Article): string =>
  locale === 'ar' ? article.bodyAr : locale === 'fr' ? article.bodyFr : article.bodyEn;

/**
 * Public slugs are opaque path segments: reject anything that could escape
 * the segment (separators, query, fragment) before it reaches the handler.
 */
function safeSlug(raw: string): string | null {
  const slug = decodeURIComponent(raw).trim();
  if (!slug || /[\s/?#]/.test(slug)) return null;
  return slug;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  if (!isLocale(locale) || !safeSlug(slug)) return { title: dict.help.title };
  const handler = handlerOf('GET', '/content/pages/:slug');
  if (!handler) return { title: dict.help.title };
  try {
    const result = await invoke<ArticleResult>(handler, {
      path: `/content/pages/${encodeURIComponent(slug)}`,
      params: { slug },
      locale,
    });
    return {
      title: titleOf(locale, result.page),
      description: result.page.seoDescription ?? dict.help.subtitle,
    };
  } catch {
    // Missing/draft alike — the page component performs the real notFound().
    return { title: dict.help.title };
  }
}

/**
 * One published CMS article (P12). Drafts and archived rows are
 * indistinguishable from missing ones publicly (the module 404s them), and
 * the body stays plain text exactly as the admin textarea wrote it: blank
 * lines separate paragraphs; a paragraph's first line renders as its lead.
 */
export default async function HelpArticlePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const safe = safeSlug(slug);
  if (!safe) notFound();
  const { dict } = getDictionary(locale);

  const handler = handlerOf('GET', '/content/pages/:slug');
  if (!handler) notFound();

  let article: Article;
  try {
    const result = await invoke<ArticleResult>(handler, {
      path: `/content/pages/${encodeURIComponent(safe)}`,
      params: { slug: safe },
      locale,
    });
    article = result.page;
  } catch (error) {
    if (isAppError(error) && (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR')) {
      notFound();
    }
    throw error;
  }

  const paragraphs = bodyOf(locale, article)
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {/* PageHeader (DESIGN.md §4): eyebrow → h1 → type + freshness. */}
      <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 rtl:tracking-normal">
        {dict.help.title}
      </p>
      <h1 className="mt-2 text-3xl font-bold text-sand-900">{titleOf(locale, article)}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-sand-500">
        <Badge tone="success">{dict.help.types[article.type]}</Badge>
        <span>
          {dict.help.updated} {formatDate(article.updatedAt, locale)}
        </span>
      </div>

      <article className="mt-8 space-y-5 leading-relaxed text-sand-700">
        {paragraphs.map((paragraph, index) => {
          const [lead, ...rest] = paragraph.split('\n');
          return rest.length > 0 ? (
            <div key={index} className="space-y-1.5">
              <p className="font-semibold text-sand-900">{lead}</p>
              <p>{rest.join(' ')}</p>
            </div>
          ) : (
            <p key={index}>{paragraph}</p>
          );
        })}
      </article>

      <p className="mt-10">
        <Link
          href={`/${locale}/help`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800"
        >
          <ChevronLeftIcon className="size-4 rtl:rotate-180" />
          {dict.help.allArticles}
        </Link>
      </p>
    </div>
  );
}
