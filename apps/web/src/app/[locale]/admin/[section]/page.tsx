import { notFound, redirect } from 'next/navigation';
import { getDictionary, isLocale } from '@/ui/i18n';
import { isAdminSection } from '@/server/admin-access';
import { AdminConsole } from '@/ui/admin-console';
import { AdminPageHeader, adminAccess } from '../admin-shell';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; section: string }>;
}) {
  const { locale, section } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return {
    title: isAdminSection(section) ? dict.admin.tabs[section] : dict.admin.title,
    robots: { index: false, follow: false },
  };
}

/**
 * One admin section per URL (M7): the `[section]` param must name a section
 * id the caller's roles actually grant — an unknown id and a real-but-ungranted
 * id both canonicalise to the first granted section (307: grants are live, so
 * the target must never be cached as permanent), and the ungranted case does
 * NOT 404 because a 404 would confirm the section exists. Session, TOTP and
 * no-access notices come from the shared shell; the grant is display-only —
 * every endpoint re-checks its own permission server-side. Delivery of the
 * redirect matches `../page.tsx` (streamed meta refresh inside a 200).
 */
export default async function AdminSectionPage({
  params,
}: {
  params: Promise<{ locale: string; section: string }>;
}) {
  const { locale, section } = await params;
  if (!isLocale(locale)) notFound();

  const access = await adminAccess(locale, `/${locale}/admin/${section}`);
  if (!access.ok) return access.notice;

  const target =
    isAdminSection(section) && access.sections.includes(section) ? section : access.sections[0];
  if (target !== section) redirect(`/${locale}/admin/${target}`);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <AdminPageHeader locale={locale} />
      <AdminConsole
        locale={locale}
        section={target}
        sections={access.sections}
        perms={access.perms}
      />
    </div>
  );
}
