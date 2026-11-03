import { notFound, redirect } from 'next/navigation';
import { canTransition } from '@bladna/domain';
import { isAppError } from '@bladna/types';
import { Card } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { errorMessageFor } from '@/ui/api/client';
import { pageSession } from '@/server/page-session';
import { sponsorRoutes, SPONSORSHIP_TRANSITIONS } from '@/server/modules/sponsors';
import { csrRoutes, PROGRAM_TRANSITIONS } from '@/server/modules/csr';
import { publicList as listCampaigns } from '@/server/modules/campaigns';
import { invoke } from '@/server/ssr';
import type { AppRoute } from '@/server/router';
import type { Handler } from '@/server/http';
import { SponsorRegister } from '@/ui/components/sponsor-register';
import {
  SponsorConsole,
  type MemberRow,
  type OptionItem,
  type PageMeta,
  type ProgramAction,
  type ProgramRow,
  type SponsorProfileData,
  type SponsorTab,
  type SponsorshipAction,
  type SponsorshipRow,
} from '@/ui/components/sponsor-console';

export const dynamic = 'force-dynamic';

const LIST_LIMIT = 10;
const OPTIONS_LIMIT = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Local copy of the tab list — a client module's values are not readable here (RSC). */
const TABS: readonly SponsorTab[] = ['overview', 'profile', 'sponsorships', 'programs', 'members'];

const ROUTE_TABLES: AppRoute[][] = [sponsorRoutes, csrRoutes];

/** Look up a handler from a module route table so SSR can call it in-process. */
function requireHandler(method: string, path: string): Handler {
  const handler = ROUTE_TABLES.flatMap((table) => table).find(
    (route) => route.method === method && route.path === path,
  )?.handler;
  if (!handler) throw new Error(`Missing route handler for ${method} ${path}`);
  return handler;
}

interface ListEnvelope<T> {
  items: T[];
  meta: PageMeta;
}

interface SponsorDetailResult {
  sponsor: SponsorProfileData;
  access: 'workspace' | 'public';
}

/**
 * Prisma rows arrive with `Date`/`Decimal` instances (invoke skips the JSON
 * hop) — round-trip them so props crossing the RSC boundary are plain strings.
 */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// Action → target status mirrors of the server maps (the server still runs
// `assertTransition`; this only decides which buttons to render honestly).
const SPONSORSHIP_ACTIONS = ['ACTIVATE', 'COMPLETE', 'CANCEL'] as const;
const SPONSORSHIP_ACTION_TARGETS: Record<SponsorshipAction, SponsorshipRow['status']> = {
  ACTIVATE: 'ACTIVE',
  COMPLETE: 'COMPLETED',
  CANCEL: 'CANCELLED',
};

function allowedSponsorshipActions(status: SponsorshipRow['status']): SponsorshipAction[] {
  return SPONSORSHIP_ACTIONS.filter((action) =>
    canTransition(SPONSORSHIP_TRANSITIONS, status, SPONSORSHIP_ACTION_TARGETS[action]),
  );
}

const PROGRAM_ACTIONS = ['ACTIVATE', 'PAUSE', 'COMPLETE', 'ARCHIVE'] as const;
const PROGRAM_ACTION_TARGETS: Record<ProgramAction, ProgramRow['status']> = {
  ACTIVATE: 'ACTIVE',
  PAUSE: 'PAUSED',
  COMPLETE: 'COMPLETED',
  ARCHIVE: 'ARCHIVED',
};

function allowedProgramActions(status: ProgramRow['status']): ProgramAction[] {
  return PROGRAM_ACTIONS.filter((action) =>
    canTransition(PROGRAM_TRANSITIONS, status, PROGRAM_ACTION_TARGETS[action]),
  );
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return {
    title: dict.sponsorConsole.title,
    description: dict.sponsorConsole.subtitle,
    robots: { index: false, follow: false },
  };
}

