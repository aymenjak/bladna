'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Input, Select } from '@bladna/ui';
import { api, errorMessageFor, fieldErrors as extractFieldErrors } from '@/ui/api/client';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { getDictionary, type LocaleCode } from '@/ui/i18n';
import type { PassportCountryOption } from './passport-form';

/** `POST /international/experiences` body — always persisted self-declared. */
interface ExperienceDraft {
  organizationName: string;
  program: string;
  activity?: string;
  startDate: string;
  endDate?: string;
  hours?: number;
  sourceUrl?: string;
  countryId?: string;
  role?: string;
}

/**
 * Declare a self-declared international experience → `POST
 * /international/experiences`. The server always stores it with
 * `verified: false`; local checks only catch empty required fields and
 * malformed numbers/URLs — every other rejection surfaces the typed server
 * message (422 field errors are mapped per field).
 */
export function DeclareExperienceForm({
  locale,
  countryOptions,
}: {
  locale: LocaleCode;
  countryOptions: PassportCountryOption[];
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState('');
  const [program, setProgram] = useState('');
  const [activity, setActivity] = useState('');
  const [role, setRole] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [hours, setHours] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [countryId, setCountryId] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // DESIGN §8: failed submit focuses the first invalid control (RESEARCH M4).
  useFocusFirstError(fieldErrors);

  function reset(): void {
    setOrganizationName('');
    setProgram('');
    setActivity('');
    setRole('');
    setStartDate('');
    setEndDate('');
    setHours('');
    setSourceUrl('');
    setCountryId('');
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSent(false);

    const localErrors: Record<string, string> = {};
    if (!organizationName.trim()) localErrors.organizationName = dict.common.required;
    if (!program.trim()) localErrors.program = dict.common.required;
    if (!startDate) localErrors.startDate = dict.common.required;
    if (endDate && startDate && endDate < startDate) localErrors.endDate = dict.errors.validation;

    let hoursValue: number | undefined;
    if (hours.trim()) {
      const parsed = Number(hours);
      if (!Number.isFinite(parsed) || parsed < 0) {
        localErrors.hours = dict.errors.validation;
      } else {
        hoursValue = parsed;
      }
    }
    if (sourceUrl.trim() && !/^(https?:\/\/)/i.test(sourceUrl.trim())) {
      localErrors.sourceUrl = dict.errors.validation;
    }
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }

    const body: ExperienceDraft = {
      organizationName: organizationName.trim(),
      program: program.trim(),
      startDate,
      ...(activity.trim() ? { activity: activity.trim() } : {}),
      ...(endDate ? { endDate } : {}),
      ...(hoursValue !== undefined ? { hours: hoursValue } : {}),
      ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
      ...(countryId ? { countryId } : {}),
      ...(role.trim() ? { role: role.trim() } : {}),
    };

    setBusy(true);
    try {
      await api.post('/international/experiences', body);
      setSent(true);
      reset();
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

  return (
    <form onSubmit={submit} className="mt-3 space-y-4" noValidate>
      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}
      {sent ? (
        <Alert tone="success" role="status">
          {dict.international.experienceSent}
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label={dict.international.experienceOrg}
          name="organizationName"
          required
          value={organizationName}
          onChange={(event) => setOrganizationName(event.target.value)}
          error={fieldErrors.organizationName}
        />
        <Input
          label={dict.international.experienceProgram}
          name="program"
          required
          value={program}
          onChange={(event) => setProgram(event.target.value)}
          error={fieldErrors.program}
        />
        <Input
          label={dict.international.experienceActivity}
          name="activity"
          value={activity}
          onChange={(event) => setActivity(event.target.value)}
          error={fieldErrors.activity}
        />
        <Input
          label={dict.workspace.members.roleLabel}
          name="role"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          error={fieldErrors.role}
        />
        <Input
          label={dict.international.startDateLabel}
          name="startDate"
          type="date"
          required
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          error={fieldErrors.startDate}
        />
        <Input
          label={dict.international.endDateLabel}
          name="endDate"
          type="date"
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
          error={fieldErrors.endDate}
        />
        <Input
          label={dict.international.experienceHours}
          name="hours"
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          value={hours}
          onChange={(event) => setHours(event.target.value)}
          error={fieldErrors.hours}
        />
        <Input
          label={dict.international.experienceUrl}
          name="sourceUrl"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={sourceUrl}
          onChange={(event) => setSourceUrl(event.target.value)}
          error={fieldErrors.sourceUrl}
        />
        {countryOptions.length > 0 ? (
          <Select
            id="experience-country"
            label={dict.international.filtersCountry}
            value={countryId}
            onChange={(event) => setCountryId(event.target.value)}
            error={fieldErrors.countryId}
          >
            <option value="">{dict.common.optional}</option>
            {countryOptions.map((country) => (
              <option key={country.id} value={country.id}>
                {country.name}
              </option>
            ))}
          </Select>
        ) : null}
      </div>

      <Button type="submit" loading={busy}>
        {dict.common.submit}
      </Button>
    </form>
  );
}
