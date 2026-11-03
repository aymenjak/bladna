import { notFound } from 'next/navigation';
import { getDictionary, isLocale } from '@/ui/i18n';
import { pageSession } from '@/server/page-session';
import { AcceptInvitationButton } from '@/ui/components/account-actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.invitations.title, robots: { index: false, follow: false } };
}

/**
 * Landing page for the invitation link emailed by `POST /orgs/:orgId/members/invite`
 * (`${publicAppUrl}/invitations/accept?token=…`). The token is one-time and
 * validated server-side on accept — expiry, email match and membership are all
 * enforced by the API, never by this page.
 */
export default async function AcceptInvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const { dict } = getDictionary(locale);

  const token = (sp.token ?? '').slice(0, 512);
  // Keep the token through the login/MFA bounce so the link still works after.
  const pagePath = `/${locale}/invitations/accept${
    token ? `?token=${encodeURIComponent(token)}` : ''
  }`;
  await pageSession(locale, pagePath);

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold text-sand-900">{dict.invitations.title}</h1>
        <p className="text-sm text-sand-600">{dict.invitations.subtitle}</p>
      </header>

      {token ? (
        <AcceptInvitationButton locale={locale} token={token} />
      ) : (
        <section className="rounded-xl border border-dashed border-sand-300 bg-white p-6">
          <h2 className="text-lg font-semibold text-sand-900">{dict.invitations.missingToken}</h2>
          <p className="mt-1 text-sm text-sand-600">{dict.invitations.missingTokenBody}</p>
        </section>
      )}
    </div>
  );
}
