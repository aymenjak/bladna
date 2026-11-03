import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VOLUNTEER_ID_FORMAT,
  isValidVolunteerId,
  parseVolunteerIdFormat,
  renderVolunteerId,
} from './volunteer-id';

describe('volunteer ID', () => {
  it('renders the default format', () => {
    expect(renderVolunteerId(DEFAULT_VOLUNTEER_ID_FORMAT, 1)).toBe('BLD-ALG-000001');
    expect(renderVolunteerId(DEFAULT_VOLUNTEER_ID_FORMAT, 123456)).toBe('BLD-ALG-123456');
  });

  it('supports configurable prefixes/widths', () => {
    const format = parseVolunteerIdFormat('{BLD}-{16}-{SEQ:4}');
    expect(format).toEqual({ prefix: 'BLD', region: '16', width: 4 });
    expect(renderVolunteerId(format, 42)).toBe('BLD-16-0042');
  });

  it('falls back to defaults on malformed format config', () => {
    expect(parseVolunteerIdFormat('nonsense')).toEqual(DEFAULT_VOLUNTEER_ID_FORMAT);
    expect(parseVolunteerIdFormat(null)).toEqual(DEFAULT_VOLUNTEER_ID_FORMAT);
  });

  it('treats the bare {PREFIX}-{REGION} template as unset', () => {
    const format = parseVolunteerIdFormat('{PREFIX}-{REGION}-{SEQ:6}');
    expect(format).toEqual(DEFAULT_VOLUNTEER_ID_FORMAT);
    expect(renderVolunteerId(format, 1)).toBe('BLD-ALG-000001');
  });

  it('validates rendered ids', () => {
    expect(isValidVolunteerId('BLD-ALG-000001')).toBe(true);
    expect(isValidVolunteerId('BLD-ALG-1')).toBe(false);
    expect(isValidVolunteerId('XXX-ALG-000001')).toBe(false);
    expect(isValidVolunteerId("Robert'); DROP TABLE volunteers;--")).toBe(false);
  });

  it('rejects non-positive sequences', () => {
    expect(() => renderVolunteerId(DEFAULT_VOLUNTEER_ID_FORMAT, 0)).toThrow();
    expect(() => renderVolunteerId(DEFAULT_VOLUNTEER_ID_FORMAT, 1.5)).toThrow();
  });
});
