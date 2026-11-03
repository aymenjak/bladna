-- Step-up authentication tracking: set when TOTP was verified for a session.
ALTER TABLE "Session" ADD COLUMN "mfaSatisfiedAt" TIMESTAMP(3);
