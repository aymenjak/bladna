// International demo dataset: programmes abroad that Algerian volunteers can
// apply to, with countries, official programme sources, applications and a
// few completed experiences (the "volunteer passport").
//
// Programme frameworks and their URLs are real public programmes; the hosting
// organizations and the individual offers are illustrative demo content.
// Create-once (guarded by the first source name). Dates are relative to the
// run date so deadlines stay in the future.

import type { getPrisma } from './index';

type Prisma = ReturnType<typeof getPrisma>;
type Benefit = 'INCLUDED' | 'NOT_INCLUDED' | 'UNKNOWN';

const DAY = 24 * 60 * 60 * 1000;
const day = (n: number): Date => {
  const d = new Date(Date.now() + n * DAY);
  d.setUTCHours(9, 0, 0, 0);
  return d;
};

const COUNTRIES = [
  { code: 'TN', nameAr: 'تونس', nameFr: 'Tunisie', nameEn: 'Tunisia' },
  { code: 'MA', nameAr: 'المغرب', nameFr: 'Maroc', nameEn: 'Morocco' },
  { code: 'ES', nameAr: 'إسبانيا', nameFr: 'Espagne', nameEn: 'Spain' },
  { code: 'FR', nameAr: 'فرنسا', nameFr: 'France', nameEn: 'France' },
  { code: 'IT', nameAr: 'إيطاليا', nameFr: 'Italie', nameEn: 'Italy' },
  { code: 'PT', nameAr: 'البرتغال', nameFr: 'Portugal', nameEn: 'Portugal' },
  { code: 'TR', nameAr: 'تركيا', nameFr: 'Turquie', nameEn: 'Turkey' },
  { code: 'JO', nameAr: 'الأردن', nameFr: 'Jordanie', nameEn: 'Jordan' },
  { code: 'SN', nameAr: 'السنغال', nameFr: 'Sénégal', nameEn: 'Senegal' },
  { code: 'DE', nameAr: 'ألمانيا', nameFr: 'Allemagne', nameEn: 'Germany' },
] as const;

const SOURCES = [
  {
    key: 'esc',
    name: 'European Solidarity Corps',
    url: 'https://youth.europa.eu/solidarity_en',
    domain: 'youth.europa.eu',
  },
  {
    key: 'erasmus',
    name: 'Erasmus+ — Youth exchanges',
    url: 'https://erasmus-plus.ec.europa.eu',
    domain: 'erasmus-plus.ec.europa.eu',
  },
  { key: 'unv', name: 'UN Volunteers (UNV)', url: 'https://www.unv.org', domain: 'unv.org' },
  {
    key: 'sci',
    name: 'Service Civil International — workcamps',
    url: 'https://sci.ngo',
    domain: 'sci.ngo',
  },
] as const;

interface Offer {
  country: (typeof COUNTRIES)[number]['code'];
  city: string;
  source: (typeof SOURCES)[number]['key'];
  program: string;
  provider: string;
  category:
    | 'VOLUNTEERING'
    | 'YOUTH_EXCHANGE'
    | 'ENVIRONMENTAL_PROJECT'
    | 'HUMANITARIAN_PROJECT'
    | 'EDUCATIONAL_PROJECT'
    | 'CULTURAL_PROJECT'
    | 'DIGITAL_VOLUNTEERING'
    | 'INTERNATIONAL_CAMP';
  title: { ar: string; fr: string; en: string };
  description: { ar: string; fr: string; en: string };
  skills: string;
  minAge: number;
  maxAge?: number;
  languages: string;
  duration: string;
  start: number; // days from now
  lengthDays: number;
  deadline: number;
  benefits: Partial<
    Record<
      | 'accommodation'
      | 'food'
      | 'transportation'
      | 'insurance'
      | 'visaSupport'
      | 'training'
      | 'certificateProvided'
      | 'fees'
      | 'allowance'
      | 'travelSupport',
      Benefit
    >
  >;
}

