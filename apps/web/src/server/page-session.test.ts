import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@bladna/types';
import { redirect } from 'next/navigation';
import { invoke } from '@/server/ssr';
import { me } from '@/server/modules/auth';
import { pageSession, type MeSession, type MeUser } from './page-session';

/**
 * pageSession contract (spec §49): UNAUTHORIZED / MFA_REQUIRED bounce to
 * login with `?next=`, an unsatisfied MFA session bounces to the MFA step,
 * and every other error is rethrown — real bugs never silently redirect.
 * The SSR invoke and next/navigation redirect are mocked; the decision logic
 * under test is the real one.
 */
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock('@/server/ssr', () => ({ invoke: vi.fn() }));
vi.mock('@/server/modules/auth', () => ({ me: vi.fn() }));

const invokeMock = vi.mocked(invoke);
const redirectMock = vi.mocked(redirect);

function makeUser(overrides: Partial<MeUser> = {}): MeUser {
  return {
    id: 'user-1',
    email: 'v@example.dz',
    phone: null,
    firstName: 'Sahra',
    lastName: 'Bensalem',
    dateOfBirth: null,
    profileImage: null,
    preferredLanguage: 'ar',
    roles: ['VOLUNTEER'],
    status: 'ACTIVE',
    emailVerified: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeSession(overrides: Partial<MeSession> = {}): MeSession {
  return {
    user: makeUser(),
    mfa: { enabled: false, satisfied: true },
    mfaRequired: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pageSession', () => {
  it('returns the session and calls /auth/me once on success', async () => {
    const session = makeSession();
    invokeMock.mockResolvedValueOnce(session);

    await expect(pageSession('fr', '/fr/dashboard')).resolves.toBe(session);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith(me, { path: '/auth/me', locale: 'fr' });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('redirects to login on UNAUTHORIZED with next preserved', async () => {
    invokeMock.mockRejectedValueOnce(AppError.unauthorized());

    await expect(pageSession('en', '/en/settings')).rejects.toThrow(
      '/en/login?next=%2Fen%2Fsettings',
    );
    expect(redirectMock).toHaveBeenCalledWith('/en/login?next=%2Fen%2Fsettings');
  });

  it('redirects to login on MFA_REQUIRED (the API contract for pending MFA)', async () => {
    invokeMock.mockRejectedValueOnce(AppError.mfaRequired());

    await expect(pageSession('ar', '/ar/billing')).rejects.toThrow('/ar/login?next=');
    expect(redirectMock).toHaveBeenCalledWith('/ar/login?next=%2Far%2Fbilling');
  });

  it('redirects to the MFA step when the session still owes a code', async () => {
    invokeMock.mockResolvedValueOnce(
      makeSession({ mfa: { enabled: true, satisfied: false }, mfaRequired: true }),
    );

    await expect(pageSession('ar', '/ar/admin')).rejects.toThrow('/ar/mfa?next=');
    expect(redirectMock).toHaveBeenCalledWith('/ar/mfa?next=%2Far%2Fadmin');
  });

  it('rethrows non-session AppErrors instead of redirecting', async () => {
    const error = AppError.internal('handler exploded');
    invokeMock.mockRejectedValueOnce(error);

    await expect(pageSession('ar', '/ar/dashboard')).rejects.toBe(error);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('rethrows unexpected non-App errors instead of redirecting', async () => {
    const error = new TypeError('invoke is not a function');
    invokeMock.mockRejectedValueOnce(error);

    await expect(pageSession('ar', '/ar/dashboard')).rejects.toBe(error);
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
