import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDictionary, isLocale } from '@/ui/i18n';
import { PageMasthead } from '@/ui/components/page-masthead';
import { PHOTO_CREDITS } from '@/ui/photo-credits';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.legal.credits.title, description: dict.legal.credits.intro };
}

/**
 * Photo credits — the attribution the CC BY / CC BY-SA licences of the site
 * photos require (author, licence, source). Static and linked from the footer.
 */
export default async function CreditsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { dict } = getDictionary(locale);
  const copy = dict.legal.credits;

  return (
    <>
      <PageMasthead title={copy.title} subtitle={copy.intro} inner="mx-auto max-w-5xl px-4 py-10" />
      <div className="mx-auto max-w-5xl px-4 pt-6 pb-12">
        <nav aria-label={dict.meta.siteName} className="text-sm text-sand-500">
          <Link href={`/${locale}`} className="hover:text-brand-700">
            {dict.nav.home}
          </Link>
          <span aria-hidden className="mx-2">
            /
          </span>
          <span className="text-sand-700">{copy.title}</span>
        </nav>

        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PHOTO_CREDITS.map((credit) => (
            <li
              key={credit.file}
              className="overflow-hidden rounded-card border border-sand-200 bg-white shadow-sm"
            >
              <img
                src={`/photos/${credit.file}`}
                alt=""
                loading="lazy"
                className="aspect-[3/2] w-full object-cover"
              />
              <dl className="space-y-1 p-4 text-sm">
                <div className="flex gap-2">
                  <dt className="text-sand-500">{copy.author}:</dt>
                  <dd className="font-medium text-sand-900" dir="auto">
                    {credit.author}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-sand-500">{copy.license}:</dt>
                  <dd>
                    {credit.licenseUrl ? (
                      <a
                        href={credit.licenseUrl}
                        target="_blank"
                        rel="noopener noreferrer license"
                        className="text-brand-700 underline-offset-2 hover:underline"
                      >
                        {credit.license}
                      </a>
                    ) : (
                      credit.license
                    )}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-sand-500">{copy.source}:</dt>
                  <dd className="min-w-0">
                    <a
                      href={credit.source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-brand-700 underline-offset-2 hover:underline"
                      dir="ltr"
                    >
                      {credit.title}
                    </a>
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
