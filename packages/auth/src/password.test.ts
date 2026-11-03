import { describe, expect, it } from 'vitest';
import { checkPasswordPolicy, passwordHasher } from './password';

describe('password hashing', () => {
  it('hashes and verifies a password', async () => {
    const stored = await passwordHasher.hash('Correct-Horse-Battery-9');
    expect(stored.startsWith('scrypt$')).toBe(true);
    expect(await passwordHasher.verify('Correct-Horse-Battery-9', stored)).toBe(true);
  });

  it('rejects wrong passwords', async () => {
    const stored = await passwordHasher.hash('Correct-Horse-Battery-9');
    expect(await passwordHasher.verify('correct-horse-battery-9', stored)).toBe(false);
    expect(await passwordHasher.verify('', stored)).toBe(false);
  });

  it('never stores plaintext and salts every hash', async () => {
    const a = await passwordHasher.hash('same-password-here-1');
    const b = await passwordHasher.hash('same-password-here-1');
    expect(a).not.toContain('same-password-here-1');
    expect(a).not.toBe(b);
  });

  it('does not throw on malformed stored hashes', async () => {
    expect(await passwordHasher.verify('x', 'garbage')).toBe(false);
    expect(await passwordHasher.verify('x', 'scrypt$bad$format')).toBe(false);
    expect(await passwordHasher.verify('x', 'bcrypt$10$abc$def$ghi$jkl')).toBe(false);
  });
});

describe('password policy', () => {
  it('requires reasonable length', () => {
    expect(checkPasswordPolicy('short').ok).toBe(false);
    expect(checkPasswordPolicy('long-enough-password').ok).toBe(true);
  });

  it('blocks common and email-derived passwords', () => {
    expect(checkPasswordPolicy('password1').problems).toContain('PASSWORD_TOO_COMMON');
    const result = checkPasswordPolicy('aymen-secret-99', { email: 'aymen@example.com' });
    expect(result.ok).toBe(false);
    expect(result.problems).toContain('PASSWORD_CONTAINS_EMAIL');
  });
});
