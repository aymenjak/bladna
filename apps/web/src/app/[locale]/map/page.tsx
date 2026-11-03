import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAppError } from '@bladna/types';
import { getDictionary, isLocale } from '@/ui/i18n';
import { formatNumber } from '@/ui/format';
import type { MapItem } from '@/ui/opportunity';
import { discover } from '@/server/modules/opportunities';
import { invoke } from '@/server/ssr';
import { ChevronLeftIcon } from '@/ui/components/icons';
import { InitiativeMap } from '@/ui/components/initiative-map';
import { PageMasthead } from '@/ui/components/page-masthead';

export const dynamic = 'force-dynamic';

interface MapResult {
  items: MapItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.nav.map, description: dict.opportunity.mapSubtitle };
}

/**
 * Public initiative map (spec §16) — discover `mode=map` (MAP_SELECT) on the
 * Leaflet island (P6): bundled OSM geography (ODbL, attributed in the UI), a
 * proximity cluster so nearby pins never blob together, and "search this
 * area" re-querying discover with the `bounds` viewport filter over the
 * public API. The side list is the visible, keyboard-accessible alternative
 * to every pin (P11).
 */
export default async function MapPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { dict } = getDictionary(locale);

  let items: MapItem[] = [];
  try {
    const result = await invoke<MapResult>(discover, {
      path: '/opportunities',
      locale,
      query: { mode: 'map', sort: 'recent', limit: 100, page: 1 },
    });
    items = result.items;
  } catch (error) {
    // Mirror the discover page: injected garbage degrades to an empty map.
    if (!isAppError(error) || error.code !== 'VALIDATION_ERROR') throw error;
  }

  // Header stat: how many wilayas the pins span (flat field, no extra query).
  const distinctWilayas = new Set(items.map((item) => item.wilayaId).filter(Boolean)).size;

  return (
    <>
      <PageMasthead
        eyebrow={dict.opportunity.mapEyebrow}
        title={dict.nav.map}
        subtitle={dict.opportunity.mapSubtitle}
        action={
          items.length > 0 ? (
            <dl className="flex gap-6 pb-1">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-brand-200 rtl:tracking-normal">
                  {dict.landing.statsInitiatives}
                </dt>
                <dd className="mt-0.5 text-2xl font-bold tabular-nums text-white">
                  {formatNumber(items.length, locale)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-brand-200 rtl:tracking-normal">
                  {dict.opportunity.filterWilaya}
                </dt>
                <dd className="mt-0.5 text-2xl font-bold tabular-nums text-white">
                  {formatNumber(distinctWilayas, locale)}
                </dd>
              </div>
            </dl>
          ) : null
        }
      />
      <div className="mx-auto max-w-6xl px-4 pt-6 pb-10">
        <div className="mt-6">
          <InitiativeMap locale={locale} items={items} />
        </div>

        <p className="mt-6">
          <Link
            href={`/${locale}/opportunities`}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800"
          >
            <ChevronLeftIcon className="size-4 rtl:rotate-180" />
            {dict.opportunity.backToList}
          </Link>
        </p>
      </div>
    </>
  );
}
