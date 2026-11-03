-- 0002 — database constraints, partial unique indexes, search vector, append-only triggers
-- Hand-written on top of the generated baseline (spec §83, §84, §108).

-- ── CHECK constraints ─────────────────────────────────────────

ALTER TABLE "VolunteerHour"
  ADD CONSTRAINT "VolunteerHour_hours_positive" CHECK ("hours" > 0),
  ADD CONSTRAINT "VolunteerHour_hours_max" CHECK ("hours" <= 168);

ALTER TABLE "Attendance"
  ADD CONSTRAINT "Attendance_hours_range" CHECK ("hours" IS NULL OR ("hours" >= 0 AND "hours" <= 24)),
  ADD CONSTRAINT "Attendance_checkout_after_checkin"
    CHECK ("checkInAt" IS NULL OR "checkOutAt" IS NULL OR "checkOutAt" >= "checkInAt");

ALTER TABLE "Opportunity"
  ADD CONSTRAINT "Opportunity_capacity_positive" CHECK ("capacity" IS NULL OR "capacity" > 0),
  ADD CONSTRAINT "Opportunity_age_range"
    CHECK ("minimumAge" IS NULL OR "maximumAge" IS NULL OR "minimumAge" <= "maximumAge"),
  ADD CONSTRAINT "Opportunity_dates_ordered"
    CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "startDate" <= "endDate"),
  ADD CONSTRAINT "Opportunity_hours_range"
    CHECK ("estimatedHours" IS NULL OR ("estimatedHours" >= 0 AND "estimatedHours" <= 1000));

ALTER TABLE "VolunteerCertificate"
  ADD CONSTRAINT "VolunteerCertificate_hours_positive" CHECK ("hours" > 0);

ALTER TABLE "Campaign"
  ADD CONSTRAINT "Campaign_dates_ordered" CHECK ("startDate" <= "endDate"),
  ADD CONSTRAINT "Campaign_targets_non_negative"
    CHECK ("volunteerTarget" IS NULL OR "volunteerTarget" >= 0);

ALTER TABLE "CampaignParticipant"
  ADD CONSTRAINT "CampaignParticipant_hours_non_negative" CHECK ("hours" >= 0);

ALTER TABLE "Plan"
  ADD CONSTRAINT "Plan_price_non_negative" CHECK ("priceDzd" >= 0);

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_amounts_non_negative" CHECK ("amountDzd" >= 0 AND "totalDzd" >= 0);

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_amount_positive" CHECK ("amountDzd" > 0);

ALTER TABLE "Sponsorship"
  ADD CONSTRAINT "Sponsorship_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "RiskAssessment"
  ADD CONSTRAINT "RiskAssessment_score_range" CHECK ("riskScore" >= 0 AND "riskScore" <= 100);

ALTER TABLE "AttendanceSession"
  ADD CONSTRAINT "AttendanceSession_expiry_after_start" CHECK ("expiresAt" > "startsAt");

ALTER TABLE "OrganizationInvitation"
  ADD CONSTRAINT "OrganizationInvitation_expiry_future" CHECK ("expiresAt" > "createdAt");

-- ── Partial unique: one active application per volunteer/opportunity ──
-- Active = in-flight states; REJECTED / WITHDRAWN / NO_SHOW / COMPLETED allow a new application.

CREATE UNIQUE INDEX "OpportunityApplication_active_unique"
  ON "OpportunityApplication" ("opportunityId", "volunteerProfileId")
  WHERE "status" IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'WAITLISTED');

