import { ZodError } from 'zod';
import { AppError } from '@bladna/types';

/** Convert a ZodError into a stable VALIDATION_ERROR with field details. */
export function toValidationError(error: ZodError, message = 'Validation failed.'): AppError {
  const details = error.issues.map((issue) => ({
    path: issue.path.join('.'),
    code: issue.code,
    message: issue.message,
  }));
  return AppError.validation(message, details);
}

/** Parse input or throw AppError(VALIDATION_ERROR). */
export function parseOrThrow<T>(schema: { parse: (input: unknown) => T }, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) throw toValidationError(error);
    throw error;
  }
}
