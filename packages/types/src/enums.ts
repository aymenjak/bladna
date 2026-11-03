// Canonical enum value lists. These mirror the Prisma enums — keep in sync
// with packages/database/prisma/schema.prisma (see validation/enums.test.ts).

export const LOCALES = ['ar', 'fr', 'en'] as const;
export type LocaleCode = (typeof LOCALES)[number];

export const USER_STATUSES = [
  'ACTIVE',
  'PENDING_VERIFICATION',
  'SUSPENDED',
  'BANNED',
  'DELETED',
] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const SYSTEM_ROLES = [
  'USER',
  'VOLUNTEER',
  'ORGANIZATION_MEMBER',
  'ORGANIZATION_ADMIN',
  'ORGANIZATION_OWNER',
  'SPONSOR_MEMBER',
  'SPONSOR_ADMIN',
  'MODERATOR',
  'VERIFICATION_OFFICER',
  'SUPPORT',
  'SUPER_ADMIN',
] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const ORG_MEMBER_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF', 'VIEWER'] as const;
export type OrgMemberRole = (typeof ORG_MEMBER_ROLES)[number];

export const ORG_MEMBER_STATUSES = ['INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED'] as const;
export type OrgMemberStatus = (typeof ORG_MEMBER_STATUSES)[number];

export const ORGANIZATION_TYPES = [
  'ASSOCIATION',
  'NGO',
  'FOUNDATION',
  'EDUCATIONAL_INSTITUTION',
  'YOUTH_ORGANIZATION',
  'COMMUNITY_INITIATIVE',
  'COMPANY',
  'PUBLIC_INSTITUTION',
  'OTHER',
] as const;
export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

export const ORGANIZATION_STATUSES = [
  'PENDING_VERIFICATION',
  'ACTIVE',
  'SUSPENDED',
  'ARCHIVED',
] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

export const VERIFICATION_STATUSES = [
  'PENDING',
  'UNDER_REVIEW',
  'VERIFIED',
  'REJECTED',
  'SUSPENDED',
  'EXPIRED',
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const TRUST_LEVELS = [
  'LEVEL_0_UNVERIFIED',
  'LEVEL_1_BASIC_VERIFIED',
  'LEVEL_2_ORGANIZATION_VERIFIED',
  'LEVEL_3_TRUSTED_PARTNER',
  'LEVEL_4_STRATEGIC_PARTNER',
] as const;
export type TrustLevel = (typeof TRUST_LEVELS)[number];

export const OPPORTUNITY_TYPES = [
  'LOCAL',
  'NATIONAL',
  'ONLINE',
  'INTERNATIONAL',
  'EVENT',
  'CAMPAIGN',
] as const;
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

export const LOCATION_TYPES = ['PHYSICAL', 'ONLINE', 'HYBRID'] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

export const OPPORTUNITY_STATUSES = [
  'DRAFT',
  'PENDING_REVIEW',
  'PUBLISHED',
  'REJECTED',
  'SUSPENDED',
  'EXPIRED',
  'ARCHIVED',
] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const BENEFIT_TYPES = [
  'ACCOMMODATION',
  'FOOD',
  'TRANSPORTATION',
  'INSURANCE',
  'TRAINING',
  'CERTIFICATE',
  'OTHER',
] as const;
export type BenefitType = (typeof BENEFIT_TYPES)[number];

export const BENEFIT_VALUES = ['INCLUDED', 'NOT_INCLUDED', 'UNKNOWN'] as const;
export type BenefitValue = (typeof BENEFIT_VALUES)[number];

/** Opportunity requirement kinds (spec §40) — mirrors Prisma `RequirementType`. */
export const REQUIREMENT_TYPES = [
  'DOCUMENT',
  'EXPERIENCE',
  'AVAILABILITY',
  'AGE',
  'EDUCATION',
  'OTHER',
] as const;
export type RequirementType = (typeof REQUIREMENT_TYPES)[number];

/** Application question kinds — mirrors Prisma `QuestionType`. */
export const QUESTION_TYPES = ['TEXT', 'MULTILINE', 'CHOICE', 'BOOLEAN'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Sponsorship contribution kind — mirrors Prisma `SponsorshipKind` (cash or in-kind). */
export const SPONSORSHIP_KINDS = ['CASH', 'IN_KIND'] as const;
export type SponsorshipKind = (typeof SPONSORSHIP_KINDS)[number];

/** Campaign contribution lifecycle — mirrors Prisma `ContributionStatus`. */
export const CONTRIBUTION_STATUSES = ['PENDING', 'CONFIRMED', 'REJECTED'] as const;
export type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];

/** Initiative support-need kinds (spec §5) — mirrors Prisma `SupportNeedKind`. */
export const SUPPORT_NEED_KINDS = ['FINANCIAL', 'EQUIPMENT', 'MATERIAL', 'SERVICE'] as const;
export type SupportNeedKind = (typeof SUPPORT_NEED_KINDS)[number];

/** Support-offer lifecycle (spec §13) — mirrors Prisma `SupportOfferStatus`. */
export const SUPPORT_OFFER_STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED'] as const;
export type SupportOfferStatus = (typeof SUPPORT_OFFER_STATUSES)[number];

export const APPLICATION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'ACCEPTED',
  'WAITLISTED',
  'REJECTED',
  'WITHDRAWN',
  'COMPLETED',
  'NO_SHOW',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

// BLADNA International (spec §6/§9/§4) — mirrors the Prisma enums.
export const INTERNATIONAL_PROJECT_TYPES = [
  'VOLUNTEERING',
  'YOUTH_EXCHANGE',
  'COMMUNITY_PROJECT',
  'ENVIRONMENTAL_PROJECT',
  'HUMANITARIAN_PROJECT',
  'EDUCATIONAL_PROJECT',
  'CULTURAL_PROJECT',
  'SPORT_PROJECT',
  'DIGITAL_VOLUNTEERING',
  'EMERGENCY_RESPONSE',
  'INTERNATIONAL_CAMP',
  'OTHER',
] as const;
export type InternationalProjectType = (typeof INTERNATIONAL_PROJECT_TYPES)[number];

export const INTERNATIONAL_APPLICATION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'SHORTLISTED',
  'INTERVIEW',
  'ACCEPTED',
  'WAITLISTED',
  'REJECTED',
  'WITHDRAWN',
  'COMPLETED',
] as const;
export type InternationalApplicationStatus = (typeof INTERNATIONAL_APPLICATION_STATUSES)[number];

