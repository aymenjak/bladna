import { describe, expect, it } from 'vitest';
import { checkFieldsLocally, type ExtractionField } from './ai';

const EXPECTED = { fullName: 'Amina Berkane', docNumber: 'AB123456' };

function check(fields: ExtractionField[]) {
  return checkFieldsLocally({
    documentType: 'IDENTITY',
    fields,
    expected: EXPECTED,
  });
}

describe('checkFieldsLocally', () => {
  it('passes when every field matches at sufficient confidence', () => {
    const result = check([
      { name: 'fullName', value: '  Amina   Berkane ', confidence: 1 },
      { name: 'docNumber', value: 'ab123456', confidence: 0.9 },
    ]);
    expect(result.decision).toBe('pass');
    expect(result.checks).toHaveLength(2);
    expect(result.checks.every((c) => c.ok)).toBe(true);
  });

  it('fails only when every field confidently mismatches', () => {
    const result = check([
      { name: 'fullName', value: 'Someone Else', confidence: 1 },
      { name: 'docNumber', value: 'XX999999', confidence: 1 },
    ]);
    expect(result.decision).toBe('fail');
    expect(result.checks.every((c) => c.detail === 'mismatch')).toBe(true);
  });

  it('reviews a partial mismatch instead of failing outright', () => {
    const result = check([
      { name: 'fullName', value: 'Amina Berkane', confidence: 1 },
      { name: 'docNumber', value: 'XX999999', confidence: 1 },
    ]);
    expect(result.decision).toBe('review');
  });

  it('reviews a low-confidence value rather than treating it as forged', () => {
    const result = check([{ name: 'fullName', value: 'Amina Berkane', confidence: 0.4 }]);
    expect(result.decision).toBe('review');
    expect(result.checks[0]?.detail).toBe('low confidence');
  });

  it('reviews when fields were never extracted (missing is not a mismatch)', () => {
    const result = check([{ name: 'fullName', value: 'whoever', confidence: 1 }]);
    // expected has two fields, only one was extracted -> partial coverage
    expect(result.decision).toBe('review');
  });

  it('reviews when nothing was extracted at all (missing is neither pass nor fail)', () => {
    // An empty extraction produces one `missing` check per expected field. The
    // old logic counted every `missing` as a failure and answered "fail" —
    // unreadable evidence is a review case: never approval, never proof of
    // forgery. (An entirely empty `expected` is guarded separately and must
    // also never read as "pass".)
    const result = check([]);
    expect(result.checks).toHaveLength(Object.keys(EXPECTED).length);
    expect(result.checks.every((c) => c.detail === 'missing')).toBe(true);
    expect(result.decision).toBe('review');
  });
});
