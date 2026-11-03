import { notFound } from 'next/navigation';
import { Card } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { pageSession } from '@/server/page-session';
import { CheckInActions } from '@/ui/components/check-in-actions';

export const dynamic = 'force-dynamic';

interface CheckInSearchParams {
  token?: string;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.checkin.title, robots: { index: false, follow: false } };
}

/**
 * QR check-in landing page.
 *
 * The session QR encodes this page's own landing URL (`?token=…`), so a phone
 * camera scan opens it directly; the token itself is still a signed blob that
 * `POST /attendance/check-in` validates server-side. That endpoint requires an
 * authenticated volunteer, so the session gate runs first and carries `?token=`
 * through the login/MFA bounce (a scanned link must survive signing in).
 */
export default async function CheckInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<CheckInSearchParams>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const { dict } = getDictionary(locale);

  const token = (sp.token ?? '').trim();
  // Keep the token through the login/MFA bounce so a scanned link still works.
  await pageSession(
    locale,
    `/${locale}/check-in${token ? `?token=${encodeURIComponent(token)}` : ''}`,
  );

  if (!token) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <Card className="p-6">
          <h1 className="text-3xl font-bold text-sand-900">{dict.checkin.missingToken}</h1>
          <p className="mt-2 text-sm text-sand-600">{dict.checkin.missingTokenBody}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Card className="p-6">
        <h1 className="text-3xl font-bold text-sand-900">{dict.checkin.title}</h1>
        <p className="mt-2 text-sm text-sand-600">{dict.checkin.subtitle}</p>
        <div className="mt-5">
          <CheckInActions locale={locale} token={token} />
        </div>
      </Card>
    </div>
  );
}
