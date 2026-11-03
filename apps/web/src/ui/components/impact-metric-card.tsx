import type { ReactNode } from 'react';
import { Badge } from '@bladna/ui';
import { formatDate, formatNumber } from '@/ui/format';
import type { LocaleCode } from '@/ui/i18n';

/**
 * Decimal columns reach the client two ways: as JSON strings from the
 * console's raw metric select, and as numbers from the SSR detail module.
 * Normalise both to a figure without lying about either (Intl keeps up to
 * three decimals, so `4.50` prints as `4.5` and integers stay integers).
 */
function figure(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface MetricCardLabels {
  actual: string;
  target: string;
  source: string;
  verified: string;
}

/**
 * P29 — the one impact-metric card (spec §14), shared by the workspace
 * console and the public initiative page. The old layout crammed label,
 * value, unit, source and verification into a single `·`-joined run-on
 * line (`Actual: 0 / 5 … · Source: … · Verified`); this zones the same
 * data instead: a title row (type chip, name, verified badge, date), a
 * labelled Actual/Target figure pair, an honest progress bar (the bar
 * caps visually — the printed figures never round), and the source on
 * its own muted line. Callers keep their own wrapper element.
 */
export function ImpactMetricCard({
  locale,
  name,
  typeLabel,
  actual,
  target,
  unit,
  source,
  verified = false,
  date,
  labels,
}: {
  locale: LocaleCode;
  name: string;
  /** Type chip — the console lists flat metrics; the public page already has a section heading. */
  typeLabel?: string;
  actual: number | string;
  target: number | string | null;
  unit: string;
  source?: string | null;
  verified?: boolean;
  /** ISO timestamp from the console list (the public card omits it). */
  date?: string;
  labels: MetricCardLabels;
}): ReactNode {
  const actualNum = figure(actual);
  const targetNum = target === null ? null : figure(target);
  // A bar needs a real denominator: zero/null targets print `—` and skip the bar.
  const barMax = targetNum !== null && targetNum > 0 ? targetNum : null;
  const ratio = barMax !== null ? Math.min(1, Math.max(0, actualNum / barMax)) : 0;

  return (
    <div data-impact-metric>
      {/* Title row — what this measures, verification, and when. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {typeLabel ? (
            <span className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-medium text-sand-700">
              {typeLabel}
            </span>
          ) : null}
          <p className="text-sm font-semibold text-sand-900">{name}</p>
          {verified ? <Badge tone="success">{labels.verified}</Badge> : null}
        </div>
        {date ? (
          <span className="shrink-0 text-xs text-sand-400">{formatDate(date, locale)}</span>
        ) : null}
      </div>

      {/* Figures — labelled and tabular so `0 / 5` stops hiding inside prose. */}
      <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-2">
        <div>
          <p className="text-xs font-medium text-sand-500">{labels.actual}</p>
          <p className="mt-0.5 text-2xl font-bold leading-tight tabular-nums text-brand-800">
            {formatNumber(actualNum, locale)}
            {targetNum === null ? (
              <span className="ms-1.5 text-sm font-medium text-sand-500">{unit}</span>
            ) : null}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-sand-500">{labels.target}</p>
          <p className="mt-0.5 text-2xl font-semibold leading-tight tabular-nums text-sand-700">
            {targetNum !== null ? formatNumber(targetNum, locale) : '—'}
            {targetNum !== null ? (
              <span className="ms-1.5 text-sm font-medium text-sand-500">{unit}</span>
            ) : null}
          </p>
        </div>
      </div>

      {/* Honest bar — visual only; capping at 100% never edits the figures. */}
      {barMax !== null ? (
        <div
          role="progressbar"
          aria-label={name}
          aria-valuemin={0}
          aria-valuemax={barMax}
          aria-valuenow={Math.max(0, Math.min(actualNum, barMax))}
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-sand-100"
        >
          <div
            className="h-full rounded-full bg-brand-600"
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
      ) : null}

      {/* Source — its own line; long provenance text wraps instead of jamming. */}
      {source ? (
        <p className="mt-3 text-xs leading-relaxed text-sand-500">
          <span className="font-medium text-sand-600">{labels.source}:</span> {source}
        </p>
      ) : null}
    </div>
  );
}
