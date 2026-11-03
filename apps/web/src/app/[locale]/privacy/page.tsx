import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDictionary, isLocale } from '@/ui/i18n';
import { LegalDoc } from '@/ui/legal-doc';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.legal.privacy.title, description: dict.legal.privacy.intro };
}

/** Privacy policy — static, indexable, linked from the register form and footer. */
export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <LegalDoc locale={locale} kind="privacy" />;
}
