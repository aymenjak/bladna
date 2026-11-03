import { expect, test } from '@playwright/test';

/**
 * Public organization profile — P15 trust & presence pass.
 *
 * Asserts the presentation fields that make the tenant feel real (cover band,
 * logo in the identity tile) and the consent rule behind the team preview:
 * `ORG_PUBLIC_SELECT` only ships members whose volunteer profile is opted-in
 * (`publicProfile`), so the demo volunteer — not every account — appears, and
 * the directory card carries the same logo.
 */
test('the organization profile shows its cover, logo and opted-in team', async ({ page }) => {
  await page.goto('/en/organizations/atlas-verts');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Association Atlas Verts');
  await expect(page.locator('[data-testid="org-cover"] img')).toBeVisible();
  await expect(page.locator('header img[src*="logo-atlas-verts"]')).toBeVisible();
  // P23: the header carries the messaging entry point, addressed to this org.
  await expect(page.getByRole('link', { name: 'Message', exact: true }).first()).toHaveAttribute(
    'href',
    /^\/en\/messages\?org=[0-9a-f-]{36}&name=/,
  );
  await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible();
  await expect(page.getByText('Staff', { exact: true })).toBeVisible();
});

test('the directory card carries the tenant logo', async ({ page }) => {
  await page.goto('/en/organizations');
  await expect(page.locator('img[src*="logo-atlas-verts"]').first()).toBeVisible();
});
