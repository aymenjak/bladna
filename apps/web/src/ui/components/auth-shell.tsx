import Link from 'next/link';
import { getDictionary, type LocaleCode } from '@/ui/i18n';
import { PageMasthead } from '@/ui/components/page-masthead';

/**
 * Centered card shell for the auth flows (login, register, reset…).
 * Server component — the form itself is a client component passed as children.
 * P28: the title/subtitle moved up into the same dark page-masthead band every
 * public page opens with (mjeunesse.gov.dz silhouette), so the card now starts
 * straight at the form; the back-home link keeps its spot on the white side.
 */
export function AuthShell({
  locale,
  title,
  subtitle,
  children,
  footer,
}: {
  locale: LocaleCode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { dict } = getDictionary(locale);

  return (
    <>
      <PageMasthead title={title} subtitle={subtitle} inner="mx-auto max-w-md px-4 pt-10 pb-8" />
      <div className="mx-auto flex max-w-md flex-col px-4 pt-6 pb-10">
        {/* P30: the platform mark opens every auth flow — the only logo a
            visitor sees before the form (the header keeps its own copy). */}
        <img
          src="/logo.png"
          alt=""
          width={72}
          height={72}
          decoding="async"
          className="mx-auto mb-4 h-16 w-16"
        />
        <Link
          href={`/${locale}`}
          className="mb-8 self-center text-sm font-medium text-brand-700 hover:text-brand-800"
        >
          {dict.common.backHome}
        </Link>
        <div className="rounded-2xl border border-sand-200 bg-white p-8 shadow-sm">
          <div>{children}</div>
        </div>
        {footer ? <div className="mt-6 text-center text-sm text-sand-600">{footer}</div> : null}
      </div>
    </>
  );
}
