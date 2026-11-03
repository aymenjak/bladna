import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

/**
 * Admin sub-routes (M7): `/admin` and `/admin?tab=` now canonicalize to
 * `/admin/{section}` through 307 redirects (never 301 — grants live), unknown
 * or ungranted sections canonicalize instead of 404ing, and the console keeps
 * deep links, keyboard operation and history in sync.
 */
test.describe('admin sub-routes', () => {
  test('an anonymous deep link ends up at sign-in with ?next preserved', async ({
    page,
    request,
  }) => {
    // Raw HTTP: the app-wide `[locale]/loading.tsx` flushes the shell (skeleton)
    // before the session gate resolves, so an app-level `redirect()` can no
    // longer change the status and travels as Next's `__next-page-redirect`
    // meta refresh inside a 200. A bare 307 only exists pre-flush (proxy).
    const response = await request.get('/en/admin/users', { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain('url=/en/login?next=%2Fen%2Fadmin%2Fusers');

    // What a real browser does with that marker: land on the login page with
    // the original deep link preserved for post-login return.
    await page.goto('/en/admin/users');
    await expect(page).toHaveURL('/en/login?next=%2Fen%2Fadmin%2Fusers');
  });

  test('grants deep-link, canonicalize, ?tab= and back-button', async ({ page }) => {
    await signIn(page, 'admin@bladna.dz', { mfa: true });

    await test.step('a deep link lands on its own canonical tab', async () => {
      await page.goto('/en/admin/audit');
      await expect(page.getByRole('heading', { level: 1, name: 'Administration' })).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Audit log' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });

    await test.step('an unknown section canonicalizes instead of 404ing', async () => {
      await page.goto('/en/admin/bogus');
      await expect(page).toHaveURL('/en/admin/users');
      await expect(page.getByRole('tab', { name: 'Users' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });

    await test.step('the legacy ?tab= query still resolves (307)', async () => {
      await page.goto('/en/admin?tab=audit');
      await expect(page).toHaveURL('/en/admin/audit');
      await expect(page.getByRole('tab', { name: 'Audit log' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });

    await test.step('tabs answer the keyboard and history back follows', async () => {
      const audit = page.getByRole('tab', { name: 'Audit log' });
      await audit.focus();
      await page.keyboard.press('ArrowRight');

      await expect(page).toHaveURL('/en/admin/content');
      await expect(page.getByRole('tab', { name: 'Content' })).toHaveAttribute(
        'aria-selected',
        'true',
      );

      await page.goBack();
      await expect(page).toHaveURL('/en/admin/audit');
      await expect(page.getByRole('tab', { name: 'Audit log' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });
  });
});
