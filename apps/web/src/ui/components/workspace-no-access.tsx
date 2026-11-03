import Link from 'next/link';
import { Card } from '@bladna/ui';
import { getDictionary, type LocaleCode } from '@/ui/i18n';

interface WorkspaceNoAccessProps {
  locale: LocaleCode;
  /** Renders the "back to overview" link — set when the workspace shell already opened. */
  orgId?: string;
  /** Renders the whole page (title as the h1) — used by the layout gate, where no shell exists. */
  standalone?: boolean;
}

/**
 * P31 — the honest access state for the workspace: a member whose role lacks
 * this page's permission (or a signed-in viewer the layout gate turns away)
 * is told why they cannot open it and where to go instead. `FORBIDDEN` used
 * to be mapped to `notFound()`, which claimed the page did not exist while
 * the workspace tabs visibly linked to it — the reported live 404s.
 */
export function WorkspaceNoAccess({ locale, orgId, standalone = false }: WorkspaceNoAccessProps) {
  const { dict } = getDictionary(locale);
  const title = dict.workspace.noAccessTitle;

  const actions = (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-semibold">
      {orgId ? (
        <Link
          href={`/${locale}/workspace/${orgId}`}
          className="text-brand-700 hover:text-brand-800"
        >
          {dict.workspace.tabs.overview}
        </Link>
      ) : null}
      <Link href={`/${locale}/dashboard`} className="text-brand-700 hover:text-brand-800">
        {dict.nav.dashboard}
      </Link>
      {standalone ? (
        <Link href={`/${locale}`} className="text-brand-700 hover:text-brand-800">
          {dict.common.backHome}
        </Link>
      ) : null}
    </div>
  );

  if (!standalone) {
    // Inside the shell: the layout h1 already titles the page.
    return (
      <Card className="px-6 py-8 text-center">
        <p className="text-sm font-semibold text-sand-900">{title}</p>
        <p className="mt-2 text-sm text-sand-600">{dict.workspace.noAccessBody}</p>
        {actions}
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <h1 className="text-3xl font-bold text-sand-900">{title}</h1>
      <Card className="px-6 py-8 text-center">
        <p className="text-sm text-sand-600">{dict.workspace.noAccessBody}</p>
        {actions}
      </Card>
    </div>
  );
}
