import Link from 'next/link';
import { Card, CardTitle, EmptyState } from '@bladna/ui';
import { formatDate } from '@/ui/format';
import { getDictionary, type LocaleCode } from '@/ui/i18n';
import {
  categoryNameFor,
  locationLineFor,
  titleFor,
  type OpportunityListItem,
} from '@/ui/opportunity';
import { SaveButton } from './save-button';

/**
 * Personalized matching surfaces (P5) — server components over
 * `GET /me/recommendations`. Every row carries the engine's reason codes as
 * localized chips plus the 0–100 score, so the "why" is always visible
 * (the transparency promise behind `matching.howItWorks`). Rows are the same
 * on the dashboard strip (top 3) and the recommendations page.

 */

export interface MatchReasonView {
  code: string;
  weight: number;
}

export interface MatchView {
  score: number;
  reasons: MatchReasonView[];
}

export type MatchingItem = OpportunityListItem & {
  saved: boolean;
  match: MatchView;
};

export interface MatchingRowsProps {
  locale: LocaleCode;
  items: MatchingItem[];
  /** Heading level of each row title (dashboard card already sits under an h2). */
  headingLevel?: 'h2' | 'h3';
}

const CHIP_CLS = 'rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-medium text-sand-700';

export function MatchingRows({ locale, items, headingLevel = 'h3' }: MatchingRowsProps) {
  const { dict } = getDictionary(locale);
  const Heading = headingLevel;
  const reasons = dict.matching.reasons as Record<string, string>;

  return (
    <ul className="mt-4 space-y-4" data-testid="matching-rows">
      {items.map((item) => {
        const location = locationLineFor(item, locale);
        const category = categoryNameFor(item.category, locale);
        const headingId = `match-title-${item.id}`;
        return (
          <li key={item.id}>
            <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-800">
                      {dict.matching.scoreLabel}: {item.match.score}%
                    </span>
                    {item.organization.verificationStatus === 'VERIFIED' ? (
                      <span className={CHIP_CLS}>{dict.common.verified}</span>
                    ) : null}
                  </div>
                  <Heading
                    id={headingId}
                    className="mt-2 text-base font-semibold leading-snug text-sand-900"
                  >
                    <Link
                      href={`/${locale}/opportunities/${item.slug}`}
                      className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                    >
                      {titleFor(item, locale)}
                    </Link>
                  </Heading>
                  <p className="mt-1 text-sm text-sand-500">{item.organization.name}</p>
                  {category || location ? (
                    <p className="mt-1 text-sm text-sand-600">
                      {[category, location].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}
                </div>
                <SaveButton
                  opportunityId={item.id}
                  locale={locale}
                  initialSaved={item.saved}
                  className="shrink-0"
                />
              </div>

              {/* One chip per engine reason — the whole "why" stays visible. */}
              <ul className="mt-3 flex flex-wrap gap-2" aria-label={dict.matching.scoreLabel}>
                {item.match.reasons.map((reason) => (
                  <li key={reason.code} className={CHIP_CLS}>
                    {reasons[reason.code] ?? reason.code}
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-sand-100 pt-3 text-xs text-sand-500">
                {item.applicationDeadline ? (
                  <span>
                    {dict.common.deadline}: {formatDate(item.applicationDeadline, locale)}
                  </span>
                ) : null}
                <span>
                  {dict.common.applicants}: {item.applicationCount}
                </span>
                <span>
                  {dict.opportunity.joined}: {item.acceptedCount}
                  {item.capacity !== null ? ` / ${item.capacity}` : ''}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export interface MatchingCardProps {
  locale: LocaleCode;
  items: MatchingItem[];
}

/** Dashboard strip: the top matches inside one Card with the transparency note. */
export function MatchingCard({ locale, items }: MatchingCardProps) {
  const { dict } = getDictionary(locale);
  return (
    <Card data-testid="matching-strip">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>{dict.matching.title}</CardTitle>
        <Link
          href={`/${locale}/recommendations`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-brand-700 hover:text-brand-800"
        >
          {dict.matching.viewAll}
        </Link>
      </div>
      <p className="mt-1 text-sm text-sand-600">{dict.matching.subtitle}</p>
      {items.length === 0 ? (
        <EmptyState className="mt-4" data-testid="matching-empty">
          {dict.matching.empty} {dict.matching.emptyBody}
        </EmptyState>
      ) : (
        <MatchingRows locale={locale} items={items} />
      )}
      <p className="mt-4 text-xs text-sand-500">{dict.matching.howItWorks}</p>
    </Card>
  );
}
