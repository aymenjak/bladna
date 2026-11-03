// Response DTO shapes consumed by web, mobile and API clients.
// DTOs are explicit projections — private fields (passwordHash, document storage
// keys, tokens…) are intentionally absent from these types.

import type {
  ApplicationStatus,
  AvailabilitySlot,
  BenefitType,
  BenefitValue,
  CertificateStatus,
  HourStatus,
  LanguageLevel,
  LocationType,
  LocaleCode,
  NotificationType,
  OpportunityStatus,
  OpportunityType,
  OrgMemberRole,
  OrganizationType,
  PlanTier,
  RiskLevel,
  RecommendedAction,
  ReportStatus,
  ReportTargetType,
  SkillVerificationLevel,
  SourceType,
  SystemRole,
  TrustLevel,
  UserStatus,
  VerificationStatus,
  VolunteerVerificationStatus,
} from './enums';

export interface UserSummaryDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  preferredLanguage: LocaleCode;
  roles: SystemRole[];
  status: UserStatus;
  profileImage: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export interface SessionUserDto extends UserSummaryDto {
  volunteerProfileId: string | null;
  volunteerId: string | null;
  memberships: OrgMembershipSummaryDto[];
}

export interface OrgMembershipSummaryDto {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: OrgMemberRole;
  trustLevel: TrustLevel;
  status: string;
}

export interface VolunteerProfileDto {
  id: string;
  userId: string;
  volunteerId: string;
  bio: string | null;
  wilaya: LocationRefDto | null;
  city: LocationRefDto | null;
  availability: AvailabilitySlot[];
  onlinePreference: boolean;
  internationalPreference: boolean;
  publicProfile: boolean;
  publicPhone: boolean;
  publicEmail: boolean;
  verificationStatus: VolunteerVerificationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface LocationRefDto {
  id: string;
  code?: string;
  name: string;
}

export interface SkillDto {
  id: string;
  name: string;
  category: string;
  verificationLevel?: SkillVerificationLevel;
  verifiedByOrganizationId?: string | null;
  verifiedAt?: string | null;
  yearsExperience?: number | null;
}

export interface LanguageDto {
  id: string;
  name: string;
  level?: LanguageLevel;
}

export interface InterestDto {
  id: string;
  name: string;
  code: string;
}

export interface VolunteerStatsDto {
  verifiedHours: number;
  pendingHours: number;
  completedActivities: number;
  certificates: number;
  skills: number;
  applications: number;
  upcomingActivities: number;
}

export interface OpportunitySummaryDto {
  id: string;
  slug: string;
  title: string;
  organization: OpportunityOrgRefDto;
  type: OpportunityType;
  locationType: LocationType;
  category: { id: string; name: string; slug: string } | null;
  wilaya: LocationRefDto | null;
  country: LocationRefDto | null;
  startDate: string | null;
  endDate: string | null;
  applicationDeadline: string | null;
  status: OpportunityStatus;
  verificationStatus: VerificationStatus;
  badge: OpportunityBadgeDto;
  capacity: number | null;
  estimatedHours: number | null;
  applicationCount?: number;
  saved?: boolean;
}

export interface OpportunityOrgRefDto {
  id: string;
  name: string;
  slug: string;
  trustLevel: TrustLevel;
  organizationType: OrganizationType;
  logo: string | null;
}

export interface OpportunityBadgeDto {
  /** Trust badge shown on cards — never misleading (spec §49). */
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

export interface OpportunityDetailDto extends OpportunitySummaryDto {
  description: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  minimumAge: number | null;
  maximumAge: number | null;
  sourceUrl: string | null;
  source: {
    id: string;
    name: string;
    sourceType: SourceType;
    url: string | null;
    official: boolean;
    verified: boolean;
  } | null;
  skills: SkillDto[];
  languages: LanguageDto[];
  benefits: { benefitType: BenefitType; value: BenefitValue; note: string | null }[];
  requirements: {
    id: string;
    type: string;
    label: string;
    description: string | null;
    required: boolean;
  }[];
  questions: { id: string; prompt: string; type: string; required: boolean }[];
  viewCount: number;
  createdAt: string;
}

export interface ApplicationDto {
  id: string;
  opportunity: {
    id: string;
    slug: string;
    title: string;
    organizationName: string;
  };
  status: ApplicationStatus;
  motivation: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  createdAt: string;
  volunteer?: { id: string; volunteerId: string; firstName: string; lastName: string };
}

export interface CertificateDto {
  id: string;
  certificateNumber: string;
  title: string;
  description: string | null;
  hours: number;
  issuedAt: string;
  status: CertificateStatus;
  organization: { id: string; name: string; slug: string };
  verificationUrl: string;
}

export interface HourDto {
  id: string;
  hours: number;
  date: string;
  status: HourStatus;
  source: string;
  organization: { id: string; name: string };
  activityTitle: string | null;
  verifiedAt: string | null;
  rejectReason: string | null;
  revokeReason: string | null;
}

export interface OrganizationSummaryDto {
  id: string;
  name: string;
  slug: string;
  organizationType: OrganizationType;
  verificationStatus: VerificationStatus;
  trustLevel: TrustLevel;
  status: string;
  logo: string | null;
  wilaya: LocationRefDto | null;
  opportunityCount?: number;
}

export interface CampaignSummaryDto {
  id: string;
  name: string;
  slug: string;
  status: string;
  startDate: string;
  endDate: string;
  organization: { id: string; name: string; slug: string };
  volunteerTarget: number | null;
  hourTarget: number | null;
  beneficiaryTarget: number | null;
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  readByCurrentUser: boolean;
}

export interface ConversationDto {
  id: string;
  subject: string | null;
  type: string;
  participants: { id: string; name: string }[];
  lastMessage: MessageDto | null;
  unreadCount: number;
  updatedAt: string;
}

export interface ReportDto {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  description: string | null;
  status: ReportStatus;
  createdAt: string;
}

export interface RiskAssessmentDto {
  id: string;
  targetType: string;
  targetId: string;
  riskScore: number;
  riskLevel: RiskLevel;
  reasons: { code: string; weight: number; detail: string }[];
  recommendedAction: RecommendedAction;
  decidedAt: string | null;
  createdAt: string;
}

export interface PlanDto {
  id: string;
  code: string;
  tier: PlanTier;
  name: string;
  priceDzd: number;
  currency: string;
  periodDays: number;
  features: string[];
}

export interface DashboardSummaryDto {
  hours: VolunteerStatsDto;
  activities: number;
  certificates: number;
  applications: number;
  recommendations: { reason: string }[];
}

export interface InternationalOpportunityDto {
  id: string;
  title: string;
  country: LocationRefDto | null;
  city: string | null;
  program: string;
  provider: string;
  duration: string | null;
  deadline: string | null;
  sourceType: SourceType;
  verificationStatus: VerificationStatus;
  sourceUrl: string | null;
}

export interface HealthDto {
  status: 'ok' | 'degraded';
  version: string;
  uptimeSeconds: number;
  checks: { database: string; redis: string; storage: string };
}
