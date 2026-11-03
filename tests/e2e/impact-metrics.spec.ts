import { expect, test } from '@playwright/test';
// Side-effect import: repository `.env` → process.env for the TOTP child.
import '../../scripts/e2e-env';
import { ORG_ID, signIn } from './helpers';

/**
 * P29 — the shared impact-metric card (spec §14) zones its data on both
 * surfaces instead of one `·`-joined run-on line: a title row, labelled
 * Actual/Target figures, an honest progress bar (the bar caps visually —
 * the printed figures never round), and the source on its own line. The
 * public initiative page and the workspace console's Impact tab render the
 * same component, so both get pinned here.
 */
test('initiative page zones metric figures, bar and source', async ({ page }) => {
  await page.goto('/en/opportunities/algiers-park-cleanup');

  const cards = page.locator('[data-impact-metric]');
  await expect(cards).toHaveCount(2);

  // A metric WITH a target shows the labelled figure pair and a real bar.
  const volunteers = cards.filter({ hasText: 'Registered volunteers' });
  await expect(volunteers).toHaveCount(1);
  await expect(volunteers.getByText('Actual', { exact: true })).toBeVisible();
  await expect(volunteers.getByText('Target', { exact: true })).toBeVisible();

  const bar = volunteers.getByRole('progressbar');
  await expect(bar).toHaveAttribute('aria-valuemax', '25');
  await expect(bar).toHaveAttribute('aria-valuenow', '1');

  // The provenance sentence sits on its own muted line, not after ` · `.
  await expect(volunteers.getByText('Source:', { exact: true })).toBeVisible();
  await expect(volunteers.getByText('Registration records (demo dataset)')).toBeVisible();

  // Both seeded metrics carry targets → each card owns its own bar.
  await expect(page.locator('[data-impact-metric] [role="progressbar"]')).toHaveCount(2);
});

test('workspace console Impact tab renders the zoned cards', async ({ page }) => {
  await signIn(page, 'org@bladna.dz', { mfa: true });
  await page.goto(`/en/workspace/${ORG_ID}/opportunities`);

  const row = page.locator('li').filter({ hasText: 'Algiers central park clean-up' });
  await row.getByRole('button', { name: /console/i }).click();
  await page.getByRole('tab', { name: 'Impact', exact: true }).click();

  const cards = page.locator('[data-impact-metric]');
  await expect(cards).toHaveCount(2);

  // The console adds the type chip + timestamp; the figures stay zoned.
  const volunteers = cards.filter({ hasText: 'Registered volunteers' });
  await expect(volunteers).toHaveCount(1);
  await expect(
    volunteers.locator('span.rounded-full').filter({ hasText: /^Volunteers$/ }),
  ).toBeVisible();
  await expect(volunteers.getByText('Actual', { exact: true })).toBeVisible();
  await expect(volunteers.getByRole('progressbar')).toBeVisible();
  await expect(volunteers.getByText('Registration records (demo dataset)')).toBeVisible();
});
