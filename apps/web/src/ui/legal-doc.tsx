import Link from 'next/link';
import { getDictionary, type LocaleCode } from '@/ui/i18n';
import { PageMasthead } from '@/ui/components/page-masthead';

/**
 * Shared renderer for the legal content pages (terms of service, privacy
 * policy). The copy itself lives in the three dictionaries — this component
 * only lays it out. Server component: legal text must be indexable and
 * crawlable without JavaScript.
 */
export function LegalDoc({ locale, kind }: { locale: LocaleCode; kind: 'terms' | 'privacy' }) {
  const { dict } = getDictionary(locale);
  const doc = dict.legal[kind];
  const other = kind === 'terms' ? 'privacy' : 'terms';
  const otherDoc = dict.legal[other];
  const otherHref = `/${locale}/${other}`;

  return (
    <>
      <PageMasthead
        title={doc.title}
        subtitle={doc.intro}
        note={doc.updated}
        inner="mx-auto max-w-3xl px-4 py-10"
      />
      <div className="mx-auto max-w-3xl px-4 pt-6 pb-10">
        <nav aria-label={dict.meta.siteName} className="text-sm text-sand-500">
          <Link href={`/${locale}`} className="hover:text-brand-700">
            {dict.nav.home}
          </Link>
          <span aria-hidden className="mx-2">
            /
          </span>
          <span className="text-sand-700">{doc.title}</span>
        </nav>

        <div className="mt-8 space-y-7">
          {doc.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-semibold text-brand-800">{section.heading}</h2>
              <p className="mt-2 leading-relaxed text-sand-700">{section.body}</p>
            </section>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-sand-200 bg-sand-50 p-5 text-sm text-sand-600">
          <Link href={otherHref} className="font-medium text-brand-700 hover:text-brand-800">
            {otherDoc.title}
          </Link>
        </div>
      </div>
    </>
  );
}
