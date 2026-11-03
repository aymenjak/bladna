// API response envelopes and the centralized error model (spec §55, §88).

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'MFA_REQUIRED'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'BUSINESS_RULE_ERROR'
  | 'CONFIG_ERROR'
  | 'NOT_IMPLEMENTED'
  | 'EXTERNAL_SERVICE_ERROR'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'INTERNAL_ERROR';

export interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  cursor?: string | null;
  nextCursor?: string | null;
  requestId?: string;
  [key: string]: unknown;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: ApiMeta;
}

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  /** Structured validation details — field paths, never stack traces. */
  details?: unknown;
}

export interface ApiFailure {
  success: false;
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface Paginated<T> {
  items: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const HTTP_STATUS_BY_ERROR_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  MFA_REQUIRED: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  BUSINESS_RULE_ERROR: 422,
  CONFIG_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  EXTERNAL_SERVICE_ERROR: 502,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  INTERNAL_ERROR: 500,
};

/**
 * Application error carrying a stable machine-readable code.
 * Handlers map this to the API failure envelope; the message is safe to expose,
 * internal details belong in `internalMessage` which is only logged.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  readonly internalMessage?: string;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { details?: unknown; internalMessage?: string; cause?: unknown },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.status = HTTP_STATUS_BY_ERROR_CODE[code];
    this.details = options?.details;
    this.internalMessage = options?.internalMessage;
  }

  static notFound(message = 'Resource not found.'): AppError {
    return new AppError('NOT_FOUND', message);
  }

  static unauthorized(message = 'Authentication required.'): AppError {
    return new AppError('UNAUTHORIZED', message);
  }

  static forbidden(message = 'You are not authorized to perform this action.'): AppError {
    return new AppError('FORBIDDEN', message);
  }

  static conflict(message: string, details?: unknown): AppError {
    return new AppError('CONFLICT', message, { details });
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError('VALIDATION_ERROR', message, { details });
  }

  static businessRule(message: string, details?: unknown): AppError {
    return new AppError('BUSINESS_RULE_ERROR', message, { details });
  }

  static rateLimited(message = 'Too many requests. Please try again later.'): AppError {
    return new AppError('RATE_LIMITED', message);
  }

  /** Missing/invalid MFA on a step-up protected action (403, code MFA_REQUIRED). */
  static mfaRequired(message = 'Two-factor authentication is required for this action.'): AppError {
    return new AppError('MFA_REQUIRED', message);
  }

  /** Server misconfiguration (missing integration credentials, …). Message is operator-facing but contains no secrets. */
  static config(message: string, internalMessage?: string): AppError {
    return new AppError('CONFIG_ERROR', message, { internalMessage });
  }

  /** Known capability that is intentionally not wired in this build. */
  static notImplemented(message = 'This capability is not available in this build.'): AppError {
    return new AppError('NOT_IMPLEMENTED', message);
  }

  static internal(internalMessage: string, cause?: unknown): AppError {
    return new AppError('INTERNAL_ERROR', 'An unexpected error occurred.', {
      internalMessage,
      cause,
    });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function success<T>(data: T, meta?: ApiMeta): ApiSuccess<T> {
  return meta ? { success: true, data, meta } : { success: true, data };
}

export function failure(error: ApiErrorBody): ApiFailure {
  return { success: false, error };
}
