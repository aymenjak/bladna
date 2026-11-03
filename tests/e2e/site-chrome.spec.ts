import { expect, test } from '@playwright/test';

/**
 * P27 — the reference chrome beyond the landing (mjeunesse.gov.dz): the
 * promise strip and the marquee ticker ride every public hub (they now live
 * in the locale layout), and each hub opens with the dark page-masthead
 * band. Seed fact: one pinned announcement renders the ticker; the EN
 * opportunities h1 is "Initiatives" and the AR locale ships dir="rtl".
 *
 * P28 — the same band carries the auth flows and the initiative detail page:
 * the title block is inside `[data-page-masthead]`, not below it.
 */
test('the reference chrome rides the public hubs', async ({ page }) => {
  await page.goto('/en/opportunities');
  await expect(
    page.getByText('Algeria-first — identity, hours and certificates, all verifiable'),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Announcement' })).toBeVisible();

  const masthead = page.locator('[data-page-masthead]');
  await expect(masthead).toBeVisible();
  await expect(masthead.getByRole('heading', { level: 1 })).toHaveText('Initiatives');
});

test('the Arabic hub masthead renders in RTL', async ({ page }) => {
  await page.goto('/ar/verify');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('[data-page-masthead] h1')).toBeVisible();
});

test('the auth flow opens with the masthead band', async ({ page }) => {
  await page.goto('/en/login');
  const auth = page.locator('[data-page-masthead]');
  await expect(auth).toBeVisible();
  await expect(auth.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible();
  // The form still sits on the white card below the band.
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('the initiative detail header rides the masthead band', async ({ page }) => {
  await page.goto('/en/opportunities/sidi-fredj-beach-cleanup');
  const detail = page.locator('[data-page-masthead]');
  await expect(detail).toBeVisible();
  await expect(detail.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(detail.getByText('Organized by')).toBeVisible();
});

/**
 * P30 — the provided platform art replaces the initial-letter avatar in the
 * brand slots: the header mark decodes real pixels (a missing asset would
 * report naturalWidth 0), the app icon is registered from `src/app/icon.png`,
 * and clicking the mark takes the visitor home.
 */
test('the header brand mark is the platform logo and links home', async ({ page }) => {
  await page.goto('/en/opportunities');
  const logo = page.locator('header img[src="/logo.png"]');
  await expect(logo).toBeVisible();
  expect(await logo.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute('href', /icon\.png/);

  await logo.click();
  await page.waitForURL('**/en');
});

test('the auth flow and the footer open with the platform mark', async ({ page }) => {
  await page.goto('/en/login');
  // Scoped past the header's own copy — `main` holds the auth card.
  const authMark = page.locator('main img[src="/logo.png"]');
  await expect(authMark).toBeVisible();
  expect(await authMark.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);

  await page.goto('/en');
  const footerMark = page.locator('footer img[src="/logo.png"]');
  await expect(footerMark).toBeVisible();
  expect(await footerMark.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
});