const OFFERS: Offer[] = [
  {
    country: 'ES',
    city: 'Almería',
    source: 'esc',
    program: 'European Solidarity Corps — volunteering project',
    provider: 'Red Mediterránea Verde (demo)',
    category: 'ENVIRONMENTAL_PROJECT',
    title: {
      ar: 'حماية السواحل والحياة البحرية في ألميريا',
      fr: 'Protection du littoral et de la vie marine à Almería',
      en: 'Coastal and marine life protection in Almería',
    },
    description: {
      ar: 'مشروع تطوعي لمدة شهرين: تنظيف الشواطئ، رصد السلاحف البحرية، وتنشيط ورشات توعية لتلاميذ المدارس.',
      fr: 'Projet de deux mois : nettoyage des plages, suivi des tortues marines et ateliers de sensibilisation dans les écoles.',
      en: 'A two-month project: beach clean-ups, sea-turtle monitoring and awareness workshops in schools.',
    },
    skills: 'Environmental awareness, teamwork, basic Spanish or English',
    minAge: 18,
    maxAge: 30,
    languages: 'English (B1) or Spanish (A2)',
    duration: '2 months',
    start: 75,
    lengthDays: 60,
    deadline: 30,
    benefits: {
      accommodation: 'INCLUDED',
      food: 'INCLUDED',
      insurance: 'INCLUDED',
      travelSupport: 'INCLUDED',
      allowance: 'INCLUDED',
      training: 'INCLUDED',
      certificateProvided: 'INCLUDED',
      fees: 'NOT_INCLUDED',
    },
  },
  {
    country: 'TN',
    city: 'Djerba',
    source: 'sci',
    program: 'International workcamp',
    provider: 'Association Jeunes du Sud (demo)',
    category: 'INTERNATIONAL_CAMP',
    title: {
      ar: 'مخيم دولي لترميم التراث في جربة',
      fr: 'Chantier international de restauration du patrimoine à Djerba',
      en: 'International heritage restoration workcamp in Djerba',
    },
    description: {
      ar: 'أسبوعان مع شباب من 8 دول لترميم بيوت تقليدية (منازل) وتنظيم أنشطة ثقافية مع السكان.',
      fr: 'Deux semaines avec des jeunes de 8 pays pour restaurer des maisons traditionnelles (menzel) et animer des activités culturelles.',
      en: 'Two weeks with young people from 8 countries restoring traditional houses (menzel) and running cultural activities.',
    },
    skills: 'Manual work, intercultural curiosity',
    minAge: 18,
    languages: 'French or English',
    duration: '2 weeks',
    start: 40,
    lengthDays: 14,
    deadline: 18,
    benefits: {
      accommodation: 'INCLUDED',
      food: 'INCLUDED',
      insurance: 'UNKNOWN',
      travelSupport: 'NOT_INCLUDED',
      fees: 'INCLUDED',
      certificateProvided: 'INCLUDED',
    },
  },
  {
    country: 'FR',
    city: 'Marseille',
    source: 'esc',
    program: 'European Solidarity Corps — volunteering project',
    provider: 'Maison des Solidarités Marseille (demo)',
    category: 'HUMANITARIAN_PROJECT',
    title: {
      ar: 'مرافقة العائلات المهاجرة في مرسيليا',
      fr: 'Accompagnement des familles migrantes à Marseille',
      en: 'Supporting migrant families in Marseille',
    },
    description: {
      ar: 'مساعدة في دروس اللغة والدعم المدرسي وتوجيه العائلات نحو الخدمات الاجتماعية لمدة 6 أشهر.',
      fr: 'Cours de langue, soutien scolaire et orientation des familles vers les services sociaux pendant 6 mois.',
      en: 'Language classes, homework support and guiding families to social services for 6 months.',
    },
    skills: 'Arabic and French, empathy, teaching',
    minAge: 18,
    maxAge: 30,
    languages: 'French (B2), Arabic',
    duration: '6 months',
    start: 120,
    lengthDays: 180,
    deadline: 45,
    benefits: {
      accommodation: 'INCLUDED',
      food: 'INCLUDED',
      insurance: 'INCLUDED',
      visaSupport: 'INCLUDED',
      allowance: 'INCLUDED',
      travelSupport: 'INCLUDED',
      training: 'INCLUDED',
      certificateProvided: 'INCLUDED',
    },
  },
  {
    country: 'IT',
    city: 'Palermo',
    source: 'erasmus',
    program: 'Erasmus+ Youth Exchange',
    provider: 'Giovani Ponti del Mediterraneo (demo)',
    category: 'YOUTH_EXCHANGE',
    title: {
      ar: 'تبادل شبابي: الفن من أجل التغيير في باليرمو',
      fr: 'Échange de jeunes : l’art pour le changement à Palerme',
      en: 'Youth exchange: art for change in Palermo',
    },
    description: {
      ar: '10 أيام من الورشات الفنية مع شباب من 6 بلدان متوسطية حول قضايا الهجرة والهوية.',
      fr: '10 jours d’ateliers artistiques avec des jeunes de 6 pays méditerranéens sur la migration et l’identité.',
      en: '10 days of art workshops with young people from 6 Mediterranean countries on migration and identity.',
    },
    skills: 'Drawing, music, theatre or video — any level',
    minAge: 18,
    maxAge: 25,
    languages: 'English (A2)',
    duration: '10 days',
    start: 55,
    lengthDays: 10,
    deadline: 21,
    benefits: {
      accommodation: 'INCLUDED',
      food: 'INCLUDED',
      travelSupport: 'INCLUDED',
      insurance: 'INCLUDED',
      fees: 'NOT_INCLUDED',
      certificateProvided: 'INCLUDED',
    },
  },
  {
    country: 'SN',
    city: 'Saint-Louis',
    source: 'unv',
    program: 'UN Volunteers — national & international assignments',
    provider: 'Programme éducation Saint-Louis (demo)',
    category: 'EDUCATIONAL_PROJECT',
    title: {
      ar: 'دعم التعليم الأساسي في سان لويس بالسنغال',
      fr: 'Appui à l’éducation de base à Saint-Louis, Sénégal',
      en: 'Supporting basic education in Saint-Louis, Senegal',
    },
    description: {
      ar: 'مهمة تطوعية لمدة 9 أشهر لتكوين المعلمين وتطوير موارد تعليمية رقمية.',
      fr: 'Mission de 9 mois pour former les enseignants et développer des ressources pédagogiques numériques.',
      en: 'A 9-month assignment training teachers and building digital learning resources.',
    },
    skills: 'Teaching degree, digital tools, project management',
    minAge: 22,
    languages: 'French (C1)',
    duration: '9 months',
    start: 150,
    lengthDays: 270,
    deadline: 60,
    benefits: {
      accommodation: 'INCLUDED',
      allowance: 'INCLUDED',
      insurance: 'INCLUDED',
      travelSupport: 'INCLUDED',
      visaSupport: 'INCLUDED',
      training: 'INCLUDED',
    },
  },
  {
    country: 'JO',
    city: 'Amman',
    source: 'unv',
    program: 'UN Volunteers — online volunteering',
    provider: 'Refugee Learning Hub (demo)',
    category: 'DIGITAL_VOLUNTEERING',
    title: {
      ar: 'تطوع عن بعد: ترجمة محتوى تعليمي للاجئين',
      fr: 'Bénévolat en ligne : traduire des contenus éducatifs pour les réfugiés',
      en: 'Online volunteering: translating learning content for refugees',
    },
    description: {
      ar: 'ترجمة وتدقيق دروس قصيرة من الإنجليزية إلى العربية، 5 ساعات أسبوعيًا من منزلك.',
      fr: 'Traduire et relire de courtes leçons de l’anglais vers l’arabe, 5 heures par semaine depuis chez vous.',
      en: 'Translate and proofread short lessons from English into Arabic, 5 hours a week from home.',
    },
    skills: 'Translation EN→AR, attention to detail',
    minAge: 18,
    languages: 'Arabic (native), English (B2)',
    duration: '3 months · remote',
    start: 10,
    lengthDays: 90,
    deadline: 8,
    benefits: {
      accommodation: 'NOT_INCLUDED',
      fees: 'NOT_INCLUDED',
      certificateProvided: 'INCLUDED',
      training: 'INCLUDED',
    },
  },
  {
    country: 'MA',
    city: 'Ouarzazate',
    source: 'sci',
    program: 'International workcamp',
    provider: 'Chantiers Atlas Solidaire (demo)',
    category: 'ENVIRONMENTAL_PROJECT',
    title: {
      ar: 'مخيم دولي لمكافحة التصحر في ورزازات',
      fr: 'Chantier international contre la désertification à Ouarzazate',
      en: 'International workcamp against desertification in Ouarzazate',
    },
    description: {
      ar: 'غرس الأشجار وبناء حواجز رملية مع سكان الواحة لمدة 3 أسابيع.',
      fr: 'Plantation d’arbres et construction de brise-sable avec les habitants de l’oasis pendant 3 semaines.',
      en: 'Tree planting and building sand barriers with the oasis community for 3 weeks.',
    },
    skills: 'Physical work outdoors',
    minAge: 18,
    languages: 'French or Arabic',
    duration: '3 weeks',
    start: 95,
    lengthDays: 21,
    deadline: 50,
    benefits: {
      accommodation: 'INCLUDED',
      food: 'INCLUDED',
      fees: 'INCLUDED',
      travelSupport: 'NOT_INCLUDED',
    },
  },
  {
    country: 'PT',
    city: 'Porto',
    source: 'esc',
    program: 'European Solidarity Corps — volunteering teams',
    provider: 'Casa Comum Porto (demo)',
    category: 'CULTURAL_PROJECT',
    title: {
      ar: 'فريق تطوعي لمهرجان الثقافات في بورتو',
      fr: 'Équipe de volontaires pour le festival des cultures de Porto',
      en: 'Volunteering team for the Porto festival of cultures',
    },
    description: {
      ar: 'تنظيم الاستقبال والورشات خلال مهرجان ثقافي متعدد الجنسيات لمدة شهر.',
      fr: 'Accueil et animation d’ateliers pendant un festival multiculturel d’un mois.',
      en: 'Hosting visitors and running workshops during a month-long multicultural festival.',
    },
    skills: 'Event support, languages, communication',
    minAge: 18,
    maxAge: 30,
    languages: 'English (B1)',
    duration: '1 month',
    start: 160,
    lengthDays: 30,
    deadline: 70,
    benefits: {
      accommodation: 'INCLUDED',
      food: 'INCLUDED',
      insurance: 'INCLUDED',
      travelSupport: 'INCLUDED',
      allowance: 'INCLUDED',
      certificateProvided: 'INCLUDED',
    },
  },
  {
    country: 'TR',
    city: 'Gaziantep',
    source: 'unv',
    program: 'UN Volunteers — humanitarian assignment',
    provider: 'Community Relief Centre (demo)',
    category: 'HUMANITARIAN_PROJECT',
    title: {
      ar: 'دعم نفسي واجتماعي للأطفال في غازي عنتاب',
      fr: 'Soutien psychosocial aux enfants à Gaziantep',
      en: 'Psychosocial support for children in Gaziantep',
    },
    description: {
      ar: 'تنشيط فضاءات صديقة للطفل وأنشطة ترفيهية مع فرق محلية لمدة 6 أشهر.',
      fr: 'Animation d’espaces amis des enfants et d’activités récréatives avec les équipes locales pendant 6 mois.',
      en: 'Running child-friendly spaces and recreational activities with local teams for 6 months.',
    },
    skills: 'Psychology or social work studies, Arabic',
    minAge: 23,
    languages: 'Arabic, English (B2)',
    duration: '6 months',
    start: 100,
    lengthDays: 180,
    deadline: 35,
    benefits: {
      accommodation: 'INCLUDED',
      allowance: 'INCLUDED',
      insurance: 'INCLUDED',
      visaSupport: 'INCLUDED',
      travelSupport: 'INCLUDED',
      training: 'INCLUDED',
    },
  },
  {
    country: 'DE',
    city: 'Berlin',
    source: 'erasmus',
    program: 'Erasmus+ Youth — training course',
    provider: 'Jugendbrücke Berlin (demo)',
    category: 'EDUCATIONAL_PROJECT',
    title: {
      ar: 'دورة تكوينية: إدارة المشاريع الجمعوية في برلين',
      fr: 'Formation : gestion de projets associatifs à Berlin',
      en: 'Training course: managing youth projects in Berlin',
    },
    description: {
      ar: 'أسبوع تكويني لقادة الجمعيات الشبابية حول التخطيط والتمويل وقياس الأثر.',
      fr: 'Une semaine de formation pour les responsables associatifs : planification, financement et mesure d’impact.',
      en: 'A one-week course for youth leaders on planning, funding and impact measurement.',
    },
    skills: 'Active member of a youth organization',
    minAge: 18,
    languages: 'English (B2)',
    duration: '7 days',
    start: 65,
    lengthDays: 7,
    deadline: 25,
    benefits: {
      accommodation: 'INCLUDED',
      food: 'INCLUDED',
      travelSupport: 'INCLUDED',
      visaSupport: 'INCLUDED',
      fees: 'NOT_INCLUDED',
      certificateProvided: 'INCLUDED',
    },
  },
  {
    country: 'TN',
    city: 'Tabarka',
    source: 'erasmus',
    program: 'Erasmus+ Youth Exchange',
    provider: 'Club Méditerranée Jeunesse (demo)',
    category: 'YOUTH_EXCHANGE',
    title: {
      ar: 'تبادل شبابي مغاربي حول الاقتصاد الأخضر في طبرقة',
      fr: 'Échange maghrébin sur l’économie verte à Tabarka',
      en: 'Maghreb youth exchange on the green economy in Tabarka',
    },
    description: {
      ar: 'شباب من الجزائر وتونس والمغرب يعملون معًا على مشاريع صغيرة صديقة للبيئة.',
      fr: 'Des jeunes d’Algérie, de Tunisie et du Maroc travaillent ensemble sur de petits projets verts.',
      en: 'Young people from Algeria, Tunisia and Morocco co-design small green projects.',
    },
    skills: 'Interest in entrepreneurship and environment',
    minAge: 18,
    maxAge: 28,
    languages: 'Arabic or French',
    duration: '8 days',
    start: 28,
    lengthDays: 8,
    deadline: 12,
    benefits: {
      accommodation: 'INCLUDED',
      food: 'INCLUDED',
      travelSupport: 'INCLUDED',
      fees: 'NOT_INCLUDED',
    },
  },
  {
    country: 'ES',
    city: 'Granada',
    source: 'esc',
    program: 'European Solidarity Corps — volunteering project',
    provider: 'Fundación Alhambra Joven (demo)',
    category: 'CULTURAL_PROJECT',
    title: {
      ar: 'توثيق التراث الأندلسي المشترك في غرناطة',
      fr: 'Documenter le patrimoine andalou partagé à Grenade',
      en: 'Documenting shared Andalusian heritage in Granada',
    },
    description: {
      ar: 'تصوير ورقمنة مخطوطات ومعالم وإنتاج محتوى تعريفي بالعربية والإسبانية.',
      fr: 'Photographier et numériser manuscrits et monuments, produire des contenus en arabe et en espagnol.',
      en: 'Photograph and digitise manuscripts and monuments, and produce content in Arabic and Spanish.',
    },
    skills: 'Photography, history, Arabic',
    minAge: 18,
    maxAge: 30,
    languages: 'Arabic, English or Spanish (B1)',
    duration: '4 months',
    start: 140,
    lengthDays: 120,
    deadline: 55,
    benefits: {
      accommodation: 'INCLUDED',
      food: 'INCLUDED',
      insurance: 'INCLUDED',
      allowance: 'INCLUDED',
      travelSupport: 'INCLUDED',
      certificateProvided: 'INCLUDED',
    },
  },
];

