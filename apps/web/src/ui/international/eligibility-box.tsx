import { Badge, Card } from '@bladna/ui';
import type { LocaleCode } from '@bladna/types';
import { getDictionary, type Dictionary } from '@/ui/i18n';
import type { EligibilityCheck, EligibilityCheckKey, EligibilityStatus } from './types';

/**
 * The personalized eligibility result (§11) as label/status rows under
 * `eligibilityTitle`. Labels come from `eligibility{Age,Language,Experience,
 * Availability,Documents}` and statuses from `elig{Eligible,NotEligible,
 * Unknown,NotRequired}`. Rows with an unrecognised key/status are dropped —
 * the box renders nothing when no check survives.
 */

function checkLabelFor(dict: Dictionary, key: EligibilityCheckKey): string | null {
  switch (key) {
    case 'age':
      return dict.international.eligibilityAge;
    case 'language':
      return dict.international.eligibilityLanguage;
    case 'experience':
      return dict.international.eligibilityExperience;
    case 'availability':
      return dict.international.eligibilityAvailability;
    case 'documents':
      return dict.international.eligibilityDocuments;
    default:
      return null;
  }
}

function statusFor(
  dict: Dictionary,
  status: EligibilityStatus,
): { text: string; tone: 'success' | 'danger' | 'info' | 'neutral' } | null {
  switch (status) {
    case 'ELIGIBLE':
      return { text: dict.international.eligEligible, tone: 'success' };
    case 'NOT_ELIGIBLE':
      return { text: dict.international.eligNotEligible, tone: 'danger' };
    case 'UNKNOWN':
      return { text: dict.international.eligUnknown, tone: 'info' };
    case 'NOT_REQUIRED':
      return { text: dict.international.eligNotRequired, tone: 'neutral' };
    default:
      return null;
  }
}

export function EligibilityBox({
  locale,
  checks,
}: {
  locale: LocaleCode;
  checks: EligibilityCheck[];
}) {
  const { dict } = getDictionary(locale);

  const rows = checks.flatMap((check) => {
    if (!check) return [];
    const label = checkLabelFor(dict, check.key);
    const status = statusFor(dict, check.status);
    if (!label || !status) return [];
    return [{ key: check.key, label, ...status }];
  });

  if (rows.length === 0) return null;

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-sand-900">{dict.international.eligibilityTitle}</h2>
      <dl className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-3 text-sm">
            <dt className="text-sand-600">{row.label}</dt>
            <dd>
              <Badge tone={row.tone}>{row.text}</Badge>
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
