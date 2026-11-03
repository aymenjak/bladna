'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Input, Select, Textarea } from '@bladna/ui';
import { ORGANIZATION_TYPES, type OrganizationType } from '@bladna/types';
import { ApiClientError, api, errorMessageFor } from '@/ui/api/client';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { getDictionary, type LocaleCode } from '@/ui/i18n';

/**
 * Self-service organization creation on the workspace picker — POST
 * /organizations. The tenant starts PENDING_VERIFICATION / PENDING (never
 * ACTIVE/VERIFIED) and the OWNER role comes from the session, never the
 * payload. The type selector is where each actor (association, company,
 * public institution, …) declares itself; consents land in the §54 ledger.
 */
export function CreateOrganizationForm({ locale }: { locale: LocaleCode }) {
  const { dict } = getDictionary(locale);
  const router = useRouter();

  const [name, setName] = useState('');
  const [orgType, setOrgType] = useState<OrganizationType>('ASSOCIATION');
  const [legalName, setLegalName] = useState('');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [officialEmail, setOfficialEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentPrivacy, setConsentPrivacy] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // DESIGN §8: failed submit focuses the first invalid control (RESEARCH M4).
  useFocusFirstError(fieldErrors);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    if (!consentTerms || !consentPrivacy) {
      setError(dict.auth.consentRequired);
      return;
    }
    const consents: Array<'terms' | 'privacy_policy' | 'data_processing' | 'marketing_email'> = [
      'terms',
      'privacy_policy',
      'data_processing',
    ];
    if (consentMarketing) consents.push('marketing_email');

    setBusy(true);
    try {
      await api.post('/organizations', {
        name: name.trim(),
        organizationType: orgType,
        ...(legalName.trim() ? { legalName: legalName.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(website.trim() ? { website: website.trim() } : {}),
        ...(officialEmail.trim() ? { officialEmail: officialEmail.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(address.trim() ? { address: address.trim() } : {}),
        consents,
      });
      setDone(true);
      setName('');
      setLegalName('');
      setDescription('');
      setWebsite('');
      setOfficialEmail('');
      setPhone('');
      setAddress('');
      setConsentTerms(false);
      setConsentPrivacy(false);
      setConsentMarketing(false);
      router.refresh();
    } catch (cause) {
      if (
        cause instanceof ApiClientError &&
        cause.code === 'VALIDATION_ERROR' &&
        Array.isArray(cause.details)
      ) {
        const errors: Record<string, string> = {};
        for (const issue of cause.details as Array<{ path?: string; message?: string }>) {
          if (issue.path) errors[issue.path] = issue.message ?? dict.errors.validation;
        }
        if (Object.keys(errors).length > 0) {
          setFieldErrors(errors);
          setBusy(false);
          return;
        }
      }
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {done ? <Alert tone="success">{dict.workspace.createOrgDone}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={dict.workspace.settings.nameLabel}
          name="name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={fieldErrors.name}
        />
        <Select
          label={dict.workspace.settings.typeLabel}
          name="organizationType"
          value={orgType}
          onChange={(event) => setOrgType(event.target.value as OrganizationType)}
          error={fieldErrors.organizationType}
        >
          {ORGANIZATION_TYPES.map((value) => (
            <option key={value} value={value}>
              {dict.organizations.types[value]}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={dict.workspace.settings.legalName}
          name="legalName"
          value={legalName}
          onChange={(event) => setLegalName(event.target.value)}
          error={fieldErrors.legalName}
        />
        <Input
          label={dict.workspace.settings.websiteLabel}
          name="website"
          type="url"
          placeholder="https://…"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
          error={fieldErrors.website}
        />
      </div>

      <Textarea
        label={`${dict.workspace.settings.descriptionLabel} (${dict.common.optional})`}
        name="description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        error={fieldErrors.description}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={dict.workspace.settings.emailLabel}
          name="officialEmail"
          type="email"
          value={officialEmail}
          onChange={(event) => setOfficialEmail(event.target.value)}
          error={fieldErrors.officialEmail}
        />
        <Input
          label={dict.workspace.settings.phoneLabel}
          name="phone"
          type="tel"
          placeholder="+213 …"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          error={fieldErrors.phone}
        />
      </div>

      <Input
        label={`${dict.workspace.settings.addressLabel} (${dict.common.optional})`}
        name="address"
        value={address}
        onChange={(event) => setAddress(event.target.value)}
        error={fieldErrors.address}
      />

      <div className="space-y-2">
        <label className="flex items-start gap-2 text-sm text-sand-700">
          <input
            type="checkbox"
            className="mt-1"
            checked={consentTerms}
            onChange={(event) => setConsentTerms(event.target.checked)}
          />
          <span>{dict.auth.consentTerms}</span>
        </label>
        <label className="flex items-start gap-2 text-sm text-sand-700">
          <input
            type="checkbox"
            className="mt-1"
            checked={consentPrivacy}
            onChange={(event) => setConsentPrivacy(event.target.checked)}
          />
          <span>{dict.auth.consentPrivacy}</span>
        </label>
        <label className="flex items-start gap-2 text-sm text-sand-500">
          <input
            type="checkbox"
            className="mt-1"
            checked={consentMarketing}
            onChange={(event) => setConsentMarketing(event.target.checked)}
          />
          <span>{dict.auth.consentMarketing}</span>
        </label>
      </div>

      <Button type="submit" loading={busy}>
        {dict.workspace.createOrg}
      </Button>
    </form>
  );
}
