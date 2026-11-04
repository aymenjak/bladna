// E2E helper — prints, as one JSON line, the seeded identifiers the specs need
// (tests/e2e/helpers.ts `SEEDED`). The seed creates them with random UUIDs and
// random certificate numbers, so they change on every database reset; reading
// them here keeps the suite valid against any fresh `db:seed`.
import './e2e-env';
import { getPrisma } from '@bladna/database';

async function main(): Promise<void> {
  const prisma = getPrisma();
  try {
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: 'org@bladna.dz' },
      select: { id: true },
    });
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'atlas-verts' },
      select: { id: true },
    });
    const certificate = await prisma.volunteerCertificate.findFirstOrThrow({
      where: { status: 'VALID', volunteerProfile: { user: { email: 'volunteer@bladna.dz' } } },
      orderBy: { issuedAt: 'asc' },
      select: { certificateNumber: true },
    });
    process.stdout.write(
      JSON.stringify({
        orgId: organization.id,
        orgOwnerId: owner.id,
        certificateNumber: certificate.certificateNumber,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
