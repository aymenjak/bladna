import { expect, test } from '@playwright/test';

/**
 * P25 — the public volunteer profile: the directory card's name opens the
 * opted-in profile (identity header, skillset, verified achievements), unknown
 * or malformed ids land on 404, and the Arabic locale renders the same page.
 * Seed facts: exactly one public profile (Amina Benali) carrying verified
 * hours, one VALID certificate and one completed beach-cleanup participation.
 */

test('the directory card opens the public profile with achievements', async ({ page }) => {
  await page.goto('/en/volunteers');
  // The card's name is the click-through (the footer link has no trailing id).
  const profileLink = page.locator('a[href^="/en/volunteers/"]').first();
  await expect(profileLink).toBeVisible();
  await profileLink.click();
  await expect(page).toHaveURL(/\/en\/volunteers\/[0-9a-f-]{36}$/);
  await expect(page).toHaveTitle(/Amina Benali/);

  // Identity header: name, verification, bio and the availability chips.
  await expect(page.getByRole('heading', { level: 1, name: 'Amina Benali' })).toBeVisible();
  await expect(page.getByText('Volunteer based in Algiers', { exact: false })).toBeVisible();
  await expect(page.getByText('Weekends')).toBeVisible();

  // Achievements: honest digit totals, the certificate with its credential-
  // keyed verify link, and the participation linked to its initiative.
  const hoursTile = page.locator('dl > div', { hasText: 'Verified hours' });
  await expect(hoursTile.locator('dd')).toHaveText(/^\d+$/);
  await expect(page.getByText('Sidi Fredj beach clean-up — volunteer certificate')).toBeVisible();
  await expect(
    page.locator('a[href^="/en/verify/certificate?code=BLD-CERT-"]').first(),
  ).toBeVisible();
  await expect(page.locator('a[href="/en/opportunities/sidi-fredj-beach-cleanup"]')).toBeVisible();

  // P23 chain kept on the profile, plus the directory's privacy honesty.
  await expect(page.locator('a[href^="/en/messages?to="]')).toBeVisible();
  await expect(page.getByText('Phone numbers are never shown', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to the directory' })).toHaveAttribute(
    'href',
    '/en/volunteers',
  );
});

test('unknown and malformed profile ids land on the not-found page', async ({ page }) => {
  // Page-level notFound() renders the not-found UI inside the streamed shell
  // (this app answers 200 on every unknown page — the API is where the real
  // status lives, and it does answer 404).
  await page.goto('/en/volunteers/00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Amina Benali' })).toHaveCount(0);
  await page.goto('/en/volunteers/not-a-uuid');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();

  const api = await page.request.get('/api/v1/volunteers/00000000-0000-4000-8000-000000000000');
  expect(api.status()).toBe(404);
  const malformed = await page.request.get('/api/v1/volunteers/not-a-uuid');
  expect(malformed.status()).toBeGreaterThanOrEqual(400);
});

test('the Arabic locale renders the same profile', async ({ page }) => {
  await page.goto('/ar/volunteers');
  const profileLink = page.locator('a[href^="/ar/volunteers/"]').first();
  await expect(profileLink).toBeVisible();
  await profileLink.click();
  await expect(page).toHaveURL(/\/ar\/volunteers\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('link', { name: 'العودة إلى الدليل' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Amina Benali' })).toBeVisible();
});
