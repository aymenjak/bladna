import { notFound, redirect } from 'next/navigation';
import { isAppError } from '@bladna/types';
import { getDictionary, isLocale } from '@/ui/i18n';
import { contactQuery } from '@/ui/messages-utils';
import { messagingRoutes } from '@/server/modules/messaging';
import { pageSession } from '@/server/page-session';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import { MessagesView, type ConversationsResult } from '@/ui/components/messages-view';

export const dynamic = 'force-dynamic';

const LIST_LIMIT = 20;

/** Look up a handler from the module route table so SSR can call it in-process. */
function handlerOf(method: string, path: string): Handler | null {
  return (
    messagingRoutes.find((route) => route.method === method && route.path === path)?.handler ?? null
  );
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.messages.title, robots: { index: false, follow: false } };
}

export default async function MessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { dict } = getDictionary(locale);

  // P23: contact entry points (a directory card's `?to=`, an initiative's or
  // organization's `?org=`) must survive this page's own sign-in/MFA bounce —
  // the params are re-validated into the path, so `?next=` only ever echoes
  // what the compose form accepts.
  const query = contactQuery(await searchParams);
  const pagePath = `/${locale}/messages${query ? `?${query}` : ''}`;

  const session = await pageSession(locale, pagePath);
  const next = encodeURIComponent(pagePath);

  const handler = handlerOf('GET', '/conversations');
  if (!handler) throw new Error('Missing route handler for GET /conversations');

  let conversations: ConversationsResult;
  try {
    conversations = await invoke<ConversationsResult>(handler, {
      path: '/conversations',
      locale,
      query: { page: 1, limit: LIST_LIMIT },
    });
  } catch (error) {
    if (isAppError(error) && error.code === 'UNAUTHORIZED') {
      redirect(`/${locale}/login?next=${next}`);
    }
    if (isAppError(error) && error.code === 'MFA_REQUIRED') redirect(`/${locale}/mfa?next=${next}`);
    throw error;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold text-sand-900">{dict.messages.title}</h1>
        <p className="text-sm text-sand-600">{dict.messages.subtitle}</p>
      </header>
      <MessagesView locale={locale} meId={session.user.id} initial={conversations} />
    </div>
  );
}