export async function seedInternational(
  prisma: Prisma,
  volunteers: Array<{ userId: string; profileId: string }>,
  demoProfileId: string,
): Promise<number> {
  const exists = await prisma.opportunitySource.findFirst({ where: { name: SOURCES[0].name } });
  if (exists) return 0;

  const countryIds = new Map<string, string>();
  for (const c of COUNTRIES) {
    const row = await prisma.country.upsert({ where: { code: c.code }, update: {}, create: c });
    countryIds.set(c.code, row.id);
  }
  const sourceIds = new Map<string, string>();
  for (const s of SOURCES) {
    const row = await prisma.opportunitySource.create({
      data: {
        name: s.name,
        sourceType: 'OFFICIAL',
        url: s.url,
        domain: s.domain,
        official: true,
        verified: true,
        lastCheckedAt: day(-3),
      },
    });
    sourceIds.set(s.key, row.id);
  }

  const offerIds: string[] = [];
  for (const [i, o] of OFFERS.entries()) {
    const source = SOURCES.find((s) => s.key === o.source)!;
    const start = day(o.start);
    const row = await prisma.internationalOpportunity.create({
      data: {
        titleAr: o.title.ar,
        titleFr: o.title.fr,
        titleEn: o.title.en,
        descriptionAr: o.description.ar,
        descriptionFr: o.description.fr,
        descriptionEn: o.description.en,
        countryId: countryIds.get(o.country),
        city: o.city,
        program: o.program,
        provider: o.provider,
        category: o.category,
        skills: o.skills,
        eligibility: 'Open to Algerian residents meeting the age and language requirements.',
        ageRequirements: o.maxAge ? `${o.minAge}–${o.maxAge}` : `${o.minAge}+`,
        minAge: o.minAge,
        maxAge: o.maxAge ?? null,
        languageRequirements: o.languages,
        duration: o.duration,
        startDate: start,
        endDate: new Date(start.getTime() + o.lengthDays * DAY),
        deadline: day(o.deadline),
        ...o.benefits,
        applicationMethod: 'Apply on BLADNA, then confirm on the official programme portal.',
        officialSource: source.name,
        sourceUrl: source.url,
        sourceId: sourceIds.get(o.source),
        sourceType: 'OFFICIAL',
        verificationStatus: 'VERIFIED',
        verifiedAt: day(-2 - i),
        createdAt: day(-10 - i),
      },
    });
    await prisma.internationalVerificationEvent.create({
      data: {
        opportunityId: row.id,
        status: 'VERIFIED',
        notes: 'Programme framework and source domain checked.',
        checkedAt: day(-2 - i),
      },
    });
    offerIds.push(row.id);
  }

  // Applications: a handful per offer, plus the core demo volunteer on two.
  const statuses = ['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW', 'ACCEPTED'] as const;
  for (const [i, offerId] of offerIds.entries()) {
    const applicants = volunteers.slice((i * 5) % volunteers.length).slice(0, 3 + (i % 4));
    for (const [j, v] of applicants.entries()) {
      await prisma.internationalApplication.create({
        data: {
          opportunityId: offerId,
          volunteerProfileId: v.profileId,
          status: statuses[(i + j) % statuses.length]!,
          motivationLetter: 'أرغب في اكتساب تجربة دولية ونقل ما أتعلمه إلى جمعيتي في الجزائر.',
          languages: 'Arabic, French, English',
          availability: 'Full period',
          passportReadiness: (['READY', 'IN_PROGRESS', 'READY'] as const)[j % 3]!,
          submittedAt: day(-(1 + j + (i % 5))),
        },
      });
    }
  }
  for (const [k, offerId] of offerIds.slice(0, 2).entries()) {
    await prisma.internationalApplication.create({
      data: {
        opportunityId: offerId,
        volunteerProfileId: demoProfileId,
        status: k === 0 ? 'SHORTLISTED' : 'SUBMITTED',
        motivationLetter: 'أشارك منذ سنتين في حملات تنظيف الشواطئ وأريد تعلم مناهج جديدة.',
        languages: 'Arabic, French, English',
        availability: 'Full period',
        passportReadiness: 'READY',
        submittedAt: day(-3 - k),
      },
    });
  }

  // Completed experiences abroad (volunteer passport), a few verified.
  const PAST = [
    {
      country: 'TN',
      org: 'Association Jeunes du Sud',
      program: 'International workcamp',
      hours: 80,
    },
    {
      country: 'ES',
      org: 'Red Mediterránea Verde',
      program: 'European Solidarity Corps',
      hours: 320,
    },
    {
      country: 'IT',
      org: 'Giovani Ponti del Mediterraneo',
      program: 'Erasmus+ Youth Exchange',
      hours: 60,
    },
    {
      country: 'MA',
      org: 'Chantiers Atlas Solidaire',
      program: 'International workcamp',
      hours: 120,
    },
  ] as const;
  const travellers = [{ profileId: demoProfileId }, ...volunteers.slice(0, 7)];
  for (const [i, v] of travellers.entries()) {
    const p = PAST[i % PAST.length]!;
    const start = day(-200 - i * 30);
    await prisma.internationalExperience.create({
      data: {
        volunteerProfileId: v.profileId,
        countryId: countryIds.get(p.country),
        organizationName: p.org,
        program: p.program,
        role: 'Volunteer',
        activity: 'Field activities and community workshops',
        startDate: start,
        endDate: new Date(start.getTime() + 21 * DAY),
        hours: p.hours,
        verified: i % 2 === 0,
        verifiedAt: i % 2 === 0 ? new Date(start.getTime() + 40 * DAY) : null,
      },
    });
  }
  return offerIds.length;
}
