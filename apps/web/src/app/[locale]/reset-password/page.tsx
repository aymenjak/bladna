import { notFound } from 'next/navigation';
import { getDictionary, isLocale } from '@/ui/i18n';
import { AuthShell } from '@/ui/components/auth-shell';
import { ResetPasswordForm } from '@/ui/components/password-forms';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.auth.resetTitle, robots: { index: false, follow: false } };
}

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  const { token } = await searchParams;
  if (!token) notFound();
  const { locale: resolved, dict } = getDictionary(locale);

  return (
    <AuthShell locale={resolved} title={dict.auth.resetTitle} subtitle={dict.auth.resetSubtitle}>
      <ResetPasswordForm locale={resolved} token={token} />
    </AuthShell>
  );
}
