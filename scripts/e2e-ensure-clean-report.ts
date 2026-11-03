// P20 E2E fixture — called by scripts/e2e-global-setup.ts through a `tsx`
// child process (same as the P18 offers fixture): safety.spec.ts files one
// report per run against the seeded initiative, and `POST /reports` refuses a
// second open report on the same target — so the previous run's row (reporter
// = demo volunteer, target = the seeded opportunity) is dropped before every
// suite. Nothing else is touched.
import './e2e-env';
import { getPrisma } from '@bladna/database';

async function main(): Promise<void> {
  const prisma = getPrisma();
  try {
    const opportunity = await prisma.opportunity.findUnique({
      where: { slug: 'algiers-park-cleanup' },
      select: { id: true },
    });
    const volunteer = await prisma.user.findUnique({
      where: { email: 'volunteer@bladna.dz' },
      select: { id: true },
    });
    if (!opportunity || !volunteer) return; // seeds absent — the suite fails elsewhere

    await prisma.report.deleteMany({
      where: {
        reporterId: volunteer.id,
        targetType: 'OPPORTUNITY',
        targetId: opportunity.id,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
