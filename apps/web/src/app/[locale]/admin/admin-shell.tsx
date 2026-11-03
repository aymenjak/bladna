import Link from 'next/link';
import type { ReactNode } from 'react';
import { SYSTEM_ROLES, type SystemRole } from '@bladna/types';
import { permissionsForSystemRoles } from '@bladna/domain';
import { Card } from '@bladna/ui';
import { getDictionary, type LocaleCode } from '@/ui/i18n';
import { pageSession } from '@/server/page-session';
import { adminSectionsFor, type AdminSectionId } from '@/server/admin-access';

/** Shared admin page header (root and every `/admin/[section]` route). */
export function AdminPageHeader({ locale }: { locale: LocaleCode }) {
  const { dict } = getDictionary(locale);
  return (
    <header className="space-y-1">
      <h1 className="text-3xl font-bold text-sand-900">{dict.admin.title}</h1>
      <p className="text-sm text-sand-600">{dict.admin.subtitle}</p>
    </header>
  );
}

/** Honest no-access card for callers whose roles grant no console section. */
export function AdminNoAccessCard({ locale }: { locale: LocaleCode }) {
  const { dict } = getDictionary(locale);
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <AdminPageHeader locale={locale} />
      <Card className="px-6 py-8 text-center">
        <p className="text-sm text-sand-600">{dict.admin.noAccess}</p>
        <Link
          href={`/${locale}/dashboard`}
          className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:text-brand-800"
        >
          {dict.nav.dashboard} →
        </Link>
      </Card>
    </div>
  );
}

/**
 * Staff without TOTP enrolled get an honest enable-2FA notice instead of a
 * console whose every fetch would fail with MFA_REQUIRED.
 */
export function AdminMfaNoticeCard({ locale }: { locale: LocaleCode }) {
  const { dict } = getDictionary(locale);
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <AdminPageHeader locale={locale} />
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-8 text-center">
        <p className="text-sm text-amber-900">{dict.admin.mfaNotice}</p>
        <Link
          href={`/${locale}/settings`}
          className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:text-brand-800"
        >
          {dict.nav.settings} →
        </Link>
      </div>
    </div>
  );
}

/**
 * Session + grants shared by `/admin` and `/admin/[section]`. `pageSession`
 * redirects anonymous (or MFA-challenged) callers to login; a caller with no
 * granted section gets the no-access notice, staff without TOTP get the
 * enable-2FA notice, and everyone else gets the section grants plus the
 * display-only permission list (every write re-checks its own permission
 * server-side).
 */
export async function adminAccess(
  locale: LocaleCode,
  pagePath: string,
): Promise<
  { ok: false; notice: ReactNode } | { ok: true; sections: AdminSectionId[]; perms: string[] }
> {
  const session = await pageSession(locale, pagePath);
  const sections = adminSectionsFor(session.user.roles);
  if (sections.length === 0) {
    return { ok: false, notice: <AdminNoAccessCard locale={locale} /> };
  }
  if (!session.mfa.enabled) {
    return { ok: false, notice: <AdminMfaNoticeCard locale={locale} /> };
  }
  const systemRoles = session.user.roles.filter((role): role is SystemRole =>
    (SYSTEM_ROLES as readonly string[]).includes(role),
  );
  const perms = Array.from(permissionsForSystemRoles(systemRoles));
  return { ok: true, sections, perms };
}
