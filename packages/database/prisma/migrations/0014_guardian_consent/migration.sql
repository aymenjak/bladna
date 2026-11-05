-- CreateEnum
CREATE TYPE "GuardianRelationship" AS ENUM ('PARENT', 'LEGAL_GUARDIAN');

-- CreateTable
CREATE TABLE "GuardianConsent" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "guardianName" TEXT NOT NULL,
    "relationship" "GuardianRelationship" NOT NULL,
    "guardianEmail" TEXT,
    "guardianPhone" TEXT,
    "policyVersion" TEXT NOT NULL,
    "ipAddress" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardianConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuardianConsent_userId_key" ON "GuardianConsent"("userId");

-- AddForeignKey
ALTER TABLE "GuardianConsent" ADD CONSTRAINT "GuardianConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

