import { isAppError } from '@bladna/types';
import { redirect } from 'next/navigation';
import { me } from '@/server/modules/auth';
import { invoke } from '@/server/ssr';

/**
 * Session gate for authenticated pages (spec §49) — the `/auth/me` contract
 * every private page must run before rendering:
 *
 * 1. `UNAUTHORIZED` / `MFA_REQUIRED` → bounce to login with `?next=`.
 * 2. MFA enabled but not satisfied for this session → bounce to the MFA step
 *    (protected roles must re-prove MFA, §145).
 * 3. Everything else (real bugs) throws — never silently redirects.
 *
 * `invoke` forwards the caller's cookies, so `requireAuth` and the MFA gating
 * run server-side exactly as they do behind the API router.
 */
export interface MeUser {
  id: string;
  email: string;
  phone: string | null;
  firstName: string;
  lastName: string;
  dateOfBirth: string | Date | null;
  profileImage: string | null;
  preferredLanguage: 'ar' | 'fr' | 'en';
  roles: string[];
  status: string;
  emailVerified: boolean;
  createdAt: string | Date;
}

export interface MeSession {
  user: MeUser;
  mfa: { enabled: boolean; satisfied: boolean };
  mfaRequired: boolean;
}

export async function pageSession(locale: string, pagePath: string): Promise<MeSession> {
  const next = encodeURIComponent(pagePath);
  let session: MeSession;
  try {
    session = await invoke<MeSession>(me, { path: '/auth/me', locale });
  } catch (error) {
    if (isAppError(error) && (error.code === 'UNAUTHORIZED' || error.code === 'MFA_REQUIRED')) {
      redirect(`/${locale}/login?next=${next}`);
    }
    throw error;
  }
  if (session.mfaRequired) redirect(`/${locale}/mfa?next=${next}`);
  return session;
}
