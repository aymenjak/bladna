'use client';

import { useState, type FormEvent } from 'react';
import type { ApiErrorBody } from '@bladna/types';
import { Alert, Button, Card, CardTitle, Input, Select } from '@bladna/ui';
import { ApiClientError, api, fieldErrors } from '@/ui/api/client';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { getDictionary, type LocaleCode } from '@/ui/i18n';
import { formatNumber } from '@/ui/format';
import { NoticeBar, useFail } from '@/ui/admin-shared';

/**
 * Exports section — `POST /admin/exports` (modules/admin.ts `dataExport`),
 * gated by `data.export` server-side. The endpoint answers per format: `json`
 * returns the normal success envelope with `{ export: { count, truncated,
 * rows… } }` inline, `csv` returns a RAW `text/csv` attachment carrying
 * `x-export-count` / `x-export-truncated` headers (not the JSON envelope).
 * The shared `apiFetch` only parses JSON envelopes, so CSV goes through a raw
 * `fetch` that still decodes the same error envelope on failure; both formats
 * are saved as a real download and the count/truncation shown below comes
 * from those actual responses — nothing is estimated client-side.
 */

type ExportKind = 'VOLUNTEERS' | 'ORGANIZATIONS' | 'CAMPAIGNS' | 'FINANCIAL';
type ExportFormat = 'csv' | 'json';

const EXPORT_KINDS: readonly ExportKind[] = [
  'VOLUNTEERS',
  'ORGANIZATIONS',
  'CAMPAIGNS',
  'FINANCIAL',
];
const EXPORT_FORMATS: readonly ExportFormat[] = ['csv', 'json'];

/** `adminDataExportSchema` body — dates are optional ISO `YYYY-MM-DD` strings. */
interface ExportBody {
  kind: ExportKind;
  format: ExportFormat;
  from?: string;
  to?: string;
}

/** Success payload of `format: 'json'` (`dataExport` in modules/admin.ts). */
interface JsonExportResponse {
  export: {
    kind: ExportKind;
    generatedAt: string;
    truncated: boolean;
    count: number;
    rows: Array<Record<string, unknown>>;
  };
}

interface ExportResult {
  kind: ExportKind;
  count: number;
  truncated: boolean;
}

/** Save export bytes as a file (the blob URL is revoked once consumed). */
function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** Server-supplied attachment name, falling back to the server's own pattern. */
function csvFileName(kind: ExportKind, disposition: string | null): string {
  const match = disposition ? /filename="([^"]+)"/.exec(disposition) : null;
  return match?.[1] ?? `bladna-${kind.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
}

async function fetchCsvExport(body: ExportBody): Promise<ExportResult> {
  let response: Response;
  try {
    response = await fetch('/api/v1/admin/exports', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        'accept-language': typeof navigator === 'undefined' ? 'ar' : navigator.language,
        'x-locale': typeof document === 'undefined' ? 'ar' : document.documentElement.lang || 'ar',
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Same network failure shape apiFetch throws, so `useFail` maps it once.
    throw new ApiClientError(0, { code: 'EXTERNAL_SERVICE_ERROR', message: 'network' });
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (response.ok && contentType.includes('text/csv')) {
    const rawCount = Number(response.headers.get('x-export-count'));
    const count = Number.isFinite(rawCount) ? rawCount : 0;
    const truncated = response.headers.get('x-export-truncated') === 'true';
    downloadBlob(
      await response.blob(),
      csvFileName(body.kind, response.headers.get('content-disposition')),
    );
    return { kind: body.kind, count, truncated };
  }

  // Anything else: the JSON error envelope the API returns on failure.
  let errorBody: ApiErrorBody | null = null;
  try {
    const payload = (await response.json()) as { error?: ApiErrorBody };
    errorBody = payload.error ?? null;
  } catch {
    // Not JSON — fall through to the generic status message.
  }
  throw new ApiClientError(
    response.status,
    errorBody ?? { code: 'INTERNAL_ERROR', message: `Unexpected response (${response.status}).` },
  );
}

export function ExportsSection({ locale }: { locale: LocaleCode }) {
  const { dict } = getDictionary(locale);
  const fail = useFail(locale);
  const [kind, setKind] = useState<ExportKind>('VOLUNTEERS');
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  useFocusFirstError(fieldErr);
  const [result, setResult] = useState<ExportResult | null>(null);

  async function run(event: FormEvent): Promise<void> {
    event.preventDefault();
    const body: ExportBody = {
      kind,
      format,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    };
    setBusy(true);
    setError(null);
    setNotice(null);
    setResult(null);
    setFieldErr({});
    try {
      let outcome: ExportResult;
      if (format === 'csv') {
        outcome = await fetchCsvExport(body);
      } else {
        const response = await api.post<JsonExportResponse>('/admin/exports', body);
        const summary = response.data.export;
        downloadBlob(
          new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' }),
          `bladna-${summary.kind.toLowerCase()}-${summary.generatedAt.slice(0, 10)}.json`,
        );
        outcome = { kind: summary.kind, count: summary.count, truncated: summary.truncated };
      }
      setNotice(dict.admin.exports.done);
      setResult(outcome);
    } catch (cause) {
      setFieldErr(fieldErrors(cause));
      const message = fail(cause);
      if (message) setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <Card>
        <CardTitle>{dict.admin.exports.title}</CardTitle>
        <p className="mt-1 text-sm text-sand-500">{dict.admin.exports.hint}</p>
        <form onSubmit={(event) => void run(event)} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="w-52">
            <Select
              label={dict.common.type}
              value={kind}
              onChange={(event) => setKind(event.target.value as ExportKind)}
            >
              {EXPORT_KINDS.map((value) => (
                <option key={value} value={value}>
                  {dict.admin.exports.kinds[value]}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-44">
            <Select
              label={dict.admin.exports.formatLabel}
              value={format}
              onChange={(event) => setFormat(event.target.value as ExportFormat)}
            >
              {EXPORT_FORMATS.map((value) => (
                <option key={value} value={value}>
                  {dict.admin.exports.formats[value]}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-44">
            <Input
              type="date"
              label={dict.common.startDate}
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              error={fieldErr.from ?? null}
            />
          </div>
          <div className="w-44">
            <Input
              type="date"
              label={dict.common.endDate}
              value={to}
              onChange={(event) => setTo(event.target.value)}
              error={fieldErr.to ?? null}
            />
          </div>
          <Button type="submit" loading={busy}>
            {dict.admin.exports.run}
          </Button>
        </form>
      </Card>

      <NoticeBar message={notice} />
      {result ? (
        <div className="space-y-1 rounded-lg border border-sand-200 bg-white px-4 py-3 text-sm text-sand-700">
          <p>
            {dict.admin.exports.kinds[result.kind]} · {formatNumber(result.count, locale)}
          </p>
          {result.truncated ? (
            <p className="text-amber-700">{dict.admin.exports.truncated}</p>
          ) : null}
        </div>
      ) : null}
      {error ? <Alert>{error}</Alert> : null}
    </section>
  );
}
