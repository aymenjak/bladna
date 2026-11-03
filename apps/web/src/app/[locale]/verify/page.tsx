import type { Metadata } from 'next';
import Link from 'next/link';

import { notFound } from 'next/navigation';
import { getDictionary, isLocale } from '@/ui/i18n';
import { ChevronRightIcon } from '@/ui/components/icons';
import { VerifyClient } from './verify-client';
import { PageMasthead } from '@/ui/components/page-masthead';

const KINDS = ['certificate', 'volunteer', 'organization'] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.verify.title, description: dict.verify.subtitle };
}

export default async function VerifyPage({
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
    <>
      <PageMasthead
        title={dict.verify.title}
        subtitle={dict.verify.subtitle}
        inner="mx-auto max-w-xl px-4 py-10"
      />
      <div className="mx-auto max-w-xl px-4 pt-6 pb-10">
        {/* The three deep-link kinds as explainer cards (P12): each states what
          it checks before you pick it — no account, no session either way. */}
        <nav aria-label={dict.verify.title} className="mt-6">
          <ul className="space-y-3">
            {KINDS.map((kind) => (
              <li key={kind}>
                <Link
                  href={`/${locale}/verify/${kind}`}
                  className="group flex items-center gap-3 rounded-xl border border-sand-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-sand-900 group-hover:text-brand-800">
                      {dict.verify.kinds[kind].title}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-sand-600">
                      {dict.verify.kinds[kind].hint}
                    </span>
                  </span>
                  <ChevronRightIcon
                    className="size-4 shrink-0 text-sand-400 group-hover:text-brand-700 rtl:rotate-180"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <VerifyClient locale={locale} initialCode={code ?? ''} />

        {/* How verification works (P12) + the FAQ article behind it. */}
        <section className="mt-8 rounded-xl border border-sand-200 bg-sand-50 p-5">
          <h2 className="text-sm font-semibold text-sand-900">{dict.verify.howTitle}</h2>
          <ol className="mt-3 space-y-2 text-sm leading-relaxed text-sand-700">
            {dict.verify.how.map((step, index) => (
              <li key={step} className="flex gap-2">
                <span className="shrink-0 font-semibold text-brand-700">{index + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm">
            <Link
              href={`/${locale}/help/faq`}
              className="font-semibold text-brand-700 hover:text-brand-800"
            >
              {dict.verify.faqLink}
            </Link>
          </p>
        </section>
      </div>
    </>
  );
}
