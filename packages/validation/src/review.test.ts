import { describe, expect, it } from 'vitest';
import { createReviewSchema, reviewParamsSchema, updateReviewSchema } from './opportunity';

const UUID = '3c53878a-c567-4de1-9b78-89d38168cd63';

describe('review schemas (P24)', () => {
  it('accepts a stars-only review (body optional)', () => {
    const parsed = createReviewSchema.parse({ rating: 4 });
    expect(parsed.rating).toBe(4);
    expect(parsed.body).toBeUndefined();
  });

  it('accepts a rating with a body and trims it', () => {
    const parsed = createReviewSchema.parse({
      rating: 5,
      body: '  Clear briefing, great team.  ',
    });
    expect(parsed.body).toBe('Clear briefing, great team.');
  });

  it('rejects ratings outside the 1–5 star scale', () => {
    for (const rating of [0, 6, 4.5, '5', null, undefined]) {
      expect(createReviewSchema.safeParse({ rating }).success, String(rating)).toBe(false);
    }
  });

  it('caps the written body at 2000 characters', () => {
    expect(createReviewSchema.safeParse({ rating: 3, body: 'x'.repeat(2000) }).success).toBe(true);
    expect(createReviewSchema.safeParse({ rating: 3, body: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('rejects a whitespace-only body (send nothing instead)', () => {
    expect(createReviewSchema.safeParse({ rating: 3, body: '   ' }).success).toBe(false);
  });

  it('edit accepts either field, with null clearing the text', () => {
    expect(updateReviewSchema.safeParse({ rating: 2 }).success).toBe(true);
    expect(updateReviewSchema.safeParse({ body: null }).success).toBe(true);
    expect(updateReviewSchema.safeParse({ rating: 5, body: 'Better next time' }).success).toBe(
      true,
    );
    expect(updateReviewSchema.safeParse({ body: '   ' }).success).toBe(false);
  });

  it('edit rejects an empty patch (neither rating nor body)', () => {
    expect(updateReviewSchema.safeParse({}).success).toBe(false);
  });

  it('review params pair the initiative slug with the review uuid', () => {
    const parsed = reviewParamsSchema.parse({ slug: 'algiers-park-cleanup', reviewId: UUID });
    expect(parsed.slug).toBe('algiers-park-cleanup');
    expect(parsed.reviewId).toBe(UUID);
    expect(
      reviewParamsSchema.safeParse({ slug: 'algiers-park-cleanup', reviewId: 'nope' }).success,
    ).toBe(false);
  });
});
