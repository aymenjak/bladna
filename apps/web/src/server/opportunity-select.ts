// Shared Prisma select for opportunity list rows.
//
// `LIST_SELECT` is the canonical card/list projection (spec §16): discover,
// saved-opportunity lists and the personalized matching module all return
// exactly this shape, so every card surface renders the same fields. It lives
// in its own module so `modules/matching.ts` and `modules/opportunities.ts`
// can both use it without importing each other (a cycle would put
// `LIST_SELECT` in the temporal dead zone at module init).

import type { Prisma } from '@bladna/database';

export const LIST_SELECT = {
  id: true,
  slug: true,
  titleAr: true,
  titleFr: true,
  titleEn: true,
  type: true,
  locationType: true,
  categoryId: true,
  countryId: true,
  wilayaId: true,
  cityId: true,
  startDate: true,
  endDate: true,
  applicationDeadline: true,
  capacity: true,
  minimumAge: true,
  maximumAge: true,
  estimatedHours: true,
  latitude: true,
  longitude: true,
  status: true,
  publishedAt: true,
  viewCount: true,
  applicationCount: true,
  acceptedCount: true,
  createdAt: true,
  // Card cover (spec §4 presentation): the organizer's own image when set;
  // cards fall back to category art (see ui/components/initiative-card).
  coverImage: true,
  organization: {
    select: {
      id: true,
      name: true,
      slug: true,
      logo: true,
      verificationStatus: true,
      trustLevel: true,
    },
  },
  category: {
    select: { id: true, slug: true, nameAr: true, nameFr: true, nameEn: true, icon: true },
  },
  wilaya: { select: { id: true, code: true, nameAr: true, nameFr: true, nameEn: true } },
  city: { select: { id: true, nameAr: true, nameFr: true, nameEn: true } },
  skills: {
    select: {
      required: true,
      skill: { select: { id: true, nameAr: true, nameFr: true, nameEn: true, category: true } },
    },
  },
  benefits: { select: { benefitType: true, value: true, note: true } },
} as const satisfies Prisma.OpportunitySelect;
