import { expect, test } from '@playwright/test';

/**
 * Sign-in smoke (M8) + the M4/DESIGN §8 focus rule that was previously only
 * unit-covered by `use-focus-first-error`.
 */
test.describe('sign-in', () => {
  test('an empty submit marks and focuses the first invalid control', async ({ page }) => {
    await page.goto('/en/login');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

    // The form is `noValidate`: the server's zod result is what marks fields,
    // so this submit is also the hydration check for the controlled inputs.
    await page.getByRole('button', { name: 'Sign in' }).click();

    const email = page.locator('input[name="email"]');
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('input[name="password"]')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('alert').first()).toBeVisible();

    // DESIGN §8 / use-focus-first-error: focus lands on the FIRST invalid
    // control (the password field must not steal it).
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute('name') ?? ''))
      .toBe('email');
  });

  test('a wrong password shows the non-revealing banner', async ({ page }) => {
    await page.goto('/en/login');
    await page.waitForLoadState('networkidle');
    await page.locator('input[name="email"]').fill('volunteer@bladna.dz');
    await page.locator('input[name="password"]').fill('definitely-not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Incorrect email or password.', { exact: true })).toBeVisible();
    // The banner never reveals whether the account exists, and the visitor
    // stays on the form.
    await expect(page).toHaveURL('/en/login');
    await expect(page.getByText('No account with that email', { exact: true })).toHaveCount(0);
  });
});
