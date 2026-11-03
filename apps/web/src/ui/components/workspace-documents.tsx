'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LocaleCode } from '@bladna/types';
import { Alert, Button, Card, useConfirm } from '@bladna/ui';
import { api, errorMessageFor, fieldErrors } from '@/ui/api/client';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { getDictionary } from '@/ui/i18n';

/**
 * Client-side mirrors of the server upload gate (server/infra/upload.ts +
 * storage.ts). The server re-validates everything; these only avoid a round
 * trip for obviously wrong files. NOTE: MAX_UPLOAD_BYTES is 10 MiB on the
 * server while the frozen dictionary copy in `chooseFile` still says
 * "max 5 MB" — the 10 MiB value below is the source of truth (see REPORT).
 */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const EXTENSIONS_BY_TYPE: Record<string, readonly string[]> = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
};
const DOCUMENT_TYPES = [
  'AVATAR',
  'LOGO',
  'COVER_IMAGE',
  'IDENTITY',
  'ORGANIZATION_REGISTRATION',
  'VERIFICATION_EVIDENCE',
  'CERTIFICATE',
  'ATTACHMENT',
  'OTHER',
] as const;
const DOCUMENT_VISIBILITIES = ['PRIVATE', 'ORGANIZATION', 'PUBLIC'] as const;

/** ArrayBuffer → base64 without blowing the call stack on 10 MiB files. */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 0x8000;
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  }
  return btoa(binary);
}

/**
 * Upload form — `POST /orgs/:orgId/documents` with the inline
 * `uploadDocumentSchema` payload `{type, fileName, mimeType, contentBase64,
 * visibility?}`. Type/visibility option labels use the raw enum values: the
 * frozen dictionary has no keys for them.
 */
export function UploadDocumentForm({ locale, orgId }: { locale: LocaleCode; orgId: string }) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<(typeof DOCUMENT_TYPES)[number]>('OTHER');
  const [visibility, setVisibility] =
    useState<(typeof DOCUMENT_VISIBILITIES)[number]>('ORGANIZATION');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  useFocusFirstError(fields);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setFields({});
    if (!file) return;

    const allowedExtensions = EXTENSIONS_BY_TYPE[file.type];
    if (!allowedExtensions) {
      setFields({ fileName: dict.errors.validation });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setFields({ fileName: dict.errors.validation });
      return;
    }
    const lower = file.name.toLowerCase();
    if (!allowedExtensions.some((extension) => lower.endsWith(extension))) {
      setFields({ fileName: dict.errors.validation });
      return;
    }

    setBusy(true);
    try {
      const contentBase64 = toBase64(await file.arrayBuffer());
      await api.post(`/orgs/${orgId}/documents`, {
        type,
        fileName: file.name,
        mimeType: file.type,
        contentBase64,
        visibility,
      });
      setMessage(dict.workspace.documents.uploaded);
      setFile(null);
      const input = document.getElementById('doc-upload-file') as HTMLInputElement | null;
      if (input) input.value = '';
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
    'h-10 mt-1 w-full rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100';

  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold text-sand-900">
        {dict.workspace.documents.uploadTitle}
      </h2>
      <p className="mt-1 text-sm text-sand-500">{dict.workspace.documents.hint}</p>
      <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <label htmlFor="doc-upload-file" className="block text-sm font-medium text-sand-700">
            {dict.workspace.documents.fileName}
          </label>
          <input
            id="doc-upload-file"
            type="file"
            required
            aria-invalid={!!fields.fileName || undefined}
            accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm text-sand-700 file:me-3 file:rounded-lg file:border-0 file:bg-sand-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-sand-700 hover:file:bg-sand-200"
          />
          <p className="mt-1 text-xs text-sand-500">{dict.workspace.documents.chooseFile}</p>
          {fields.fileName ? (
            <p role="alert" className="mt-1 text-sm text-red-700">
              {fields.fileName}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor="doc-upload-type" className="block text-sm font-medium text-sand-700">
            {dict.workspace.documents.typeLabel}
          </label>
          <select
            id="doc-upload-type"
            value={type}
            onChange={(event) => setType(event.target.value as typeof type)}
            className={inputClass}
          >
            {DOCUMENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="doc-upload-visibility"
            className="block text-sm font-medium text-sand-700"
          >
            {dict.workspace.documents.visibilityLabel}
          </label>
          <select
            id="doc-upload-visibility"
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as typeof visibility)}
            className={inputClass}
          >
            {DOCUMENT_VISIBILITIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={busy || !file} className="w-full">
            {dict.workspace.documents.upload}
          </Button>
        </div>
      </form>
      {error ? (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      ) : null}
      {message ? (
        <Alert tone="success" className="mt-3">
          {message}
        </Alert>
      ) : null}
    </Card>
  );
}

/**
 * Soft-delete one tenant file —
 * `DELETE /orgs/:orgId/documents/:documentId` (uploader or manager; the
 * server refuses while the file is evidence of an open verification).
 */
export function DeleteDocumentButton({
  locale,
  orgId,
  documentId,
  fileName,
}: {
  locale: LocaleCode;
  orgId: string;
  documentId: string;
  fileName: string;
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function remove(): Promise<void> {
    if (!(await confirm(dict.workspace.documents.confirmDelete))) return;
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await api.delete(`/orgs/${orgId}/documents/${documentId}`);
      setMessage(dict.workspace.documents.deleted);
      router.refresh();
    } catch (cause) {
      setError(
        `${fileName}: ${errorMessageFor(cause, {
          errors: dict.errors,
          genericFallback: dict.errors.generic,
        })}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="text-red-700 hover:border-red-300 hover:bg-red-50 focus-visible:outline-red-700"
        disabled={busy}
        onClick={remove}
      >
        {dict.workspace.documents.delete}
      </Button>
      {error ? (
        <span role="alert" className="max-w-64 text-end text-xs text-red-700">
          {error}
        </span>
      ) : null}
      {message ? (
        <span role="status" className="text-xs text-brand-800">
          {message}
        </span>
      ) : null}
    </span>
  );
}
