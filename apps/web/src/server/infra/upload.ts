// Upload validation gate (spec §60).
//
// Every user-supplied file crosses this module BEFORE any byte reaches the
// storage adapter and before any database row exists:
//
//   1. size      — declared base64 length and decoded byte count vs MAX_UPLOAD_BYTES
//   2. MIME type — must be on ALLOWED_UPLOAD_TYPES (png/jpeg/webp/pdf)
//   3. content   — magic-byte sniff must agree with the declared MIME type
//   4. name      — the file name extension must agree with the declared MIME type
//
// A row is therefore only ever created for bytes that passed all four checks,
// which is what `Document.status = AVAILABLE` means. This build ships NO
// malware scanner: `PENDING_SCAN`/`QUARANTINED` remain reserved for a real
// scan stage, and nothing here claims to scan.

import { createHash } from 'node:crypto';
import { AppError } from '@bladna/types';
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from './storage';

/** File-name extension required for each accepted upload MIME type. */
const EXTENSIONS_BY_TYPE: Record<string, readonly string[]> = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
};

/** Longest base64 payload that can decode to MAX_UPLOAD_BYTES (plus padding). */
export const MAX_BASE64_CHARS = Math.ceil(MAX_UPLOAD_BYTES / 3) * 4 + 4;

/** Canonical extension for an accepted MIME type, or null when not accepted. */
export function extensionForType(mimeType: string): string | null {
  const extensions = EXTENSIONS_BY_TYPE[mimeType];
  return extensions ? extensions[0]! : null;
}

function startsWith(bytes: Buffer, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

/** Magic-byte sniff for the accepted upload types; unknown types never match. */
export function magicMatches(bytes: Buffer, mimeType: string): boolean {
  switch (mimeType) {
    case 'image/png':
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/jpeg':
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case 'application/pdf':
      return bytes.subarray(0, 5).toString('latin1') === '%PDF-';
    case 'image/webp':
      return (
        bytes.length >= 12 &&
        bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
        bytes.subarray(8, 12).toString('latin1') === 'WEBP'
      );
    default:
      return false;
  }
}

/**
 * Decodes a base64 payload with strict shape checks performed BEFORE decoding
 * (so oversized input never allocates), then re-checks the real byte count.
 */
export function decodeBase64Upload(content: string): Buffer {
  const compact = content.replace(/\s+/g, '');
  if (compact.length === 0) {
    throw AppError.validation('File content is required (base64-encoded).');
  }
  if (compact.length > MAX_BASE64_CHARS) {
    throw AppError.validation(`File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MiB limit.`);
  }
  if (compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    throw AppError.validation('File content is not valid base64.');
  }
  const bytes = Buffer.from(compact, 'base64');
  if (bytes.byteLength === 0) {
    throw AppError.validation('File content decoded to zero bytes.');
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw AppError.validation(`File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MiB limit.`);
  }
  return bytes;
}

/**
 * Runs checks 2–4 and returns the canonical storage extension for the file.
 * Throws VALIDATION_ERROR with a precise reason on the first failure.
 */
export function assertUploadAcceptable(input: {
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}): string {
  const { fileName, mimeType, bytes } = input;

  const allowedExtensions = EXTENSIONS_BY_TYPE[mimeType];
  if (!allowedExtensions || !ALLOWED_UPLOAD_TYPES.includes(mimeType as never)) {
    throw AppError.validation(
      `Unsupported content type "${mimeType}". Allowed: ${ALLOWED_UPLOAD_TYPES.join(', ')}.`,
    );
  }
  if (bytes.byteLength === 0) {
    throw AppError.validation('File is empty.');
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw AppError.validation(`File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MiB limit.`);
  }
  if (!magicMatches(bytes, mimeType)) {
    throw AppError.validation('File content does not match its declared content type.');
  }
  const lower = fileName.toLowerCase();
  if (!allowedExtensions.some((extension) => lower.endsWith(extension))) {
    throw AppError.validation(
      `File name must end in ${allowedExtensions.join(' or ')} to match "${mimeType}".`,
    );
  }
  return allowedExtensions[0]!;
}

/** Integrity fingerprint stored on the row (never exposed by the API). */
export function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
