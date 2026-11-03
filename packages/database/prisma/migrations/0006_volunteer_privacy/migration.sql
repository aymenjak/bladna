-- Per-field visibility flags on the public volunteer profile (spec §30).
-- DEFAULT true preserves the pre-migration behavior: the public directory
-- always showed wilaya and GET /public/verify always showed verified hours.
-- Contact flags (publicPhone/publicEmail) remain opt-in false elsewhere.
ALTER TABLE "VolunteerProfile"
  ADD COLUMN "showCertificates" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "showHours" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "showWilaya" BOOLEAN NOT NULL DEFAULT true;
