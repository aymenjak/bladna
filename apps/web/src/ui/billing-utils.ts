import type { LocaleCode, PlanTier } from '@bladna/types';

/** Tier ascending order — must match PLAN_TIER_ORDER in server/modules/billing.ts. */
const TIER_ORDER: Record<PlanTier, number> = {
  FREE: 0,
  BASIC: 1,
  PROFESSIONAL: 2,
  ENTERPRISE: 3,
};

export type PlanAction = 'UPGRADE' | 'DOWNGRADE';

/**
 * Billing plan CTA (display-only — the server re-validates the transition):
 * - no subscription yet → UPGRADE (rendered as "Subscribe")
 * - same tier → null (render the "current plan" badge, no button)
 * - higher target → UPGRADE, lower target → DOWNGRADE
 */
export function planActionFor(
  currentTier: PlanTier | null,
  targetTier: PlanTier,
): PlanAction | null {
  if (currentTier === null) return 'UPGRADE';
  if (currentTier === targetTier) return null;
  return TIER_ORDER[targetTier] > TIER_ORDER[currentTier] ? 'UPGRADE' : 'DOWNGRADE';
}

/** Plans carry their own trilingual names — pick the active locale. */
export function planName(
  plan: { nameAr: string; nameFr: string; nameEn: string },
  locale: LocaleCode,
): string {
  if (locale === 'ar') return plan.nameAr;
  if (locale === 'fr') return plan.nameFr;
  return plan.nameEn;
}
