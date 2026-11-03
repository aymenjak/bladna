import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

/**
 * P20 — no target-id hunting: the initiative page's Report link prefills the
 * safety form with the page's own URL, the target type is detected from the
 * path, and filing stores the report against the RESOLVED uuid — the list
 * shows an id, never the pasted link. The previous run's report is dropped by
 * scripts/e2e-ensure-clean-report.ts (global setup), so the duplicate guard
 * never bites across runs.
 */
test('the Report link prefills the form and the pasted link resolves to an id', async ({
  page,
}) => {
  await signIn(page, 'volunteer@bladna.dz');

  // From the very page you would report — no id anywhere in sight.
  await page.goto('/en/opportunities/algiers-park-cleanup');
  await page.getByRole('link', { name: 'Report', exact: true }).click();

  // The form arrives prefilled with this page's link, type detected.
  await expect(page).toHaveURL(/\/en\/safety\?target=/);
  await expect(page.getByLabel('Target identifier')).toHaveValue(
    '/en/opportunities/algiers-park-cleanup',
  );
  await expect(page.getByLabel('What are you reporting?')).toHaveValue('OPPORTUNITY');

  // File it — the server resolves the slug to the opportunity's uuid.
  // (No `exact`: the required marker lands in the accessible name — "Reason *".)
  await page.getByLabel('Reason').selectOption('MISLEADING_INFO');
  await page.getByRole('button', { name: 'Submit report' }).click();
  await expect(page.getByText(/Report submitted/)).toBeVisible();

  // "My reports" carries the resolved uuid, never the pasted URL.
  const row = page.locator('li').filter({ hasText: 'Opportunity — ' }).first();
  await expect(row.locator('code')).toHaveText(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
});
