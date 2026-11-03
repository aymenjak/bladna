// Helpers for interpreting Prisma known request errors as stable API errors.
//
// Each check tries the strict `instanceof` first, then falls back to a
// structural match. The fallback exists because the Next 16 Turbopack build
// can evaluate the generated Prisma client (a CommonJS `export *` module —
// the build itself flags it) in more than one module instance: the thrown
// error then carries the same `code`/`clientVersion` fields but a different
// class identity, and `instanceof` returns false. Observed 2026-09-26: the
// duplicate-application P2002 escaped the guard as an INTERNAL_ERROR instead
// of the 409 conflict (E2E `volunteer-apply` under next@16.3.6). No other
// error type in this codebase exposes `code` + `clientVersion`, so the shape
// is unambiguous.

import { Prisma } from '@bladna/database';

function isKnownRequestError(error: unknown, code: string): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === code;
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'clientVersion' in error &&
    (error as { code: unknown }).code === code
  );
}

export function isUniqueViolation(error: unknown): boolean {
  return isKnownRequestError(error, 'P2002');
}

export function isForeignKeyViolation(error: unknown): boolean {
  return isKnownRequestError(error, 'P2003');
}

export function isRecordNotFound(error: unknown): boolean {
  return isKnownRequestError(error, 'P2025');
}
