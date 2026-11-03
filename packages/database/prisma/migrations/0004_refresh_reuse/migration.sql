-- Refresh-token reuse detection: keep the previous rotation's hash so that
-- presenting a rotated (stolen) token allows revoking the entire family.
ALTER TABLE "Session" ADD COLUMN "previousRefreshTokenHash" TEXT;
CREATE INDEX "Session_previousRefreshTokenHash_idx" ON "Session"("previousRefreshTokenHash");
