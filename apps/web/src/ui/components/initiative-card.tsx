import Link from 'next/link';
import { Badge } from '@bladna/ui';
import { formatDate, formatNumber } from '@/ui/format';
import { CalendarIcon, MapPinIcon, UsersIcon } from '@/ui/components/icons';
import {
  categoryNameFor,
  locationLineFor,
  titleFor,
  typeLabelFor,
  type OpportunityListItem,
} from '@/ui/opportunity';
import type { Dictionary, LocaleCode } from '@/ui/i18n';

/**
 * P11 thematic covers — one CC0/PDM photo per category slug, credited in
 * design-refs/PHOTO-CREDITS.md. Only these slugs (or an organizer-set
 * `coverImage`) ever get an <img>: anything else falls back to the gradient
 * block, so the grid never shows a broken image. Honesty rule (DESIGN §7):
 * covers are chosen by CATEGORY/record, alt="" marks them decorative — the
 * art is never presented as a photograph of this specific initiative.
 */
const COVER_SLOTS = new Set([
  'environment',
  'education',
  'humanitarian',
  'health',
  'community',
  'culture',
  'youth',
  'animal-welfare',
]);

/**
 * The one initiative result card — shared by the landing rail and the discover
 * list (previously two drifting copies of the same markup). Server-safe: no
 * client hooks, the whole tile is a single link.
 *
 * Craft notes:
 * - badges come from the kit (`Badge`), never page-local tone styles;
 * - the title tag is passed in (`h3` on the landing under its section `h2`,
 *   `h2` on the list under the page `h1`) so both pages keep a clean ladder;
 * - the meta footer pins to the card bottom (`mt-auto`) so equal-height grid
 *   rows keep their dividers on one line;
 * - P11: a thematic category cover leads the card (decorative alt="", see
 *   COVER_SLOTS) — never documentary, credits in PHOTO-CREDITS.md;
 * - meta icons are symmetric/direction-neutral (RTL-safe), all decorative.
 */
export function InitiativeCard({
  locale,
  dict,
  item,
  titleAs = 'h3',
  showApplicants = false,
  showOrganization = true,
}: {
  locale: LocaleCode;
  dict: Dictionary;
  item: OpportunityListItem;
  titleAs?: 'h2' | 'h3';
  /** The list page also shows the applicant count; the landing rail does not. */
  showApplicants?: boolean;
  /** The organization's own profile page hides the redundant byline. */
  showOrganization?: boolean;
}) {
  const Title = titleAs;
  const location = locationLineFor(item, locale);
  const category = categoryNameFor(item.category, locale);
  const context = [category, location].filter(Boolean).join(' · ');
  const verified = item.organization.verificationStatus === 'VERIFIED';
  // Cover order (P11): the organizer's own `coverImage` (spec §4), then the
  // category's CC0/PDM art, then the gradient block — never a broken image.
  const categoryCover =
    item.category && COVER_SLOTS.has(item.category.slug)
      ? `/photos/${item.category.slug}.jpg`
      : null;
  const cover = item.coverImage || categoryCover;

  return (
    <li className="h-full">
      <Link
        href={`/${locale}/opportunities/${item.slug}`}
        className="group flex h-full flex-col overflow-hidden rounded-card border border-sand-200 bg-white p-5 shadow-card transition hover:border-brand-200 hover:shadow-md"
      >
        {/* Thematic cover — decorative (alt=""), lazy, fixed 16:10 slot so
            rows never shift; saturate keeps mixed sources one palette. */}
        <div className="relative -mx-5 -mt-5 aspect-[16/10] overflow-hidden bg-gradient-to-br from-brand-800 to-brand-900">
          {cover ? (
            <img
              src={cover}
              alt=""
              width={1280}
              height={800}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover saturate-[0.85] transition duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <span
              aria-hidden
              className="absolute inset-0 opacity-35"
              style={{
                backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.35) 1px, transparent 1px)',
                backgroundSize: '22px 22px',
              }}
            />
          )}
          <span
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-brand-900/30 via-brand-900/5 to-transparent"
          />
        </div>
        <div className="mt-3 flex items-start justify-between gap-2">
          <Badge>{typeLabelFor(item.type, dict)}</Badge>
          {verified ? <Badge tone="success">{dict.common.verified}</Badge> : null}
        </div>
        <Title className="mt-3 text-base font-semibold leading-snug text-sand-900 transition-colors group-hover:text-brand-800">
          {titleFor(item, locale)}
        </Title>
        {showOrganization ? (
          <p className="mt-1 text-sm text-sand-500">{item.organization.name}</p>
        ) : null}
        {context ? (
          <p className="mt-2 mb-4 flex items-start gap-1.5 text-sm text-sand-600">
            <MapPinIcon className="mt-0.5 size-3.5 shrink-0 text-sand-400" />
            <span>{context}</span>
          </p>
        ) : (
          <span className="flex-1" aria-hidden />
        )}
        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t border-sand-100 pt-3 text-xs text-sand-500">
          {item.applicationDeadline ? (
            <span className="inline-flex items-center gap-1.5">
              <CalendarIcon className="size-3.5 text-sand-400" />
              {dict.common.deadline}: {formatDate(item.applicationDeadline, locale)}
            </span>
          ) : null}
          {showApplicants ? (
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              {dict.common.applicants}: {formatNumber(item.applicationCount, locale)}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <UsersIcon className="size-3.5 text-sand-400" />
            {dict.opportunity.joined}: {formatNumber(item.acceptedCount, locale)}
            {item.capacity !== null ? ` / ${formatNumber(item.capacity, locale)}` : ''}
          </span>
        </div>
      </Link>
    </li>
  );
}
