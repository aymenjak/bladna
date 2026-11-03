import { expect, test } from '@playwright/test';
import { ORG_ID, signIn } from './helpers';

/**
 * Organization review flow (M8 smoke).
 *
 * Deliberately non-destructive: every decision button is gated behind the
 * kit's confirm dialog (Radix AlertDialog, P6), and the seeded demo dataset
 * is shared with the probe scripts — accepting/rejecting would move the row
 * to a terminal status and break the next run. The spec therefore proves the
 * gate (exact dialog copy + a dismissed dialog leaves the row untouched)
 * instead of firing the POST.
 *
 * The volunteer can hold applications on more than one opportunity (the demo
 * dataset is shared), so the list is scoped to the opportunity that carries
 * the seeded ACCEPTED row rather than to the first row of hers that appears.
 */
test.describe('organization application review', () => {
  test('scopes the list to an opportunity and gates decisions behind confirm', async ({ page }) => {
    await signIn(page, 'org@bladna.dz', { mfa: true });

    // The list only renders under an `?opp=` scope (plain GET form, no JS).
    const options = page.locator('#opp option:not([value=""])');
    await page.goto(`/en/workspace/${ORG_ID}/applications`);
    await expect(page.getByLabel('Opportunity')).toBeVisible();
    const count = await options.count();
    expect(count, 'the demo organization has opportunities to scope by').toBeGreaterThan(0);

    let scoped = '';
    for (let index = 0; index < count; index += 1) {
      const value = (await options.nth(index).getAttribute('value')) ?? '';
      await page.goto(`/en/workspace/${ORG_ID}/applications?opp=${value}`);
      // waitFor* retries: the app streams its loading skeleton first, so a
      // single-shot isVisible() would look at the skeleton and give up. A
      // scope that only holds her SUBMITTED row does not match — only the
      // seeded ACCEPTED one does.
      const found = await page
        .locator('li')
        .filter({ hasText: 'Amina Benali' })
        .getByText('Accepted', { exact: true })
        .waitFor({ timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (found) {
        scoped = value;
        break;
      }
    }
    expect(
      scoped,
      'the seeded ACCEPTED application lives under one of these opportunities',
    ).not.toBe('');

    const row = page.locator('li').filter({ hasText: 'Amina Benali' });
    await expect(row).toHaveCount(1);
    await expect(row.getByText('Accepted', { exact: true })).toBeVisible();

    // State machine: ACCEPTED can only move to REJECTED, so no Accept button.
    await expect(row.getByRole('button', { name: 'Reject' })).toHaveCount(1);
    await expect(row.getByRole('button', { name: 'Accept' })).toHaveCount(0);

    await row.getByRole('button', { name: 'Reject' }).click();

    // Kit confirm dialog (Radix AlertDialog): exact copy, then dismiss.
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Reject the selected applications?')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    // Dismissed → no POST, no success banner, status untouched.
    await expect(page.getByText('Applications updated.')).toHaveCount(0);
    await expect(row.getByText('Accepted', { exact: true })).toBeVisible();
  });
});
