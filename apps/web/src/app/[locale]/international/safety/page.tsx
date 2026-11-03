import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, Card, buttonClasses } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';

/**
 * BLADNA International safety center (§56) — fully static content from
 * `international.safety.*`, in spec order, followed by the disclaimer and a
 * CTA to the platform report form (`/{locale}/safety`, the route every report
 * on the platform goes through). No API calls.
 */

const SECTION_ORDER = [
  'scams',
  'fake',
  'documents',
  'payments',
  'travel',
  'emergency',
  'verifySource',
  'report',
] as const;

type SafetySectionKey = (typeof SECTION_ORDER)[number];

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.international.safetyTitle, description: dict.international.safetySubtitle };
}

export default async function InternationalSafetyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { dict } = getDictionary(locale);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold text-sand-900">{dict.international.safetyTitle}</h1>
        <p className="text-sm text-sand-600">{dict.international.safetySubtitle}</p>
      </header>

      {SECTION_ORDER.map((key: SafetySectionKey) => {
        const section = dict.international.safety[key];
        const isReport = key === 'report';
        return (
          <Card key={key} className="p-6">
            <h2 className="text-lg font-semibold text-sand-900">{section.title}</h2>
            <p className="mt-2 whitespace-pre-line leading-relaxed text-sand-700">{section.body}</p>
            {isReport ? (
              <Link href={`/${locale}/safety`} className={buttonClasses({ className: 'mt-4' })}>
                {dict.safety.reportTitle}
              </Link>
            ) : null}
          </Card>
        );
      })}

      {/* Disclaimer — honest limits of the platform, rendered verbatim. */}
      <Alert tone="warning" role="note" className="font-medium">
        {dict.international.safetyDisclaimer}
      </Alert>
    </div>
  );
}
