import { Suspense } from 'react';
import { getDictionary, isLocale } from '@/ui/i18n';
import { AuthShell } from '@/ui/components/auth-shell';
import { AuthFormSkeleton } from '@/ui/components/auth-form-skeleton';
import { MfaChallenge } from '@/ui/components/mfa-challenge';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.auth.mfaTitle, robots: { index: false, follow: false } };
}

export default async function MfaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { locale: resolved, dict } = getDictionary(locale);

  return (
    <AuthShell locale={resolved} title={dict.auth.mfaTitle} subtitle={dict.auth.mfaSubtitle}>
      <Suspense fallback={<AuthFormSkeleton label={dict.common.loading} />}>
        <MfaChallenge locale={resolved} />
      </Suspense>
    </AuthShell>
  );
}
