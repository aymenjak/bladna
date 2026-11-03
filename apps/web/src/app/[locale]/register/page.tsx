import { getDictionary, isLocale } from '@/ui/i18n';
import { AuthShell } from '@/ui/components/auth-shell';
import { RegisterFormSuspense } from '@/ui/components/register-form';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.auth.registerTitle };
}

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ accountType?: string; next?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const { locale: resolved, dict } = getDictionary(locale);
  const defaultAccountType =
    sp.accountType === 'ORGANIZATION' ? ('ORGANIZATION' as const) : undefined;

  return (
    <AuthShell
      locale={resolved}
      title={dict.auth.registerTitle}
      subtitle={dict.auth.registerSubtitle}
    >
      <RegisterFormSuspense locale={resolved} defaultAccountType={defaultAccountType} />
    </AuthShell>
  );
}
