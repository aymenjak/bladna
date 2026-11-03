import Link from 'next/link';
import { notFound } from 'next/navigation';

import { isAppError, type AvailabilitySlot, type LanguageLevel } from '@bladna/types';
import { Avatar, Card, buttonClasses } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { formatDate, formatNumber } from '@/ui/format';
import { nameFor, type PlaceRef } from '@/ui/opportunity';
import { StatusBadge } from '@/ui/status';
import { ChevronLeftIcon } from '@/ui/components/icons';
import { PageMasthead } from '@/ui/components/page-masthead';
import { volunteerRoutes } from '@/server/modules/volunteers';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';

export const dynamic = 'force-dynamic';

/**
 * Public volunteer profile (P25) — the click-through the directory card
 * gained: photo, identity, skillset and the achievements behind an opt-in
 * profile. Every withheld section (hours / certificates) says so out loud
 * instead of rendering a fake 0, and the same 404 covers "unknown id" and
 * "profile opted out of publicity" — the page never confirms a private
 * profile exists. Public: indexed on purpose (classified in
 * private-noindex.test.ts); profile URLs stay out of the sitemap because the
 * directory is the discovery surface.
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

interface LanguageRow {
  languageId: string;
  level: LanguageLevel;
  language: SkillOption;
}

interface InterestRow {
  interestId: string;
  interest: SkillOption;
}

interface CertificateRow {
  number: string;
  title: string;
  organization: string | null;
  hours: number;
  issuedAt: string;
}

type ActivityStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

interface ParticipationRow {
  id: string;
  title: string;
  status: ActivityStatus;
  startedAt: string;
  endedAt: string | null;
  organization: string | null;
  opportunity: { slug: string; titleAr: string; titleFr: string; titleEn: string } | null;
  /** Null when the owner set `showHours=false` (spec §30). */
  verifiedHours: number | null;
}

interface ProfilePayload {
  profile: {
    id: string;
    userId: string;
    volunteerId: string;
    bio: string | null;
    verificationStatus: 'UNVERIFIED' | 'BASIC_VERIFIED' | 'IDENTITY_VERIFIED';
    availability: AvailabilitySlot[];
    memberSince: string;
    wilaya: PlaceRef | null;
    city: PlaceRef | null;
    email: string;
    user: { firstName: string; lastName: string; profileImage: string | null };
  };
  skills: SkillRow[];
  languages: LanguageRow[];
  interests: InterestRow[];
  achievements: {
    /** Null = withheld by the owner (spec §30), never an unqueried 0. */
    verifiedHours: number | null;
    /** Null = withheld; otherwise the newest VALID rows (capped). */
    certificates: CertificateRow[] | null;
    certificatesTotal: number | null;
    participations: ParticipationRow[];
    participationsTotal: number;
  };
}

/** Look up a handler from the module route table so SSR can call it in-process. */
function handlerOf(method: string, path: string): Handler | null {
  return volunteerRoutes.find((r) => r.method === method && r.path === path)?.handler ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const resolved = isLocale(locale) ? locale : undefined;
  try {
    const handler = handlerOf('GET', '/volunteers/:id');
    if (!handler) throw new Error('profile handler missing');
    const data = await invoke<ProfilePayload>(handler, {
      path: `/volunteers/${id}`,
      params: { id },
      locale,
      withCookies: false,
    });
    const name = [data.profile.user.firstName, data.profile.user.lastName]
      .filter(Boolean)
      .join(' ');
    if (name) {
      return { title: name, description: data.profile.bio ?? undefined };
    }
  } catch {
    // Unknown/withheld/malformed ids fall through to the generic title; the
    // page itself is what renders the not-found state.
  }
  const { dict } = getDictionary(resolved);
  return { title: dict.directory.title, description: dict.directory.subtitle };
}

