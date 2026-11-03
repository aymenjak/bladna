import { expect, test } from '@playwright/test';

/**
 * Discovery UI in a real browser (P3 deferred rows): the `<details>` filter
 * tray collapses below `lg` after hydration, touch opens it, the GET form
 * round-trips through the URL, active chips drop exactly their own filter —
 * plus the RTL locale and the zoom-safe viewport meta (WCAG 1.4.4).
 */
test.describe('mobile discovery', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('the filter tray collapses, submits and chips-drop on touch', async ({ page }) => {
    await page.goto('/en/opportunities');
    await expect(page.getByRole('heading', { name: 'Initiatives' })).toBeVisible();

    // Anonymous shell keeps the full-height column (no bottom bar, no pb-24).
    await expect(page.locator('main#main').locator('xpath=..')).not.toHaveClass(/pb-24/);

    const tray = page.getByTestId('filter-tray');
    // SSR ships `open` (no-JS intact); once hydrated below lg it collapses.
    await expect(tray).not.toHaveAttribute('open', '');

    // H3 real-browser check: the primary mobile target meets the DESIGN.md
    // >=44px floor as actually laid out, not just in the CSS source.
    const box = await tray.locator('summary').boundingBox();
    expect(box, 'the tray summary is laid out').not.toBeNull();
    expect(box!.height, 'tray summary height (px)').toBeGreaterThanOrEqual(44);

    await tray.locator('summary').tap();
    await expect(tray).toHaveAttribute('open', '');

    await page.locator('#q').fill('park');
    await tray.getByRole('button', { name: 'Search' }).click();
    await expect(page).toHaveURL(/[?&]q=park/);

    const chips = page.getByTestId('filter-chips');
    await expect(chips).toBeVisible();
    await expect(chips).toContainText('Search: park');

    // The search submit loaded a fresh document — wait for hydration (the tray
    // collapse runs in useEffect, so it is a post-hydration signal) before
    // asking a client-side <Link> click to navigate.
    await expect(tray).not.toHaveAttribute('open', '');

    const chip = chips.getByRole('link', { name: 'Remove filter: Search: park' });
    await expect(chip).toHaveAttribute('href', '/en/opportunities');
    await Promise.all([page.waitForURL((url) => !/[?&]q=/.test(url.search)), chip.click()]);

    await expect(page).not.toHaveURL(/[?&]q=/);
    await expect(page.getByTestId('filter-chips')).toHaveCount(0);
  });

  test('the Arabic locale renders right-to-left', async ({ page }) => {
    await page.goto('/ar/opportunities');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'المبادرات' })).toBeVisible();
    await expect(page.getByTestId('filter-tray').locator('summary')).toContainText('تصفية');
  });

  test('the viewport meta never blocks pinch zoom', async ({ page }) => {
    await page.goto('/en/safety');
    const content = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(content ?? '').toContain('width=device-width');
    expect(content ?? '').not.toMatch(/maximum-scale|user-scalable\s*=\s*no/);
  });
});
