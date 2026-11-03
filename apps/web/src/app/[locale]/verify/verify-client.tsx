'use client';

import { useState } from 'react';
import { Button } from '@bladna/ui';
import { ApiClientError, apiFetch, errorMessageFor, fieldErrors } from '@/ui/api/client';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { getDictionary, type LocaleCode } from '@/ui/i18n';
import { formatDate } from '@/ui/format';
import { formatNumber } from '@/ui/format';

interface VerifyResult {
  type: 'certificate' | 'volunteer' | 'organization';
  valid: boolean;
  holderName?: string;
  organizationName?: string;
  hours?: number;
  verifiedAt?: string | Date;
  [key: string]: unknown;
}

/**
 * Public verification form (§72): one code field accepting certificate
 * numbers/tokens, volunteer public tokens and org slugs — resolved server side
 * by `GET /public/verify`. No session required. The optional `kind` only
 * scopes the label/hint copy for the `/verify/{certificate,volunteer,
 * organization}` deep-link pages; lookup itself stays unified.
 */
export function VerifyClient({
  locale,
  initialCode,
  kind,
}: {
  locale: LocaleCode;
  initialCode: string;
  kind?: 'certificate' | 'volunteer' | 'organization';
}) {
  const { dict } = getDictionary(locale);
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  // DESIGN §8: failed submit focuses the first invalid control (RESEARCH M4).
  useFocusFirstError(fields);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(query: string): Promise<void> {
    setLoading(true);
    setError(null);
    setFields({});
    setResult(null);
    try {
      const { data } = await apiFetch<VerifyResult>(`/public/verify?${query}`);
      setResult(data);
    } catch (err) {
      const details = fieldErrors(err);
      if (Object.keys(details).length > 0) setFields(details);
      if (err instanceof ApiClientError && err.code === 'NOT_FOUND') {
        setError(dict.verify.invalid);
      } else {
        setError(
          errorMessageFor(err, {
            errors: dict.errors,
            genericFallback: dict.errors.generic,
          }),
        );
      }
    } finally {
      setLoading(false);
    }
  }

  const typeLabel =
    result?.type && result.type in dict.verify.types
      ? dict.verify.types[result.type as 'certificate' | 'volunteer' | 'organization']
      : (result?.type ?? '');

  return (
    <div className="mt-8 space-y-6">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = code.trim();
          if (!trimmed) return;
          void submit(`code=${encodeURIComponent(trimmed)}`);
        }}
      >
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-sand-500">
            {dict.verify.codeLabel}
          </span>
          <input
            data-testid="verify-code"
            className="mt-1 w-full rounded-lg border border-sand-200 bg-white px-4 py-3 font-mono text-sand-900 placeholder:font-sans placeholder:text-sand-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder={kind ? dict.verify.kinds[kind].placeholder : dict.verify.codePlaceholder}
            maxLength={200}
            required
          />
        </label>
        <Button type="submit" disabled={loading || !code.trim()} className="w-full">
          {loading ? dict.common.loading : dict.verify.submit}
        </Button>
        {error && !result ? (
          <p className="text-sm text-red-700" data-testid="verify-error">
            {error}
          </p>
        ) : null}
        {Object.entries(fields).map(([field, message]) => (
          <p key={field} className="text-sm text-red-700">
            {message}
          </p>
        ))}
      </form>

      {result ? (
        result.valid ? (
          <div
            className="rounded-xl border border-brand-200 bg-brand-50 p-6"
            data-testid="verify-result"
            data-valid="true"
          >
            <p className="text-lg font-bold text-brand-800">{dict.verify.validTitle}</p>
            <dl className="mt-4 space-y-2 text-sm">
              {typeLabel ? <Row label={dict.verify.resultType} value={typeLabel} /> : null}
              {typeof result.holderName === 'string' ? (
                <Row label={dict.verify.resultHolder} value={result.holderName} />
              ) : null}
              {typeof result.organizationName === 'string' ? (
                <Row label={dict.verify.resultOrganization} value={result.organizationName} />
              ) : null}
              {typeof result.hours === 'number' ? (
                <Row label={dict.verify.resultHours} value={formatNumber(result.hours, locale)} />
              ) : null}
              {result.verifiedAt ? (
                <Row
                  label={dict.verify.resultVerifiedAt}
                  value={formatDate(result.verifiedAt, locale)}
                />
              ) : null}
            </dl>
          </div>
        ) : (
          <div
            className="rounded-xl border border-red-200 bg-red-50 p-6"
            data-testid="verify-result"
            data-valid="false"
          >
            <p className="text-lg font-bold text-red-800">{dict.verify.invalid}</p>
            <p className="mt-2 text-sm text-red-700">{dict.verify.invalidHelp}</p>
          </div>
        )
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-sand-500">{label}</dt>
      <dd className="text-end font-medium text-sand-900">{value}</dd>
    </div>
  );
}
