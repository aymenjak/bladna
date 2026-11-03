'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import type { LocaleCode } from '@bladna/types';
import type { Dictionary } from '@/ui/i18n';
import { formatNumber } from '@/ui/format';
import {
  ArrowRightIcon,
  AwardIcon,
  BuildingIcon,
  CheckIcon,
  ClockIcon,
  QrCodeIcon,
  SearchIcon,
  ShieldCheckIcon,
  UserRoundIcon,
  UsersIcon,
} from '@/ui/components/icons';

type StartHereCopy = Dictionary['landing']['startHere'];
type RoleKey = StartHereCopy['roles'][number]['key'];

/** One icon per step, in the same order as each role's `steps` copy. */
const STEP_ICONS: Record<RoleKey, Array<typeof CheckIcon>> = {
  volunteer: [UserRoundIcon, SearchIcon, QrCodeIcon, AwardIcon],
  organization: [BuildingIcon, ShieldCheckIcon, UsersIcon, ClockIcon],
  verifier: [QrCodeIcon, SearchIcon, ShieldCheckIcon, CheckIcon],
};

const ROLE_ICONS: Record<RoleKey, typeof CheckIcon> = {
  volunteer: UserRoundIcon,
  organization: BuildingIcon,
  verifier: ShieldCheckIcon,
};

const STEP_MS = 2600;

/**
 * "Start here" infographic — the first thing under the hero. A visitor picks
 * who they are and sees their path as four illustrated steps, with one live
 * figure (from persisted rows) and one action. The highlighted step advances
 * on its own; hovering/focusing pauses it and reduced-motion users get the
 * static diagram with every step fully drawn.
 */
export function StartHere({
  copy,
  locale,
  liveCounts,
}: {
  copy: StartHereCopy;
  locale: LocaleCode;
  liveCounts: Record<RoleKey, number>;
}) {
  const [roleIndex, setRoleIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [animate, setAnimate] = useState(false);
  const baseId = useId();

  const role = copy.roles[roleIndex];
  const stepCount = role.steps.length;

  useEffect(() => {
    setAnimate(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  useEffect(() => {
    if (!animate || paused) return;
    const timer = window.setInterval(() => setStep((s) => (s + 1) % stepCount), STEP_MS);
    return () => window.clearInterval(timer);
  }, [animate, paused, stepCount, roleIndex]);

  const selectRole = (index: number): void => {
    setRoleIndex(index);
    setStep(0);
  };

  const icons = STEP_ICONS[role.key];

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        role="tablist"
        aria-label={copy.rolesLabel}
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        onKeyDown={(event) => {
          const dir = document.documentElement.dir === 'rtl' ? -1 : 1;
          let next = -1;
          if (event.key === 'ArrowRight') next = roleIndex + dir;
          if (event.key === 'ArrowLeft') next = roleIndex - dir;
          if (next === -1 && event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
          event.preventDefault();
          const wrapped = (next + copy.roles.length) % copy.roles.length;
          selectRole(wrapped);
          document.getElementById(`${baseId}-tab-${wrapped}`)?.focus();
        }}
      >
        {copy.roles.map((r, i) => {
          const RoleIcon = ROLE_ICONS[r.key];
          const selected = i === roleIndex;
          return (
            <button
              key={r.key}
              id={`${baseId}-tab-${i}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectRole(i)}
              className={`flex items-center gap-3 rounded-card border p-4 text-start transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
                selected
                  ? 'border-brand-700 bg-brand-800 text-white shadow-lg'
                  : 'border-brand-100 bg-white text-sand-900 hover:border-brand-300 hover:bg-brand-50'
              }`}
            >
              <span
                className={`grid size-11 shrink-0 place-items-center rounded-full ${
                  selected ? 'bg-white/15' : 'bg-brand-50'
                }`}
              >
                <RoleIcon className={`size-6 ${selected ? 'text-white' : 'text-brand-700'}`} />
              </span>
              <span>
                <span className="block text-base font-bold">{r.label}</span>
                <span className={`block text-sm ${selected ? 'text-brand-100' : 'text-sand-600'}`}>
                  {r.tagline}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${roleIndex}`}
        className="mt-6 rounded-card border border-brand-100 bg-white p-5 shadow-sm md:p-8"
      >
        <ol className="relative grid grid-cols-1 gap-6 md:grid-cols-4 md:gap-4">
          {/* Progress rail behind the step nodes (desktop): fills up to the
              highlighted step so the path reads as one journey. */}
          <span
            aria-hidden
            className="absolute inset-x-[12.5%] top-8 hidden h-1 rounded-full bg-brand-100 md:block"
          >
            <span
              className="start-here-rail block h-full rounded-full bg-gradient-to-r from-brand-500 to-clay-400 rtl:bg-gradient-to-l"
              style={{ width: animate ? `${(step / (stepCount - 1)) * 100}%` : '100%' }}
            />
          </span>
          {role.steps.map((s, i) => {
            const Icon = icons[i] ?? CheckIcon;
            const reached = !animate || i <= step;
            const current = animate && i === step;
            return (
              <li
                key={`${role.key}-${i}`}
                className="relative flex gap-4 md:flex-col md:items-center md:text-center"
              >
                <span
                  className={`relative z-10 grid size-16 shrink-0 place-items-center rounded-full border-4 transition-all duration-500 ${
                    reached
                      ? 'border-brand-600 bg-brand-700 text-white'
                      : 'border-brand-100 bg-white text-brand-400'
                  } ${current ? 'start-here-pulse scale-110' : ''}`}
                >
                  <Icon className="size-7" />
                  <span className="absolute -top-1 -end-1 grid size-6 place-items-center rounded-full bg-clay-500 text-xs font-bold text-white">
                    {formatNumber(i + 1, locale)}
                  </span>
                </span>
                <span>
                  <span
                    className={`block text-base font-bold transition-colors ${
                      reached ? 'text-sand-900' : 'text-sand-400'
                    }`}
                  >
                    {s.title}
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-sand-600">{s.body}</span>
                </span>
              </li>
            );
          })}
        </ol>

        <div className="mt-8 flex flex-col items-start gap-4 border-t border-brand-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-sand-700">
            <span aria-hidden className="relative flex size-2.5">
              <span className="start-here-live absolute inline-flex size-full rounded-full bg-brand-500 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-brand-600" />
            </span>
            <span>
              <strong className="text-lg tabular-nums text-brand-800">
                {formatNumber(liveCounts[role.key], locale)}
              </strong>{' '}
              {role.liveLabel}
            </span>
          </p>
          <Link
            href={`/${locale}${role.href}`}
            className="inline-flex items-center gap-2 rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            {role.cta}
            <ArrowRightIcon className="size-4 rtl:rotate-180" />
          </Link>
        </div>
      </div>
    </div>
  );
}
