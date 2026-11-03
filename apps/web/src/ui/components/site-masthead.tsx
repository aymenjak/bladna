import type { ReactNode } from 'react';
import { getDictionary, type LocaleCode } from '@/ui/i18n';
import { ShieldCheckIcon } from '@/ui/components/icons';
import { AnnouncementBanner } from '@/ui/components/announcement-banner';
import { cmsRoutes } from '@/server/modules/cms';
import { invoke } from '@/server/ssr';
import type { Handler } from '@/server/http';

/**
 * P27 — the reference site's opening chrome (mjeunesse.gov.dz), moved from the
 * landing page into the locale layout so it rides EVERY route: the platform's
 * promise on dark ink (the locked heroBadge copy), then the pinned
 * announcement (P12) as the marquee ticker. Both sit above the sticky header,
 * so they scroll away exactly like the reference's top line.
 *
 * Server component: the announcement read is optional (a failing CMS lookup
 * degrades to "no ticker", it never blocks the page — the P12 contract).
 */

interface AnnouncementRow {
  id: string;
  titleAr: string;
  titleFr: string;
  titleEn: string;
  bodyAr: string;
  bodyFr: string;
  bodyEn: string;
}

interface HomeResult {
  announcement?: AnnouncementRow | null;
}

interface AnnouncementsResult {
  items: AnnouncementRow[];
}

/** Look up a CMS handler from the module route table for in-process SSR. */
function cmsHandlerOf(method: string, path: string): Handler | null {
  return cmsRoutes.find((route) => route.method === method && route.path === path)?.handler ?? null;
}

/** Pick the request locale's variant of a trilingual CMS row. */
function pick(locale: LocaleCode, ar: string, fr: string, en: string): string {
  return locale === 'ar' ? ar : locale === 'fr' ? fr : en;
}

async function fetchAnnouncement(locale: LocaleCode): Promise<AnnouncementRow | null> {
  // The pinned announcement (GET /home) wins; otherwise the latest active one.
  try {
    const homeHandler = cmsHandlerOf('GET', '/home');
    if (homeHandler) {
      const home = await invoke<HomeResult>(homeHandler, { path: '/home', locale });
      if (home.announcement) return home.announcement;
    }
  } catch {
    // Fall through to the list read below.
  }
  try {
    const listHandler = cmsHandlerOf('GET', '/announcements');
    if (listHandler) {
      const list = await invoke<AnnouncementsResult>(listHandler, {
        path: '/announcements',
        locale,
        query: { page: 1, limit: 1 },
      });
      return list.items[0] ?? null;
    }
  } catch {
    // No ticker rather than a broken page.
  }
  return null;
}

export async function SiteMasthead({ locale }: { locale: LocaleCode }): Promise<ReactNode> {
  const { dict } = getDictionary(locale);
  const announcement = await fetchAnnouncement(locale);

  return (
    <>
      {/* The reference's opening line — the platform's promise on dark ink. */}
      <div className="bg-sand-950 text-sand-300">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 text-sm">
          <ShieldCheckIcon className="size-4 shrink-0 text-clay-300" />
          <p className="font-medium">{dict.landing.heroBadge}</p>
        </div>
      </div>

      {/* The pinned announcement as the reference's marquee ticker: same
          dismissal, same localization, on every route. */}
      {announcement ? (
        <AnnouncementBanner
          variant="ticker"
          locale={locale}
          id={announcement.id}
          title={pick(locale, announcement.titleAr, announcement.titleFr, announcement.titleEn)}
          body={pick(locale, announcement.bodyAr, announcement.bodyFr, announcement.bodyEn)}
        />
      ) : null}
    </>
  );
}
