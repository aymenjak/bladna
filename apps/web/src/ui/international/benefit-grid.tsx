import type { LocaleCode } from '@bladna/types';
import { Card } from '@bladna/ui';
import { getDictionary } from '@/ui/i18n';
import { benefitValueKey, type InternationalOpportunityRow } from './types';

/**
 * All 11 benefit flags of an offer (spec §5) as label/value rows under
 * `benefitsTitle`, values mapped through `benefitValues.{included,notIncluded,
 * unknown}`. Fields the API has not populated read as `unknown` — honest,
 * never invented.
 */
export function BenefitGrid({
  locale,
  offer,
}: {
  locale: LocaleCode;
  offer: InternationalOpportunityRow;
}) {
  const { dict } = getDictionary(locale);
  const b = dict.international.benefitLabels;
  const rows: Array<[string, string]> = [
    [b.accommodation, offer.accommodation],
    [b.food, offer.food],
    [b.transport, offer.transportation],
    [b.insurance, offer.insurance],
    [b.visaSupport, offer.visaSupport],
    [b.training, offer.training],
    [b.certificate, offer.certificateProvided],
    [b.fees, offer.fees],
    [b.funding, offer.funding],
    [b.allowance, offer.allowance],
    [b.travelSupport, offer.travelSupport],
  ];

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-sand-900">{dict.international.benefitsTitle}</h2>
      <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 rounded-lg bg-sand-50 px-3 py-2 text-sm"
          >
            <dt className="text-sand-600">{label}</dt>
            <dd className="font-medium text-sand-800">
              {dict.international.benefitValues[benefitValueKey(value)]}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
