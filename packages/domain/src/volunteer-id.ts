// Volunteer ID generation (spec §10): e.g. BLD-ALG-000001.
// The format is configurable through the `volunteerId.format` Setting:
//   {PREFIX}-{REGION}-{SEQ:6}
// The sequence is allocated transactionally (Counter table) by the caller.

export interface VolunteerIdFormat {
  prefix: string;
  /** Literal middle segment, e.g. "ALG" or a wilaya code like "16". */
  region: string;
  /** Zero-padded sequence width. */
  width: number;
}

export const DEFAULT_VOLUNTEER_ID_FORMAT: VolunteerIdFormat = {
  prefix: 'BLD',
  region: 'ALG',
  width: 6,
};

export const VOLUNTEER_ID_FORMAT_TEMPLATE = '{PREFIX}-{REGION}-{SEQ:6}';

export function parseVolunteerIdFormat(format?: string | null): VolunteerIdFormat {
  if (!format) return { ...DEFAULT_VOLUNTEER_ID_FORMAT };
  const match =
    /^\{(?<prefix>[A-Z0-9]{1,8})\}-\{(?<region>[A-Z0-9]{1,8})\}-\{SEQ:(?<width>\d{1,3})\}$/.exec(
      format.trim().toUpperCase(),
    );
  if (!match?.groups) {
    return { ...DEFAULT_VOLUNTEER_ID_FORMAT };
  }
  return {
    prefix: match.groups.prefix,
    region: match.groups.region,
    width: Number(match.groups.width),
  };
}

export function renderVolunteerId(format: VolunteerIdFormat, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error('Volunteer ID sequence must be a positive integer.');
  }
  const padded = String(sequence).padStart(format.width, '0');
  return `${format.prefix}-${format.region}-${padded}`;
}

/** Validation pattern matching a rendered volunteer ID of the given format. */
export function volunteerIdPattern(format: VolunteerIdFormat): RegExp {
  return new RegExp(`^${format.prefix}-${format.region}-\\d{${format.width}}$`);
}

export function isValidVolunteerId(
  value: string,
  format: VolunteerIdFormat = DEFAULT_VOLUNTEER_ID_FORMAT,
): boolean {
  return volunteerIdPattern(format).test(value.toUpperCase());
}
