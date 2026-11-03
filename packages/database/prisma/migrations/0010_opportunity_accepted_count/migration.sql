-- Honest "needs volunteers" filtering + initiative-level financial offers
-- (spec §9/§11/§13) — additive only.
-- 1) acceptedCount: number of ACCEPTED applications, maintained by the org
--    application-decision handlers; backfilled once from existing data.
-- 2) hasOpenSpots: denormalized open-spots flag (capacity IS NULL OR
--    acceptedCount < capacity) — Prisma cannot compare two columns in a
--    where-clause, so the honest `needs=VOLUNTEERS` filter needs this flag.
-- 3) SupportOffer.amount/currency: a FINANCIAL support offer pledges an amount
--    (bank transfer happens outside the platform; we only record the pledge).

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "acceptedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "hasOpenSpots" BOOLEAN NOT NULL DEFAULT true;

-- Backfill accepted volunteers, then derive the open-spots flag from it.
UPDATE "Opportunity" o
SET "acceptedCount" = (
    SELECT COUNT(*)
    FROM "OpportunityApplication" a
    WHERE a."opportunityId" = o.id
      AND a."status" = 'ACCEPTED'
);

UPDATE "Opportunity"
SET "hasOpenSpots" = ("capacity" IS NULL OR "acceptedCount" < "capacity");

-- AlterTable
ALTER TABLE "SupportOffer" ADD COLUMN     "amount" DECIMAL(14,2),
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'DZD';
