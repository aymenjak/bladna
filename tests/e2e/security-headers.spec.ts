import { expect, test } from '@playwright/test';

/**
 * Site-wide security headers seen by a real browser — the check that was
 * previously structural only (the CSP nonce contract used to be read off the
 * served HTML because no browser was reachable in this environment).
 */
test.describe('security headers', () => {
  test('a document ships the nonce CSP and the static header set', async ({ page }) => {
    const response = await page.goto('/en/safety');
    expect(response, 'the page answered').not.toBeNull();
    const headers = response!.headers();

    // Document policy: nonce + strict-dynamic (no inline-script allowlist).
    expect(headers['content-security-policy']).toContain("script-src 'self' 'nonce-");
    expect(headers['content-security-policy']).toContain('strict-dynamic');
    expect(headers['strict-transport-security']).toContain('max-age=31536000');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  test('every executable script element carries the response nonce', async ({ page }) => {
    await page.goto('/en/safety');
    // Wait for a rendered shell so the audit sees the finished document, not a
    // streaming frame.
    await page.waitForSelector('h1');
    const audit = await page.evaluate(() => {
      const executable = Array.from(document.querySelectorAll('script')).filter((script) => {
        const type = script.getAttribute('type');
        return !type || type === 'module' || /javascript/.test(type);
      });
      return {
        total: executable.length,
        withoutNonce: executable.filter((script) => (script.nonce ?? '').length === 0).length,
      };
    });
    expect(audit.total, 'the page executes scripts').toBeGreaterThan(0);
    expect(audit.withoutNonce, 'executable scripts with a missing nonce').toBe(0);
  });

  test('API responses carry the lockdown policy', async ({ request }) => {
    const response = await request.get('/api/v1/health');
    expect(response.ok()).toBe(true);
    const csp = response.headers()['content-security-policy'];
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
  });
});
