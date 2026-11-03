import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAppError, type LocaleCode } from '@bladna/types';
import { Avatar, Card, EmptyState, buttonClasses } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { nameFor, type PlaceRef } from '@/ui/opportunity';
import { StatusBadge } from '@/ui/status';
import { listSkills } from '@/server/modules/taxonomies';
import { listWilayas } from '@/server/modules/locations';
import { volunteerRoutes } from '@/server/modules/volunteers';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import { PageMasthead } from '@/ui/components/page-masthead';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 12;
/** Skills rendered as chips before the "+N" overflow chip. */
const SKILL_CHIPS = 4;

/**
 * Public volunteer directory (P5) — the first consumer of the public
 * `GET /volunteers` endpoint. Rows are the owner-chosen public visibility:
 * `publicProfile` gates the list server-side, `showWilaya` gates location,
 * the API masks email unless `publicEmail` is on (the privacy footnote says
 * so out loud), and the phone number never travels through this contract.
 */

interface SkillOption {
  id: string;
  nameAr: string;
  nameFr: string;
  nameEn: string;
}

interface SkillRow {
  skillId: string;
  skill: SkillOption;
}

interface VolunteerItem {
  id: string;
  /** P23: the card's Message link — the owner's account id (?to= target). */
  userId: string;
  volunteerId: string;
  bio: string | null;
  verificationStatus: 'UNVERIFIED' | 'BASIC_VERIFIED' | 'IDENTITY_VERIFIED';
  wilaya: PlaceRef | null;
  city: PlaceRef | null;
  skills: SkillRow[];
  user: {
    firstName: string;
    lastName: string;
    profileImage: string | null;
    email: string;
  };
}

interface VolunteersResult {
  items: VolunteerItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface CatalogResult<T> {
  items: T[];
}

interface Filters {
  q: string;
  wilayaId: string;
  skill: string;
  verifiedOnly: boolean;
}

/** Preserve the active filters when moving between pages. */
function pageHref(locale: LocaleCode, page: number, filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.wilayaId) params.set('wilayaId', filters.wilayaId);
  if (filters.skill) params.set('skill', filters.skill);
  if (filters.verifiedOnly) params.set('verifiedOnly', 'true');
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return `/${locale}/volunteers${qs ? `?${qs}` : ''}`;
}

/** Look up a handler from the module route table so SSR can call it in-process. */
function handlerOf(method: string, path: string): Handler | null {
  return volunteerRoutes.find((r) => r.method === method && r.path === path)?.handler ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  // Public page: indexed on purpose (classified in private-noindex.test.ts).
  return { title: dict.directory.title, description: dict.directory.subtitle };
}

