-- CreateEnum
CREATE TYPE "EconomicCompanySize" AS ENUM ('MICRO', 'SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "EconomicSector" AS ENUM ('AGRICULTURE', 'INDUSTRY', 'CONSTRUCTION', 'ENERGY', 'TELECOM_IT', 'FINANCE_INSURANCE', 'TRANSPORT_LOGISTICS', 'COMMERCE', 'TOURISM', 'HEALTH', 'EDUCATION_TRAINING', 'MEDIA_CULTURE', 'MINING', 'WATER_SANITATION', 'OTHER');

-- CreateEnum
CREATE TYPE "BeneficiaryGroup" AS ENUM ('WOMEN', 'YOUTH', 'CHILDREN', 'RURAL', 'DISABILITY', 'ELDERLY', 'OTHER');

-- CreateEnum
CREATE TYPE "PartnershipRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'REQUEST_INFO', 'SHORTLISTED', 'NEGOTIATION', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PartnershipProposalStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "PartnershipStatus" AS ENUM ('PROPOSED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "PartnershipType" AS ENUM ('SPONSORSHIP', 'SERVICE', 'IN_KIND', 'COOPERATION', 'PRO_BONO');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('DRAFT', 'PENDING_SIGNATURE', 'ACTIVE', 'EXPIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "AgreementType" AS ENUM ('FRAMEWORK', 'COOPERATION', 'SPONSORSHIP', 'SERVICE_PROVISION', 'OTHER');

-- CreateEnum
CREATE TYPE "ObligationParty" AS ENUM ('INITIATIVE_ORGANIZATION', 'ECONOMIC_ORGANIZATION');

-- CreateEnum
CREATE TYPE "ObligationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'FULFILLED', 'WAIVED', 'BREACHED');

-- CreateEnum
CREATE TYPE "FundingCommitmentStatus" AS ENUM ('PENDING', 'COMMITTED', 'CANCELLED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "FundingInstallmentStatus" AS ENUM ('SCHEDULED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DisbursementStatus" AS ENUM ('SCHEDULED', 'EXECUTED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InKindContributionKind" AS ENUM ('EQUIPMENT', 'MATERIAL', 'TRANSPORTATION', 'FOOD', 'TRAINING', 'SERVICES', 'TECHNOLOGY', 'LOGISTICS', 'OTHER');

-- CreateEnum
CREATE TYPE "InKindStatus" AS ENUM ('PLANNED', 'DELIVERED', 'RECEIVED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ImpactEvidenceType" AS ENUM ('PHOTO', 'DOCUMENT', 'ATTENDANCE', 'CERTIFICATE', 'RECEIPT', 'INVOICE', 'REPORT', 'VIDEO', 'OTHER');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ImpactReportStatus" AS ENUM ('DRAFT', 'GENERATED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PartnershipInteractionType" AS ENUM ('MEETING', 'CALL', 'EMAIL', 'MESSAGE', 'EVENT', 'SITE_VISIT', 'OTHER');

-- CreateEnum
CREATE TYPE "PartnershipFollowUpStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'PARTNERSHIP_MATCH';
ALTER TYPE "NotificationType" ADD VALUE 'PARTNERSHIP_REQUEST';
ALTER TYPE "NotificationType" ADD VALUE 'PROPOSAL_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'PROPOSAL_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE 'PROPOSAL_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'AGREEMENT_SIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'FUNDING_COMMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'FUNDING_DISBURSED';
ALTER TYPE "NotificationType" ADD VALUE 'EVIDENCE_REQUIRED';
ALTER TYPE "NotificationType" ADD VALUE 'IMPACT_VERIFICATION';
ALTER TYPE "NotificationType" ADD VALUE 'REPORT_READY';

-- DropIndex
DROP INDEX "AuditLog_created_idx";

-- DropIndex
DROP INDEX "Message_created_idx";

-- DropIndex
DROP INDEX "VolunteerProfile_availability_gin_idx";

-- AlterTable
ALTER TABLE "Sponsor" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "SupportOffer" ADD COLUMN     "organizationId" TEXT;

-- CreateTable
CREATE TABLE "EconomicInstitutionProfile" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" TEXT NOT NULL,
    "sector" "EconomicSector",
    "subSector" TEXT,
    "companySize" "EconomicCompanySize",
    "nationalScope" BOOLEAN NOT NULL DEFAULT true,
    "csrEnabled" BOOLEAN NOT NULL DEFAULT false,
    "esgEnabled" BOOLEAN NOT NULL DEFAULT false,
    "csrContactName" TEXT,
    "csrContactEmail" TEXT,
    "csrContactPhone" TEXT,
    "annualCSRBudget" DECIMAL(14,2),
    "minProjectBudget" DECIMAL(14,2),
    "maxProjectBudget" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'DZD',
    "preferredSupportTypes" "SupportNeedKind"[] DEFAULT ARRAY[]::"SupportNeedKind"[],
    "preferredBeneficiaryGroups" "BeneficiaryGroup"[] DEFAULT ARRAY[]::"BeneficiaryGroup"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EconomicInstitutionProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CSRFocusArea" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CSRFocusArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EconomicProfileFocusArea" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "profileId" TEXT NOT NULL,
    "focusAreaId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EconomicProfileFocusArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EconomicProfileWilaya" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "profileId" TEXT NOT NULL,
    "wilayaId" TEXT NOT NULL,

    CONSTRAINT "EconomicProfileWilaya_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityFocusArea" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "opportunityId" TEXT NOT NULL,
    "focusAreaId" TEXT NOT NULL,

    CONSTRAINT "OpportunityFocusArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerMatch" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "opportunityId" TEXT NOT NULL,
    "economicOrganizationId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL,
    "engineVersion" TEXT NOT NULL DEFAULT 'rules-v1',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnershipRequest" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "requesterOrganizationId" TEXT NOT NULL,
    "receiverOrganizationId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "supportNeedId" TEXT,
    "csrProgramId" TEXT,
    "requestedAmount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'DZD',
    "message" TEXT NOT NULL,
    "status" "PartnershipRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "decisionNote" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnershipRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnershipProposal" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "partnershipRequestId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "requestedAmount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'DZD',
    "supportType" "SupportNeedKind",
    "implementationPlan" TEXT,
    "expectedOutcomes" TEXT,
    "beneficiaryTarget" INTEGER,
    "volunteerTarget" INTEGER,
    "hourTarget" DECIMAL(8,2),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" "PartnershipProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnershipProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partnership" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" TEXT NOT NULL,
    "economicOrganizationId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "campaignId" TEXT,
    "csrProgramId" TEXT,
    "proposalId" TEXT,
    "partnershipType" "PartnershipType" NOT NULL DEFAULT 'COOPERATION',
    "status" "PartnershipStatus" NOT NULL DEFAULT 'PROPOSED',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "totalValue" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'DZD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partnership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnershipAgreement" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "partnershipId" TEXT NOT NULL,
    "agreementNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "agreementType" "AgreementType" NOT NULL DEFAULT 'FRAMEWORK',
    "documentId" TEXT,
    "signedAt" TIMESTAMP(3),
    "signedById" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "totalValue" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'DZD',
    "status" "AgreementStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnershipAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnershipObligation" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "partnershipId" TEXT NOT NULL,
    "party" "ObligationParty" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "value" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'DZD',
    "status" "ObligationStatus" NOT NULL DEFAULT 'PENDING',
    "evidenceDocumentId" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnershipObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingCommitment" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "partnershipId" TEXT NOT NULL,
    "csrProgramId" TEXT,
    "sponsorshipId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'DZD',
    "status" "FundingCommitmentStatus" NOT NULL DEFAULT 'PENDING',
    "committedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundingCommitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingInstallment" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "commitmentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'DZD',
    "dueAt" TIMESTAMP(3),
    "status" "FundingInstallmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "paidAt" TIMESTAMP(3),
    "reference" TEXT,
    "evidenceDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundingInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Disbursement" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "commitmentId" TEXT NOT NULL,
    "installmentId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'DZD',
    "reference" TEXT,
    "executedAt" TIMESTAMP(3),
    "evidenceDocumentId" TEXT,
    "status" "DisbursementStatus" NOT NULL DEFAULT 'SCHEDULED',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Disbursement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InKindContribution" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "partnershipId" TEXT NOT NULL,
    "kind" "InKindContributionKind" NOT NULL DEFAULT 'OTHER',
    "item" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT,
    "estimatedValue" DECIMAL(14,2),
    "marketValue" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'DZD',
    "deliveryDate" TIMESTAMP(3),
    "deliveryLocation" TEXT,
    "receivedById" TEXT,
    "evidenceDocumentId" TEXT,
    "status" "InKindStatus" NOT NULL DEFAULT 'PLANNED',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InKindContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImpactEvidence" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "metricId" TEXT NOT NULL,
    "type" "ImpactEvidenceType" NOT NULL,
    "documentId" TEXT,
    "note" TEXT,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "EvidenceStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImpactEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImpactReport" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" TEXT NOT NULL,
    "title" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "ImpactReportStatus" NOT NULL DEFAULT 'DRAFT',
    "payload" JSONB,
    "generatedAt" TIMESTAMP(3),
    "generatedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImpactReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnershipContact" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "partnershipId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnershipContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnershipInteraction" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "partnershipId" TEXT NOT NULL,
    "type" "PartnershipInteractionType" NOT NULL DEFAULT 'OTHER',
    "subject" TEXT,
    "body" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "participants" JSONB,
    "nextAction" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnershipInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnershipFollowUp" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "partnershipId" TEXT NOT NULL,
    "interactionId" TEXT,
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "status" "PartnershipFollowUpStatus" NOT NULL DEFAULT 'OPEN',
    "ownerId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnershipFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnershipNote" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "partnershipId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnershipNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EconomicInstitutionProfile_organizationId_key" ON "EconomicInstitutionProfile"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CSRFocusArea_code_key" ON "CSRFocusArea"("code");

-- CreateIndex
CREATE INDEX "EconomicProfileFocusArea_focusAreaId_idx" ON "EconomicProfileFocusArea"("focusAreaId");

-- CreateIndex
CREATE UNIQUE INDEX "EconomicProfileFocusArea_profileId_focusAreaId_key" ON "EconomicProfileFocusArea"("profileId", "focusAreaId");

-- CreateIndex
CREATE INDEX "EconomicProfileWilaya_wilayaId_idx" ON "EconomicProfileWilaya"("wilayaId");

-- CreateIndex
CREATE UNIQUE INDEX "EconomicProfileWilaya_profileId_wilayaId_key" ON "EconomicProfileWilaya"("profileId", "wilayaId");

-- CreateIndex
CREATE INDEX "OpportunityFocusArea_focusAreaId_idx" ON "OpportunityFocusArea"("focusAreaId");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityFocusArea_opportunityId_focusAreaId_key" ON "OpportunityFocusArea"("opportunityId", "focusAreaId");

-- CreateIndex
CREATE INDEX "PartnerMatch_economicOrganizationId_score_idx" ON "PartnerMatch"("economicOrganizationId", "score" DESC);

-- CreateIndex
CREATE INDEX "PartnerMatch_opportunityId_score_idx" ON "PartnerMatch"("opportunityId", "score" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerMatch_opportunityId_economicOrganizationId_key" ON "PartnerMatch"("opportunityId", "economicOrganizationId");

-- CreateIndex
CREATE INDEX "PartnershipRequest_receiverOrganizationId_status_idx" ON "PartnershipRequest"("receiverOrganizationId", "status");

-- CreateIndex
CREATE INDEX "PartnershipRequest_requesterOrganizationId_status_idx" ON "PartnershipRequest"("requesterOrganizationId", "status");

-- CreateIndex
CREATE INDEX "PartnershipRequest_opportunityId_idx" ON "PartnershipRequest"("opportunityId");

-- CreateIndex
CREATE INDEX "PartnershipRequest_status_createdAt_idx" ON "PartnershipRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PartnershipProposal_partnershipRequestId_status_idx" ON "PartnershipProposal"("partnershipRequestId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PartnershipProposal_partnershipRequestId_version_key" ON "PartnershipProposal"("partnershipRequestId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Partnership_proposalId_key" ON "Partnership"("proposalId");

-- CreateIndex
CREATE INDEX "Partnership_organizationId_status_idx" ON "Partnership"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Partnership_economicOrganizationId_status_idx" ON "Partnership"("economicOrganizationId", "status");

-- CreateIndex
CREATE INDEX "Partnership_opportunityId_idx" ON "Partnership"("opportunityId");

-- CreateIndex
CREATE INDEX "Partnership_csrProgramId_idx" ON "Partnership"("csrProgramId");

-- CreateIndex
CREATE INDEX "Partnership_campaignId_idx" ON "Partnership"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnershipAgreement_agreementNumber_key" ON "PartnershipAgreement"("agreementNumber");

-- CreateIndex
CREATE INDEX "PartnershipAgreement_partnershipId_status_idx" ON "PartnershipAgreement"("partnershipId", "status");

-- CreateIndex
CREATE INDEX "PartnershipObligation_partnershipId_party_status_idx" ON "PartnershipObligation"("partnershipId", "party", "status");

-- CreateIndex
CREATE INDEX "PartnershipObligation_dueDate_idx" ON "PartnershipObligation"("dueDate");

-- CreateIndex
CREATE INDEX "FundingCommitment_partnershipId_status_idx" ON "FundingCommitment"("partnershipId", "status");

-- CreateIndex
CREATE INDEX "FundingInstallment_status_dueAt_idx" ON "FundingInstallment"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "FundingInstallment_commitmentId_number_key" ON "FundingInstallment"("commitmentId", "number");

-- CreateIndex
CREATE INDEX "Disbursement_commitmentId_status_idx" ON "Disbursement"("commitmentId", "status");

-- CreateIndex
CREATE INDEX "InKindContribution_partnershipId_status_idx" ON "InKindContribution"("partnershipId", "status");

-- CreateIndex
CREATE INDEX "ImpactEvidence_metricId_status_idx" ON "ImpactEvidence"("metricId", "status");

-- CreateIndex
CREATE INDEX "ImpactEvidence_status_createdAt_idx" ON "ImpactEvidence"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ImpactReport_organizationId_status_idx" ON "ImpactReport"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ImpactReport_organizationId_periodStart_idx" ON "ImpactReport"("organizationId", "periodStart");

-- CreateIndex
CREATE INDEX "PartnershipContact_partnershipId_idx" ON "PartnershipContact"("partnershipId");

-- CreateIndex
CREATE INDEX "PartnershipInteraction_partnershipId_occurredAt_idx" ON "PartnershipInteraction"("partnershipId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "PartnershipFollowUp_partnershipId_status_idx" ON "PartnershipFollowUp"("partnershipId", "status");

-- CreateIndex
CREATE INDEX "PartnershipFollowUp_dueAt_idx" ON "PartnershipFollowUp"("dueAt");

-- CreateIndex
CREATE INDEX "PartnershipNote_partnershipId_createdAt_idx" ON "PartnershipNote"("partnershipId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Sponsor_organizationId_key" ON "Sponsor"("organizationId");

-- AddForeignKey
ALTER TABLE "SupportOffer" ADD CONSTRAINT "SupportOffer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sponsor" ADD CONSTRAINT "Sponsor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomicInstitutionProfile" ADD CONSTRAINT "EconomicInstitutionProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomicProfileFocusArea" ADD CONSTRAINT "EconomicProfileFocusArea_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "EconomicInstitutionProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomicProfileFocusArea" ADD CONSTRAINT "EconomicProfileFocusArea_focusAreaId_fkey" FOREIGN KEY ("focusAreaId") REFERENCES "CSRFocusArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomicProfileWilaya" ADD CONSTRAINT "EconomicProfileWilaya_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "EconomicInstitutionProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomicProfileWilaya" ADD CONSTRAINT "EconomicProfileWilaya_wilayaId_fkey" FOREIGN KEY ("wilayaId") REFERENCES "Wilaya"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityFocusArea" ADD CONSTRAINT "OpportunityFocusArea_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityFocusArea" ADD CONSTRAINT "OpportunityFocusArea_focusAreaId_fkey" FOREIGN KEY ("focusAreaId") REFERENCES "CSRFocusArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerMatch" ADD CONSTRAINT "PartnerMatch_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerMatch" ADD CONSTRAINT "PartnerMatch_economicOrganizationId_fkey" FOREIGN KEY ("economicOrganizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnershipRequest" ADD CONSTRAINT "PartnershipRequest_requesterOrganizationId_fkey" FOREIGN KEY ("requesterOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnershipRequest" ADD CONSTRAINT "PartnershipRequest_receiverOrganizationId_fkey" FOREIGN KEY ("receiverOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnershipRequest" ADD CONSTRAINT "PartnershipRequest_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnershipRequest" ADD CONSTRAINT "PartnershipRequest_supportNeedId_fkey" FOREIGN KEY ("supportNeedId") REFERENCES "SupportNeed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnershipRequest" ADD CONSTRAINT "PartnershipRequest_csrProgramId_fkey" FOREIGN KEY ("csrProgramId") REFERENCES "CSRProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnershipProposal" ADD CONSTRAINT "PartnershipProposal_partnershipRequestId_fkey" FOREIGN KEY ("partnershipRequestId") REFERENCES "PartnershipRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partnership" ADD CONSTRAINT "Partnership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partnership" ADD CONSTRAINT "Partnership_economicOrganizationId_fkey" FOREIGN KEY ("economicOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partnership" ADD CONSTRAINT "Partnership_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partnership" ADD CONSTRAINT "Partnership_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partnership" ADD CONSTRAINT "Partnership_csrProgramId_fkey" FOREIGN KEY ("csrProgramId") REFERENCES "CSRProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partnership" ADD CONSTRAINT "Partnership_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "PartnershipProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnershipAgreement" ADD CONSTRAINT "PartnershipAgreement_partnershipId_fkey" FOREIGN KEY ("partnershipId") REFERENCES "Partnership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnershipAgreement" ADD CONSTRAINT "PartnershipAgreement_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnershipObligation" ADD CONSTRAINT "PartnershipObligation_partnershipId_fkey" FOREIGN KEY ("partnershipId") REFERENCES "Partnership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnershipObligation" ADD CONSTRAINT "PartnershipObligation_evidenceDocumentId_fkey" FOREIGN KEY ("evidenceDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingCommitment" ADD CONSTRAINT "FundingCommitment_partnershipId_fkey" FOREIGN KEY ("partnershipId") REFERENCES "Partnership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingCommitment" ADD CONSTRAINT "FundingCommitment_csrProgramId_fkey" FOREIGN KEY ("csrProgramId") REFERENCES "CSRProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingCommitment" ADD CONSTRAINT "FundingCommitment_sponsorshipId_fkey" FOREIGN KEY ("sponsorshipId") REFERENCES "Sponsorship"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingInstallment" ADD CONSTRAINT "FundingInstallment_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "FundingCommitment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingInstallment" ADD CONSTRAINT "FundingInstallment_evidenceDocumentId_fkey" FOREIGN KEY ("evidenceDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disbursement" ADD CONSTRAINT "Disbursement_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "FundingCommitment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disbursement" ADD CONSTRAINT "Disbursement_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "FundingInstallment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disbursement" ADD CONSTRAINT "Disbursement_evidenceDocumentId_fkey" FOREIGN KEY ("evidenceDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InKindContribution" ADD CONSTRAINT "InKindContribution_partnershipId_fkey" FOREIGN KEY ("partnershipId") REFERENCES "Partnership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InKindContribution" ADD CONSTRAINT "InKindContribution_evidenceDocumentId_fkey" FOREIGN KEY ("evidenceDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpactEvidence" ADD CONSTRAINT "ImpactEvidence_metricId_fkey" FOREIGN KEY ("metricId") REFERENCES "ImpactMetric"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpactEvidence" ADD CONSTRAINT "ImpactEvidence_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpactReport" ADD CONSTRAINT "ImpactReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnershipContact" ADD CONSTRAINT "PartnershipContact_partnershipId_fkey" FOREIGN KEY ("partnershipId") REFERENCES "Partnership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnershipInteraction" ADD CONSTRAINT "PartnershipInteraction_partnershipId_fkey" FOREIGN KEY ("partnershipId") REFERENCES "Partnership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnershipFollowUp" ADD CONSTRAINT "PartnershipFollowUp_partnershipId_fkey" FOREIGN KEY ("partnershipId") REFERENCES "Partnership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnershipFollowUp" ADD CONSTRAINT "PartnershipFollowUp_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "PartnershipInteraction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnershipNote" ADD CONSTRAINT "PartnershipNote_partnershipId_fkey" FOREIGN KEY ("partnershipId") REFERENCES "Partnership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

