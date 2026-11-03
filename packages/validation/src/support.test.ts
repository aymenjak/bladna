import { describe, expect, it } from 'vitest';
import {
  createOpportunitySchema,
  createSupportNeedSchema,
  createSupportOfferSchema,
  decideSupportOfferSchema,
  updateSupportNeedSchema,
  updateOpportunitySchema,
} from './opportunity';
import { opportunityFiltersSchema } from './volunteer';

const needBase = {
  labelAr: 'أكياس بذور',
  labelFr: 'Sacs de graines',
  labelEn: 'Seed bags',
};

describe('support need schema (spec §5)', () => {
  it('accepts a financial need with a target amount and no quantity', () => {
    const parsed = createSupportNeedSchema.parse({
      kind: 'FINANCIAL',
      ...needBase,
      labelAr: 'شراء مواد',
      labelFr: 'Achat de matériel',
      labelEn: 'Material purchase',
      targetAmount: 150000,
    });
    expect(parsed.kind).toBe('FINANCIAL');
    expect(parsed.targetAmount).toBe(150000);
    expect(parsed.fulfilled).toBe(0);
  });

  it('rejects a financial need without a target amount', () => {
    expect(
      createSupportNeedSchema.safeParse({
        kind: 'FINANCIAL',
        ...needBase,
        labelAr: 'شراء مواد',
        labelFr: 'Achat',
        labelEn: 'Purchase',
      }).success,
    ).toBe(false);
  });

  it('rejects a quantity on a financial need', () => {
    expect(
      createSupportNeedSchema.safeParse({
        kind: 'FINANCIAL',
        ...needBase,
        labelAr: 'شراء مواد',
        labelFr: 'Achat',
        labelEn: 'Purchase',
        targetAmount: 1000,
        quantity: 5,
      }).success,
    ).toBe(false);
  });

  it('rejects a target amount on a quantity need', () => {
    expect(
      createSupportNeedSchema.safeParse({
        kind: 'MATERIAL',
        ...needBase,
        targetAmount: 1000,
      }).success,
    ).toBe(false);
  });

  it('rejects fulfilled progress beyond the declared quantity', () => {
    expect(
      createSupportNeedSchema.safeParse({
        kind: 'MATERIAL',
        ...needBase,
        quantity: 500,
        fulfilled: 501,
      }).success,
    ).toBe(false);
    expect(
      createSupportNeedSchema.safeParse({
        kind: 'MATERIAL',
        ...needBase,
        quantity: 500,
        fulfilled: 500,
      }).success,
    ).toBe(true);
  });

  it('merges partial updates through the same rules (update schema is partial)', () => {
    const patch = updateSupportNeedSchema.safeParse({ fulfilled: 20 });
    expect(patch.success).toBe(true);
    // The server merge-validates the patch against the create schema, so a
    // patch that would produce an invalid row still fails there:
    const invalidMerge = createSupportNeedSchema.safeParse({
      kind: 'FINANCIAL',
      ...needBase,
      labelAr: 'شراء',
      labelFr: 'Achat',
      labelEn: 'Buy',
      targetAmount: 1000,
      quantity: 3, // kept from a hypothetical row — must fail
      fulfilled: 0,
    });
    expect(invalidMerge.success).toBe(false);
  });
});

describe('support offer schema (spec §13)', () => {
  it('accepts a described offer with optional measures', () => {
    expect(
      createSupportOfferSchema.safeParse({
        supportNeedId: '3f2b9a10-1111-4222-8333-444455556666',
        description: 'Nous livrons 50 sacs de terreau vendredi.',
        quantity: 50,
        contactNote: 'Livraison le matin.',
      }).success,
    ).toBe(true);
  });

  it('requires a meaningful description', () => {
    expect(
      createSupportOfferSchema.safeParse({
        supportNeedId: '3f2b9a10-1111-4222-8333-444455556666',
        description: 'ok',
      }).success,
    ).toBe(false);
  });

  it('requires a reason when rejecting, never when accepting', () => {
    expect(
      decideSupportOfferSchema.safeParse({ action: 'REJECT', reason: 'We already have enough.' })
        .success,
    ).toBe(true);
    expect(decideSupportOfferSchema.safeParse({ action: 'REJECT' }).success).toBe(false);
    expect(decideSupportOfferSchema.safeParse({ action: 'REJECT', reason: 'x' }).success).toBe(
      false,
    );
    expect(decideSupportOfferSchema.safeParse({ action: 'ACCEPT' }).success).toBe(true);
  });
});

describe('initiative narrative triplets (spec §4)', () => {
  const titles = {
    titleAr: 'أ',
    titleFr: 'a',
    titleEn: 'a',
    descriptionAr: 'وصف',
    descriptionFr: 'desc',
    descriptionEn: 'desc',
    type: 'LOCAL' as const,
    locationType: 'PHYSICAL' as const,
  };

  it('accepts no problem/objective at all', () => {
    expect(createOpportunitySchema.safeParse(titles).success).toBe(true);
  });

  it('rejects a problem written in only one language', () => {
    expect(
      createOpportunitySchema.safeParse({ ...titles, problemAr: 'لا نظافة في الحي.' }).success,
    ).toBe(false);
  });

  it('accepts complete problem + objective triplets', () => {
    expect(
      createOpportunitySchema.safeParse({
        ...titles,
        problemAr: 'لا نظافة في الحي.',
        problemFr: "Le quartier n'est pas propre.",
        problemEn: 'The neighborhood is not clean.',
        objectiveAr: 'تنظيم حملة نظافة.',
        objectiveFr: 'Organiser une campagne de propreté.',
        objectiveEn: 'Organize a cleanup campaign.',
      }).success,
    ).toBe(true);
  });

  it('applies the same all-or-nothing rule on partial updates', () => {
    expect(updateOpportunitySchema.safeParse({ objectiveEn: 'Goal' }).success).toBe(false);
    expect(
      updateOpportunitySchema.safeParse({
        objectiveAr: 'الهدف',
        objectiveFr: 'Le but',
        objectiveEn: 'The goal',
      }).success,
    ).toBe(true);
  });
});

describe('discover needs filter (spec §11)', () => {
  it('accepts volunteers + any + every support kind', () => {
    for (const needs of ['VOLUNTEERS', 'ANY', 'FINANCIAL', 'EQUIPMENT', 'MATERIAL', 'SERVICE']) {
      expect(opportunityFiltersSchema.safeParse({ needs }).success).toBe(true);
    }
  });

  it('rejects unknown need values', () => {
    expect(opportunityFiltersSchema.safeParse({ needs: 'MONEY' }).success).toBe(false);
  });
});
