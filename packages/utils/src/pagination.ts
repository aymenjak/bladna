// Pagination helpers — every list endpoint paginates (spec §57).

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PageParams {
  page: number;
  limit: number;
}

export interface NormalizedPage extends PageParams {
  skip: number;
  take: number;
}

export function normalizePageParams(
  input: { page?: unknown; limit?: unknown } = {},
  defaults: PageParams = { page: 1, limit: DEFAULT_PAGE_SIZE },
): NormalizedPage {
  const page = toPositiveInt(input.page, defaults.page);
  const limit = Math.min(toPositiveInt(input.limit, defaults.limit), MAX_PAGE_SIZE);
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

export function buildPageMeta(
  total: number,
  params: PageParams,
): {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
} {
  return {
    page: params.page,
    limit: params.limit,
    total,
    totalPages: params.limit > 0 ? Math.ceil(total / params.limit) : 0,
  };
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}
