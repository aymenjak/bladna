'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  INTERNATIONAL_PROJECT_TYPES,
  type InternationalPassportReadiness,
  type InternationalProjectType,
} from '@bladna/types';
import { Alert, Button, Card, Input, Select } from '@bladna/ui';
import { api, errorMessageFor, fieldErrors as extractFieldErrors } from '@/ui/api/client';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { getDictionary, type LocaleCode } from '@/ui/i18n';

/** Localized `{ id, name }` country option built by the server page. */
export interface PassportCountryOption {
  id: string;
  name: string;
}

export interface PassportFormValues {
  readiness: InternationalPassportReadiness;
  travelReady: boolean;
  emergencyContactReady: boolean;
  preferredCategories: InternationalProjectType[];
  preferredCountryIds: string[];
  /** `YYYY-MM-DD` (already trimmed by the page) or '' when unset. */
  dateOfBirth: string;
}

/** `PATCH /international/passport` body — every field optional server-side. */
interface PassportPatchBody {
  passportReadiness?: InternationalPassportReadiness;
  travelReady?: boolean;
  emergencyContactReady?: boolean;
  preferredCategories?: InternationalProjectType[];
  preferredCountryIds?: string[];
  dateOfBirth?: string;
}

/** One radio choice in the passport-readiness fieldset. */
interface ReadinessOption {
  value: InternationalPassportReadiness;
  label: string;
}

/**
 * Readiness + preferences → `PATCH /international/passport`. The country
 * multi-select renders only when the catalogue loaded (and always contains
 * the current picks), so `preferredCountryIds` is never sent blind; the date
 * field is omitted when cleared because the API has no clear-on-null shape.
 */
export function PassportSettingsForm({
  locale,
  initial,
  countryOptions,
}: {
  locale: LocaleCode;
  initial: PassportFormValues;
  countryOptions: PassportCountryOption[];
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const [readiness, setReadiness] = useState<InternationalPassportReadiness>(initial.readiness);
  const [travelReady, setTravelReady] = useState(initial.travelReady);
  const [emergencyContactReady, setEmergencyContactReady] = useState(initial.emergencyContactReady);
  const [categories, setCategories] = useState<InternationalProjectType[]>(
    initial.preferredCategories,
  );
  const [countryIds, setCountryIds] = useState<string[]>(initial.preferredCountryIds);
  const [dateOfBirth, setDateOfBirth] = useState(initial.dateOfBirth);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // DESIGN §8: failed submit focuses the first invalid control (RESEARCH M4).
  useFocusFirstError(fieldErrors);

  const readinessOptions: ReadonlyArray<ReadinessOption> = [
    { value: 'READY', label: dict.international.passportReady },
    { value: 'IN_PROGRESS', label: dict.international.passportInProgress },
    { value: 'NOT_AVAILABLE', label: dict.international.passportNone },
  ];

  function toggleCategory(type: InternationalProjectType): void {
    setSaved(false);
    setCategories((previous) =>
      previous.includes(type) ? previous.filter((t) => t !== type) : [...previous, type],
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSaved(false);
    setBusy(true);
    try {
      const body: PassportPatchBody = {
        passportReadiness: readiness,
        travelReady,
        emergencyContactReady,
        preferredCategories: categories.slice(0, 12),
      };
      if (countryOptions.length > 0) body.preferredCountryIds = countryIds.slice(0, 50);
      if (dateOfBirth) body.dateOfBirth = dateOfBirth;
      await api.patch('/international/passport', body);
      setSaved(true);
      router.refresh();
    } catch (cause) {
      setFieldErrors(extractFieldErrors(cause));
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  const selectClass =
    'w-full h-10 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100';

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error ? (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        ) : null}
        {saved ? (
          <Alert tone="success" role="status">
            {dict.settings.savedOk}
          </Alert>
        ) : null}

        <fieldset className="space-y-2">
          <legend className="text-base font-semibold text-sand-900">
            {dict.international.applyPassport}
          </legend>
          {readinessOptions.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm text-sand-700">
              <input
                type="radio"
                name="passportReadiness"
                value={option.value}
                checked={readiness === option.value}
                onChange={() => {
                  setSaved(false);
                  setReadiness(option.value);
                }}
                className="size-4 border-sand-300 text-brand-700 focus:ring-brand-600"
              />
              {option.label}
            </label>
          ))}
        </fieldset>

        {/* Travel / emergency preparedness toggles. */}
        <div className="space-y-2">
          <label className="flex items-start gap-2 text-sm text-sand-700">
            <input
              type="checkbox"
              checked={travelReady}
              onChange={(event) => {
                setSaved(false);
                setTravelReady(event.target.checked);
              }}
              className="mt-0.5 size-4 rounded border-sand-300"
            />
            {dict.international.travelReady}
          </label>
          <label className="flex items-start gap-2 text-sm text-sand-700">
            <input
              type="checkbox"
              checked={emergencyContactReady}
              onChange={(event) => {
                setSaved(false);
                setEmergencyContactReady(event.target.checked);
              }}
              className="mt-0.5 size-4 rounded border-sand-300"
            />
            {dict.international.emergencyContact}
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-sand-700">
            {dict.international.filtersCategory}
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {INTERNATIONAL_PROJECT_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2 text-sm text-sand-700">
                <input
                  type="checkbox"
                  checked={categories.includes(type)}
                  onChange={() => toggleCategory(type)}
                  className="size-4 rounded border-sand-300"
                />
                {dict.international.categories[type]}
              </label>
            ))}
          </div>
        </fieldset>

        {countryOptions.length > 0 ? (
          <Select
            id="preferred-countries"
            label={dict.international.countriesTitle}
            multiple
            size={Math.min(6, Math.max(3, countryOptions.length))}
            value={countryIds}
            onChange={(event) => {
              setSaved(false);
              setCountryIds(
                Array.from(event.target.selectedOptions, (option) => option.value).slice(0, 50),
              );
            }}
            className={selectClass}
          >
            {countryOptions.map((country) => (
              <option key={country.id} value={country.id}>
                {country.name}
              </option>
            ))}
          </Select>
        ) : null}

        <Input
          label={dict.international.dateOfBirth}
          type="date"
          name="dateOfBirth"
          value={dateOfBirth}
          onChange={(event) => {
            setSaved(false);
            setDateOfBirth(event.target.value);
          }}
          error={fieldErrors.dateOfBirth}
        />

        <Button type="submit" loading={busy}>
          {dict.common.save}
        </Button>
      </form>
    </Card>
  );
}
