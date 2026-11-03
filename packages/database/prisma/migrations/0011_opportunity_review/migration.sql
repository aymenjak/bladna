-- Participant reviews & ratings (P24) — additive only.
-- One review per author per initiative (compound unique), rating bounded by a
-- CHECK (Prisma does not model check constraints), and `source` records which
-- eligibility path qualified the author at review time: an ACCEPTED
-- application ("participant") or VERIFIED hours tied to the initiative.

-- CreateEnum
CREATE TYPE "ReviewSource" AS ENUM ('PARTICIPANT', 'HOURS');

-- CreateTable
CREATE TABLE "OpportunityReview" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "opportunityId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT,
    "source" "ReviewSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpportunityReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityReview_opportunityId_authorId_key" ON "OpportunityReview"("opportunityId", "authorId");

-- CreateIndex
CREATE INDEX "OpportunityReview_opportunityId_createdAt_idx" ON "OpportunityReview"("opportunityId", "createdAt");

-- Check (hand-written: rating stays within the star scale at the DB level too)
ALTER TABLE "OpportunityReview" ADD CONSTRAINT "OpportunityReview_rating_check" CHECK ("rating" >= 1 AND "rating" <= 5);

-- AddForeignKey
ALTER TABLE "OpportunityReview" ADD CONSTRAINT "OpportunityReview_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityReview" ADD CONSTRAINT "OpportunityReview_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
