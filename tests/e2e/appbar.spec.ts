import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

/**
 * The signed-in app bar (P16 declutter pass): five text links (public four +
 * dashboard) plus two labeled icon destinations, all in one sticky row. The
 * eight-link row this replaced wrapped "Dashboard" onto two lines in a user
 * screenshot — the icon/aria assertions keep those destinations reachable
 * while `not.toBeVisible` on `/en/applications` pins the account-menu move
 * (the element still exists in the hidden mobile drawer, hence visibility).
 */
test('the signed-in app bar stays one row with labeled icon destinations', async ({ page }) => {
  await signIn(page, 'volunteer@bladna.dz');

  const header = page.locator('header').first();
  await expect(header).toHaveCSS('position', 'sticky');

  // Text nav: public four + dashboard.
  await expect(header.locator('a[href="/en/dashboard"]')).toBeVisible();
  await expect(header.locator('a[href="/en/opportunities"]')).toBeVisible();
  // Applications moved into the account menu (hidden drawer keeps the DOM node).
  await expect(header.locator('a[href="/en/applications"]')).not.toBeVisible();

  // Messages/notifications are icon buttons carrying the accessible names.
  await expect(header.locator('a[aria-label="Messages"]')).toBeVisible();
  await expect(header.locator('a[aria-label="Notifications"]')).toBeVisible();
});
