'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api/client';
import { getDictionary, type LocaleCode } from '@/ui/i18n';
import {
  CalendarIcon,
  CompassIcon,
  HandshakeIcon,
  MapPinIcon,
  UsersIcon,
} from '@/ui/components/icons';

interface ActiveFilters {
  needs?: string;
  wilayaId?: string;
  thisWeek?: boolean;
}

/**
 * Quick discovery chips (spec §9): All / Needs volunteers / Needs support /
 * Near me / This week. “Near me” uses browser geolocation → the nearest city
 * (`GET /locations/cities?nearLat&nearLng`) and routes to its wilaya filter.
 * Pass `active={null}` (home) to highlight nothing; pass the parsed discover
 * params (list page) to highlight the active chip.
 */
export function QuickChips({
  locale,
  active,
}: {
  locale: LocaleCode;
  active?: ActiveFilters | null;
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState(false);

  const base = `/${locale}/opportunities`;
  const activeNeeds = active?.needs ?? '';
  const highlightAll =
    active !== null &&
    active !== undefined &&
    !active.needs &&
    !active.wilayaId &&
    !active.thisWeek;

  const chips: Array<{
    key: string;
    label: string;
    href: string;
    isActive: boolean;
    icon: React.ReactElement;
  }> = [
    {
      key: 'all',
      label: dict.common.all,
      href: base,
      isActive: highlightAll,
      icon: <CompassIcon className="size-4" />,
    },
    {
      key: 'volunteers',
      label: dict.opportunity.filterNeedsVolunteers,
      href: `${base}?needs=VOLUNTEERS`,
      isActive: activeNeeds === 'VOLUNTEERS',
      icon: <UsersIcon className="size-4" />,
    },
    {
      key: 'support',
      label: dict.opportunity.filterNeedsSupport,
      href: `${base}?needs=ANY`,
      isActive: activeNeeds === 'ANY',
      icon: <HandshakeIcon className="size-4" />,
    },
    {
      key: 'week',
      label: dict.opportunity.filterThisWeek,
      href: `${base}?thisWeek=1`,
      isActive: Boolean(active?.thisWeek),
      icon: <CalendarIcon className="size-4" />,
    },
  ];

  function locate(): void {
    setError(false);
    if (!('geolocation' in navigator)) {
      setError(true);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { data } = await api.get<{ items: { id: string; wilayaId: string | null }[] }>(
            `/locations/cities?nearLat=${position.coords.latitude.toFixed(6)}&nearLng=${position.coords.longitude.toFixed(6)}&limit=1`,
          );
          const wilayaId = data.items[0]?.wilayaId;
          if (wilayaId) {
            router.push(`${base}?wilayaId=${wilayaId}`);
            return;
          }
          setError(true);
        } catch {
          setError(true);
        } finally {
          setLocating(false);
        }
      },
      () => {
        setError(true);
        setLocating(false);
      },
      { timeout: 8000, maximumAge: 600000 },
    );
  }

  const pill =
    'min-h-11 inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition';
  const idle = `${pill} border-sand-200 bg-white text-sand-700 hover:border-brand-300 hover:text-brand-800`;
  const on = `${pill} border-brand-600 bg-brand-600 text-white`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.href}
          aria-current={chip.isActive ? 'true' : undefined}
          className={chip.isActive ? on : idle}
        >
          {chip.icon}
          {chip.label}
        </Link>
      ))}
      <button
        type="button"
        onClick={locate}
        disabled={locating}
        aria-pressed={Boolean(active?.wilayaId)}
        className={active?.wilayaId ? `${on} disabled:opacity-70` : `${idle} disabled:opacity-60`}
      >
        <MapPinIcon className="size-4" />
        {locating ? dict.opportunity.nearMeLocating : dict.opportunity.filterNearMe}
      </button>
      {error ? (
        <span role="alert" className="text-xs font-medium text-red-700">
          {dict.opportunity.nearMeError}
        </span>
      ) : null}
    </div>
  );
}
