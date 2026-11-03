import { expect, test } from '@playwright/test';

/**
 * Anonymous record verification (M8 smoke) — no account, no session.
 */
test.describe('public record verification', () => {
  test('an unknown code is refused with the honest empty-state copy', async ({ page }) => {
    await page.goto('/en/verify');
    await expect(page.getByRole('heading', { name: 'Verify a record' })).toBeVisible();

    await page.getByTestId('verify-code').fill('BLD-CERT-NOT-A-REAL-CODE');
    await page.getByRole('button', { name: 'Check' }).click();

    await expect(page.getByTestId('verify-error')).toHaveText(
      'We could not find a record for this code.',
    );
    await expect(page.getByTestId('verify-result')).toHaveCount(0);
  });

  test('the seeded certificate resolves through its dedicated page', async ({ page }) => {
    await page.goto('/en/verify/certificate');
    await expect(page.getByRole('heading', { name: 'Verify a certificate' })).toBeVisible();

    await page.getByTestId('verify-code').fill('BLD-CERT-2LXHUMOJTJ');
    await page.getByRole('button', { name: 'Check' }).click();

    const result = page.getByTestId('verify-result');
    await expect(result).toHaveAttribute('data-valid', 'true');
    await expect(result).toContainText('Record found');
  });
});
