/** URL-safe slug helpers. */

const SEPARATORS = /[^\p{L}\p{N}]+/gu;

export function slugify(input: string, maxLength = 80): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(SEPARATORS, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return slug || 'item';
}

/** Append -2, -3… until the candidate is free. */
export function uniqueSlug(base: string, existing: ReadonlySet<string>): string {
  const root = slugify(base);
  if (!existing.has(root)) return root;
  for (let i = 2; i < 10_000; i += 1) {
    const candidate = `${root}-${i}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${root}-${Date.now()}`;
}