export const INTERNATIONAL_PASSPORT_READINESS = ['READY', 'IN_PROGRESS', 'NOT_AVAILABLE'] as const;
export type InternationalPassportReadiness = (typeof INTERNATIONAL_PASSPORT_READINESS)[number];

export const ACTIVITY_STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const ATTENDANCE_METHODS = ['QR', 'MANUAL', 'ORGANIZATION', 'IMPORT'] as const;
export type AttendanceMethod = (typeof ATTENDANCE_METHODS)[number];

export const ATTENDANCE_STATUSES = [
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'REJECTED',
  'ABSENT',
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const HOUR_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED', 'REVOKED'] as const;
export type HourStatus = (typeof HOUR_STATUSES)[number];

export const HOUR_SOURCES = ['ATTENDANCE', 'MANUAL', 'IMPORT', 'EVENT'] as const;
export type HourSource = (typeof HOUR_SOURCES)[number];

export const CERTIFICATE_STATUSES = ['VALID', 'REVOKED', 'EXPIRED'] as const;
export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number];

export const SKILL_VERIFICATION_LEVELS = [
  'SELF_DECLARED',
  'ORGANIZATION_VERIFIED',
  'CERTIFICATE_VERIFIED',
] as const;
export type SkillVerificationLevel = (typeof SKILL_VERIFICATION_LEVELS)[number];

export const LANGUAGE_LEVELS = [
  'BEGINNER',
  'ELEMENTARY',
  'INTERMEDIATE',
  'UPPER_INTERMEDIATE',
  'ADVANCED',
  'NATIVE',
] as const;
export type LanguageLevel = (typeof LANGUAGE_LEVELS)[number];

export const AVAILABILITY_SLOTS = [
  'WEEKDAYS',
  'WEEKENDS',
  'EVENINGS',
  'NIGHTS',
  'HOLIDAYS',
  'FLEXIBLE',
] as const;
export type AvailabilitySlot = (typeof AVAILABILITY_SLOTS)[number];

export const VOLUNTEER_VERIFICATION_STATUSES = [
  'UNVERIFIED',
  'BASIC_VERIFIED',
  'IDENTITY_VERIFIED',
] as const;
export type VolunteerVerificationStatus = (typeof VOLUNTEER_VERIFICATION_STATUSES)[number];

