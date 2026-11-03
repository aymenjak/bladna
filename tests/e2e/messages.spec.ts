import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

// Clipboard round-trip: the Copy button writes, the page reads it back.
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

/**
 * The messages workspace (P17 pass): the seeded org↔volunteer thread opens
 * from the list and renders the redesigned surfaces — peer names under the
 * thread title, the peer's bubble with its day separator, and a composer that
 * keeps its labels (textarea placeholder, Send button, attachment picker).
 */
test('the seeded conversation opens with bubbles and a composer', async ({ page }) => {
  await signIn(page, 'volunteer@bladna.dz');

  await page.goto('/en/messages');

  const row = page.getByRole('button', { name: /Winter campaign volunteers/ });
  await expect(row).toBeVisible();
  await row.click();

  // Thread: the org owner's opening line + the composer are ready.
  await expect(page.getByText('park cleanup briefing')).toBeVisible();
  await expect(page.getByText('Perfect, see you Thursday.')).toBeVisible();
  await expect(page.getByPlaceholder('Write a message…')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
  // The peer's name rides under the thread title (and heads his own bubble).
  await expect(page.getByText('Karim Haddad').first()).toBeVisible();
});

/**
 * P19 — nobody should have to hunt for a raw UUID: Settings carries a
 * copyable conversation link, opening it (`/messages?to=<id>`) prefills the
 * new-conversation form, and starting it lands on the existing DIRECT thread
 * (the server dedupes), so the seeded org↔volunteer conversation opens.
 */
test('the shareable conversation link prefills the recipient and opens the thread', async ({
  page,
}) => {
  await signIn(page, 'volunteer@bladna.dz');

  // Settings: the absolute link renders and the Copy button writes it there.
  await page.goto('/en/settings');
  const linkCode = page.locator('code', { hasText: /messages\?to=/ });
  await expect(linkCode).toHaveCount(1);
  // Wait for the mounted absolute URL (SSR renders the origin-less path first).
  await expect(linkCode).toContainText('http://localhost:3002/en/messages?to=');
  const link = ((await linkCode.textContent()) ?? '').trim();
  expect(link).toContain('http://localhost:3002/en/messages?to=');

  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByRole('button', { name: 'Link copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);

  // Opening the org's link prefills the recipient — no UUID hunting here.
  const orgUserId = '669e91a9-bf1f-479d-9c49-2ee6c77094eb'; // seeded org owner
  await page.goto(`/en/messages?to=${orgUserId}`);
  await expect(page.getByLabel('Recipient user ID')).toHaveValue(orgUserId);

  // Start → the server dedupes into an existing DIRECT thread for this pair
  // (the seeded one or an older pair thread): whichever opens must carry
  // content — a freshly created empty row would fail this.
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(
    page.getByText('park cleanup briefing').or(page.getByText('قل مرحّبًا.')).first(),
  ).toBeVisible();
  await expect(page.getByPlaceholder('Write a message…')).toBeVisible();
});

/**
 * P23 — contact before applying: the directory's Message link and an
 * initiative/organization's `?org=` link both bounce anonymous visitors to
 * login with the target kept in `?next=`, so signing in lands on a compose
 * form that is already addressed (the params are re-validated server-side —
 * junk never rides the bounce).
 */
test('contact links survive the sign-in bounce with their target intact', async ({ page }) => {
  // Directory card → /messages?to=<owner id> → login keeps the recipient.
  await page.goto('/en/volunteers');
  await page.getByRole('link', { name: 'Message', exact: true }).first().click();
  await expect(page).toHaveURL(/\/en\/login\?next=/);
  const toNext = new URL(page.url()).searchParams.get('next') ?? '';
  expect(new URL(toNext, 'http://local').searchParams.get('to')).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );

  // Initiative/organization → /messages?org=<id>&name=… → both survive.
  await page.goto(
    `/en/messages?org=11111111-1111-4111-8111-111111111111&name=${encodeURIComponent('Atlas Verts')}`,
  );
  await expect(page).toHaveURL(/\/en\/login\?next=/);
  const orgNext = new URL(page.url()).searchParams.get('next') ?? '';
  const params = new URL(orgNext, 'http://local').searchParams;
  expect(params.get('org')).toBe('11111111-1111-4111-8111-111111111111');
  expect(params.get('name')).toBe('Atlas Verts');
});
