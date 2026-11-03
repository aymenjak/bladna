import { notFound, redirect } from 'next/navigation';
import { getDictionary, isLocale } from '@/ui/i18n';
import { isAdminSection } from '@/server/admin-access';
import { adminAccess } from './admin-shell';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return {
    title: dict.admin.title,
    robots: { index: false, follow: false },
  };
}

/**
 * Admin entry point (M7). The console itself lives on `/admin/[section]`
 * sub-routes so every section has one deep-linkable URL; this root only
 * resolves a target: a legacy `?tab=` naming a GRANTED section canonicalises
 * to it, anything else falls back to the first granted section. The redirect
 * is temporary (307) because the target depends on the caller's live grants —
 * never a permanent redirect that could outlive a role change. Anonymous and
 * MFA-challenged callers never reach it: `adminAccess` sends them to login
 * first, and callers with no sections (or no TOTP) get their notice card here.
 *
 * Delivery note: the app-wide `[locale]/loading.tsx` flushes the shell before
 * a page-level `redirect()` resolves, so a document request carries it as
 * Next's `__next-page-redirect` meta refresh inside a 200 (the digest still
 * records the `307` intent) — browsers follow it, and M6 pins such responses
 * `private, no-store` so the 200 can never be cached. Both forms are covered
 * by `tests/e2e/admin.spec.ts` and the M7 probe block.
 */
export default async function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { tab: tabParam } = await searchParams;

  const access = await adminAccess(locale, `/${locale}/admin`);
  if (!access.ok) return access.notice;

  const target =
    tabParam !== undefined && isAdminSection(tabParam) && access.sections.includes(tabParam)
      ? tabParam
      : access.sections[0];
  redirect(`/${locale}/admin/${target}`);
}
