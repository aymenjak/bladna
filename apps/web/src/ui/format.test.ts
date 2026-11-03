import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatTime } from './format';

describe('format helpers', () => {
  it('renders a locale clock time (P17) and refuses invalid input', () => {
    expect(formatTime('2026-09-30T10:05:00.000Z', 'en')).toMatch(/\d{1,2}:\d{2}/);
    expect(formatDate('2026-09-30T10:05:00.000Z', 'fr')).not.toBe('—');
    expect(formatDateTime('2026-09-30T10:05:00.000Z', 'ar')).not.toBe('—');

    expect(formatTime(null, 'en')).toBe('—');
    expect(formatTime('not-a-date', 'en')).toBe('—');
    expect(formatDate(undefined, 'en')).toBe('—');
  });
});
