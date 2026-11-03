// Trust badges (spec §49). Never misleading: an external opportunity is always
// labeled EXTERNAL, unverified organizations always show UNVERIFIED.

import type { OrganizationType, TrustLevel, VerificationStatus } from '@bladna/types';

export interface Badge {
  code:
    | 'VERIFIED'
    | 'OFFICIAL_SOURCE'
    | 'PARTNER'
    | 'UNDER_REVIEW'
    | 'EXTERNAL'
    | 'SUSPENDED'
    | 'UNVERIFIED';
  labelAr: string;
  labelFr: string;
  labelEn: string;
}

const BADGES: Record<Badge['code'], Badge> = {
  VERIFIED: {
    code: 'VERIFIED',
    labelAr: 'موثق من بلادنا',
    labelFr: 'Vérifié par BLADNA',
    labelEn: 'VERIFIED BY BLADNA',
  },
  OFFICIAL_SOURCE: {
    code: 'OFFICIAL_SOURCE',
    labelAr: 'مصدر رسمي',
    labelFr: 'Source officielle',
    labelEn: 'OFFICIAL SOURCE',
  },
  PARTNER: {
    code: 'PARTNER',
    labelAr: 'شريك موثوق',
    labelFr: 'Partenaire de confiance',
    labelEn: 'TRUSTED PARTNER',
  },
  UNDER_REVIEW: {
    code: 'UNDER_REVIEW',
    labelAr: 'قيد المراجعة',
    labelFr: 'En cours de vérification',
    labelEn: 'UNDER REVIEW',
  },
  EXTERNAL: {
    code: 'EXTERNAL',
    labelAr: 'فرصة خارجية — غير موثقة من بلادنا',
    labelFr: 'EXTERNE — NON VÉRIFIÉ PAR BLADNA',
    labelEn: 'EXTERNAL OPPORTUNITY — NOT VERIFIED BY BLADNA',
  },
  SUSPENDED: { code: 'SUSPENDED', labelAr: 'موقوفة', labelFr: 'Suspendue', labelEn: 'SUSPENDED' },
  UNVERIFIED: {
    code: 'UNVERIFIED',
    labelAr: 'غير موثق',
    labelFr: 'Non vérifié',
    labelEn: 'UNVERIFIED',
  },
};

export function badgeFor(code: Badge['code']): Badge {
  return BADGES[code];
}

/** Badge for an opportunity, derived from its lifecycle + source. */
export function opportunityBadge(input: {
  status: string;
  verificationStatus: VerificationStatus;
  sourceType: 'OFFICIAL' | 'VERIFIED_PARTNER' | 'EXTERNAL' | null;
  sourceOfficial: boolean;
}): Badge {
  if (input.status === 'SUSPENDED') return BADGES.SUSPENDED;
  if (input.verificationStatus === 'UNDER_REVIEW' || input.status === 'PENDING_REVIEW') {
    return BADGES.UNDER_REVIEW;
  }
  if (input.sourceType === 'EXTERNAL' || (!input.sourceOfficial && input.sourceType !== null)) {
    // External content is never presented as BLADNA-verified.
    if (input.verificationStatus !== 'VERIFIED') return BADGES.EXTERNAL;
  }
  if (input.verificationStatus === 'VERIFIED') {
    if (input.sourceOfficial || input.sourceType === 'OFFICIAL') return BADGES.OFFICIAL_SOURCE;
    return BADGES.VERIFIED;
  }
  if (input.sourceType === 'VERIFIED_PARTNER') return BADGES.PARTNER;
  if (input.sourceType === 'EXTERNAL') return BADGES.EXTERNAL;
  return BADGES.UNVERIFIED;
}

const TRUST_BADGES: Record<TrustLevel, OrganizationBadge['code']> = {
  LEVEL_0_UNVERIFIED: 'UNVERIFIED',
  LEVEL_1_BASIC_VERIFIED: 'BASIC_VERIFIED',
  LEVEL_2_ORGANIZATION_VERIFIED: 'ORGANIZATION_VERIFIED',
  LEVEL_3_TRUSTED_PARTNER: 'TRUSTED_PARTNER',
  LEVEL_4_STRATEGIC_PARTNER: 'STRATEGIC_PARTNER',
};

