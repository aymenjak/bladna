'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, Input, Textarea, buttonClasses } from '@bladna/ui';
import {
  ApiClientError,
  api,
  errorMessageFor,
  fieldErrors as extractFieldErrors,
} from '@/ui/api/client';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { getDictionary, type LocaleCode } from '@/ui/i18n';
import type { PassportReadiness } from './types';

/**
 * Apply to an international program → POST /international/applications
 * (authenticated; the page gates the session with `pageSession` first).
 *
 * Body: { opportunityId, motivationLetter?, languages?, availability?,
 * previousExperience?, passportReadiness }. Error contract:
 *   409 CONFLICT         → `applyDuplicate`
 *   404 NOT_FOUND        → hidden/missing offer → inline not-found panel
 *   422 BUSINESS_RULE    → `applyNeedProfile` when the server demands the
 *                          volunteer profile, otherwise `applyClosed`
 *   VALIDATION_ERROR     → per-field server messages (existing pattern)
 *   UNAUTHORIZED / MFA   → bounce to sign-in preserving `next`
 */

type PassportOption = {
  value: PassportReadiness;
  labelKey: 'passportReady' | 'passportInProgress' | 'passportNone';
};

const PASSPORT_OPTIONS: ReadonlyArray<PassportOption> = [
  { value: 'NOT_AVAILABLE', labelKey: 'passportNone' },
  { value: 'IN_PROGRESS', labelKey: 'passportInProgress' },
  { value: 'READY', labelKey: 'passportReady' },
];

export function ApplyFormIntl({
  locale,
  opportunityId,
}: {
  locale: LocaleCode;
  opportunityId: string;
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const pathname = usePathname();

  const [motivationLetter, setMotivationLetter] = useState('');
  const [languages, setLanguages] = useState('');
  const [availability, setAvailability] = useState('');
  const [previousExperience, setPreviousExperience] = useState('');
  const [passportReadiness, setPassportReadiness] = useState<PassportReadiness | ''>('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // DESIGN §8: failed submit focuses the first invalid control (RESEARCH M4).
  useFocusFirstError(errors);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setErrors({});
    setSent(false);

    if (!passportReadiness) {
      setErrors({ passportReadiness: dict.common.required });
      return;
    }

    setBusy(true);
    try {
      await api.post('/international/applications', {
        opportunityId,
        ...(motivationLetter.trim() ? { motivationLetter: motivationLetter.trim() } : {}),
        ...(languages.trim() ? { languages: languages.trim() } : {}),
        ...(availability.trim() ? { availability: availability.trim() } : {}),
        ...(previousExperience.trim() ? { previousExperience: previousExperience.trim() } : {}),
        passportReadiness,
      });
      setSent(true);
    } catch (cause) {
      if (cause instanceof ApiClientError) {
        if (cause.code === 'UNAUTHORIZED' || cause.code === 'MFA_REQUIRED') {
          router.push(`/${locale}/login?next=${encodeURIComponent(pathname)}`);
          return;
        }
        if (cause.code === 'NOT_FOUND') {
          setMissing(true);
          return;
        }
        if (cause.code === 'CONFLICT') {
          setError(dict.international.applyDuplicate);
          return;
        }
        if (cause.code === 'BUSINESS_RULE_ERROR') {
          setError(
            /profile/i.test(cause.message)
              ? dict.international.applyNeedProfile
              : dict.international.applyClosed,
          );
          return;
        }
      }
      setErrors(extractFieldErrors(cause));
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  // Offer vanished after the page rendered → the localized not-found boundary copy.
  if (missing) {
    return (
      <Card>
        <p className="text-sm font-semibold text-brand-700">404</p>
        <h2 className="mt-1 text-lg font-semibold text-sand-900">{dict.common.missingPageTitle}</h2>
        <p className="mt-2 text-sm text-sand-500">{dict.common.missingPageBody}</p>
        <Link href={`/${locale}`} className={buttonClasses({ className: 'mt-5' })}>
          {dict.common.backHome}
        </Link>
      </Card>
    );
  }

  if (sent) {
    return <Alert tone="success">{dict.international.applySent}</Alert>;
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Textarea
          label={dict.international.applyMotivation}
          maxLength={4000}
          value={motivationLetter}
          onChange={(event) => setMotivationLetter(event.target.value)}
          error={errors.motivationLetter}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={dict.international.applyLanguages}
            maxLength={200}
            value={languages}
            onChange={(event) => setLanguages(event.target.value)}
            error={errors.languages}
          />
          <Input
            label={dict.international.applyAvailability}
            maxLength={300}
            value={availability}
            onChange={(event) => setAvailability(event.target.value)}
            error={errors.availability}
          />
        </div>
        <Textarea
          label={dict.international.applyExperience}
          maxLength={2000}
          value={previousExperience}
          onChange={(event) => setPreviousExperience(event.target.value)}
          error={errors.previousExperience}
        />

        <fieldset>
          <legend className="text-sm font-medium text-sand-700">
            {dict.international.applyPassport}
          </legend>
          <div className="mt-2 flex flex-wrap gap-4">
            {PASSPORT_OPTIONS.map((option) => (
              <label key={option.value} className="flex items-center gap-2 text-sm text-sand-700">
                <input
                  type="radio"
                  name="passportReadiness"
                  value={option.value}
                  checked={passportReadiness === option.value}
                  onChange={() => setPassportReadiness(option.value)}
                  className="size-4 border-sand-300 text-brand-700 focus:ring-brand-600"
                />
                {dict.international[option.labelKey]}
              </label>
            ))}
          </div>
          {errors.passportReadiness ? (
            <p role="alert" className="mt-1 text-sm text-red-700">
              {errors.passportReadiness}
            </p>
          ) : null}
        </fieldset>

        <Button type="submit" loading={busy}>
          {dict.international.applyLink}
        </Button>
      </form>
    </Card>
  );
}
