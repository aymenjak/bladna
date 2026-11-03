-- CreateEnum
CREATE TYPE "InternationalProjectType" AS ENUM ('VOLUNTEERING', 'YOUTH_EXCHANGE', 'COMMUNITY_PROJECT', 'ENVIRONMENTAL_PROJECT', 'HUMANITARIAN_PROJECT', 'EDUCATIONAL_PROJECT', 'CULTURAL_PROJECT', 'SPORT_PROJECT', 'DIGITAL_VOLUNTEERING', 'EMERGENCY_RESPONSE', 'INTERNATIONAL_CAMP', 'OTHER');

-- CreateEnum
CREATE TYPE "InternationalApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW', 'ACCEPTED', 'WAITLISTED', 'REJECTED', 'WITHDRAWN', 'COMPLETED');

-- CreateEnum
CREATE TYPE "InternationalPassportReadiness" AS ENUM ('READY', 'IN_PROGRESS', 'NOT_AVAILABLE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'APPLICATION_STATUS_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE 'INTERVIEW_INVITATION';
ALTER TYPE "NotificationType" ADD VALUE 'INTERNATIONAL_OPPORTUNITY_MATCH';
ALTER TYPE "NotificationType" ADD VALUE 'DOCUMENT_EXPIRING';
ALTER TYPE "NotificationType" ADD VALUE 'PROGRAM_START_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE 'PROGRAM_END_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE 'INTERNATIONAL_PARTICIPATION_VERIFIED';

-- AlterEnum
ALTER TYPE "ReportTargetType" ADD VALUE 'INTERNATIONAL_OPPORTUNITY';

-- AlterTable
ALTER TABLE "InternationalExperience" ADD COLUMN     "opportunityId" TEXT,
ADD COLUMN     "role" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedBy" TEXT;

-- AlterTable
ALTER TABLE "InternationalOpportunity" ADD COLUMN     "allowance" "BenefitValue" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "category" "InternationalProjectType" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "certificateProvided" "BenefitValue" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "fees" "BenefitValue" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "funding" "BenefitValue" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "maxAge" INTEGER,
ADD COLUMN     "minAge" INTEGER,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "skills" TEXT,
ADD COLUMN     "training" "BenefitValue" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "travelSupport" "BenefitValue" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "visaSupport" "BenefitValue" NOT NULL DEFAULT 'UNKNOWN';

-- AlterTable
ALTER TABLE "VolunteerProfile" ADD COLUMN     "emergencyContactReady" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passportReadiness" "InternationalPassportReadiness" NOT NULL DEFAULT 'NOT_AVAILABLE',
ADD COLUMN     "preferredCategories" "InternationalProjectType"[] DEFAULT ARRAY[]::"InternationalProjectType"[],
ADD COLUMN     "travelReady" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "InternationalApplication" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "opportunityId" TEXT NOT NULL,
    "volunteerProfileId" TEXT NOT NULL,
    "status" "InternationalApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "motivationLetter" TEXT,
    "languages" TEXT,
    "availability" TEXT,
    "previousExperience" TEXT,
    "passportReadiness" "InternationalPassportReadiness" NOT NULL DEFAULT 'NOT_AVAILABLE',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InternationalApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternationalVerificationEvent" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "opportunityId" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL,
    "notes" TEXT,
    "checkedById" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternationalVerificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CountryToVolunteerProfile" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CountryToVolunteerProfile_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "InternationalApplication_opportunityId_status_idx" ON "InternationalApplication"("opportunityId", "status");

-- CreateIndex
CREATE INDEX "InternationalApplication_volunteerProfileId_status_idx" ON "InternationalApplication"("volunteerProfileId", "status");

-- CreateIndex
CREATE INDEX "InternationalApplication_submittedAt_idx" ON "InternationalApplication"("submittedAt");

-- CreateIndex
CREATE INDEX "InternationalVerificationEvent_opportunityId_checkedAt_idx" ON "InternationalVerificationEvent"("opportunityId", "checkedAt");

-- CreateIndex
CREATE INDEX "_CountryToVolunteerProfile_B_index" ON "_CountryToVolunteerProfile"("B");

-- CreateIndex
CREATE INDEX "InternationalExperience_verified_idx" ON "InternationalExperience"("verified");

-- CreateIndex
CREATE INDEX "InternationalOpportunity_category_idx" ON "InternationalOpportunity"("category");

-- AddForeignKey
ALTER TABLE "InternationalExperience" ADD CONSTRAINT "InternationalExperience_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "InternationalOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternationalApplication" ADD CONSTRAINT "InternationalApplication_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "InternationalOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternationalApplication" ADD CONSTRAINT "InternationalApplication_volunteerProfileId_fkey" FOREIGN KEY ("volunteerProfileId") REFERENCES "VolunteerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternationalVerificationEvent" ADD CONSTRAINT "InternationalVerificationEvent_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "InternationalOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CountryToVolunteerProfile" ADD CONSTRAINT "_CountryToVolunteerProfile_A_fkey" FOREIGN KEY ("A") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CountryToVolunteerProfile" ADD CONSTRAINT "_CountryToVolunteerProfile_B_fkey" FOREIGN KEY ("B") REFERENCES "VolunteerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written constraint (mirrors 0002 for local applications): only ONE
-- active international application per volunteer per offer — WITHDRAWN and
-- REJECTED rows do not block a re-application. Partial indexes are not
-- expressible in the Prisma schema (same pattern as 0002).
CREATE UNIQUE INDEX "InternationalApplication_active_unique"
  ON "InternationalApplication" ("opportunityId", "volunteerProfileId")
  WHERE "status" NOT IN ('WITHDRAWN', 'REJECTED');

