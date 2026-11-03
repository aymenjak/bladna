import { notFound, redirect } from 'next/navigation';
import { isAppError } from '@bladna/types';
import { getDictionary, isLocale } from '@/ui/i18n';
import { authRoutes } from '@/server/modules/auth';
import { volunteerRoutes } from '@/server/modules/volunteers';
import { pageSession } from '@/server/page-session';
import type { AppRoute } from '@/server/router';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import {
  ChangePasswordForm,
  PrivacyToggles,
  ProfileForm,
  SessionsPanel,
} from '@/ui/components/settings-forms';
import { TwoFactorPanel } from '@/ui/components/two-factor-panel';
import { NotificationMatrix, type PreferenceRow } from '@/ui/components/notification-matrix';

export const dynamic = 'force-dynamic';

const ROUTE_TABLES: AppRoute[][] = [authRoutes, volunteerRoutes];

/** Look up a handler from a module route table so SSR can call it in-process. */
function requireHandler(method: string, path: string): Handler {
  const handler = ROUTE_TABLES.flatMap((table) => table).find(
    (route) => route.method === method && route.path === path,
  )?.handler;
  if (!handler) throw new Error(`Missing route handler for ${method} ${path}`);
  return handler;
}

interface SessionsResult {
  items: Array<{
    id: string;
    current: boolean;
    ip: string | null;
    userAgent: string | null;
    lastUsedAt: string | Date;
    createdAt: string | Date;
    expiresAt: string | Date;
    mfaSatisfied: boolean;
  }>;
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface TwoFactorResult {
  enabled: boolean;
  satisfied: boolean;
}

interface PrivacyProfile {
  publicProfile: boolean;
  publicPhone: boolean;
  publicEmail: boolean;
  showWilaya: boolean;
  showHours: boolean;
  showCertificates: boolean;
}

interface NotificationPrefsResult {
  items: PreferenceRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.settings.title, robots: { index: false, follow: false } };
}

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { dict } = getDictionary(locale);

  const session = await pageSession(locale, `/${locale}/settings`);
  const next = encodeURIComponent(`/${locale}/settings`);

  // Core data — auth failures bounce (the session died mid-request), real
  // bugs throw, exactly like the dashboard's applications list.
  let sessions: SessionsResult;
  try {
    sessions = await invoke<SessionsResult>(requireHandler('GET', '/auth/sessions'), {
      path: '/auth/sessions',
      locale,
      query: { page: 1, limit: 10 },
    });
  } catch (error) {
    if (isAppError(error) && error.code === 'UNAUTHORIZED') {
      redirect(`/${locale}/login?next=${next}`);
    }
    if (isAppError(error) && error.code === 'MFA_REQUIRED') redirect(`/${locale}/mfa?next=${next}`);
    throw error;
  }

  const twoFactor = await invoke<TwoFactorResult>(
    requireHandler('GET', '/auth/two-factor/status'),
    {
      path: '/auth/two-factor/status',
      locale,
    },
  );

  // Volunteer-profile enrichment: org accounts (or anyone without a volunteer
  // profile) get FORBIDDEN/NOT_FOUND — degrade to hiding the privacy card.
  let privacy: PrivacyProfile | null = null;
  try {
    const data = await invoke<{ profile: PrivacyProfile }>(requireHandler('GET', '/me/profile'), {
      path: '/me/profile',
      locale,
    });
    privacy = data.profile;
  } catch (error) {
    if (!isAppError(error)) throw error;
  }

  // Notification preferences — guarded by volunteer.profile.read; any AppError
  // (FORBIDDEN for org-only accounts, MFA… ) degrades to hiding the panel
  // honestly, anything else is a real bug and throws.
  let notifications: PreferenceRow[] | null = null;
  try {
    const data = await invoke<NotificationPrefsResult>(
      requireHandler('GET', '/me/notification-preferences'),
      { path: '/me/notification-preferences', locale, query: { page: 1, limit: 100 } },
    );
    notifications = data.items;
  } catch (error) {
    if (!isAppError(error)) throw error;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold text-sand-900">{dict.settings.title}</h1>
        <p className="text-sm text-sand-600">{dict.settings.subtitle}</p>
      </header>

      <ProfileForm locale={locale} user={session.user} />
      <ChangePasswordForm locale={locale} />
      <TwoFactorPanel locale={locale} initialEnabled={twoFactor.enabled} />
      {notifications ? <NotificationMatrix locale={locale} initial={notifications} /> : null}
      <SessionsPanel locale={locale} initialItems={sessions.items} initialMeta={sessions.meta} />
      {privacy ? <PrivacyToggles locale={locale} initial={privacy} /> : null}
    </div>
  );
}
