import type { LocaleCode, VerificationStatus } from '@bladna/types';
import { getDictionary } from '@/ui/i18n';
import { StatusBadge } from '@/ui/status';
import { isVerificationStatus, sourceTypeLabelFor } from './types';

/**
 * Source provenance pill for an international offer: `sourceLabel` + the
 * `sourceOfficial` / `sourceVerified` / `sourceExternal` copy for the offer's
 * `sourceType`, plus a status badge with `verificationStatuses.{status}`.
 * Unknown strings at either position render nothing (never guess copy).
 */

export function SourceBadge({
  locale,
  sourceType,
  verificationStatus,
}: {
  locale: LocaleCode;
  sourceType: string | null | undefined;
  verificationStatus: string | null | undefined;
}) {
  const { dict } = getDictionary(locale);
  const source = sourceTypeLabelFor(dict, sourceType);
  const status = isVerificationStatus(verificationStatus)
    ? dict.international.verificationStatuses[verificationStatus]
    : null;

  if (!source && !status) return null;

  return (
    <>
      {source ? (
        <span className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-medium text-sand-700">
          {dict.international.sourceLabel}: {source}
        </span>
      ) : null}
      {status ? (
        <StatusBadge status={verificationStatus as VerificationStatus} label={status} />
      ) : null}
    </>
  );
}
