import { expect, test } from '@playwright/test';
// Side-effect import: repository `.env` → process.env for the TOTP child.
import '../../scripts/e2e-env';
import { ORG_ID, signIn } from './helpers';

/**
 * P18 — the offers decision room (workspace opportunities → initiative
 * console → Support offers). scripts/e2e-ensure-pending-offer.ts seeds one
 * fresh PENDING offer on a dedicated ladder need, so this test takes a real
 * decision and asserts the in-place update the user reported missing
 * ("لم يتم تحديث عند قبول العروض"): the card's status chip flips, the Accept
 * button disappears, the headline counts move, and the group header's
 * two-tone bar reports one more accepted unit (0 → 1).
 */
test('accepting a support offer updates the console in place', async ({ page }) => {
  await signIn(page, 'org@bladna.dz', { mfa: true });
  await page.goto(`/ar/workspace/${ORG_ID}/opportunities`);

  // Open THIS opportunity's console from its row (state-gated tab list),
  // then scope every lookup inside the console region — the row's own <li>
  // wraps the console and would otherwise double every li-level match.
  const row = page.locator('li').filter({ hasText: 'تنظيف الحديقة المركزية بالجزائر' });
  await row.getByRole('button', { name: /كونسول/ }).click();
  const consolePanel = page.getByRole('region', { name: 'دعم المبادرة وأثرها' });
  await page.getByRole('tab', { name: 'العروض', exact: true }).click();

  // Decision-room summary strip (P18).
  await expect(page.getByText('إجمالي العروض')).toBeVisible();

  // The fixture group: its need header carries the two-tone bar at 0/10.
  const group = consolePanel.locator('li').filter({ hasText: 'احتياج سلّم الاختبار' });
  await expect(group).toHaveCount(1);
  const bar = group.getByRole('progressbar');
  await expect(bar).toHaveAttribute('aria-valuenow', '0');

  // The pending fixture card is the one offering the decision buttons.
  const card = group
    .locator('li')
    .filter({ has: page.getByRole('button', { name: 'قبول', exact: true }) });
  await expect(card).toHaveCount(1);

  const decision = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('/support-offers/'),
  );
  await card.getByRole('button', { name: 'قبول', exact: true }).click();
  const response = await decision;
  expect(response.ok()).toBeTruthy();

  // In-place update: notice, chip flip, Accept gone, bar +1. The card is
  // re-located by its (unique) description now — the pre-decision locator
  // filtered on the Accept button, which is exactly what must disappear.
  const decidedCard = group.locator('li').filter({ hasText: 'E2E pending pledge (P18)' });
  await expect(decidedCard).toHaveCount(1);
  await expect(page.getByText('سُجِّل القرار.')).toBeVisible();
  await expect(decidedCard.getByText('مقبولة', { exact: true })).toBeVisible();
  await expect(decidedCard.getByRole('button', { name: 'قبول', exact: true })).toHaveCount(0);
  await expect(bar).toHaveAttribute('aria-valuenow', '1');
});
