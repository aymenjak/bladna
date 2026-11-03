import Link from 'next/link';
import type { LocaleCode } from '@bladna/types';
import { Card } from '@bladna/ui';
import { getDictionary } from '@/ui/i18n';
import { formatDate } from '@/ui/format';
import { titleFor } from '@/ui/opportunity';
import { SourceBadge } from './source-badge';
import {
  categoryLabelFor,
  safeExternalUrl,
  textFor,
  type InternationalOpportunityRow,
} from './types';

/**
 * Public BLADNA International offer card (list + country pages): program and
 * category chips, the source badge, a title linking to the detail page, and a
 * footer with duration/location/deadline. `context="country"` switches the
 * duration label to `countryDuration` and surfaces the offer's application
 * requirements under `countryRequirements`.
 */
export function OpportunityCardIntl({
  locale,
  item,
  context = 'list',
}: {
  locale: LocaleCode;
  item: InternationalOpportunityRow;
  context?: 'list' | 'country';
}) {
  const { dict } = getDictionary(locale);
  const excerpt = textFor(locale, item.descriptionAr, item.descriptionFr, item.descriptionEn);
  const applyUrl = safeExternalUrl(item.sourceUrl);
  const categoryLabel = categoryLabelFor(dict, item.category);
  const durationLabel =
    context === 'country' ? dict.international.countryDuration : dict.international.duration;
  const place = item.region ? [item.city, item.region].filter(Boolean).join(', ') : item.city;

  return (
    <Card as="li" className="flex h-full flex-col p-5">
      <div className="flex flex-wrap items-start gap-2">
        <span className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-medium text-sand-700">
          {item.program}
        </span>
        {categoryLabel ? (
          <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-800">
            {categoryLabel}
          </span>
        ) : null}
        <SourceBadge
          locale={locale}
          sourceType={item.sourceType}
          verificationStatus={item.verificationStatus}
        />
      </div>
      <h2 className="mt-3 text-base font-semibold leading-snug text-sand-900">
        <Link
          href={`/${locale}/international/${item.id}`}
          className="transition hover:text-brand-700"
        >
          {titleFor(item, locale) || item.program}
        </Link>
      </h2>
      <p className="mt-1 text-sm text-sand-500">
        {dict.international.provider}: {item.provider}
      </p>
      {excerpt ? <p className="mt-2 line-clamp-3 text-sm text-sand-600">{excerpt}</p> : null}
      {context === 'country' && item.eligibility ? (
        <p className="mt-2 line-clamp-3 text-sm text-sand-600">
          <span className="font-medium text-sand-700">
            {dict.international.countryRequirements}:
          </span>{' '}
          {item.eligibility}
        </p>
      ) : null}
      <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t border-sand-100 pt-3 text-xs text-sand-500">
        {item.duration ? (
          <span>
            {durationLabel}: {item.duration}
          </span>
        ) : null}
        {place ? <span>{place}</span> : null}
        {item.deadline ? (
          <span>
            {dict.common.deadline}: {formatDate(item.deadline, locale)}
          </span>
        ) : null}
      </div>
      {applyUrl ? (
        <a
          href={applyUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border border-brand-700 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
        >
          {dict.international.applyLink} ↗
        </a>
      ) : null}
    </Card>
  );
}
