'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, CardTitle, Input, Textarea } from '@bladna/ui';
import { api, errorMessageFor, fieldErrors as extractFieldErrors } from '@/ui/api/client';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { getDictionary, type LocaleCode } from '@/ui/i18n';

/**
 * Sponsor self-registration -> `POST /sponsors` (real `registerSponsorSchema`:
 * the create fields plus the §54 consent bar; `terms` + `privacy_policy` are
 * mandatory). The handler seats the registrant as SPONSOR_ADMIN and returns
 * the created sponsor, whose id the client carries into the workspace through
 * `?id=` — the API has no "list my sponsors" endpoint to rediscover it.
 */
export function SponsorRegister({ locale }: { locale: LocaleCode }) {
  const router = useRouter();
  const { dict } = getDictionary(locale);
  const [legalName, setLegalName] = useState('');
  const [commercialName, setCommercialName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [industry, setIndustry] = useState('');
  const [description, setDescription] = useState('');
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // DESIGN §8: failed submit focuses the first invalid control (RESEARCH M4).
  useFocusFirstError(errors);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setErrors({});
    if (!terms || !privacy) {
      setErrors({ consents: dict.auth.consentRequired });
      return;
    }
    if (!legalName.trim() || !commercialName.trim() || !contactEmail.trim()) {
      const missing: Record<string, string> = {};
      if (!legalName.trim()) missing.legalName = dict.common.required;
      if (!commercialName.trim()) missing.commercialName = dict.common.required;
      if (!contactEmail.trim()) missing.contactEmail = dict.common.required;
      setErrors(missing);
      return;
    }
    setBusy(true);
    try {
      const result = await api.post<{ sponsor: { id: string } }>('/sponsors', {
        legalName: legalName.trim(),
        commercialName: commercialName.trim(),
        contactEmail: contactEmail.trim(),
        ...(contactPhone.trim() ? { contactPhone: contactPhone.trim() } : {}),
        ...(website.trim() ? { website: website.trim() } : {}),
        ...(industry.trim() ? { industry: industry.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        consents: [
          'terms',
          'privacy_policy',
          ...(marketing ? ['marketing_email'] : []),
        ] as string[],
      });
      const id = result.data.sponsor.id;
      router.push(`/${locale}/sponsor?tab=overview&id=${id}&registered=1`);
      router.refresh();
    } catch (cause) {
      setErrors(extractFieldErrors(cause));
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <CardTitle>{dict.sponsorConsole.registerTitle}</CardTitle>

      <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={dict.admin.sponsorAdmin.legalName}
            name="legalName"
            required
            maxLength={200}
            value={legalName}
            onChange={(event) => setLegalName(event.target.value)}
            error={errors.legalName}
          />
          <Input
            label={dict.admin.sponsorAdmin.commercialName}
            name="commercialName"
            required
            maxLength={200}
            value={commercialName}
            onChange={(event) => setCommercialName(event.target.value)}
            error={errors.commercialName}
          />
          <Input
            label={dict.admin.sponsorAdmin.contactEmail}
            name="contactEmail"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
            error={errors.contactEmail}
          />
          <Input
            label={`${dict.admin.sponsorAdmin.contactPhone} (${dict.common.optional})`}
            name="contactPhone"
            type="tel"
            maxLength={20}
            value={contactPhone}
            onChange={(event) => setContactPhone(event.target.value)}
            error={errors.contactPhone}
          />
          <Input
            label={`${dict.admin.sponsorAdmin.website} (${dict.common.optional})`}
            name="website"
            type="url"
            maxLength={300}
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            error={errors.website}
          />
          <Input
            label={`${dict.admin.sponsorAdmin.industry} (${dict.common.optional})`}
            name="industry"
            maxLength={120}
            value={industry}
            onChange={(event) => setIndustry(event.target.value)}
            error={errors.industry}
          />
        </div>

        <Textarea
          label={`${dict.common.description} (${dict.common.optional})`}
          name="description"
          maxLength={8000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          error={errors.description}
        />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-sand-700">
            {dict.sponsorConsole.registerTitle}
          </legend>
          <label className="flex items-start gap-2 text-sm text-sand-700">
            <input
              type="checkbox"
              checked={terms}
              onChange={(event) => setTerms(event.target.checked)}
              className="mt-0.5 size-4 rounded border-sand-300"
            />
            {dict.auth.consentTerms}
          </label>
          <label className="flex items-start gap-2 text-sm text-sand-700">
            <input
              type="checkbox"
              checked={privacy}
              onChange={(event) => setPrivacy(event.target.checked)}
              className="mt-0.5 size-4 rounded border-sand-300"
            />
            {dict.auth.consentPrivacy}
          </label>
          <label className="flex items-start gap-2 text-sm text-sand-700">
            <input
              type="checkbox"
              checked={marketing}
              onChange={(event) => setMarketing(event.target.checked)}
              className="mt-0.5 size-4 rounded border-sand-300"
            />
            {dict.auth.consentMarketing}
          </label>
          {errors.consents ? (
            <p role="alert" className="text-sm text-red-700">
              {errors.consents}
            </p>
          ) : null}
        </fieldset>

        <Button type="submit" loading={busy}>
          {dict.sponsorConsole.register}
        </Button>
      </form>
    </Card>
  );
}
