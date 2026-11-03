import { getDictionary, isLocale } from '@/ui/i18n';
import { AuthShell } from '@/ui/components/auth-shell';
import { ForgotPasswordForm } from '@/ui/components/password-forms';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.auth.forgotTitle, robots: { index: false, follow: false } };
}

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { locale: resolved, dict } = getDictionary(locale);

  return (
    <AuthShell locale={resolved} title={dict.auth.forgotTitle} subtitle={dict.auth.forgotSubtitle}>
      <ForgotPasswordForm locale={resolved} />
    </AuthShell>
  );
}