-- ── Search (PostgreSQL full-text, spec §42) ───────────────────

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.bladna_opportunity_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" :=
      setweight(to_tsvector('simple', coalesce(NEW."titleEn", '')), 'A')
   || setweight(to_tsvector('simple', coalesce(NEW."titleFr", '')), 'A')
   || setweight(to_tsvector('simple', coalesce(NEW."titleAr", '')), 'A')
   || setweight(to_tsvector('simple', coalesce(NEW."descriptionEn", '')), 'B')
   || setweight(to_tsvector('simple', coalesce(NEW."descriptionFr", '')), 'B')
   || setweight(to_tsvector('simple', coalesce(NEW."descriptionAr", '')), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Opportunity_search_vector_trigger" ON "Opportunity";
CREATE TRIGGER "Opportunity_search_vector_trigger"
  BEFORE INSERT OR UPDATE OF "titleAr", "titleFr", "titleEn", "descriptionAr", "descriptionFr", "descriptionEn"
  ON "Opportunity"
  FOR EACH ROW EXECUTE FUNCTION public.bladna_opportunity_search_vector_update();

CREATE INDEX "Opportunity_search_idx"
  ON "Opportunity" USING GIN (to_tsvector('simple', coalesce("searchVector", '')));

CREATE INDEX "Opportunity_title_trgm_idx"
  ON "Opportunity" USING GIN (lower("titleEn") gin_trgm_ops);

CREATE INDEX "VolunteerProfile_availability_gin_idx"
  ON "VolunteerProfile" USING GIN ("availability");

-- ── Append-only protections (spec §16, §25, §108) ────────────
-- Completed verification records must never be overwritten.

CREATE OR REPLACE FUNCTION public.bladna_protect_completed_verification() RETURNS trigger AS $$
BEGIN
  IF OLD."status" IN ('VERIFIED', 'REJECTED') THEN
    IF NEW."status" IS DISTINCT FROM OLD."status"
       OR NEW."level" IS DISTINCT FROM OLD."level"
       OR NEW."officerId" IS DISTINCT FROM OLD."officerId"
       OR NEW."reviewedAt" IS DISTINCT FROM OLD."reviewedAt"
       OR NEW."notes" IS DISTINCT FROM OLD."notes" THEN
      RAISE EXCEPTION 'Completed verification records are append-only (id=%)', OLD."id";
    END IF;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "OrganizationVerification_append_only" ON "OrganizationVerification";
CREATE TRIGGER "OrganizationVerification_append_only"
  BEFORE UPDATE ON "OrganizationVerification"
  FOR EACH ROW EXECUTE FUNCTION public.bladna_protect_completed_verification();

-- Verified volunteer hours cannot be silently rewritten: only REVOKED transitions allowed.

CREATE OR REPLACE FUNCTION public.bladna_protect_verified_hours() RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'VERIFIED' THEN
    IF NEW."status" = 'REVOKED' THEN
      RETURN NEW; -- revocation path
    END IF;
    IF NEW."hours" IS DISTINCT FROM OLD."hours"
       OR NEW."date" IS DISTINCT FROM OLD."date"
       OR NEW."status" IS DISTINCT FROM OLD."status"
       OR NEW."activityId" IS DISTINCT FROM OLD."activityId" THEN
      RAISE EXCEPTION 'Verified hours are append-only: revoke and supersede instead (id=%)', OLD."id";
    END IF;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "VolunteerHour_append_only" ON "VolunteerHour";
CREATE TRIGGER "VolunteerHour_append_only"
  BEFORE UPDATE ON "VolunteerHour"
  FOR EACH ROW EXECUTE FUNCTION public.bladna_protect_verified_hours();

-- ── Extra performance indexes for observed query patterns ────

CREATE INDEX "Opportunity_published_deadline_idx"
  ON "Opportunity" ("applicationDeadline") WHERE "status" = 'PUBLISHED';

CREATE INDEX "AuditLog_created_idx" ON "AuditLog" ("createdAt" DESC);

CREATE INDEX "Message_created_idx" ON "Message" ("createdAt" DESC);

CREATE INDEX "VolunteerHour_volunteer_date_idx"
  ON "VolunteerHour" ("volunteerProfileId", "date" DESC) WHERE "status" = 'VERIFIED';
