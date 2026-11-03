-- Initiative re-centering (spec §4/§5/§13/§14/§7) — additive only.
-- 1) Public-institution actor value on OrganizationType.
-- 2) Problem/objective/cover/contact columns on the initiative (Opportunity).
-- 3) SupportNeed + SupportOffer: declared needs and traceable offers of
--    financial / equipment / material / service support.
-- 4) ImpactMetric.opportunityId: initiative-level impact reporting.
-- (Auto-generated DROP INDEX noise removed — those indexes are unrelated.)

-- CreateEnum
CREATE TYPE "SupportNeedKind" AS ENUM ('FINANCIAL', 'EQUIPMENT', 'MATERIAL', 'SERVICE');

-- CreateEnum
CREATE TYPE "SupportOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "OrganizationType" ADD VALUE 'PUBLIC_INSTITUTION';

-- AlterTable
ALTER TABLE "ImpactMetric" ADD COLUMN     "opportunityId" TEXT;

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "coverImage" TEXT,
ADD COLUMN     "objectiveAr" TEXT,
ADD COLUMN     "objectiveEn" TEXT,
ADD COLUMN     "objectiveFr" TEXT,
ADD COLUMN     "problemAr" TEXT,
ADD COLUMN     "problemEn" TEXT,
ADD COLUMN     "problemFr" TEXT;

-- CreateTable
CREATE TABLE "SupportNeed" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "opportunityId" TEXT NOT NULL,
    "kind" "SupportNeedKind" NOT NULL,
    "labelAr" TEXT NOT NULL,
    "labelFr" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "description" TEXT,
    "quantity" INTEGER,
    "fulfilled" INTEGER NOT NULL DEFAULT 0,
    "targetAmount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'DZD',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportNeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportOffer" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "supportNeedId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quantity" INTEGER,
    "description" TEXT NOT NULL,
    "contactNote" TEXT,
    "status" "SupportOfferStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportNeed_opportunityId_kind_idx" ON "SupportNeed"("opportunityId", "kind");

-- CreateIndex
CREATE INDEX "SupportOffer_supportNeedId_status_idx" ON "SupportOffer"("supportNeedId", "status");

-- CreateIndex
CREATE INDEX "SupportOffer_userId_idx" ON "SupportOffer"("userId");

-- CreateIndex
CREATE INDEX "ImpactMetric_opportunityId_idx" ON "ImpactMetric"("opportunityId");

-- AddForeignKey
ALTER TABLE "SupportNeed" ADD CONSTRAINT "SupportNeed_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportOffer" ADD CONSTRAINT "SupportOffer_supportNeedId_fkey" FOREIGN KEY ("supportNeedId") REFERENCES "SupportNeed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportOffer" ADD CONSTRAINT "SupportOffer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpactMetric" ADD CONSTRAINT "ImpactMetric_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
