import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '@bladna/types';
import { env } from '../env';

/**
 * Object storage adapter.
 *
 * Drivers:
 *  - `local` : files written under STORAGE_LOCAL_DIR (default `./var/storage`).
 *              Real filesystem storage — suitable for single-node deploys.
 *  - `s3`    : S3-compatible; requires bucket credentials, otherwise a clear
 *              CONFIG_ERROR (no fake uploads).
 */

export interface StoredObject {
  key: string;
  url: string;
  size: number;
  contentType: string;
}

export interface PutObjectInput {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
}

function localRoot(): string {
  return path.resolve(process.cwd(), env.storageLocalDir);
}

function assertKey(key: string): void {
  if (!/^[a-zA-Z0-9!_.*'()/-]+$/.test(key) || key.includes('..')) {
    throw AppError.validation('Invalid storage key.');
  }
}

export async function putObject(input: PutObjectInput): Promise<StoredObject> {
  assertKey(input.key);
  if (env.storageDriver === 's3') {
    throw AppError.config(
      'S3 storage driver requires bucket credentials to be configured. Set STORAGE_DRIVER=local for filesystem storage.',
    );
  }
  const full = path.join(localRoot(), input.key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, input.body);
  return {
    key: input.key,
    url: `/api/v1/files?key=${encodeURIComponent(input.key)}`,
    size: input.body.byteLength,
    contentType: input.contentType,
  };
}

export async function getObject(key: string): Promise<{ body: Buffer; contentType: string }> {
  assertKey(key);
  if (env.storageDriver === 's3') {
    throw AppError.config('S3 storage driver requires bucket credentials to be configured.');
  }
  try {
    const body = await readFile(path.join(localRoot(), key));
    return { body, contentType: contentTypeForKey(key) };
  } catch {
    throw AppError.notFound('File not found.');
  }
}

/**
 * Best-effort removal of an object whose database registration failed, so a
 * rejected upload never leaves orphan bytes on disk. Missing files are fine
 * (the write may never have landed); real I/O errors are swallowed because the
 * caller is already unwinding from a failure.
 */
export async function removeObject(key: string): Promise<void> {
  assertKey(key);
  if (env.storageDriver === 's3') return; // putObject refuses to write for s3
  try {
    await unlink(path.join(localRoot(), key));
  } catch {
    /* already gone */
  }
}

export function contentTypeForKey(key: string): string {
  const ext = path.extname(key).toLowerCase();
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.json': 'application/json',
  };
  return map[ext] ?? 'application/octet-stream';
}

/** Content types accepted for user uploads (§60). */
export const ALLOWED_UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
