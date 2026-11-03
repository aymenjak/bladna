import { expect, test } from '@playwright/test';
// Side-effect import: repository `.env` → process.env for the TOTP child.
import '../../scripts/e2e-env';
import { ORG_ID, signIn } from './helpers';

/**
 * P14 — the kit tab bar is a segmented control with a **visible** active
 * pill. The regression this guards is systemic: Tailwind v4's automatic
 * source detection never scans `packages/ui`, so any class that exists only
 * in the kit silently vanished from the built CSS — including
 * `data-[state=active]:bg-brand-600`, which made every tab look inert
 * ("no colour shows what I pressed"). `globals.css` now declares the kit
 * with `@source`; this test asserts the outcome through computed styles,
 * not class names alone, so a future extraction miss fails here.
 */
test('workspace console tabs paint the active state', async ({ page }) => {
  await signIn(page, 'org@bladna.dz', { mfa: true });
  await page.goto(`/ar/workspace/${ORG_ID}/opportunities`);

  // The console opens from its per-row button (state-gated, so the tablist
  // only exists after this click).
  await page
    .getByRole('button', { name: /كونسول/ })
    .first()
    .click();

  const list = page.getByRole('tablist').first();
  await expect(list).toBeVisible();

  const active = list.locator('[role="tab"][data-state="active"]');
  await expect(active).toHaveCount(1);
  await expect(active).toContainClass('data-[state=active]:bg-brand-600');

  // The emitted CSS actually paints it (the P14 failure mode: class present
  // in the DOM, rule absent from the stylesheet).
  const activeBg = await active.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(activeBg, 'active tab must not be transparent').not.toBe('rgba(0, 0, 0, 0)');

  // …and the inactive siblings stay transparent, so the states differ.
  const inactive = list.locator('[role="tab"][data-state="inactive"]').first();
  const inactiveBg = await inactive.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(inactiveBg, 'inactive tabs keep the bare track').toBe('rgba(0, 0, 0, 0)');
  expect(activeBg).not.toBe(inactiveBg);
});