export const SOURCE_TYPES = ['OFFICIAL', 'VERIFIED_PARTNER', 'EXTERNAL'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const CAMPAIGN_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
  'ARCHIVED',
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const METRIC_TYPES = [
  'VOLUNTEERS',
  'HOURS',
  'BENEFICIARIES',
  'ACTIVITIES',
  'WILAYAS',
  'SCHOOLS',
  'TREES',
  'DONATIONS',
  'OTHER',
] as const;
export type MetricType = (typeof METRIC_TYPES)[number];

export const PLAN_TIERS = ['FREE', 'BASIC', 'PROFESSIONAL', 'ENTERPRISE'] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const SUBSCRIPTION_STATUSES = [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'CANCELLED',
  'EXPIRED',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const INVOICE_STATUSES = ['DRAFT', 'ISSUED', 'PAID', 'OVERDUE', 'VOID'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'REFUNDED',
  'CANCELLED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = [
  'BANK_TRANSFER',
  'MANUAL_PAYMENT',
  'CARD',
  'LOCAL_PAYMENT_GATEWAY',
  'OTHER_PROVIDER',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const REPORT_STATUSES = [
  'OPEN',
  'INVESTIGATING',
  'ACTION_TAKEN',
  'DISMISSED',
  'CLOSED',
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_TARGET_TYPES = [
  'USER',
  'ORGANIZATION',
  'OPPORTUNITY',
  'CAMPAIGN',
  'MESSAGE',
  'CERTIFICATE',
  'INTERNATIONAL_OPPORTUNITY',
] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_REASONS = [
  'SCAM',
  'FAKE_ORGANIZATION',
  'HARASSMENT',
  'DISCRIMINATION',
  'SPAM',
  'MISLEADING_INFO',
  'SAFETY_CONCERN',
  'PRIVACY_VIOLATION',
  'OTHER',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const RECOMMENDED_ACTIONS = [
  'AUTO_APPROVE',
  'QUEUE_FOR_REVIEW',
  'RESTRICT',
  'SUSPEND',
] as const;
export type RecommendedAction = (typeof RECOMMENDED_ACTIONS)[number];

export const NOTIFICATION_TYPES = [
  'APPLICATION_SUBMITTED',
  'APPLICATION_ACCEPTED',
  'APPLICATION_REJECTED',
  'APPLICATION_UNDER_REVIEW',
  'OPPORTUNITY_REMINDER',
  'DEADLINE_REMINDER',
  'HOURS_VERIFIED',
  'HOURS_REJECTED',
  'CERTIFICATE_ISSUED',
  'ORGANIZATION_VERIFIED',
  'ORGANIZATION_REJECTED',
  'CAMPAIGN_UPDATE',
  'NEW_MATCHING_OPPORTUNITY',
  'MESSAGE_RECEIVED',
  'SECURITY_ALERT',
  'SYSTEM',
  // International additions (spec §32).
  'APPLICATION_STATUS_CHANGED',
  'INTERVIEW_INVITATION',
  'INTERNATIONAL_OPPORTUNITY_MATCH',
  'DOCUMENT_EXPIRING',
  'PROGRAM_START_REMINDER',
  'PROGRAM_END_REMINDER',
  'INTERNATIONAL_PARTICIPATION_VERIFIED',
  // Partnerships & CSR ecosystem (P33 schema / P34 emission).
  'PARTNERSHIP_MATCH',
  'PARTNERSHIP_REQUEST',
  'PROPOSAL_RECEIVED',
  'PROPOSAL_ACCEPTED',
  'PROPOSAL_REJECTED',
  'AGREEMENT_SIGNED',
  'FUNDING_COMMITTED',
  'FUNDING_DISBURSED',
  'EVIDENCE_REQUIRED',
  'IMPACT_VERIFICATION',
  'REPORT_READY',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_CHANNELS = ['IN_APP', 'EMAIL', 'PUSH', 'SMS'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const SPONSORSHIP_STATUSES = ['PROPOSED', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
export type SponsorshipStatus = (typeof SPONSORSHIP_STATUSES)[number];

export const PROGRAM_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

export const DATA_REQUEST_TYPES = ['EXPORT', 'DEACTIVATE', 'DELETE'] as const;
export type DataRequestType = (typeof DATA_REQUEST_TYPES)[number];

export const DATA_REQUEST_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED'] as const;
export type DataRequestStatus = (typeof DATA_REQUEST_STATUSES)[number];

// ── Partnerships & CSR ecosystem (P34) ─────────────────────────────────────
// Status enums mirroring Prisma (`schema.prisma` §PARTNERSHIPS & CSR) — the
// state machines in @bladna/domain and the Zod transition schemas key off
// these literals, so schema drift fails typecheck here first.

export const PARTNERSHIP_REQUEST_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'REQUEST_INFO',
  'SHORTLISTED',
  'NEGOTIATION',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
] as const;
export type PartnershipRequestStatus = (typeof PARTNERSHIP_REQUEST_STATUSES)[number];

export const PARTNERSHIP_PROPOSAL_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
  'SUPERSEDED',
] as const;
export type PartnershipProposalStatus = (typeof PARTNERSHIP_PROPOSAL_STATUSES)[number];

export const PARTNERSHIP_STATUSES = [
  'PROPOSED',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
  'TERMINATED',
] as const;
export type PartnershipStatus = (typeof PARTNERSHIP_STATUSES)[number];

export const AGREEMENT_STATUSES = [
  'DRAFT',
  'PENDING_SIGNATURE',
  'ACTIVE',
  'EXPIRED',
  'TERMINATED',
] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

export const OBLIGATION_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'FULFILLED',
  'WAIVED',
  'BREACHED',
] as const;
export type ObligationStatus = (typeof OBLIGATION_STATUSES)[number];

export const FUNDING_COMMITMENT_STATUSES = [
  'PENDING',
  'COMMITTED',
  'CANCELLED',
  'TERMINATED',
] as const;
export type FundingCommitmentStatus = (typeof FUNDING_COMMITMENT_STATUSES)[number];

export const FUNDING_INSTALLMENT_STATUSES = ['SCHEDULED', 'PAID', 'CANCELLED'] as const;
export type FundingInstallmentStatus = (typeof FUNDING_INSTALLMENT_STATUSES)[number];

export const DISBURSEMENT_STATUSES = ['SCHEDULED', 'EXECUTED', 'VERIFIED', 'REJECTED'] as const;
export type DisbursementStatus = (typeof DISBURSEMENT_STATUSES)[number];

export const IN_KIND_STATUSES = [
  'PLANNED',
  'DELIVERED',
  'RECEIVED',
  'VERIFIED',
  'REJECTED',
] as const;
export type InKindStatus = (typeof IN_KIND_STATUSES)[number];

export const EVIDENCE_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED'] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export const IMPACT_REPORT_STATUSES = ['DRAFT', 'GENERATED', 'PUBLISHED', 'ARCHIVED'] as const;
export type ImpactReportStatus = (typeof IMPACT_REPORT_STATUSES)[number];

// Vocabulary enums (kinds, sectors, groups) — validation inputs for the M2
// endpoints; interaction/follow-up kinds land with the CRM (M4).
export const PARTNERSHIP_TYPES = [
  'SPONSORSHIP',
  'SERVICE',
  'IN_KIND',
  'COOPERATION',
  'PRO_BONO',
] as const;
export type PartnershipType = (typeof PARTNERSHIP_TYPES)[number];

export const AGREEMENT_TYPES = [
  'FRAMEWORK',
  'COOPERATION',
  'SPONSORSHIP',
  'SERVICE_PROVISION',
  'OTHER',
] as const;
export type AgreementType = (typeof AGREEMENT_TYPES)[number];

export const OBLIGATION_PARTIES = ['INITIATIVE_ORGANIZATION', 'ECONOMIC_ORGANIZATION'] as const;
export type ObligationParty = (typeof OBLIGATION_PARTIES)[number];

export const IN_KIND_CONTRIBUTION_KINDS = [
  'EQUIPMENT',
  'MATERIAL',
  'TRANSPORTATION',
  'FOOD',
  'TRAINING',
  'SERVICES',
  'TECHNOLOGY',
  'LOGISTICS',
  'OTHER',
] as const;
export type InKindContributionKind = (typeof IN_KIND_CONTRIBUTION_KINDS)[number];

export const IMPACT_EVIDENCE_TYPES = [
  'PHOTO',
  'DOCUMENT',
  'ATTENDANCE',
  'CERTIFICATE',
  'RECEIPT',
  'INVOICE',
  'REPORT',
  'VIDEO',
  'OTHER',
] as const;
export type ImpactEvidenceType = (typeof IMPACT_EVIDENCE_TYPES)[number];

export const ECONOMIC_SECTORS = [
  'AGRICULTURE',
  'INDUSTRY',
  'CONSTRUCTION',
  'ENERGY',
  'TELECOM_IT',
  'FINANCE_INSURANCE',
  'TRANSPORT_LOGISTICS',
  'COMMERCE',
  'TOURISM',
  'HEALTH',
  'EDUCATION_TRAINING',
  'MEDIA_CULTURE',
  'MINING',
  'WATER_SANITATION',
  'OTHER',
] as const;
export type EconomicSector = (typeof ECONOMIC_SECTORS)[number];

export const ECONOMIC_COMPANY_SIZES = ['MICRO', 'SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE'] as const;
export type EconomicCompanySize = (typeof ECONOMIC_COMPANY_SIZES)[number];

export const BENEFICIARY_GROUPS = [
  'WOMEN',
  'YOUTH',
  'CHILDREN',
  'RURAL',
  'DISABILITY',
  'ELDERLY',
  'OTHER',
] as const;
export type BeneficiaryGroup = (typeof BENEFICIARY_GROUPS)[number];