export interface OrganizationBadge {
  code:
    | 'UNVERIFIED'
    | 'BASIC_VERIFIED'
    | 'ORGANIZATION_VERIFIED'
    | 'TRUSTED_PARTNER'
    | 'STRATEGIC_PARTNER'
    | 'SUSPENDED'
    | 'UNDER_REVIEW';
  labelAr: string;
  labelFr: string;
  labelEn: string;
}

const ORG_BADGES: Record<OrganizationBadge['code'], OrganizationBadge> = {
  UNVERIFIED: {
    code: 'UNVERIFIED',
    labelAr: 'غير موثق',
    labelFr: 'Non vérifié',
    labelEn: 'UNVERIFIED',
  },
  BASIC_VERIFIED: {
    code: 'BASIC_VERIFIED',
    labelAr: 'موثق أساسي',
    labelFr: 'Vérification de base',
    labelEn: 'BASIC VERIFIED',
  },
  ORGANIZATION_VERIFIED: {
    code: 'ORGANIZATION_VERIFIED',
    labelAr: 'منظمة موثقة',
    labelFr: 'Organisation vérifiée',
    labelEn: 'VERIFIED ORGANIZATION',
  },
  TRUSTED_PARTNER: {
    code: 'TRUSTED_PARTNER',
    labelAr: 'شريك موثوق',
    labelFr: 'Partenaire de confiance',
    labelEn: 'TRUSTED PARTNER',
  },
  STRATEGIC_PARTNER: {
    code: 'STRATEGIC_PARTNER',
    labelAr: 'شريك استراتيجي',
    labelFr: 'Partenaire stratégique',
    labelEn: 'STRATEGIC PARTNER',
  },
  SUSPENDED: { code: 'SUSPENDED', labelAr: 'موقوفة', labelFr: 'Suspendue', labelEn: 'SUSPENDED' },
  UNDER_REVIEW: {
    code: 'UNDER_REVIEW',
    labelAr: 'قيد المراجعة',
    labelFr: 'En cours de vérification',
    labelEn: 'UNDER REVIEW',
  },
};

export function organizationBadge(
  trustLevel: TrustLevel,
  verificationStatus: VerificationStatus,
): OrganizationBadge {
  if (verificationStatus === 'SUSPENDED') return ORG_BADGES.SUSPENDED;
  if (verificationStatus === 'UNDER_REVIEW') return ORG_BADGES.UNDER_REVIEW;
  if (verificationStatus !== 'VERIFIED' || trustLevel === 'LEVEL_0_UNVERIFIED') {
    return ORG_BADGES.UNVERIFIED;
  }
  return ORG_BADGES[TRUST_BADGES[trustLevel]];
}

export const ORGANIZATION_TYPE_LABELS: Record<
  OrganizationType,
  { ar: string; fr: string; en: string }
> = {
  ASSOCIATION: { ar: 'جمعية', fr: 'Association', en: 'Association' },
  NGO: { ar: 'منظمة غير حكومية', fr: 'ONG', en: 'NGO' },
  FOUNDATION: { ar: 'مؤسسة', fr: 'Fondation', en: 'Foundation' },
  EDUCATIONAL_INSTITUTION: {
    ar: 'مؤسسة تعليمية',
    fr: 'Établissement éducatif',
    en: 'Educational institution',
  },
  YOUTH_ORGANIZATION: {
    ar: 'منظمة شبابية',
    fr: 'Organisation de jeunesse',
    en: 'Youth organization',
  },
  COMMUNITY_INITIATIVE: {
    ar: 'مبادرة مجتمعية',
    fr: 'Initiative communautaire',
    en: 'Community initiative',
  },
  COMPANY: { ar: 'شركة', fr: 'Entreprise', en: 'Company' },
  PUBLIC_INSTITUTION: {
    ar: 'جهة عمومية',
    fr: 'Institution publique',
    en: 'Public institution',
  },
  OTHER: { ar: 'أخرى', fr: 'Autre', en: 'Other' },
};
