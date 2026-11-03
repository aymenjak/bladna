import { getDictionary, isLocale } from '@/ui/i18n';
import { AuthShell } from '@/ui/components/auth-shell';
import { LoginFormSuspense } from '@/ui/components/login-form';
import { loadDemoAccess } from '@/server/lib/demo-access';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.auth.loginTitle };
}

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { locale: resolved, dict } = getDictionary(locale);
  // DEMO_MODE-only; returns null (and never throws) otherwise.
  const demo = await loadDemoAccess();

  return (
    <AuthShell locale={resolved} title={dict.auth.loginTitle} subtitle={dict.auth.loginSubtitle}>
      <LoginFormSuspense locale={resolved} demo={demo} />
    </AuthShell>
  );
}