export default async function VolunteerProfilePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const { dict } = getDictionary(locale);

  const handler = handlerOf('GET', '/volunteers/:id');
  if (!handler) notFound();

  let data: ProfilePayload;
  try {
    data = await invoke<ProfilePayload>(handler, {
      path: `/volunteers/${id}`,
      params: { id },
      locale,
      withCookies: false,
    });
  } catch (error) {
    // Unknown id, a withheld profile (the contract answers both with the
    // same 404) and a malformed uuid all land on the not-found page.
    if (isAppError(error) && (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR')) {
      notFound();
    }
    throw error;
  }

  const { profile, skills, languages, interests, achievements } = data;
  const name = [profile.user.firstName, profile.user.lastName].filter(Boolean).join(' ');
  const initials =
    `${profile.user.firstName?.[0] ?? ''}${profile.user.lastName?.[0] ?? ''}`.toUpperCase();
  const location = [nameFor(profile.city, locale), nameFor(profile.wilaya, locale)]
    .filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index)
    .join(' · ');
  const hasSkillset = skills.length > 0 || languages.length > 0 || interests.length > 0;

  return (
    <>
      {/* P28 — the identity header rides the dark page-masthead band, the
          same silhouette every hub opens with: back link → avatar → name. */}
      <PageMasthead inner="mx-auto max-w-4xl px-4 py-10">
        {/* Nav path */}
        <p>
          <Link
            href={`/${locale}/volunteers`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-200 hover:text-white"
          >
            <ChevronLeftIcon className="size-4 rtl:rotate-180" />
            {dict.directory.profileBack}
          </Link>
        </p>

        {/* Identity header — photo, name, verification, code, location */}
        <div className="mt-4 flex flex-wrap items-start gap-4">
          <Avatar
            className="size-16 text-xl"
            aria-hidden
            src={profile.user.profileImage ?? undefined}
          >
            {initials || '?'}
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-3xl font-bold">{name}</h1>
              <StatusBadge
                status={profile.verificationStatus}
                label={
                  dict.directory.verificationStatuses[profile.verificationStatus] ??
                  profile.verificationStatus
                }
              />
            </div>
            <p className="mt-1 text-sm text-brand-200">
              {profile.volunteerId}
              {location ? ` · ${location}` : ''}
            </p>
            <p className="mt-1 text-xs text-brand-200">
              {dict.directory.profileMemberSince} {formatDate(profile.memberSince, locale)}
            </p>
            {profile.availability.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {profile.availability.map((slot) => (
                  <li
                    key={slot}
                    className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-medium text-sand-700"
                  >
                    {dict.directory.availabilitySlots[slot]}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-2">
            {/* P23 chain: the same ?to= deep link the directory card uses —
                anonymous visitors keep the target through the login bounce. */}
            <Link
              href={`/${locale}/messages?to=${profile.userId}`}
              className={buttonClasses({ variant: 'outline', size: 'sm' })}
            >
              {dict.common.message}
            </Link>
            <span className="text-xs text-brand-200">
              {dict.directory.emailLabel}: {profile.email}
            </span>
          </div>
        </div>
      </PageMasthead>

      <div className="mx-auto max-w-4xl px-4 pb-10">
        {/* Achievements — honest totals, then the lists behind them */}
        <Card className="mt-6 p-6">
          <h2 className="text-lg font-semibold text-sand-900">{dict.profile.achievementsTitle}</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-sand-50 px-3 py-3 text-center">
              <dt className="text-xs text-sand-600">{dict.profile.verifiedHours}</dt>
              <dd className="mt-1 text-xl font-bold text-sand-900">
                {achievements.verifiedHours !== null
                  ? formatNumber(achievements.verifiedHours, locale)
                  : '—'}
              </dd>
            </div>
            <div className="rounded-lg bg-sand-50 px-3 py-3 text-center">
              <dt className="text-xs text-sand-600">{dict.profile.certificatesTitle}</dt>
              <dd className="mt-1 text-xl font-bold text-sand-900">
                {achievements.certificatesTotal !== null
                  ? formatNumber(achievements.certificatesTotal, locale)
                  : '—'}
              </dd>
            </div>
            <div className="rounded-lg bg-sand-50 px-3 py-3 text-center">
              <dt className="text-xs text-sand-600">{dict.profile.experienceTitle}</dt>
              <dd className="mt-1 text-xl font-bold text-sand-900">
                {formatNumber(achievements.participationsTotal, locale)}
              </dd>
            </div>
          </dl>
          {/* Withheld sections say so out loud — never a fake 0. */}
          {achievements.verifiedHours === null ? (
            <p className="mt-3 text-xs text-sand-500">{dict.directory.profileHoursHidden}</p>
          ) : null}
          {achievements.certificatesTotal === null ? (
            <p className="mt-3 text-xs text-sand-500">{dict.directory.profileCertsHidden}</p>
          ) : null}

          {/* Certificate list — every row links to credential-keyed
            verification, which never depends on a privacy flag. */}
          {achievements.certificates ? (
            achievements.certificates.length === 0 ? (
              <p className="mt-4 text-sm text-sand-500">{dict.profile.certificatesEmpty}</p>
            ) : (
              <ul className="mt-4 divide-y divide-sand-100 rounded-lg border border-sand-200">
                {achievements.certificates.map((row) => (
                  <li
                    key={row.number}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <a
                        href={`/${locale}/verify/certificate?code=${encodeURIComponent(row.number)}`}
                        className="font-medium text-brand-700 hover:text-brand-800"
                      >
                        {row.title}
                      </a>
                      <p className="text-xs text-sand-500">
                        {row.number}
                        {row.organization ? ` · ${row.organization}` : ''} · {dict.common.hours}:{' '}
                        {formatNumber(row.hours, locale)} · {formatDate(row.issuedAt, locale)}
                      </p>
                    </div>
                    <StatusBadge status="VALID" label={dict.profile.certificateStatuses.VALID} />
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </Card>

        {/* Participation timeline — titles, organizations, dates; the per-row
          hour count follows the same showHours gate as the total. */}
        <Card className="mt-6 p-6">
          <h2 className="text-lg font-semibold text-sand-900">{dict.profile.experienceTitle}</h2>
          {achievements.participations.length === 0 ? (
            <p className="mt-3 text-sm text-sand-500">{dict.profile.experienceEmpty}</p>
          ) : (
            <ul className="mt-4 divide-y divide-sand-100 rounded-lg border border-sand-200">
              {achievements.participations.map((row) => (
                <li key={row.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {row.opportunity ? (
                      <a
                        href={`/${locale}/opportunities/${row.opportunity.slug}`}
                        className="text-sm font-medium text-brand-700 hover:text-brand-800"
                      >
                        {row.title}
                      </a>
                    ) : (
                      <span className="text-sm font-medium text-sand-900">{row.title}</span>
                    )}
                    {row.organization ? (
                      <span className="text-xs text-sand-500">{row.organization}</span>
                    ) : null}
                    <StatusBadge
                      className="ms-auto"
                      status={row.status}
                      label={dict.profile.activityStatuses[row.status]}
                    />
                  </div>
                  <p className="mt-1 text-xs text-sand-500">
                    {formatDate(row.startedAt, locale)}
                    {row.endedAt ? ` – ${formatDate(row.endedAt, locale)}` : ''}
                    {row.verifiedHours !== null && row.verifiedHours > 0
                      ? ` · ${dict.common.hours}: ${formatNumber(row.verifiedHours, locale)}`
                      : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* About */}
        {profile.bio ? (
          <Card className="mt-6 p-6">
            <h2 className="text-lg font-semibold text-sand-900">{dict.directory.profileAbout}</h2>
            <p dir="auto" className="mt-3 text-start text-sm text-sand-600">
              {profile.bio}
            </p>
          </Card>
        ) : null}

        {/* Skillset — skills, languages (with levels) and interests */}
        {hasSkillset ? (
          <Card className="mt-6 p-6">
            <div className="space-y-4">
              {skills.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-sand-700">
                    {dict.profile.skillsGroup}
                  </h3>
                  <ul className="flex flex-wrap gap-2">
                    {skills.map((row) => (
                      <li
                        key={row.skillId}
                        className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-medium text-sand-700"
                      >
                        {nameFor(row.skill, locale) ?? row.skillId}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {languages.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-sand-700">
                    {dict.profile.languagesGroup}
                  </h3>
                  <ul className="flex flex-wrap gap-2">
                    {languages.map((row) => (
                      <li
                        key={row.languageId}
                        className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-medium text-sand-700"
                      >
                        {nameFor(row.language, locale) ?? row.languageId} ·{' '}
                        {dict.profile.levels[row.level]}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {interests.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-sand-700">
                    {dict.profile.interestsGroup}
                  </h3>
                  <ul className="flex flex-wrap gap-2">
                    {interests.map((row) => (
                      <li
                        key={row.interestId}
                        className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-medium text-sand-700"
                      >
                        {nameFor(row.interest, locale) ?? row.interestId}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </Card>
        ) : null}

        {/* Privacy footnote — the same honesty the directory states. */}
        <p className="mt-8 text-xs text-sand-500">{dict.directory.profilePrivacyNote}</p>
      </div>
    </>
  );
}
