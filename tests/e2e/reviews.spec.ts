import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

/**
 * Reviews & ratings (P24) — the full author cycle on the initiative the demo
 * volunteer qualifies for through VERIFIED hours (the beach clean-up; their
 * ACCEPTED application covers the park initiative instead, where the seeded
 * demo review lives and must stay untouched). The test is repeatable: any
 * leftover own review from a previously failed run is cleared through the UI
 * before publishing, so it always starts from a clean state.
 */
test('an eligible volunteer publishes, edits and removes their own review', async ({ page }) => {
  await signIn(page, 'volunteer@bladna.dz');
  await page.goto('/en/opportunities/sidi-fredj-beach-cleanup');

  // The section renders with the provenance rule visible before any write.
  await expect(page.getByRole('heading', { name: 'Participant reviews' })).toBeVisible();
  await expect(page.getByText('Reviews come from accepted participants')).toBeVisible();

  // Idempotency: clear a leftover own review from a previously failed run.
  const deleteOwn = page.getByRole('button', { name: 'Delete', exact: true });
  if (await deleteOwn.isVisible().catch(() => false)) {
    await deleteOwn.click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    await expect(page.getByRole('button', { name: 'Publish review' })).toBeVisible();
  }

  // Publish: 4 stars plus a written body.
  await page.getByRole('radio', { name: '4 of 5' }).click();
  await page.getByLabel('Your review').fill('Clear briefing and a well-run morning.');
  await page.getByRole('button', { name: 'Publish review' }).click();

  // The row lands as the viewer's own — provenance badge, stats and all.
  const ownRow = page.locator('li', { hasText: 'Clear briefing and a well-run morning.' });
  await expect(ownRow).toHaveCount(1);
  await expect(ownRow.getByText('Your review', { exact: true })).toBeVisible();
  await expect(ownRow.getByText('Verified hours', { exact: true })).toBeVisible();
  await expect(page.getByText('Reviews: 1')).toBeVisible();

  // Edit: the composer returns prefilled with the current rating.
  await ownRow.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('radio', { name: '4 of 5' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: '5 of 5' }).click();
  await page.getByLabel('Your review').fill('Clear briefing and a perfect morning.');
  // Scope to the composer: the detail page also carries the save-for-later
  // bookmark button, which shares the accessible name "Save".
  await page
    .locator('form')
    .filter({ has: page.getByLabel('Your review') })
    .getByRole('button', { name: 'Save', exact: true })
    .click();

  await expect(page.getByText('Clear briefing and a perfect morning.')).toBeVisible();
  await expect(page.getByText('Clear briefing and a well-run morning.')).toHaveCount(0);
  // The stamps diverge on PATCH, so the row carries its "edited" marker.
  await expect(page.getByText(/· edited/)).toBeVisible();

  // Remove: the kit confirm dialog gates it and the composer comes back.
  await page
    .locator('li', { hasText: 'Clear briefing and a perfect morning.' })
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Publish review' })).toBeVisible();
  await expect(page.getByText('Clear briefing and a perfect morning.')).toHaveCount(0);
  await expect(page.getByText('Reviews: 1')).toHaveCount(0);
  await expect(
    page.getByText('No reviews yet — be the first to share your experience.'),
  ).toBeVisible();
});
