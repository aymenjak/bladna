-- CreateEnum
CREATE TYPE "ContributionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SponsorshipKind" AS ENUM ('CASH', 'IN_KIND');

-- AlterTable
ALTER TABLE "Sponsorship" ADD COLUMN     "description" TEXT,
ADD COLUMN     "kind" "SponsorshipKind" NOT NULL DEFAULT 'CASH';

-- CreateTable
CREATE TABLE "CampaignContribution" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'DZD',
    "status" "ContributionStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "note" TEXT,
    "reason" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignContribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignContribution_campaignId_status_idx" ON "CampaignContribution"("campaignId", "status");

-- CreateIndex
CREATE INDEX "CampaignContribution_userId_idx" ON "CampaignContribution"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignContribution_campaignId_reference_key" ON "CampaignContribution"("campaignId", "reference");

-- AddForeignKey
ALTER TABLE "CampaignContribution" ADD CONSTRAINT "CampaignContribution_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignContribution" ADD CONSTRAINT "CampaignContribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
