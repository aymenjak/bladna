'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LocaleCode } from '@bladna/types';
import { Alert, Button } from '@bladna/ui';
import { api, errorMessageFor, fieldErrors } from '@/ui/api/client';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { getDictionary } from '@/ui/i18n';

interface Place {
  id: string;
  nameAr: string;
  nameFr: string;
  nameEn: string;
}

interface WilayaOption extends Place {
  code: string;
}

interface CityOption extends Place {
  wilayaId: string;
}

export interface SettingsInitial {
  name: string;
  legalName: string;
  description: string;
  website: string;
  officialEmail: string;
  phone: string;
  address: string;
  logo: string;
  coverImage: string;
  wilayaId: string;
  cityId: string;
}

function placeName(place: Place, locale: LocaleCode): string {
  if (locale === 'ar') return place.nameAr;
  if (locale === 'fr') return place.nameFr;
  return place.nameEn;
}

/**
 * Profile form — `PATCH /orgs/:orgId` with `updateOrganizationSchema`.
 * `organizationType` is immutable and never sent. Empty `officialEmail` /
 * `phone` are omitted (the server schemas reject empty strings); location ids
 * are sent as the chosen id or `null` to clear. Changing the wilaya refetches
 * that wilaya's cities from `GET /locations/cities?wilayaId=`.
 *
 * `wilayas`/`cities` are null when the (optional) location reads failed — the
 * matching fields are then omitted entirely instead of breaking the page.
 */
