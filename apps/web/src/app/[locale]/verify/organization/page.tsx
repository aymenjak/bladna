import type { Metadata } from 'next';
import Link from 'next/link';

import { notFound } from 'next/navigation';
import { getDictionary, isLocale } from '@/ui/i18n';
import { ChevronLeftIcon } from '@/ui/components/icons';
import { VerifyClient } from '../verify-client';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return {
    title: dict.verify.kinds.organization.title,
    description: dict.verify.kinds.organization.hint,
  };
}

export default async function VerifyOrganizationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { code } = await searchParams;
  const { dict } = getDictionary(locale);

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      {/* PageHeader (DESIGN.md §4) + a mirrored back link to the hub (P12). */}
      <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 rtl:tracking-normal">
        {dict.verify.title}
      </p>
      <h1 className="mt-2 text-3xl font-bold text-sand-900">
        {dict.verify.kinds.organization.title}
      </h1>
      <p className="mt-2 text-sand-600">{dict.verify.kinds.organization.hint}</p>
      <VerifyClient locale={locale} initialCode={code ?? ''} kind="organization" />
      <p className="mt-6 text-sm">
        <Link
          href={`/${locale}/verify`}
          className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:text-brand-800"
        >
          <ChevronLeftIcon className="size-4 rtl:rotate-180" />
          {dict.verify.allLink}
        </Link>
      </p>
    </div>
  );
}
