'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, CardTitle, Input } from '@bladna/ui';
import {
  ApiClientError,
  api,
  errorMessageFor,
  fieldErrors as extractFieldErrors,
} from '@/ui/api/client';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { getDictionary, type LocaleCode } from '@/ui/i18n';
import { formatDate } from '@/ui/format';

/**
 * Share an international experience → POST /international/experiences.
 *
 * createInternationalExperienceSchema: organizationName (2–200) and program
 * (2–200) and startDate are required; activity (≤500), endDate, hours (0–1000)
 * and sourceUrl (URL ≤600) are optional; countryId/certificateId are omitted
 * (no pickers exist on this public page). The server always persists
 * verified=false — the copy says "self-declared until verified".
 *
 * The same component renders `GET /international/experiences` (own rows) on
 * mount: nothing is rendered while it is loading or when the caller is
 * unauthenticated (401/UNAUTHORIZED).
 */

/** Exactly the fields GET /international/experiences returns per row. */
interface ExperienceRow {
  id: string;
  countryId: string | null;
  organizationName: string;
  program: string;
  activity: string | null;
  startDate: string;
  endDate: string | null;
  hours: number | null;
  certificateId: string | null;
  verified: boolean;
  sourceUrl: string | null;
  createdAt: string;
}

type ListState =
  | { kind: 'loading' }
  | { kind: 'hidden' }
  | { kind: 'ready'; items: ExperienceRow[] }
  | { kind: 'error'; message: string };

function safeExternalUrl(url: string | null): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}

export function ExperienceForm({ locale }: { locale: LocaleCode }) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const pathname = usePathname();

  const [organizationName, setOrganizationName] = useState('');
  const [program, setProgram] = useState('');
  const [activity, setActivity] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [hours, setHours] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // DESIGN §8: failed submit focuses the first invalid control (RESEARCH M4).
  useFocusFirstError(errors);

  const [list, setList] = useState<ListState>({ kind: 'loading' });
  const [listTick, setListTick] = useState(0);

  // Own submissions — hidden entirely for anonymous callers.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await api.get<{ items: ExperienceRow[] }>(
          '/international/experiences?page=1&limit=50',
        );
        if (!cancelled) setList({ kind: 'ready', items: data.items });
      } catch (cause) {
        if (cancelled) return;
        if (cause instanceof ApiClientError && cause.code === 'UNAUTHORIZED') {
          setList({ kind: 'hidden' });
          return;
        }
        setList({
          kind: 'error',
          message: errorMessageFor(cause, {
            errors: dict.errors,
            genericFallback: dict.errors.generic,
          }),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // dict is stable per render pass; re-run only when the list is refreshed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listTick]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setErrors({});
    setSent(false);

    const requiredErrors: Record<string, string> = {};
    if (organizationName.trim().length < 2) {
      requiredErrors.organizationName = dict.common.required;
    }
    if (program.trim().length < 2) requiredErrors.program = dict.common.required;
    if (!startDate) requiredErrors.startDate = dict.common.required;
    const hoursNumber = hours.trim() === '' ? undefined : Number(hours.trim());
    if (
      hoursNumber !== undefined &&
      (!Number.isFinite(hoursNumber) || hoursNumber < 0 || hoursNumber > 1000)
    ) {
      requiredErrors.hours = dict.errors.validation;
    }
    if (Object.keys(requiredErrors).length > 0) {
      setErrors(requiredErrors);
      return;
    }

    setBusy(true);
    try {
      await api.post('/international/experiences', {
        organizationName: organizationName.trim(),
        program: program.trim(),
        startDate,
        ...(activity.trim() ? { activity: activity.trim() } : {}),
        ...(endDate ? { endDate } : {}),
        ...(hoursNumber !== undefined ? { hours: hoursNumber } : {}),
        ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
      });
      setSent(true);
      setOrganizationName('');
      setProgram('');
      setActivity('');
      setStartDate('');
      setEndDate('');
      setHours('');
      setSourceUrl('');
      setListTick((tick) => tick + 1);
      router.refresh();
    } catch (cause) {
      if (
        cause instanceof ApiClientError &&
        (cause.code === 'UNAUTHORIZED' || cause.code === 'MFA_REQUIRED')
      ) {
        router.push(`/${locale}/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      setErrors(extractFieldErrors(cause));
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardTitle>{dict.international.shareExperience}</CardTitle>
        <p className="mt-1 text-sm text-sand-500">{dict.international.experienceTitle}</p>

        <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {sent ? <Alert tone="success">{dict.international.experienceSent}</Alert> : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label={dict.international.experienceOrg}
              required
              maxLength={200}
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
              error={errors.organizationName}
            />
            <Input
              label={dict.international.experienceProgram}
              required
              maxLength={200}
              value={program}
              onChange={(event) => setProgram(event.target.value)}
              error={errors.program}
            />
            <Input
              label={`${dict.international.experienceActivity} (${dict.common.optional})`}
              maxLength={500}
              value={activity}
              onChange={(event) => setActivity(event.target.value)}
              error={errors.activity}
            />
            <Input
              label={`${dict.international.experienceUrl} (${dict.common.optional})`}
              type="url"
              maxLength={600}
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              error={errors.sourceUrl}
            />
            <Input
              label={dict.common.startDate}
              type="date"
              required
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              error={errors.startDate}
            />
            <Input
              label={`${dict.common.endDate} (${dict.common.optional})`}
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              error={errors.endDate}
            />
            <Input
              label={`${dict.international.experienceHours} (${dict.common.optional})`}
              type="number"
              min={0}
              max={1000}
              step="0.5"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              error={errors.hours}
            />
          </div>

          <Button type="submit" loading={busy}>
            {dict.common.submit}
          </Button>
        </form>
      </Card>

      {/* Own submissions: hidden while loading or unauthenticated. */}
      {list.kind === 'ready' || list.kind === 'error' ? (
        <Card>
          <CardTitle>{dict.international.myExperiences}</CardTitle>
          {list.kind === 'error' ? (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {list.message}
            </p>
          ) : list.items.length === 0 ? (
            <p className="mt-3 text-sm text-sand-500">{dict.international.experienceEmpty}</p>
          ) : (
            <ul className="mt-3 divide-y divide-sand-100">
              {list.items.map((row) => {
                const sourceUrl = safeExternalUrl(row.sourceUrl);
                return (
                  <li key={row.id} className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <span className="font-medium text-sand-900">{row.organizationName}</span>
                      {row.verified === false ? (
                        <Badge tone="warning">{dict.international.selfDeclared}</Badge>
                      ) : row.verified ? (
                        <Badge tone="success">{dict.common.verified}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-sand-600">
                      {dict.international.experienceProgram}: {row.program}
                    </p>
                    {row.activity ? (
                      <p className="text-sm text-sand-600">
                        {dict.international.experienceActivity}: {row.activity}
                      </p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-sand-500">
                      <span>
                        {formatDate(row.startDate, locale)}
                        {row.endDate ? ` – ${formatDate(row.endDate, locale)}` : ''}
                      </span>
                      {row.hours !== null ? (
                        <span>
                          {dict.international.hoursLabel}: {row.hours}
                        </span>
                      ) : null}
                      {sourceUrl ? (
                        <a
                          href={sourceUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-brand-700 underline hover:text-brand-800"
                        >
                          {dict.international.experienceUrl}
                        </a>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : null}
    </div>
  );
}
