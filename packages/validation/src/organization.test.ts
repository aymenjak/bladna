import { describe, expect, it } from 'vitest';
import { createOrganizationSchema } from './organization';
import { registerSponsorSchema } from './sponsors';
import { registerSchema } from './auth';

const CONSENTS = ['terms', 'privacy_policy'];

const validOrg = {
  name: 'Atlas Verts',
  organizationType: 'ASSOCIATION',
  officialEmail: 'contact@atlasverts.dz',
  consents: CONSENTS,
};

describe('createOrganizationSchema (tenant self-registration)', () => {
  it('accepts a minimal tenant and trims the name', () => {
    const parsed = createOrganizationSchema.parse({ ...validOrg, name: '  Atlas Verts  ' });
    expect(parsed.name).toBe('Atlas Verts');
    expect(parsed.officialEmail).toBe('contact@atlasverts.dz');
  });

  it('keeps the same consent bar as account registration (terms + privacy)', () => {
    expect(
      createOrganizationSchema.safeParse({ ...validOrg, consents: ['marketing_email'] }).success,
    ).toBe(false);
    expect(createOrganizationSchema.safeParse({ ...validOrg, consents: ['terms'] }).success).toBe(
      false,
    );
    expect(
      createOrganizationSchema.safeParse({
        ...validOrg,
        consents: ['terms', 'privacy_policy', 'data_processing'],
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown organization type', () => {
    expect(
      createOrganizationSchema.safeParse({ ...validOrg, organizationType: 'CLUB' }).success,
    ).toBe(false);
  });

  it('rejects a too-short name', () => {
    expect(createOrganizationSchema.safeParse({ ...validOrg, name: 'A' }).success).toBe(false);
  });

  it('rejects malformed optional locations and contact fields', () => {
    expect(
      createOrganizationSchema.safeParse({ ...validOrg, wilayaId: 'not-a-uuid' }).success,
    ).toBe(false);
    expect(createOrganizationSchema.safeParse({ ...validOrg, officialEmail: 'nope' }).success).toBe(
      false,
    );
    expect(createOrganizationSchema.safeParse({ ...validOrg, phone: 'abc' }).success).toBe(false);
    expect(createOrganizationSchema.safeParse({ ...validOrg, website: 'not a url' }).success).toBe(
      false,
    );
  });

  it('collects no representative block (the creating user becomes OWNER)', () => {
    // The schema previously carried a `representative` object with nowhere to
    // store it; it must neither be required nor survive parsing.
    const parsed = createOrganizationSchema.parse({
      ...validOrg,
      representative: { firstName: 'Ghost', lastName: 'Field' },
    });
    expect('representative' in parsed).toBe(false);
  });
});

describe('registerSponsorSchema (sponsor self-registration)', () => {
  const validSponsor = {
    legalName: 'Sahra Corp SARL',
    commercialName: 'Sahra Digital',
    contactEmail: 'hello@sahra.dz',
  };

  it('requires the registration consents the admin schema does not', () => {
    expect(registerSponsorSchema.safeParse(validSponsor).success).toBe(false);
    expect(registerSponsorSchema.safeParse({ ...validSponsor, consents: CONSENTS }).success).toBe(
      true,
    );
    // the platform/admin create schema stays consent-free
    expect('consents' in validSponsor).toBe(false);
  });

  it('enforces the admin field requirements (short legal name fails)', () => {
    expect(
      registerSponsorSchema.safeParse({
        ...validSponsor,
        legalName: 'S',
        consents: CONSENTS,
      }).success,
    ).toBe(false);
  });
});

describe('registration consent bar (shared schema)', () => {
  it('is identical across account, organization and sponsor registration', () => {
    const account = registerSchema.safeParse({
      email: 'a@b.dz',
      password: 'long-enough-password',
      firstName: 'A',
      lastName: 'B',
      consents: ['terms'],
    });
    const organization = createOrganizationSchema.safeParse({ ...validOrg, consents: ['terms'] });
    const sponsor = registerSponsorSchema.safeParse({
      legalName: 'Sahra Corp SARL',
      commercialName: 'Sahra Digital',
      contactEmail: 'hello@sahra.dz',
      consents: ['terms'],
    });
    // A single shared schema means all three reject the same partial consent.
    expect(account.success).toBe(false);
    expect(organization.success).toBe(false);
    expect(sponsor.success).toBe(false);
  });
});
