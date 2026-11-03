import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAppError } from '@bladna/types';
import { EmptyState, buttonClasses } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { pageSession } from '@/server/page-session';
import { invoke } from '@/server/ssr';
import { recommendationRoutes } from '@/server/modules/matching';
import type { Handler } from '@/server/http';
import { MatchingRows, type MatchingItem } from '@/ui/components/matching-list';
import { PageMasthead } from '@/ui/components/page-masthead';

export const dynamic = 'force-dynamic';

interface RecommendationsResult {
  items: MatchingItem[];
  meta: { limit: number; minScore: number; candidates: number };
}

function handlerOf(method: string, path: string): Handler | null {
  return recommendationRoutes.find((r) => r.method === method && r.path === path)?.handler ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.matching.title, robots: { index: false, follow: false } };
}

/**
 * The full matching page behind the dashboard strip (P5): every reason the
 * engine produced stays on screen next to its initiative — this page is the
 * "why" surface, not just a longer list.
 */
export default async function RecommendationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { dict } = getDictionary(locale);

  const sessionPath = `/${locale}/recommendations`;
  await pageSession(locale, sessionPath);

  let result: RecommendationsResult = {
    items: [],
    meta: { limit: 12, minScore: 0, candidates: 0 },
  };
  const handler = handlerOf('GET', '/me/recommendations');
  if (handler) {
    try {
      result = await invoke<RecommendationsResult>(handler, {
        path: '/me/recommendations',
        locale,
        query: { limit: 12 },
      });
    } catch (error) {
      // Session guaranteed auth above; BUSINESS_RULE_ERROR = no volunteer
      // profile yet → the guided empty state below. Anything else is a bug.
      if (!isAppError(error) || error.code !== 'BUSINESS_RULE_ERROR') throw error;
    }
  }

  return (
    <>
      <PageMasthead
        title={dict.matching.title}
        subtitle={dict.matching.subtitle}
        inner="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8"
      />
      <div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-10 sm:px-6 lg:px-8">
        {result.items.length === 0 ? (
          <EmptyState className="mt-8" data-testid="matching-empty">
            <p>{dict.matching.empty}</p>
            <p className="mt-1">{dict.matching.emptyBody}</p>
            <p className="mt-4">
              <Link href={`/${locale}/profile`} className={buttonClasses({ variant: 'primary' })}>
                {dict.matching.emptyCta}
              </Link>
            </p>
          </EmptyState>
        ) : (
          <MatchingRows locale={locale} items={result.items} headingLevel="h2" />
        )}
        {/* The transparency note is unconditional (mirrors the dashboard strip):
          the "no black box" promise holds even when there is nothing to show. */}
        <p className="mt-6 text-xs text-sand-500">{dict.matching.howItWorks}</p>
      </div>
    </>
  );
}
