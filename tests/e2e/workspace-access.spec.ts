import { expect, test } from '@playwright/test';
import { ORG_ID, signIn } from './helpers';

/**
 * P31 — honest workspace access (the reported live bug): the workspace tabs
 * promise pages that role-gated endpoints protect, yet `FORBIDDEN` was mapped
 * to `notFound()` — a member without the permission got "Page not found" for
 * a tab that is visibly linked. The split: FORBIDDEN renders the access panel
 * ("You do not have access to this page"), NOT_FOUND stays a real 404.
 *
 * Seed facts: volunteer@bladna.dz is an ACTIVE member of the demo org (so the
 * shell opens via `organization.read`) but her role lacks `hours.verify`;
 * org@bladna.dz is its OWNER (TOTP) and renders the page.
 */
test('a member without the page permission gets the access panel, not a 404', async ({ page }) => {
  await signIn(page, 'volunteer@bladna.dz');
  await page.goto(`/en/workspace/${ORG_ID}/hours`);

  await expect(page.getByText('You do not have access to this page')).toBeVisible();
  await expect(page.getByText('Page not found')).toHaveCount(0);
  // The shell still opened for the member: org heading + the tabs behind it.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('the organization owner still renders the gated page', async ({ page }) => {
  await signIn(page, 'org@bladna.dz', { mfa: true });
  await page.goto(`/en/workspace/${ORG_ID}/hours`);

  await expect(page.locator('#hours-status')).toBeVisible();
  await expect(page.getByText('Page not found')).toHaveCount(0);
});