export default async function SponsorPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string; id?: string; page?: string; registered?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const { dict } = getDictionary(locale);

  const tab: SponsorTab = (TABS as readonly string[]).includes(sp.tab ?? '')
    ? (sp.tab as SponsorTab)
    : 'overview';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  // The API has no "list my sponsors" endpoint, so the workspace id only ever
  // arrives as `?id=` (carried over from the registration response).
  const sponsorId = typeof sp.id === 'string' && UUID_PATTERN.test(sp.id) ? sp.id : '';

  const search = new URLSearchParams({ tab });
  if (sponsorId) search.set('id', sponsorId);
  if (page > 1) search.set('page', String(page));
  const pagePath = `/${locale}/sponsor?${search.toString()}`;
  const next = encodeURIComponent(pagePath);

  // The /auth/me gate runs first — dead sessions bounce before any fetch.
  await pageSession(locale, pagePath);

  // Dual-mode detail validates the workspace: `access: 'workspace'` comes back
  // only for a real sponsorMember row (or a platform grant); everyone else
  // degrades to the public view — or NOT_FOUND for an unknown id.
  let sponsor: SponsorProfileData | null = null;
  if (sponsorId) {
    try {
      const data = await invoke<SponsorDetailResult>(
        requireHandler('GET', '/sponsors/:sponsorId'),
        { path: `/sponsors/${sponsorId}`, locale, params: { sponsorId } },
      );
      if (data.access === 'workspace') sponsor = plain(data.sponsor);
    } catch (error) {
      if (isAppError(error) && (error.code === 'UNAUTHORIZED' || error.code === 'MFA_REQUIRED')) {
        redirect(
          error.code === 'UNAUTHORIZED'
            ? `/${locale}/login?next=${next}`
            : `/${locale}/mfa?next=${next}`,
        );
      }
      if (!isAppError(error)) throw error;
      // NOT_FOUND (or a bad id) falls through to the honest empty state.
    }
  }

  if (!sponsor) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <header className="space-y-1">
          <h1 className="text-3xl font-bold text-sand-900">{dict.sponsorConsole.title}</h1>
          <p className="text-sm text-sand-600">{dict.sponsorConsole.subtitle}</p>
        </header>
        <Card className="p-6">
          <h2 className="text-base font-semibold text-sand-900">
            {dict.sponsorConsole.noWorkspaces}
          </h2>
          <p className="mt-2 text-sm text-sand-600">{dict.sponsorConsole.noWorkspacesBody}</p>
        </Card>
        <SponsorRegister locale={locale} />
      </div>
    );
  }

  /** Auth failures still bounce; any other AppError degrades with its message. */
  async function degrade<T>(
    run: () => Promise<T>,
  ): Promise<{ value: T | null; message: string | null }> {
    try {
      return { value: await run(), message: null };
    } catch (error) {
      if (isAppError(error) && (error.code === 'UNAUTHORIZED' || error.code === 'MFA_REQUIRED')) {
        redirect(
          error.code === 'UNAUTHORIZED'
            ? `/${locale}/login?next=${next}`
            : `/${locale}/mfa?next=${next}`,
        );
      }
      if (!isAppError(error)) throw error;
      return {
        value: null,
        message: errorMessageFor(error, {
          errors: dict.errors,
          genericFallback: dict.errors.generic,
        }),
      };
    }
  }

  /**
   * SPONSOR_ADMIN probe: `GET …/members` is the only endpoint behind
   * `sponsor.manage`, so its success/failure is the honest `canManage` signal.
   */
  async function probeCanManage(): Promise<boolean> {
    try {
      await invoke(requireHandler('GET', '/sponsors/:sponsorId/members'), {
        path: `/sponsors/${sponsorId}/members`,
        locale,
        params: { sponsorId },
        query: { page: 1, limit: 1 },
      });
      return true;
    } catch (error) {
      if (isAppError(error) && (error.code === 'UNAUTHORIZED' || error.code === 'MFA_REQUIRED')) {
        redirect(
          error.code === 'UNAUTHORIZED'
            ? `/${locale}/login?next=${next}`
            : `/${locale}/mfa?next=${next}`,
        );
      }
      if (!isAppError(error)) throw error;
      return false;
    }
  }

  const fetchSponsorships = (p: number, limit: number) =>
    degrade(() =>
      invoke<ListEnvelope<Omit<SponsorshipRow, 'allowedActions'>>>(
        requireHandler('GET', '/sponsors/:sponsorId/sponsorships'),
        {
          path: `/sponsors/${sponsorId}/sponsorships`,
          locale,
          params: { sponsorId },
          query: { page: p, limit },
        },
      ),
    );

  const fetchPrograms = (p: number, limit: number) =>
    degrade(() =>
      invoke<ListEnvelope<Omit<ProgramRow, 'allowedActions'>>>(
        requireHandler('GET', '/sponsors/:sponsorId/programs'),
        {
          path: `/sponsors/${sponsorId}/programs`,
          locale,
          params: { sponsorId },
          query: { page: p, limit },
        },
      ),
    );

  const fetchMembers = (p: number, limit: number) =>
    degrade(() =>
      invoke<ListEnvelope<MemberRow>>(requireHandler('GET', '/sponsors/:sponsorId/members'), {
        path: `/sponsors/${sponsorId}/members`,
        locale,
        params: { sponsorId },
        query: { page: p, limit },
      }),
    );

  let canManage = false;
  let counts: { sponsorships: number; programs: number } | null = null;
  let sponsorshipsList: {
    items: SponsorshipRow[];
    meta: PageMeta;
    campaigns: OptionItem[];
    programs: OptionItem[];
  } | null = null;
  let programsList: { items: ProgramRow[]; meta: PageMeta } | null = null;
  let membersList: { items: MemberRow[]; meta: PageMeta } | null = null;
  let listError: string | null = null;
  const emptyMeta: PageMeta = { page, limit: LIST_LIMIT, total: 0, totalPages: 0 };

  if (tab === 'overview') {
    // No dedicated stats endpoint — the list envelopes carry the real totals.
    const [sponsorshipsRes, programsRes] = await Promise.all([
      fetchSponsorships(1, 1),
      fetchPrograms(1, 1),
    ]);
    counts = {
      sponsorships: sponsorshipsRes.value?.meta.total ?? 0,
      programs: programsRes.value?.meta.total ?? 0,
    };
    listError = sponsorshipsRes.message ?? programsRes.message;
  }

  if (tab === 'profile') {
    canManage = await probeCanManage();
  }

  if (tab === 'sponsorships') {
    canManage = await probeCanManage();
    const [listRes, campaignsRes, programOptionsRes] = await Promise.all([
      fetchSponsorships(page, LIST_LIMIT),
      degrade(() =>
        invoke<ListEnvelope<OptionItem>>(listCampaigns, {
          path: '/campaigns',
          locale,
          query: { page: 1, limit: OPTIONS_LIMIT },
        }),
      ),
      fetchPrograms(1, OPTIONS_LIMIT),
    ]);
    listError = listRes.message;
    const items = (listRes.value?.items ?? []).map((item) => ({
      ...item,
      allowedActions: allowedSponsorshipActions(item.status),
    }));
    sponsorshipsList = plain({
      items,
      meta: listRes.value?.meta ?? emptyMeta,
      // Empty option lists degrade the pickers to plain uuid inputs.
      campaigns: (campaignsRes.value?.items ?? []).map((item) => ({
        id: item.id,
        name: item.name,
      })),
      programs: (programOptionsRes.value?.items ?? []).map((item) => ({
        id: item.id,
        name: item.title,
      })),
    });
  }

  if (tab === 'programs') {
    canManage = await probeCanManage();
    const listRes = await fetchPrograms(page, LIST_LIMIT);
    listError = listRes.message;
    const items = (listRes.value?.items ?? []).map((item) => ({
      ...item,
      allowedActions: allowedProgramActions(item.status),
    }));
    programsList = plain({ items, meta: listRes.value?.meta ?? emptyMeta });
  }

  if (tab === 'members') {
    // The members list itself requires `sponsor.manage`, so its result doubles
    // as the admin probe: FORBIDDEN means a SPONSOR_MEMBER views a dead end.
    const listRes = await fetchMembers(page, LIST_LIMIT);
    listError = listRes.message;
    canManage = listRes.value !== null;
    membersList = plain({
      items: listRes.value?.items ?? [],
      meta: listRes.value?.meta ?? emptyMeta,
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold text-sand-900">{dict.sponsorConsole.title}</h1>
        <p className="text-sm text-sand-600">{dict.sponsorConsole.subtitle}</p>
      </header>
      <SponsorConsole
        locale={locale}
        sponsorId={sponsorId}
        activeTab={tab}
        registered={sp.registered === '1'}
        sponsor={sponsor}
        canManage={canManage}
        counts={counts}
        sponsorshipsList={sponsorshipsList}
        programsList={programsList}
        membersList={membersList}
        listError={listError}
      />
    </div>
  );
}
