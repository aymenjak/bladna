// P18 E2E fixture — called by scripts/e2e-global-setup.ts through a `tsx`
// child process (exactly like tests/e2e/helpers.ts mints TOTP codes):
// @bladna/database is a TypeScript entry point, so Playwright's runner cannot
// import it directly, while `tsx` can.
//
// Self-healing, run before every suite:
//   1. drop every previous marker offer (its description carries the P18 tag),
//   2. ensure the ladder need exists (create-once),
//   3. insert ONE fresh PENDING offer on it.
// offers.spec.ts then takes that real decision and asserts the in-place
// update: status chip flips, Accept disappears, and the two-tone need bar
// reports one more accepted unit (0 → 1 — deterministic because stale
// marker offers are removed first).
import './e2e-env';
import { getPrisma } from '@bladna/database';

const FIXTURE_OFFER_DESCRIPTION = 'E2E pending pledge (P18)';
const FIXTURE_NEED_LABEL_EN = 'E2E ladder need (P18)';
const FIXTURE_NEED_LABEL_AR = 'احتياج سلّم الاختبار';
const FIXTURE_NEED_LABEL_FR = "Marche d'essai E2E";

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

    let need = await prisma.supportNeed.findFirst({
      where: { opportunityId: opportunity.id, labelEn: FIXTURE_NEED_LABEL_EN },
      select: { id: true },
    });
    if (!need) {
      need = await prisma.supportNeed.create({
        data: {
          opportunityId: opportunity.id,
          kind: 'MATERIAL',
          labelAr: FIXTURE_NEED_LABEL_AR,
          labelFr: FIXTURE_NEED_LABEL_FR,
          labelEn: FIXTURE_NEED_LABEL_EN,
          description: 'Self-healing fixture for the offers E2E (P18) — demo data.',
          quantity: 10,
          fulfilled: 0,
          sortOrder: 99,
        },
        select: { id: true },
      });
    }

    await prisma.supportOffer.deleteMany({ where: { description: FIXTURE_OFFER_DESCRIPTION } });
    await prisma.supportOffer.create({
      data: {
        supportNeedId: need.id,
        userId: volunteer.id,
        description: FIXTURE_OFFER_DESCRIPTION,
        quantity: 1,
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
