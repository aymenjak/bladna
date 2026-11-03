import type { ApiErrorBody, ApiMeta, ErrorCode } from '@bladna/types';

/**
 * Browser API client for `/api/v1`.
 *
 * Parses the success/failure envelope on every response and throws a typed
 * `ApiClientError` carrying the stable server error code, so pages can react
 * (e.g. MFA_REQUIRED → show the code screen) instead of matching strings.
 */

export class ApiClientError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiClientError';
    this.code = body.code;
    this.status = status;
    this.details = body.details;
  }
}

export interface ApiResult<T> {
  data: T;
  meta?: ApiMeta;
}

const BASE = '/api/v1';

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export async function apiFetch<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiResult<T>> {
  const { method = 'GET', body, signal } = options;
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        'accept-language': typeof navigator === 'undefined' ? 'ar' : navigator.language,
        // Middleware skips /api — forward the page locale for server-side copy.
        'x-locale': typeof document === 'undefined' ? 'ar' : document.documentElement.lang || 'ar',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiClientError(0, { code: 'EXTERNAL_SERVICE_ERROR', message: 'network' });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiClientError(response.status, {
      code: 'INTERNAL_ERROR',
      message: `Unexpected response (${response.status}).`,
    });
  }

  const envelope = payload as { success?: boolean; data?: T; meta?: ApiMeta; error?: ApiErrorBody };
  if (!envelope.success) {
    throw new ApiClientError(
      response.status,
      envelope.error ?? {
        code: 'INTERNAL_ERROR',
        message: `Unexpected response (${response.status}).`,
      },
    );
  }
  return { data: envelope.data as T, meta: envelope.meta };
}

/** Convenience wrappers. */
export const api = {
  get: <T>(path: string, signal?: AbortSignal) => apiFetch<T>(path, signal ? { signal } : {}),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    apiFetch<T>(path, { method: 'POST', body, ...(signal ? { signal } : {}) }),
  patch: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    apiFetch<T>(path, { method: 'PATCH', body, ...(signal ? { signal } : {}) }),
  put: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    apiFetch<T>(path, { method: 'PUT', body, ...(signal ? { signal } : {}) }),
  delete: <T>(path: string, signal?: AbortSignal) =>
    apiFetch<T>(path, { method: 'DELETE', ...(signal ? { signal } : {}) }),
};

/**
 * Extract per-field messages from a VALIDATION_ERROR envelope:
 * `details` is `[{ path, code, message }]` (see @bladna/validation errors.ts).
 */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiClientError) || !Array.isArray(error.details)) return {};
  const result: Record<string, string> = {};
  for (const issue of error.details as unknown[]) {
    if (!issue || typeof issue !== 'object') continue;
    const { path, message } = issue as { path?: unknown; message?: unknown };
    if (typeof path === 'string' && typeof message === 'string' && path && !result[path]) {
      result[path] = message;
    }
  }
  return result;
}

/** Follow `?next=` only when it is a same-site absolute path (no open redirects). */
export function safeNext(next: string | null | undefined, fallback: string): string {
  // Backslashes are normalized to `/` by URL parsers (`/\evil.com` → `//evil.com`),
  // so any path containing one is rejected alongside the classic `//` prefix.
  return typeof next === 'string' && next.startsWith('/') && !next.includes('\\') ? next : fallback;
}

/** Map an API failure to localized UI copy (falls back to the server message). */
export function errorMessageFor(
  error: unknown,
  dict: { errors: Record<string, string>; genericFallback: string },
): string {
  if (error instanceof ApiClientError) {
    if (error.message === 'network') return dict.errors.network ?? dict.genericFallback;
    const known = dict.errors[error.code as unknown as string];
    // Prefer the server's specific message when it is human-readable;
    // fall back to generic code copy for machine-ish messages.
    if (error.message && error.message.length > 2) return error.message;
    if (known) return known;
  }
  if (error instanceof Error && error.message) return error.message;
  return dict.genericFallback;
}
