import { formatNumber } from '@/ui/format';
import { getDictionary, type LocaleCode } from '@/ui/i18n';

/**
 * Two-tone progress for a QUANTITY support need (P18 "offers" pass): the
 * solid segment is what the owner marked **received** (`fulfilled`), the
 * lighter segment is **accepted offers** still to be delivered — so
 * accepting an offer visibly extends the bar without pretending the goods
 * arrived. FINANCIAL needs keep their accepted-amount bar elsewhere; both
 * segments cap at the target and `aria` reports the combined figure the bar
 * actually paints. Pure, unit-tested capping maths.
 */
export function progressSegments(
  quantity: number,
  received: number,
  acceptedQuantity: number,
): { received: number; accepted: number; total: number } {
  const recv = Math.max(0, Math.min(received, quantity));
  const acc = Math.max(0, Math.min(acceptedQuantity, quantity - recv));
  return { received: recv, accepted: acc, total: recv + acc };
}

interface NeedProgressBarProps {
  /** Target quantity of the need (>0 whenever rendered). */
  quantity: number;
  /** Owner-maintained received count (`fulfilled`). */
  received: number;
  /** Sum of ACCEPTED offer quantities — the pledged segment. */
  acceptedQuantity: number;
  locale: LocaleCode;
}

/** The bar + its figure row: total/target on one side, received · accepted on the other. */
export function NeedProgressBar({
  quantity,
  received,
  acceptedQuantity,
  locale,
}: NeedProgressBarProps): React.JSX.Element {
  const { dict } = getDictionary(locale);
  const segments = progressSegments(quantity, received, acceptedQuantity);
  const pct = (value: number): number => (quantity > 0 ? Math.round((value / quantity) * 100) : 0);

  return (
    <div className="space-y-1.5">
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-sand-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={quantity}
        aria-valuenow={segments.total}
        aria-label={dict.opportunity.progressLabel}
      >
        <div className="flex h-2 w-full">
          <div className="h-2 bg-brand-600" style={{ width: `${pct(segments.received)}%` }} />
          <div className="h-2 bg-brand-300" style={{ width: `${pct(segments.accepted)}%` }} />
        </div>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs">
        <span className="font-semibold tabular-nums text-sand-900">
          {formatNumber(segments.total, locale)} / {formatNumber(quantity, locale)}
        </span>
        <span className="text-sand-500">
          {dict.opportunity.receivedLabel}: {formatNumber(segments.received, locale)}
          {' · '}
          {dict.opportunity.acceptedLabel}: {formatNumber(segments.accepted, locale)}
        </span>
      </div>
    </div>
  );
}