export function SettingsForm({
  locale,
  orgId,
  initial,
  wilayas,
  cities,
}: {
  locale: LocaleCode;
  orgId: string;
  initial: SettingsInitial;
  wilayas: WilayaOption[] | null;
  cities: CityOption[] | null;
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const hasLocations = wilayas !== null && cities !== null;

  const [form, setForm] = useState<SettingsInitial>(initial);
  const [cityOptions, setCityOptions] = useState<CityOption[]>(cities ?? []);
  const [busy, setBusy] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  // DESIGN §8: failed submit focuses the first invalid control (RESEARCH M4).
  useFocusFirstError(fields);

  function update<K extends keyof SettingsInitial>(key: K, value: SettingsInitial[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function changeWilaya(wilayaId: string): Promise<void> {
    setForm((prev) => ({ ...prev, wilayaId, cityId: '' }));
    if (!wilayaId) {
      setCityOptions([]);
      return;
    }
    setLoadingCities(true);
    try {
      const result = await api.get<{ items: CityOption[] }>(
        `/locations/cities?wilayaId=${encodeURIComponent(wilayaId)}&page=1&limit=500`,
      );
      setCityOptions(result.data.items);
    } catch (cause) {
      setCityOptions([]);
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setLoadingCities(false);
    }
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setFields({});

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      legalName: form.legalName.trim(),
      description: form.description.trim(),
      website: form.website.trim(),
      address: form.address.trim(),
      logo: form.logo.trim(),
      coverImage: form.coverImage.trim(),
    };
    // Empty email/phone would fail the server's email/phone schemas — omit.
    if (form.officialEmail.trim()) payload.officialEmail = form.officialEmail.trim();
    if (form.phone.trim()) payload.phone = form.phone.trim();
    if (hasLocations) {
      payload.wilayaId = form.wilayaId || null;
      payload.cityId = form.cityId || null;
    }

    setBusy(true);
    try {
      await api.patch(`/orgs/${orgId}`, payload);
      setMessage(dict.workspace.settings.saved);
      router.refresh();
    } catch (cause) {
      const parsed = fieldErrors(cause);
      if (Object.keys(parsed).length > 0) setFields(parsed);
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'mt-1 w-full h-10 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100';

  function fieldError(name: string): string | null {
    return fields[name] ?? null;
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="org-name" className="block text-sm font-medium text-sand-700">
          {dict.workspace.settings.nameLabel}
        </label>
        <input
          id="org-name"
          required
          minLength={2}
          maxLength={160}
          value={form.name}
          onChange={(event) => update('name', event.target.value)}
          className={inputClass}
        />
        {fieldError('name') ? (
          <p role="alert" className="mt-1 text-sm text-red-700">
            {fieldError('name')}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="org-legal" className="block text-sm font-medium text-sand-700">
          {dict.workspace.settings.legalName}
        </label>
        <input
          id="org-legal"
          maxLength={200}
          value={form.legalName}
          onChange={(event) => update('legalName', event.target.value)}
          className={inputClass}
        />
      </div>

      <div className="sm:col-span-2">
        <label htmlFor="org-description" className="block text-sm font-medium text-sand-700">
          {dict.workspace.settings.descriptionLabel}
        </label>
        <textarea
          id="org-description"
          maxLength={8000}
          rows={4}
          value={form.description}
          onChange={(event) => update('description', event.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="org-website" className="block text-sm font-medium text-sand-700">
          {dict.workspace.settings.websiteLabel}
        </label>
        <input
          id="org-website"
          type="url"
          maxLength={300}
          value={form.website}
          onChange={(event) => update('website', event.target.value)}
          className={inputClass}
        />
        {fieldError('website') ? (
          <p role="alert" className="mt-1 text-sm text-red-700">
            {fieldError('website')}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="org-email" className="block text-sm font-medium text-sand-700">
          {dict.workspace.settings.emailLabel}
        </label>
        <input
          id="org-email"
          type="email"
          maxLength={254}
          value={form.officialEmail}
          onChange={(event) => update('officialEmail', event.target.value)}
          className={inputClass}
        />
        {fieldError('officialEmail') ? (
          <p role="alert" className="mt-1 text-sm text-red-700">
            {fieldError('officialEmail')}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="org-phone" className="block text-sm font-medium text-sand-700">
          {dict.workspace.settings.phoneLabel}
        </label>
        <input
          id="org-phone"
          type="tel"
          maxLength={40}
          value={form.phone}
          onChange={(event) => update('phone', event.target.value)}
          className={inputClass}
        />
        {fieldError('phone') ? (
          <p role="alert" className="mt-1 text-sm text-red-700">
            {fieldError('phone')}
          </p>
        ) : null}
      </div>

      {hasLocations ? (
        <>
          <div>
            <label htmlFor="org-wilaya" className="block text-sm font-medium text-sand-700">
              {dict.workspace.settings.wilayaLabel}
            </label>
            <select
              id="org-wilaya"
              value={form.wilayaId}
              onChange={(event) => changeWilaya(event.target.value)}
              className={inputClass}
            >
              <option value="">—</option>
              {(wilayas ?? []).map((wilaya) => (
                <option key={wilaya.id} value={wilaya.id}>
                  {wilaya.code} · {placeName(wilaya, locale)}
                </option>
              ))}
            </select>
            {fieldError('wilayaId') ? (
              <p role="alert" className="mt-1 text-sm text-red-700">
                {fieldError('wilayaId')}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="org-city" className="block text-sm font-medium text-sand-700">
              {dict.workspace.settings.cityLabel}
            </label>
            <select
              id="org-city"
              value={form.cityId}
              disabled={loadingCities || !form.wilayaId}
              onChange={(event) => update('cityId', event.target.value)}
              className={inputClass}
            >
              <option value="">—</option>
              {cityOptions.map((city) => (
                <option key={city.id} value={city.id}>
                  {placeName(city, locale)}
                </option>
              ))}
            </select>
            {fieldError('cityId') ? (
              <p role="alert" className="mt-1 text-sm text-red-700">
                {fieldError('cityId')}
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      <div className="sm:col-span-2">
        <label htmlFor="org-address" className="block text-sm font-medium text-sand-700">
          {dict.workspace.settings.addressLabel}
        </label>
        <input
          id="org-address"
          maxLength={400}
          value={form.address}
          onChange={(event) => update('address', event.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="org-logo" className="block text-sm font-medium text-sand-700">
          {dict.workspace.settings.logoLabel}
        </label>
        <input
          id="org-logo"
          type="url"
          maxLength={500}
          value={form.logo}
          onChange={(event) => update('logo', event.target.value)}
          className={inputClass}
        />
        {fieldError('logo') ? (
          <p role="alert" className="mt-1 text-sm text-red-700">
            {fieldError('logo')}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="org-cover" className="block text-sm font-medium text-sand-700">
          {dict.workspace.settings.coverLabel}
        </label>
        <input
          id="org-cover"
          type="url"
          maxLength={500}
          value={form.coverImage}
          onChange={(event) => update('coverImage', event.target.value)}
          className={inputClass}
        />
        {fieldError('coverImage') ? (
          <p role="alert" className="mt-1 text-sm text-red-700">
            {fieldError('coverImage')}
          </p>
        ) : null}
      </div>

      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy}>
          {dict.common.save}
        </Button>
      </div>

      {error ? (
        <Alert tone="danger" className="sm:col-span-2">
          {error}
        </Alert>
      ) : null}
      {message ? (
        <Alert tone="success" className="sm:col-span-2">
          {message}
        </Alert>
      ) : null}
    </form>
  );
}
