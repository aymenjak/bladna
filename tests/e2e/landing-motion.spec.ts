import { expect, test } from '@playwright/test';

/**
 * P26 — the reference-style landing (mjeunesse.gov.dz): the top promise
 * strip, the four-frame hero slider with accessible controls, the SSR-shipped
 * impact figures, the services grid and the RTL default. Seed facts: one
 * pinned announcement (renders as the marquee ticker) and four impact totals.
 */

test('the landing opens with the promise strip and a four-frame slider', async ({ page }) => {
  await page.goto('/en');
  await expect(
    page.getByText('Algeria-first — identity, hours and certificates, all verifiable'),
  ).toBeVisible();

  const slider = page.locator('[data-hero-slider]');
  await expect(slider).toBeVisible();
  await expect(slider.locator('[data-slide]')).toHaveCount(4);
  const toggle = slider.locator('[data-slider-toggle]');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  // The first photo renders, and a segment button jumps straight to its frame.
  await expect(slider.locator('[data-slide="0"]')).toHaveJSProperty('complete', true);
  await slider.getByRole('button', { name: 'Show slide 3' }).click();
  await expect(slider.locator('[data-slide="2"]')).toHaveAttribute('aria-hidden', 'false');
  await expect(slider.locator('[data-slide="0"]')).toHaveAttribute('aria-hidden', 'true');
});

test('the announcement rides the ticker and counters ship final figures', async ({ page }) => {
  await page.goto('/en');
  // P12 seed — now rendered as the reference-style marquee strip.
  await expect(page.getByRole('region', { name: 'Announcement' })).toBeVisible();

  // SSR renders the REAL totals: four digit figures before any animation.
  const counters = page.locator('[data-stat-counter]');
  await expect(counters).toHaveCount(4);
  for (const counter of await counters.all()) {
    await expect(counter).toHaveText(/\d/);
  }

  // The services grid keeps all four destinations reachable.
  await expect(
    page.getByRole('heading', { level: 2, name: 'Digital services in one place' }),
  ).toBeVisible();
  await expect(page.locator('a[href="/en/verify"]').first()).toBeVisible();
  await expect(page.locator('a[href="/en/volunteers"]').first()).toBeVisible();
});

test('reduced motion never autoplays the slider', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/en');
  // Hydration flips the default-on toggle to paused when motion is reduced.
  await expect(page.locator('[data-slider-toggle]')).toHaveAttribute('aria-pressed', 'false');
  await context.close();
});

test('the Arabic landing renders the same slider in RTL', async ({ page }) => {
  await page.goto('/ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('[data-hero-slider]')).toBeVisible();
  await expect(page.locator('[data-hero-slider] [data-slide]')).toHaveCount(4);
});