export default async function VolunteersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    q?: string;
    wilayaId?: string;
    skill?: string;
    verifiedOnly?: string;
    page?: string;
  }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const { dict } = getDictionary(locale);

  const q = (sp.q ?? '').slice(0, 120);
  const wilayaId = sp.wilayaId ?? '';
  const skill = sp.skill ?? '';
  const verifiedOnly = sp.verifiedOnly === 'true';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const filters: Filters = { q, wilayaId, skill, verifiedOnly };

  const directoryHandler = handlerOf('GET', '/volunteers');
  const [listed, wilayas, skills] = await Promise.all([
    directoryHandler
      ? invoke<VolunteersResult>(directoryHandler, {
          path: '/volunteers',
          locale,
          query: {
            q: q || undefined,
            wilayaId: wilayaId || undefined,
            skillIds: skill || undefined,
            verifiedOnly: verifiedOnly ? 'true' : undefined,
            page,
            limit: PAGE_SIZE,
          },
        }).catch((error: unknown) => {
          // Malformed filter values (injected uuids) degrade to an empty
          // result; anything else propagates.
          if (!isAppError(error) || error.code !== 'VALIDATION_ERROR') throw error;
          return null;
        })
      : Promise.resolve(null),
    invoke<CatalogResult<PlaceRef>>(listWilayas, {
      path: '/locations/wilayas',
      locale,
      query: { page: 1, limit: 100 },
    }),
    invoke<CatalogResult<SkillOption>>(listSkills, {
      path: '/taxonomies/skills',
      locale,
      query: { page: 1, limit: 200 },
    }),
  ]);

  const result: VolunteersResult = listed ?? {
    items: [],
    meta: { page, limit: PAGE_SIZE, total: 0, totalPages: 0 },
  };
  const { items, meta } = result;

  return (
    <>
      <PageMasthead
        title={dict.directory.title}
        subtitle={dict.directory.subtitle}
        note={dict.directory.privacyNote}
      />
      <div className="mx-auto max-w-6xl px-4 pt-6 pb-10">
        {/* Filters — plain GET form, works without JS */}
        <form
          method="get"
          className="mt-6 flex flex-wrap items-end gap-3"
          action={`/${locale}/volunteers`}
        >
          <div className="min-w-56 flex-1">
            <label htmlFor="q" className="block text-sm font-medium text-sand-700">
              {dict.common.search}
            </label>
            <input
              id="q"
              name="q"
              defaultValue={q}
              maxLength={120}
              className="mt-1 w-full h-10 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 placeholder:text-sand-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              placeholder={dict.common.search}
            />
          </div>
          <div>
            <label htmlFor="wilayaId" className="block text-sm font-medium text-sand-700">
              {dict.opportunity.filterWilaya}
            </label>
            <select
              id="wilayaId"
              name="wilayaId"
              defaultValue={wilayaId}
              className="mt-1 h-10 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="">{dict.common.all}</option>
              {wilayas.items.map((wilaya) => (
                <option key={wilaya.id} value={wilaya.id}>
                  {nameFor(wilaya, locale) ?? wilaya.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="skill" className="block text-sm font-medium text-sand-700">
              {dict.directory.filterSkill}
            </label>
            <select
              id="skill"
              name="skill"
              defaultValue={skill}
              className="mt-1 h-10 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="">{dict.common.all}</option>
              {skills.items.map((option) => (
                <option key={option.id} value={option.id}>
                  {nameFor(option, locale) ?? option.id}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-sand-700">
            <input
              type="checkbox"
              name="verifiedOnly"
              value="true"
              defaultChecked={verifiedOnly}
              className="size-4 rounded border-sand-300 text-brand-700 focus:ring-brand-600"
            />
            {dict.directory.verifiedOnly}
          </label>
          <button
            type="submit"
            className="rounded-lg border border-sand-200 bg-white inline-flex min-h-11 items-center px-4 text-sm font-semibold text-sand-900 hover:bg-sand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sand-900"
          >
            {dict.common.search}
          </button>
        </form>

        {/* Results */}
        {items.length === 0 ? (
          <EmptyState className="mt-12">
            {dict.directory.empty} {dict.directory.emptyBody}
          </EmptyState>
        ) : (
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const location = [nameFor(item.city, locale), nameFor(item.wilaya, locale)]
                .filter(
                  (value, index, all): value is string =>
                    Boolean(value) && all.indexOf(value) === index,
                )
                .join(' · ');
              const initials =
                `${item.user.firstName?.[0] ?? ''}${item.user.lastName?.[0] ?? ''}`.toUpperCase();
              const shown = item.skills.slice(0, SKILL_CHIPS);
              const extra = item.skills.length - shown.length;
              return (
                <Card as="li" key={item.id} className="flex h-full flex-col p-5">
                  <StatusBadge
                    status={item.verificationStatus}
                    label={
                      dict.directory.verificationStatuses[item.verificationStatus] ??
                      item.verificationStatus
                    }
                    className="self-start"
                  />
                  <div className="mt-3 flex items-center gap-3">
                    {/* P25: the photo the profile page shows, right here on the
                      card — the initials stay as the fallback when the owner
                      never uploaded one. */}
                    <Avatar aria-hidden src={item.user.profileImage ?? undefined}>
                      {initials || '?'}
                    </Avatar>
                    <div className="min-w-0">
                      {/* P25: the card's click-through into the public profile. */}
                      <h2 className="truncate text-base font-semibold leading-snug text-sand-900">
                        <Link
                          href={`/${locale}/volunteers/${item.id}`}
                          className="underline-offset-4 hover:text-brand-700 hover:underline"
                        >
                          {[item.user.firstName, item.user.lastName].filter(Boolean).join(' ')}
                        </Link>
                      </h2>
                      <p className="truncate text-xs text-sand-500">
                        {item.volunteerId}
                        {location ? ` · ${location}` : ''}
                      </p>
                    </div>
                  </div>
                  {item.bio ? (
                    <p className="mt-3 line-clamp-3 text-sm text-sand-600">{item.bio}</p>
                  ) : null}
                  {item.skills.length > 0 ? (
                    <ul className="mt-3 flex flex-wrap gap-2" aria-label={dict.common.skills}>
                      {shown.map((row) => (
                        <li
                          key={row.skillId}
                          className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-medium text-sand-700"
                        >
                          {nameFor(row.skill, locale) ?? row.skillId}
                        </li>
                      ))}
                      {extra > 0 ? (
                        <li className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-medium text-sand-700">
                          +{extra}
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-sand-100 pt-3 text-xs text-sand-500">
                    <span>
                      {dict.directory.emailLabel}: {item.user.email}
                    </span>
                    {/* P23: contact before applying — the link carries the owner's
                      id into the compose prefill (?to=), and the sign-in bounce
                      keeps the value for anonymous visitors (Report pattern). */}
                    <Link
                      href={`/${locale}/messages?to=${item.userId}`}
                      className={buttonClasses({ variant: 'outline', size: 'sm' })}
                    >
                      {dict.common.message}
                    </Link>
                  </div>
                </Card>
              );
            })}
          </ul>
        )}

        {/* Pagination */}
        {meta.totalPages > 1 ? (
          <nav
            className="mt-10 flex items-center justify-center gap-4 text-sm"
            aria-label={dict.common.page}
          >
            {meta.page > 1 ? (
              <a
                href={pageHref(locale, meta.page - 1, filters)}
                className="rounded-lg border border-sand-200 bg-white inline-flex min-h-11 items-center px-4 font-medium text-sand-700 hover:bg-sand-100"
              >
                {dict.common.previous}
              </a>
            ) : (
              <span className="rounded-lg border border-sand-100 inline-flex min-h-11 items-center px-4 text-sand-400">
                {dict.common.previous}
              </span>
            )}
            <span className="text-sand-600">
              {dict.common.page} {meta.page} {dict.common.of} {meta.totalPages} · {meta.total}
            </span>
            {meta.page < meta.totalPages ? (
              <a
                href={pageHref(locale, meta.page + 1, filters)}
                className="rounded-lg border border-sand-200 bg-white inline-flex min-h-11 items-center px-4 font-medium text-sand-700 hover:bg-sand-100"
              >
                {dict.common.next}
              </a>
            ) : (
              <span className="rounded-lg border border-sand-100 inline-flex min-h-11 items-center px-4 text-sand-400">
                {dict.common.next}
              </span>
            )}
          </nav>
        ) : null}
      </div>
    </>
  );
}
