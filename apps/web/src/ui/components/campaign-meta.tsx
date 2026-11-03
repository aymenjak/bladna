import type { LocaleCode } from '@bladna/types';
import type { Dictionary } from '@/ui/i18n';
import { formatNumber } from '@/ui/format';

type CampaignCopy = Dictionary['campaigns'];

const DAY = 24 * 60 * 60 * 1000;

/**
 * Human timing line for a campaign: "12 days left", "Starts in 3 days",
 * "Ends today" or "Campaign ended" — computed at render time from the dates.
 */
export function campaignTiming(
  startDate: string,
  endDate: string | null,
  copy: CampaignCopy,
  locale: LocaleCode,
  now = Date.now(),
): { label: string; tone: 'upcoming' | 'live' | 'ended' } {
  const start = new Date(startDate).getTime();
  if (start > now) {
    const n = Math.ceil((start - now) / DAY);
    return { label: copy.startsIn.replace('{n}', formatNumber(n, locale)), tone: 'upcoming' };
  }
  if (!endDate) return { label: '', tone: 'live' };
  const end = new Date(endDate).getTime();
  if (end < now) return { label: copy.ended, tone: 'ended' };
  const n = Math.floor((end - now) / DAY);
  if (n < 1) return { label: copy.endsToday, tone: 'live' };
  return { label: copy.daysLeft.replace('{n}', formatNumber(n, locale)), tone: 'live' };
}

/** Labelled progress bar ("Volunteers on board — 18 of 150"). */
export function ProgressBar({
  label,
  value,
  target,
  locale,
  copy,
  unit,
  tone = 'brand',
}: {
  label: string;
  value: number;
  target: number | null;
  locale: LocaleCode;
  copy: CampaignCopy;
  unit?: string;
  tone?: 'brand' | 'clay';
}) {
  const pct = target && target > 0 ? Math.min(100, Math.round((value / target) * 100)) : null;
  const suffix = unit ? ` ${unit}` : '';
  const valueText =
    target && target > 0
      ? copy.progressOf
          .replace('{value}', formatNumber(value, locale))
          .replace('{target}', `${formatNumber(target, locale)}${suffix}`)
      : `${formatNumber(value, locale)}${suffix}`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-sand-600">{label}</span>
        <span className="font-semibold tabular-nums text-sand-900">
          {valueText}
          {pct !== null ? (
            <span className="ms-1.5 text-xs font-medium text-sand-500">
              ({formatNumber(pct, locale)}%)
            </span>
          ) : null}
        </span>
      </div>
      {pct !== null ? (
        <div
          className="mt-1.5 h-2 overflow-hidden rounded-full bg-sand-100"
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div
            className={`h-full rounded-full ${tone === 'clay' ? 'bg-clay-500' : 'bg-brand-600'}`}
            style={{ width: `${Math.max(pct, 2)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
