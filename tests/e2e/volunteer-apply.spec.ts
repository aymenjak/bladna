import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

/**
 * Volunteer application flow (M8 smoke) + the signed-in mobile shell that P3
 * left for a real browser.
 *
 * Idempotency: the demo volunteer already holds an ACCEPTED application on the
 * seeded initiative, so re-applying is answered by the 409 guard every run —
 * no dataset mutation, no ordering dependency on the other specs.
 */
const SLUG = 'algiers-park-cleanup';

test.describe('volunteer application flow', () => {
  test('an anonymous visitor is offered sign-in instead of the form', async ({ page }) => {
    await page.goto(`/en/opportunities/${SLUG}`);
    await expect(page.getByText('Sign in to apply.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apply now' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible();
  });

  test('the signed-in volunteer meets the form, the duplicate guard and the bottom bar', async ({
    page,
  }) => {
    await signIn(page, 'volunteer@bladna.dz');

    await page.goto(`/en/opportunities/${SLUG}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Dynamic questionnaire controls are rendered as `q-<id>` and must stay
    // labelled (none are seeded today; the contract holds when they appear).
    for (const control of await page.locator('[id^="q-"]').all()) {
      const id = await control.getAttribute('id');
      await expect(page.locator(`label[for="${id}"]`)).toHaveCount(1);
    }

    await test.step('duplicate application is refused with the conflict message', async () => {
      await page
        .locator('textarea[name="motivation"]')
        .fill(
          'E2E smoke: motivation long enough to clear the 50-character client rule, so the duplicate guard is what answers this submit.',
        );
      await page.getByRole('button', { name: 'Apply now' }).click();
      await expect(
        page.getByText('You have already applied to this opportunity.', { exact: true }),
      ).toBeVisible();
    });

    await test.step('the fixed bottom bar reserves its own room (P3)', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      const nav = page.getByTestId('bottom-nav');
      await expect(nav).toBeVisible();
      await expect(nav).toHaveCSS('position', 'fixed');
      // The column above it carries pb-24 so the bar never covers content.
      await expect(page.locator('main#main').locator('xpath=..')).toHaveClass(/pb-24/);

      await page.setViewportSize({ width: 1280, height: 800 });
      await expect(nav).toBeHidden(); // lg:hidden — desktop keeps the header nav
    });
  });
});
