import { describe, expect, it } from 'vitest';
import { progressSegments } from './need-progress';

describe('progressSegments (P18 two-tone quantity bar)', () => {
  it('splits received and accepted without overlap', () => {
    expect(progressSegments(40, 10, 30)).toEqual({ received: 10, accepted: 30, total: 40 });
    expect(progressSegments(6, 0, 8)).toEqual({ received: 0, accepted: 6, total: 6 });
  });

  it('caps the accepted segment at what is left of the target', () => {
    // Accepted offers may overshoot (50 pledged against 40 needed) — the bar
    // still ends at the target, and received keeps its own space.
    expect(progressSegments(40, 10, 50)).toEqual({ received: 10, accepted: 30, total: 40 });
    expect(progressSegments(40, 40, 12)).toEqual({ received: 40, accepted: 0, total: 40 });
  });

  it('never paints negative progress (bad input stays at zero)', () => {
    expect(progressSegments(6, -3, -1)).toEqual({ received: 0, accepted: 0, total: 0 });
  });
});
