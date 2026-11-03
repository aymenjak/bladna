/**
 * BLADNA demo seed — demo-scoped and idempotent (spec §149, §150).
 *
 * Guard: refuses to run unless SEED_DEMO=true (or DEMO_MODE is truthy), so a
 * production `db:seed` can never silently populate demo data.
 *
 * Idempotent: every row is found by its natural key first; re-running the seed
 * never duplicates rows and never overwrites operator-made changes (link tables
 * upsert with `update: {}`, mutable records are created once and then left
 * alone). Counters are only bumped when the dependent row is actually created.
 *
 * Requires: DATABASE_URL with migrations 0001–0010 applied.
 * Run:      npm run db:seed
 *
 * Demo accounts (password for all: see DEMO_PASSWORD):
 *   admin@bladna.dz     SUPER_ADMIN — privileged /admin/* endpoints additionally
 *                       require TOTP (spec §145); enrol via /auth/two-factor/setup.
 *   org@bladna.dz       OWNER of the demo organization (atlas-verts).
 *   volunteer@bladna.dz Volunteer profile with verified experience.
 */

import { randomBytes } from 'node:crypto';
import { generateOpaqueSecret, passwordHasher } from '@bladna/auth';
import { parseVolunteerIdFormat, renderVolunteerId } from '@bladna/domain';
import { getPrisma, type Opportunity } from './index';
import { DEMO_PASSWORD } from './demo-accounts';

// ─────────────────────────────────────────────────────────────────────────────
// Guard & constants
// ─────────────────────────────────────────────────────────────────────────────

function envFlag(name: string): boolean {
  const value = (process.env[name] ?? '').trim().toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}

const SEED_ENABLED = envFlag('SEED_DEMO') || envFlag('DEMO_MODE');

// DEMO_PASSWORD (see ./demo-accounts) passes checkPasswordPolicy (no
// email-local-part overlap) and is shared with the login demo-access card.

/** Mirrors apps/web env POLICY_VERSION default — consent rows reference it. */
const POLICY_VERSION = process.env.POLICY_VERSION ?? '2026-01-01';

const ATTENDANCE_DAY = new Date('2026-09-15T00:00:00.000Z');
const PARK_CLEANUP_START = new Date('2026-10-10T09:00:00.000Z');
const PARK_CLEANUP_END = new Date('2026-10-10T13:00:00.000Z');

// ─────────────────────────────────────────────────────────────────────────────
// Reference data (Algeria-first: DZ country, the 58 official wilayas + capitals)
// ─────────────────────────────────────────────────────────────────────────────

const WILAYAS = [
  { code: '01', nameAr: 'أدرار', nameFr: 'Adrar', nameEn: 'Adrar' },
  { code: '02', nameAr: 'الشلف', nameFr: 'Chlef', nameEn: 'Chlef' },
  { code: '03', nameAr: 'الأغواط', nameFr: 'Laghouat', nameEn: 'Laghouat' },
  { code: '04', nameAr: 'أم البواقي', nameFr: 'Oum El Bouaghi', nameEn: 'Oum El Bouaghi' },
  { code: '05', nameAr: 'باتنة', nameFr: 'Batna', nameEn: 'Batna' },
  { code: '06', nameAr: 'بجاية', nameFr: 'Béjaïa', nameEn: 'Bejaia' },
  { code: '07', nameAr: 'بسكرة', nameFr: 'Biskra', nameEn: 'Biskra' },
  { code: '08', nameAr: 'بشار', nameFr: 'Béchar', nameEn: 'Bechar' },
  { code: '09', nameAr: 'البليدة', nameFr: 'Blida', nameEn: 'Blida' },
  { code: '10', nameAr: 'البويرة', nameFr: 'Bouira', nameEn: 'Bouira' },
  { code: '11', nameAr: 'تمنراست', nameFr: 'Tamanrasset', nameEn: 'Tamanrasset' },
  { code: '12', nameAr: 'تبسة', nameFr: 'Tébessa', nameEn: 'Tebessa' },
  { code: '13', nameAr: 'تلمسان', nameFr: 'Tlemcen', nameEn: 'Tlemcen' },
  { code: '14', nameAr: 'تيارت', nameFr: 'Tiaret', nameEn: 'Tiaret' },
  { code: '15', nameAr: 'تيزي وزو', nameFr: 'Tizi Ouzou', nameEn: 'Tizi Ouzou' },
  { code: '16', nameAr: 'الجزائر', nameFr: 'Alger', nameEn: 'Algiers' },
  { code: '17', nameAr: 'الجلفة', nameFr: 'Djelfa', nameEn: 'Djelfa' },
  { code: '18', nameAr: 'جيجل', nameFr: 'Jijel', nameEn: 'Jijel' },
  { code: '19', nameAr: 'سطيف', nameFr: 'Sétif', nameEn: 'Setif' },
  { code: '20', nameAr: 'سعيدة', nameFr: 'Saïda', nameEn: 'Saida' },
  { code: '21', nameAr: 'سكيكدة', nameFr: 'Skikda', nameEn: 'Skikda' },
  { code: '22', nameAr: 'سيدي بلعباس', nameFr: 'Sidi Bel Abbès', nameEn: 'Sidi Bel Abbes' },
  { code: '23', nameAr: 'عنابة', nameFr: 'Annaba', nameEn: 'Annaba' },
  { code: '24', nameAr: 'قالمة', nameFr: 'Guelma', nameEn: 'Guelma' },
  { code: '25', nameAr: 'قسنطينة', nameFr: 'Constantine', nameEn: 'Constantine' },
  { code: '26', nameAr: 'المدية', nameFr: 'Médéa', nameEn: 'Medea' },
  { code: '27', nameAr: 'مستغانم', nameFr: 'Mostaganem', nameEn: 'Mostaganem' },
  { code: '28', nameAr: 'المسيلة', nameFr: "M'Sila", nameEn: "M'Sila" },
  { code: '29', nameAr: 'معسكر', nameFr: 'Mascara', nameEn: 'Mascara' },
  { code: '30', nameAr: 'ورقلة', nameFr: 'Ouargla', nameEn: 'Ouargla' },
  { code: '31', nameAr: 'وهران', nameFr: 'Oran', nameEn: 'Oran' },
  { code: '32', nameAr: 'البيض', nameFr: 'El Bayadh', nameEn: 'El Bayadh' },
  { code: '33', nameAr: 'إليزي', nameFr: 'Illizi', nameEn: 'Illizi' },
  {
    code: '34',
    nameAr: 'برج بوعريريج',
    nameFr: 'Bordj Bou Arréridj',
    nameEn: 'Bordj Bou Arreridj',
  },
  { code: '35', nameAr: 'بومرداس', nameFr: 'Boumerdès', nameEn: 'Boumerdes' },
  { code: '36', nameAr: 'الطارف', nameFr: 'El Tarf', nameEn: 'El Tarf' },
  { code: '37', nameAr: 'تندوف', nameFr: 'Tindouf', nameEn: 'Tindouf' },
  { code: '38', nameAr: 'تيسمسيلت', nameFr: 'Tissemsilt', nameEn: 'Tissemsilt' },
  { code: '39', nameAr: 'الوادي', nameFr: 'El Oued', nameEn: 'El Oued' },
  { code: '40', nameAr: 'خنشلة', nameFr: 'Khenchela', nameEn: 'Khenchela' },
  { code: '41', nameAr: 'سوق أهراس', nameFr: 'Souk Ahras', nameEn: 'Souk Ahras' },
  { code: '42', nameAr: 'تيبازة', nameFr: 'Tipaza', nameEn: 'Tipaza' },
  { code: '43', nameAr: 'ميلة', nameFr: 'Mila', nameEn: 'Mila' },
  { code: '44', nameAr: 'عين الدفلى', nameFr: 'Aïn Defla', nameEn: 'Ain Defla' },
  { code: '45', nameAr: 'النعامة', nameFr: 'Naâma', nameEn: 'Naama' },
  { code: '46', nameAr: 'عين تموشنت', nameFr: 'Aïn Témouchent', nameEn: 'Ain Temouchent' },
  { code: '47', nameAr: 'غرداية', nameFr: 'Ghardaïa', nameEn: 'Ghardaia' },
  { code: '48', nameAr: 'غليزان', nameFr: 'Relizane', nameEn: 'Relizane' },
  { code: '49', nameAr: 'تيميمون', nameFr: 'Timimoun', nameEn: 'Timimoun' },
  {
    code: '50',
    nameAr: 'برج باجي مختار',
    nameFr: 'Bordj Badji Mokhtar',
    nameEn: 'Bordj Badji Mokhtar',
  },
  { code: '51', nameAr: 'أولاد جلال', nameFr: 'Ouled Djellal', nameEn: 'Ouled Djellal' },
  { code: '52', nameAr: 'بني عباس', nameFr: 'Béni Abbès', nameEn: 'Beni Abbes' },
  { code: '53', nameAr: 'عين صالح', nameFr: 'In Salah', nameEn: 'In Salah' },
  { code: '54', nameAr: 'عين قزام', nameFr: 'In Guezzam', nameEn: 'In Guezzam' },
  { code: '55', nameAr: 'تقرت', nameFr: 'Touggourt', nameEn: 'Touggourt' },
  { code: '56', nameAr: 'جانت', nameFr: 'Djanet', nameEn: 'Djanet' },
  { code: '57', nameAr: 'المغير', nameFr: "El M'Ghair", nameEn: "El M'Ghair" },
  { code: '58', nameAr: 'المنيعة', nameFr: 'El Meniaa', nameEn: 'El Meniaa' },
] as const;

const CITIES = [
  {
    wilayaCode: '01',
    nameAr: 'أدرار',
    nameFr: 'Adrar',
    nameEn: 'Adrar',
    latitude: 27.8742,
    longitude: -0.2938,
  },
  {
    wilayaCode: '05',
    nameAr: 'باتنة',
    nameFr: 'Batna',
    nameEn: 'Batna',
    latitude: 35.5567,
    longitude: 6.1741,
  },
  {
    wilayaCode: '06',
    nameAr: 'بجاية',
    nameFr: 'Béjaïa',
    nameEn: 'Béjaïa',
    latitude: 36.751,
    longitude: 5.081,
  },
  {
    wilayaCode: '09',
    nameAr: 'البليدة',
    nameFr: 'Blida',
    nameEn: 'Blida',
    latitude: 36.47,
    longitude: 2.83,
  },
  {
    wilayaCode: '13',
    nameAr: 'تلمسان',
    nameFr: 'Tlemcen',
    nameEn: 'Tlemcen',
    latitude: 34.8828,
    longitude: -1.3167,
  },
  {
    wilayaCode: '16',
    nameAr: 'الجزائر',
    nameFr: 'Alger',
    nameEn: 'Algiers',
    latitude: 36.7538,
    longitude: 3.0588,
  },
  {
    wilayaCode: '15',
    nameAr: 'تيزي وزو',
    nameFr: 'Tizi Ouzou',
    nameEn: 'Tizi Ouzou',
    latitude: 36.7118,
    longitude: 4.0497,
  },
  {
    wilayaCode: '23',
    nameAr: 'عنابة',
    nameFr: 'Annaba',
    nameEn: 'Annaba',
    latitude: 36.9,
    longitude: 7.7667,
  },
  {
    wilayaCode: '25',
    nameAr: 'قسنطينة',
    nameFr: 'Constantine',
    nameEn: 'Constantine',
    latitude: 36.365,
    longitude: 6.6147,
  },
  {
    wilayaCode: '31',
    nameAr: 'وهران',
    nameFr: 'Oran',
    nameEn: 'Oran',
    latitude: 35.6971,
    longitude: -0.6308,
  },
  {
    wilayaCode: '35',
    nameAr: 'بومرداس',
    nameFr: 'Boumerdès',
    nameEn: 'Boumerdès',
    latitude: 36.76,
    longitude: 3.47,
  },
  {
    wilayaCode: '42',
    nameAr: 'تيبازة',
    nameFr: 'Tipaza',
    nameEn: 'Tipaza',
    latitude: 36.5897,
    longitude: 2.4486,
  },
] as const;

const CATEGORIES = [
  {
    slug: 'environment',
    nameAr: 'البيئة',
    nameFr: 'Environnement',
    nameEn: 'Environment',
    sortOrder: 1,
  },
  { slug: 'education', nameAr: 'التعليم', nameFr: 'Éducation', nameEn: 'Education', sortOrder: 2 },
  {
    slug: 'humanitarian',
    nameAr: 'المساعدات الإنسانية',
    nameFr: 'Aide humanitaire',
    nameEn: 'Humanitarian Aid',
    sortOrder: 3,
  },
  { slug: 'health', nameAr: 'الصحة', nameFr: 'Santé', nameEn: 'Health', sortOrder: 4 },
  {
    slug: 'community',
    nameAr: 'التنمية المجتمعية',
    nameFr: 'Développement communautaire',
    nameEn: 'Community Development',
    sortOrder: 5,
  },
  {
    slug: 'culture',
    nameAr: 'الثقافة والتراث',
    nameFr: 'Culture et patrimoine',
    nameEn: 'Culture & Heritage',
    sortOrder: 6,
  },
  {
    slug: 'youth',
    nameAr: 'الشباب والرياضة',
    nameFr: 'Jeunesse et sport',
    nameEn: 'Youth & Sports',
    sortOrder: 7,
  },
  {
    slug: 'animal-welfare',
    nameAr: 'حماية الحيوانات',
    nameFr: 'Bien-être animal',
    nameEn: 'Animal Welfare',
    sortOrder: 8,
  },
] as const;

const SKILLS = [
  {
    nameAr: 'العمل الجماعي',
    nameFr: "Travail d'équipe",
    nameEn: 'Teamwork',
    category: 'soft_skills',
  },
  { nameAr: 'التواصل', nameFr: 'Communication', nameEn: 'Communication', category: 'soft_skills' },
  {
    nameAr: 'الإسعافات الأولية',
    nameFr: 'Premiers secours',
    nameEn: 'First Aid',
    category: 'health',
  },
  { nameAr: 'التدريس', nameFr: 'Enseignement', nameEn: 'Teaching', category: 'education' },
  {
    nameAr: 'جمع التبرعات',
    nameFr: 'Collecte de fonds',
    nameEn: 'Fundraising',
    category: 'soft_skills',
  },
  {
    nameAr: 'إدارة الفعاليات',
    nameFr: "Gestion d'événements",
    nameEn: 'Event Management',
    category: 'technical',
  },
  { nameAr: 'القيادة', nameFr: 'Conduite', nameEn: 'Driving', category: 'technical' },
  { nameAr: 'التصوير', nameFr: 'Photographie', nameEn: 'Photography', category: 'creative' },
  {
    nameAr: 'تطوير المواقع',
    nameFr: 'Développement web',
    nameEn: 'Web Development',
    category: 'digital',
  },
  { nameAr: 'الترجمة', nameFr: 'Traduction', nameEn: 'Translation', category: 'soft_skills' },
] as const;

const LANGUAGES = [
  { code: 'ar', nameAr: 'العربية', nameFr: 'Arabe', nameEn: 'Arabic' },
  { code: 'fr', nameAr: 'الفرنسية', nameFr: 'Français', nameEn: 'French' },
  { code: 'en', nameAr: 'الإنجليزية', nameFr: 'Anglais', nameEn: 'English' },
  { code: 'ber', nameAr: 'الأمازيغية', nameFr: 'Tamazight', nameEn: 'Tamazight' },
] as const;

const INTERESTS = [
  { code: 'environment', nameAr: 'البيئة', nameFr: 'Environnement', nameEn: 'Environment' },
  { code: 'education', nameAr: 'التعليم', nameFr: 'Éducation', nameEn: 'Education' },
  { code: 'health', nameAr: 'الصحة', nameFr: 'Santé', nameEn: 'Health' },
  { code: 'culture', nameAr: 'الثقافة', nameFr: 'Culture', nameEn: 'Culture' },
  { code: 'youth', nameAr: 'الشباب', nameFr: 'Jeunesse', nameEn: 'Youth' },
] as const;

// Partnerships & CSR ecosystem (P33): the shared vocabulary the deterministic
// matching engine compares — EconomicProfileFocusArea (what the firm funds)
// against OpportunityFocusArea (what the initiative touches). Codes are stable
// identifiers; labels are localized like every other catalog.
const CSR_FOCUS_AREAS = [
  { code: 'EDUCATION', nameAr: 'التعليم', nameFr: 'Éducation', nameEn: 'Education', sortOrder: 10 },
  { code: 'YOUTH', nameAr: 'الشباب', nameFr: 'Jeunesse', nameEn: 'Youth', sortOrder: 20 },
  { code: 'EMPLOYMENT', nameAr: 'التشغيل', nameFr: 'Emploi', nameEn: 'Employment', sortOrder: 30 },
  { code: 'DIGITAL', nameAr: 'الرقمنة', nameFr: 'Numérique', nameEn: 'Digital', sortOrder: 40 },
  {
    code: 'ENVIRONMENT',
    nameAr: 'البيئة',
    nameFr: 'Environnement',
    nameEn: 'Environment',
    sortOrder: 50,
  },
  { code: 'HEALTH', nameAr: 'الصحة', nameFr: 'Santé', nameEn: 'Health', sortOrder: 60 },
  { code: 'SPORT', nameAr: 'الرياضة', nameFr: 'Sport', nameEn: 'Sport', sortOrder: 70 },
  { code: 'CULTURE', nameAr: 'الثقافة', nameFr: 'Culture', nameEn: 'Culture', sortOrder: 80 },
  { code: 'SOCIAL', nameAr: 'العمل الاجتماعي', nameFr: 'Social', nameEn: 'Social', sortOrder: 90 },
  {
    code: 'DISABILITY',
    nameAr: 'دعم الأشخاص ذوي الإعاقة',
    nameFr: 'Handicap',
    nameEn: 'Disability',
    sortOrder: 100,
  },
  { code: 'WOMEN', nameAr: 'تمكين المرأة', nameFr: 'Femmes', nameEn: 'Women', sortOrder: 110 },
  {
    code: 'RURAL_DEVELOPMENT',
    nameAr: 'التطوير الريفي',
    nameFr: 'Développement rural',
    nameEn: 'Rural development',
    sortOrder: 120,
  },
  {
    code: 'ENTREPRENEURSHIP',
    nameAr: 'ريادة الأعمال',
    nameFr: 'Entrepreneuriat',
    nameEn: 'Entrepreneurship',
    sortOrder: 130,
  },
  {
    code: 'INNOVATION',
    nameAr: 'الابتكار',
    nameFr: 'Innovation',
    nameEn: 'Innovation',
    sortOrder: 140,
  },
  {
    code: 'COMMUNITY_DEVELOPMENT',
    nameAr: 'التطوير المجتمعي',
    nameFr: 'Développement communautaire',
    nameEn: 'Community development',
    sortOrder: 150,
  },
  { code: 'OTHER', nameAr: 'مجالات أخرى', nameFr: 'Autre', nameEn: 'Other', sortOrder: 999 },
] as const;

// Codes must stay in sync with packages/domain/src/achievements.ts
// (evaluateAchievements): unlocks that reference a missing catalog row cannot
// be persisted (FK) — this catalog is what makes unlocks durable.
const ACHIEVEMENTS: ReadonlyArray<{
  code: string;
  nameAr: string;
  nameFr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionFr: string;
  descriptionEn: string;
  thresholdHours: number | null;
  sortOrder: number;
}> = [
  {
    code: 'FIRST_ACTIVITY',
    nameAr: 'النشاط الأول',
    nameFr: 'Première activité',
    nameEn: 'First activity',
    descriptionAr: 'أتمّ المتطوع نشاطًا تطوعيًا واحدًا على الأقل.',
    descriptionFr: 'A réalisé au moins une activité de bénévolat.',
    descriptionEn: 'Completed at least one volunteer activity.',
    thresholdHours: null,
    sortOrder: 1,
  },
  {
    code: 'TEN_HOURS',
    nameAr: '10 ساعات',
    nameFr: '10 heures',
    nameEn: '10 hours',
    descriptionAr: '10 ساعات تطوع موثّقة.',
    descriptionFr: '10 heures de bénévolat vérifiées.',
    descriptionEn: '10 verified volunteer hours.',
    thresholdHours: 10,
    sortOrder: 2,
  },
  {
    code: 'TWENTY_FIVE_HOURS',
    nameAr: '25 ساعة',
    nameFr: '25 heures',
    nameEn: '25 hours',
    descriptionAr: '25 ساعة تطوع موثّقة.',
    descriptionFr: '25 heures de bénévolat vérifiées.',
    descriptionEn: '25 verified volunteer hours.',
    thresholdHours: 25,
    sortOrder: 3,
  },
  {
    code: 'FIFTY_HOURS',
    nameAr: '50 ساعة',
    nameFr: '50 heures',
    nameEn: '50 hours',
    descriptionAr: '50 ساعة تطوع موثّقة.',
    descriptionFr: '50 heures de bénévolat vérifiées.',
    descriptionEn: '50 verified volunteer hours.',
    thresholdHours: 50,
    sortOrder: 4,
  },
  {
    code: 'ONE_HUNDRED_HOURS',
    nameAr: '100 ساعة',
    nameFr: '100 heures',
    nameEn: '100 hours',
    descriptionAr: '100 ساعة تطوع موثّقة.',
    descriptionFr: '100 heures de bénévolat vérifiées.',
    descriptionEn: '100 verified volunteer hours.',
    thresholdHours: 100,
    sortOrder: 5,
  },
  {
    code: 'TWO_HUNDRED_FIFTY_HOURS',
    nameAr: '250 ساعة',
    nameFr: '250 heures',
    nameEn: '250 hours',
    descriptionAr: '250 ساعة تطوع موثّقة.',
    descriptionFr: '250 heures de bénévolat vérifiées.',
    descriptionEn: '250 verified volunteer hours.',
    thresholdHours: 250,
    sortOrder: 6,
  },
  {
    code: 'INTERNATIONAL_VOLUNTEER',
    nameAr: 'متطوع دولي',
    nameFr: 'Bénévole international',
    nameEn: 'International volunteer',
    descriptionAr: 'تجربة تطوع دولي واحدة على الأقل.',
    descriptionFr: 'Au moins une expérience de bénévolat international.',
    descriptionEn: 'At least one international volunteering experience.',
    thresholdHours: null,
    sortOrder: 7,
  },
  {
    code: 'SKILL_VERIFIED',
    nameAr: 'مهارة موثقة',
    nameFr: 'Compétence vérifiée',
    nameEn: 'Verified skill',
    descriptionAr: 'موثّقت مهارة واحدة على الأقل من طرف منظمة.',
    descriptionFr: 'Au moins une compétence vérifiée par une organisation.',
    descriptionEn: 'At least one skill verified by an organization.',
    thresholdHours: null,
    sortOrder: 8,
  },
  {
    code: 'CERTIFICATE_COLLECTION',
    nameAr: 'مجموعة الشهادات',
    nameFr: 'Collection de certificats',
    nameEn: 'Certificate collection',
    descriptionAr: 'خمس شهادات سارية على الأقل.',
    descriptionFr: 'Au moins cinq certificats valides.',
    descriptionEn: 'At least five valid certificates.',
    thresholdHours: null,
    sortOrder: 9,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function must<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`Seed dependency missing: ${label}`);
  }
  return value;
}

interface SeedUserInput {
  email: string;
  firstName: string;
  lastName: string;
  preferredLanguage: 'AR' | 'FR' | 'EN';
  roles: Array<'USER' | 'VOLUNTEER' | 'SUPER_ADMIN'>;
}

/** Create-once user: re-runs never re-hash or overwrite an existing account. */
async function ensureUser(input: SeedUserInput) {
  const prisma = getPrisma();
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) return existing;
  const passwordHash = await passwordHasher.hash(DEMO_PASSWORD);
  return prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      preferredLanguage: input.preferredLanguage,
      roles: input.roles,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
}

/** `BLD-CERT-` + uppercase base36 — mirrors apps/web .../certificates.ts. */
function nextCertificateNumber(): string {
  const suffix = BigInt(`0x${randomBytes(6).toString('hex')}`)
    .toString(36)
    .toUpperCase()
    .padStart(9, '0');
  return `BLD-CERT-${suffix}`;
}

interface InitiativeContent {
  problemAr: string;
  problemFr: string;
  problemEn: string;
  objectiveAr: string;
  objectiveFr: string;
  objectiveEn: string;
  latitude: number;
  longitude: number;
}

/**
 * Demo narrative / coordinates / contact for an initiative — fills blanks only,
 * so a re-run never overwrites operator edits (triplets stay all-or-nothing,
 * matching the API's narrative rules).
 */
async function backfillInitiative(
  id: string,
  current: Opportunity,
  content: InitiativeContent,
): Promise<void> {
  const hasProblem = Boolean(current.problemAr && current.problemFr && current.problemEn);
  const hasObjective = Boolean(current.objectiveAr && current.objectiveFr && current.objectiveEn);
  const hasCoords = current.latitude !== null && current.longitude !== null;
  const hasContact = Boolean(current.contactName);
  if (hasProblem && hasObjective && hasCoords && hasContact) return;
  await getPrisma().opportunity.update({
    where: { id },
    data: {
      ...(hasProblem
        ? {}
        : {
            problemAr: content.problemAr,
            problemFr: content.problemFr,
            problemEn: content.problemEn,
          }),
      ...(hasObjective
        ? {}
        : {
            objectiveAr: content.objectiveAr,
            objectiveFr: content.objectiveFr,
            objectiveEn: content.objectiveEn,
          }),
      ...(hasCoords ? {} : { latitude: content.latitude, longitude: content.longitude }),
      ...(hasContact
        ? {}
        : {
            contactName: 'Karim Haddad',
            contactPhone: '+213 555 12 34 56',
            contactEmail: 'org@bladna.dz',
          }),
    },
  });
}

interface DemoNeed {
  kind: 'FINANCIAL' | 'EQUIPMENT' | 'MATERIAL' | 'SERVICE';
  labelAr: string;
  labelFr: string;
  labelEn: string;
  description: string;
  quantity?: number;
  fulfilled?: number;
  targetAmount?: number;
  sortOrder: number;
}

/** Create-once support need (natural key: initiative + kind + labelEn). */
async function ensureNeed(opportunityId: string, need: DemoNeed): Promise<string> {
  const prisma = getPrisma();
  const existing = await prisma.supportNeed.findFirst({
    where: { opportunityId, kind: need.kind, labelEn: need.labelEn },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.supportNeed.create({ data: { opportunityId, ...need } });
  return created.id;
}

/** Create-once support offer (natural key: need + description). */
async function ensureOffer(
  supportNeedId: string,
  userId: string,
  offer: {
    description: string;
    quantity?: number;
    amount?: number;
    status?: 'PENDING' | 'ACCEPTED';
    contactNote?: string;
    decidedById?: string;
    decidedAt?: Date;
  },
): Promise<void> {
  const prisma = getPrisma();
  const existing = await prisma.supportOffer.findFirst({
    where: { supportNeedId, description: offer.description },
    select: { id: true },
  });
  if (existing) return;
  await prisma.supportOffer.create({ data: { supportNeedId, userId, ...offer } });
}

/** Create-once impact metric (natural key: initiative + name). */
async function ensureMetric(
  opportunityId: string,
  metric: {
    metricType: 'VOLUNTEERS' | 'HOURS' | 'BENEFICIARIES' | 'ACTIVITIES' | 'TREES';
    name: string;
    target?: number;
    actual: number;
    unit: string;
    source: string;
  },
): Promise<void> {
  const prisma = getPrisma();
  const existing = await prisma.impactMetric.findFirst({
    where: { opportunityId, name: metric.name },
    select: { id: true },
  });
  if (existing) return;
  await prisma.impactMetric.create({ data: { opportunityId, ...metric } });
}

// Sections the admin Content console can place featured targets into
// (mirrors PlacementSection in schema.prisma).
type PlacementSectionName =
  | 'HOME_HERO'
  | 'HOME_FEATURED_OPPORTUNITIES'
  | 'HOME_FEATURED_ORGANIZATIONS'
  | 'HOME_CAMPAIGNS'
  | 'DISCOVER_FEATURED';

/** Idempotent featured placement — public rails drop dead targets anyway. */
async function ensurePlacement(
  section: PlacementSectionName,
  targetType: 'OPPORTUNITY' | 'ORGANIZATION' | 'CAMPAIGN',
  targetId: string,
  position: number,
): Promise<void> {
  const prisma = getPrisma();
  await prisma.featuredPlacement.upsert({
    where: { section_targetType_targetId: { section, targetType, targetId } },
    update: { position, active: true },
    create: { section, targetType, targetId, position },
  });
}

// ── Help centre content (P12) ────────────────────────────────────────────────
// The public side of the CMS: /help lists PUBLISHED rows, /help/[slug] renders
// one. Bodies are plain text (the admin editor is a textarea) and split into
// paragraphs on blank lines; everything is trilingual like the rest of the seed.
interface SeedContentPage {
  slug: string;
  type: 'PAGE' | 'FAQ' | 'GUIDE' | 'SAFETY' | 'LEGAL';
  titleAr: string;
  titleFr: string;
  titleEn: string;
  bodyAr: string;
  bodyFr: string;
  bodyEn: string;
  seoDescription: string;
}

const CONTENT_PAGES: ReadonlyArray<SeedContentPage> = [
  {
    slug: 'faq',
    type: 'FAQ',
    titleEn: 'Frequently asked questions',
    titleFr: 'Questions fréquentes',
    titleAr: 'الأسئلة الشائعة',
    seoDescription:
      'What BLADNA is, how volunteers and organizations join, and how hours and certificates are verified.',
    bodyEn: `What is BLADNA?
BLADNA is an Algeria-first platform where volunteers find initiatives that need them, organizations publish opportunities, and every contribution — hours, certificates, participation — can be verified rather than merely claimed.

How do I join as a volunteer?
Create a volunteer account, confirm your email, then complete your profile: skills, languages, interests, availability and the wilaya you are based in. A complete profile is what powers better recommendations and richer map results.

How do organizations join?
Register an organization account and confirm your email; your workspace opens in a pending-verification state. From there you can publish initiatives, review applications, record attendance and issue certificates.

Are the hours and certificates real?
Hours come from organizer-confirmed attendance, and each certificate carries a unique number you can check on the Verify page — no account needed. This environment runs on a seeded demo dataset, so the records you see here demonstrate the real flow with illustrative data.

How is my data handled?
Only what the platform needs: identity details for your volunteer card, contact details for organizers you apply to, and the activity you record. Profile controls and data rights live in Settings and on your profile page.

Where do I report something unsafe?
Use the Safety page to report an initiative, an organization or an interaction. Reports reach the moderation team with the surrounding context attached.`,
    bodyFr: `Qu'est-ce que BLADNA ?
BLADNA est une plateforme algérienne où les volontaires trouvent les initiatives qui les attendent, les organisations publient des opportunités, et chaque contribution — heures, certificats, participation — peut être vérifiée plutôt que simplement affirmée.

Comment rejoindre en tant que volontaire ?
Créez un compte volontaire, confirmez votre adresse e-mail, puis complétez votre profil : compétences, langues, centres d'intérêt, disponibilités et votre wilaya. Un profil complet alimente de meilleures recommandations et des résultats de carte plus riches.

Comment les organisations rejoignent-elles ?
Inscrivez un compte organisation et confirmez votre e-mail ; votre espace s'ouvre à l'état en attente de vérification. Vous y publiez des initiatives, examinez les candidatures, enregistrez la présence et délivrez des certificats.

Les heures et les certificats sont-ils réels ?
Les heures proviennent d'une présence confirmée par l'organisateur, et chaque certificat porte un numéro unique vérifiable sur la page Vérifier — sans compte. Cet environnement fonctionne sur un jeu de données de démonstration : les enregistrements visibles illustrent le vrai parcours avec des données d'exemple.

Comment mes données sont-elles traitées ?
Uniquement ce dont la plateforme a besoin : les informations d'identité pour votre carte de volontaire, vos coordonnées pour les organisateurs auxquels vous postulez, et l'activité que vous enregistrez. Les commandes du profil et vos droits se trouvent dans Paramètres et sur votre page de profil.

Où signaler quelque chose d'unsafe ?
Utilisez la page Sécurité pour signaler une initiative, une organisation ou une interaction. Les signalements parviennent à l'équipe de modération avec le contexte complet.`,
    bodyAr: `ما هي بلادنا؟
بلادنا منصة جزائرية يجد فيها المتطوعون المبادرات التي تحتاج إليهم، وتنشر فيها المنظمات الفرص، ويمكن التحقق من كل مساهمة — الساعات والشهادات والمشاركة — بدل الاكتفاء بالادّعاء.

كيف أنضمّ كمتطوع؟
أنشئ حساب متطوع، وأكّد بريدك الإلكتروني، ثم أكمل ملفك: المهارات واللغات والاهتمامات والمواعيد المتاحة، وولاية موقعك. الملف الكامل هو ما يغذّي التوصيات الأفضل ونتائج الخريطة الأشمل.

كيف تنضمّ المنظمات؟
سجّل حساب منظمة وأكّد بريدك الإلكتروني؛ فيُفتح لك مساحة العمل بحالة «بانتظار التحقق». منها تنشر المبادرات، وتراجع الطلبات، وتسجّل الحضور، وتمنح الشهادات.

هل الساعات والشهادات حقيقية؟
تأتي الساعات من حضور يؤكده المنظّم، وكل شهادة تحمل رقمًا فريدًا يمكن التحقق منه من صفحة «تحقّق» — دون حساب. هذه البيئة تعمل على بيانات تجريبية، فالسجلات التي ترونها تمثّل مسارًا حقيقيًا ببيانات توضيحية.

كيف تُعالَج بياناتي؟
لا يُطلب إلا ما تحتاجه المنصة: بيانات الهوية لبطاقة المتطوع، وبيانات التواصل للمنظّمين الذين تتقدّم إليهم، والنشاط الذي تسجّله. أدوات الملف وحقوق البيانات في الإعدادات وصفحة ملفك.

أين أُبلّغ عن خطر؟
استخدم صفحة «السلامة» للإبلاغ عن مبادرة أو منظمة أو تفاعل. تصل البلاغات إلى فريق الإشراف مع السياق الكامل.`,
  },
  {
    slug: 'getting-started',
    type: 'GUIDE',
    titleEn: 'Getting started',
    titleFr: 'Bien démarrer',
    titleAr: 'البداية',
    seoDescription:
      'The volunteer journey on BLADNA: profile, discovery, applications, attendance, hours and certificates.',
    bodyEn: `Start with your profile. Your volunteer card, recommendations and map results are all built from it — skills, languages, interests, availability and the wilaya you are based in.

Find initiatives three ways. Browse the full list on Initiatives with filters for need, category, wilaya and dates, or open the Map to see everything clustered around you.

Save what matters. The bookmark on any initiative keeps it in Saved, and the Recommendations page explains why each match was suggested.

Apply, then show up. Applications reach the organizer directly; accepted volunteers appear on the attendance sheet, which is what recorded hours are based on.

Collect your record. Verified hours accumulate on your profile, and certificates issued by organizations carry a number you can verify anywhere — including for someone who has no account here.

Organizers: open a workspace. Register an organization account to publish initiatives, review applications, run attendance and issue certificates; the workspace guides each of these steps.`,
    bodyFr: `Commencez par votre profil. Votre carte de volontaire, vos recommandations et vos résultats de carte en découlent — compétences, langues, centres d'intérêt, disponibilités et votre wilaya.

Trouvez des initiatives de trois manières. Parcourez la liste complète sur Initiatives avec les filtres de besoin, catégorie, wilaya et dates, ou ouvrez la carte pour voir tout ce qui est regroupé autour de vous.

Enregistrez ce qui compte. Le signet sur une initiative la garde dans vos favoris, et la page Recommandations explique pourquoi chaque correspondance est suggérée.

Postulez, puis présentez-vous. Les candidatures partent directement à l'organisateur ; les volontaires acceptés apparaissent sur la feuille de présence, sur laquelle reposent les heures enregistrées.

Constituez votre parcours. Les heures vérifiées s'accumulent sur votre profil, et les certificats délivrés par les organisations portent un numéro vérifiable partout — même pour une personne sans compte ici.

Organisateurs : ouvrez un espace de travail. Inscrivez un compte organisation pour publier des initiatives, examiner les candidatures, gérer la présence et délivrer des certificats ; l'espace guide chacune de ces étapes.`,
    bodyAr: `ابدأ من ملفك الشخصي. بطاقة المتطوع والتوصيات ونتائج الخريطة كلها مبنية عليه — المهارات واللغات والاهتمامات والمواعيد وولاية موقعك.

ابحث عن المبادرات بثلاث طرق. تصفّح القائمة الكاملة في «المبادرات» مع مرشّحات الحاجة والفئة والولاية والتاريخ، أو افتح الخريطة لترى كل ما يجمع حولك.

احتفظ بما يهمّ. علامة الحفظ على أي مبادرة تُبقيها في «المحفوظات»، وصفحة «التوصيات» تشرح سبب كل اقتراح.

تقدّم ثمّ حضر. تصل الطلبات مباشرة إلى المنظّم، ويظهر المتطوعون المقبولون في كشف الحضور، ومنه تُبنى الساعات المسجّلة.

اجمع سجلّك. تتراكم الساعات الموثّقة في ملفك، وتحمل الشهادات التي تصدرها المنظمات رقمًا يمكن التحقق منه في أي مكان — حتى لو لم يكن صاحبها حسابًا هنا.

للمنظمات: افتح مساحة عمل. سجّل حساب منظمة لنشر المبادرات ومراجعة الطلبات وتشغيل الحضور وإصدار الشهادات — وتوجّهك مساحة العمل في كل خطوة.`,
  },
  {
    slug: 'about',
    type: 'PAGE',
    titleEn: 'About BLADNA',
    titleFr: 'À propos de BLADNA',
    titleAr: 'عن بلدنا',
    seoDescription:
      'What BLADNA stands for: verifiable contribution records, honest demo data, and three first-class languages.',
    bodyEn: `BLADNA connects Algerian initiatives with the people who can help them — time, funding, equipment or skills — and keeps a record of that contribution anyone can check.

Three principles shape the product. Verification first: hours, certificates and profiles resolve to real records, never to claims. Honesty about data: this environment ships with a seeded demo dataset and says so wherever numbers appear. Three languages: Arabic, French and English are first-class everywhere, from content to direction-aware layouts.

One account model serves volunteers, organizations, sponsors and international programs, and public verification is open to everyone — checking a certificate never requires an account.

This is a demonstration platform: the initiatives, organizations and people in this environment are seeded demo data.`,
    bodyFr: `BLADNA relie les initiatives algériennes aux personnes qui peuvent aider — du temps, des financements, du matériel ou des compétences — et conserve une trace de cette contribution que chacun peut vérifier.

Trois principes structurent le produit. La vérification d'abord : heures, certificats et profils renvoient à de vrais enregistrements, jamais à de simples affirmations. L'honnêteté sur les données : cet environnement livre un jeu de données de démonstration et le dit là où les chiffres apparaissent. Trois langues : l'arabe, le français et l'anglais sont à égalité partout, du contenu aux mises en page orientées.

Un seul modèle de compte sert les volontaires, les organisations, les sponsors et les programmes internationaux, et la vérification publique est ouverte à tous — vérifier un certificat ne demande jamais de compte.

Il s'agit d'une plateforme de démonstration : les initiatives, les organisations et les personnes de cet environnement sont des données de démonstration.`,
    bodyAr: `تصل بلدنا بين المبادرات الجزائرية وبين من يستطيع مساعدتها — بالوقت أو التمويل أو التجهيزات أو المهارات — وتحتفظ بسجلّ كل مساهمة يمكن لأيّ شخص التحقق منها.

ثلاثة مبادئ تشكّل المنصّة: التحقق أولًا — الساعات والشهادات والملفات تعود إلى سجلات حقيقية لا إلى ادّعاءات؛ وصدق البيانات — هذه البيئة تأتي ببيانات تجريبية وتصرّح بذلك عند كل رقم؛ وثلاث لغات — العربية والفرنسية والإنجليزية في مرتبة واحدة في كل مكان، من المحتوى إلى الصفحات الموجّهة.

نموذج حساب واحد يخدم المتطوعين والمنظمات والراعيين والبرامج الدولية، والتحقق العام متاح للجميع — التحقق من شهادة لا يتطلّب حسابًا أبدًا.

هذه منصة عرض توضيحي: المبادرات والمنظمات والأشخاص في هذه البيئة بيانات تجريبية.`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Seed
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!SEED_ENABLED) {
    console.warn('[seed] skipped — set SEED_DEMO=true (or DEMO_MODE=true) to load demo data.');
    return;
  }

  const prisma = getPrisma();
  try {
    // ── Geography ──────────────────────────────────────────────────────────
    const country = await prisma.country.upsert({
      where: { code: 'DZ' },
      update: {},
      create: { code: 'DZ', nameAr: 'الجزائر', nameFr: 'Algérie', nameEn: 'Algeria' },
    });

    // One-shot data correction: an earlier demo listing had Tizi Ouzou under
    // code "19" (its official code is "15"; "19" is Sétif). Only the code
    // moves — the row id is unchanged, so city/profile FKs stay attached.
    const legacyTizi = await prisma.wilaya.findFirst({
      where: { code: '19', nameFr: 'Tizi Ouzou' },
      select: { id: true },
    });
    const officialTizi = await prisma.wilaya.findUnique({
      where: { code: '15' },
      select: { id: true },
    });
    if (legacyTizi && !officialTizi) {
      await prisma.wilaya.update({ where: { id: legacyTizi.id }, data: { code: '15' } });
    }

    const wilayaIds = new Map<string, string>();
    for (const w of WILAYAS) {
      const row = await prisma.wilaya.upsert({
        where: { code: w.code },
        update: {},
        create: {
          code: w.code,
          nameAr: w.nameAr,
          nameFr: w.nameFr,
          nameEn: w.nameEn,
          countryId: country.id,
        },
      });
      wilayaIds.set(w.code, row.id);
    }

    const cityIds = new Map<string, string>();
    for (const c of CITIES) {
      const wilayaId = must(wilayaIds.get(c.wilayaCode), `wilaya ${c.wilayaCode}`);
      const existing = await prisma.city.findFirst({
        where: { wilayaId, nameFr: c.nameFr },
        select: { id: true },
      });
      const row =
        existing ??
        (await prisma.city.create({
          data: {
            nameAr: c.nameAr,
            nameFr: c.nameFr,
            nameEn: c.nameEn,
            wilayaId,
            latitude: c.latitude,
            longitude: c.longitude,
          },
        }));
      cityIds.set(c.wilayaCode, row.id);
    }

    // ── Taxonomies & catalogs ──────────────────────────────────────────────
    const categoryIds = new Map<string, string>();
    for (const cat of CATEGORIES) {
      const row = await prisma.opportunityCategory.upsert({
        where: { slug: cat.slug },
        update: {},
        create: {
          slug: cat.slug,
          nameAr: cat.nameAr,
          nameFr: cat.nameFr,
          nameEn: cat.nameEn,
          sortOrder: cat.sortOrder,
        },
      });
      categoryIds.set(cat.slug, row.id);
    }

    const skillIds = new Map<string, string>();
    for (const s of SKILLS) {
      const existing = await prisma.skill.findFirst({
        where: { nameEn: s.nameEn },
        select: { id: true },
      });
      const row = existing ?? (await prisma.skill.create({ data: { ...s } }));
      skillIds.set(s.nameEn, row.id);
    }

    const languageIds = new Map<string, string>();
    for (const l of LANGUAGES) {
      const row = await prisma.language.upsert({
        where: { code: l.code },
        update: {},
        create: { code: l.code, nameAr: l.nameAr, nameFr: l.nameFr, nameEn: l.nameEn },
      });
      languageIds.set(l.code, row.id);
    }

    const interestIds = new Map<string, string>();
    for (const i of INTERESTS) {
      const row = await prisma.interest.upsert({
        where: { code: i.code },
        update: {},
        create: { code: i.code, nameAr: i.nameAr, nameFr: i.nameFr, nameEn: i.nameEn },
      });
      interestIds.set(i.code, row.id);
    }

    // Partnerships & CSR vocabulary (P33): reference rows for the matching
    // engine; upserted by code so re-seeds never duplicate.
    for (const f of CSR_FOCUS_AREAS) {
      await prisma.cSRFocusArea.upsert({
        where: { code: f.code },
        update: {},
        create: {
          code: f.code,
          nameAr: f.nameAr,
          nameFr: f.nameFr,
          nameEn: f.nameEn,
          sortOrder: f.sortOrder,
        },
      });
    }

    for (const a of ACHIEVEMENTS) {
      await prisma.achievement.upsert({
        where: { code: a.code },
        update: {},
        create: {
          code: a.code,
          nameAr: a.nameAr,
          nameFr: a.nameFr,
          nameEn: a.nameEn,
          descriptionAr: a.descriptionAr,
          descriptionFr: a.descriptionFr,
          descriptionEn: a.descriptionEn,
          thresholdHours: a.thresholdHours,
          sortOrder: a.sortOrder,
          active: true,
        },
      });
    }

    // Volunteer-ID format setting (same key/format the auth register flow reads).
    await prisma.setting.upsert({
      where: { key: 'volunteerId.format' },
      update: {},
      create: { key: 'volunteerId.format', value: '{PREFIX}-{REGION}-{SEQ:6}' },
    });

    // ── Users ──────────────────────────────────────────────────────────────
    const admin = await ensureUser({
      email: 'admin@bladna.dz',
      firstName: 'Bladna',
      lastName: 'Administrator',
      preferredLanguage: 'FR',
      roles: ['SUPER_ADMIN'],
    });
    const volunteer = await ensureUser({
      email: 'volunteer@bladna.dz',
      firstName: 'Amina',
      lastName: 'Benali',
      preferredLanguage: 'AR',
      roles: ['USER', 'VOLUNTEER'],
    });
    const orgOwner = await ensureUser({
      email: 'org@bladna.dz',
      firstName: 'Karim',
      lastName: 'Haddad',
      preferredLanguage: 'FR',
      roles: ['USER'],
    });

    // Consent ledger (registration writes terms + privacy_policy).
    for (const user of [admin, volunteer, orgOwner]) {
      for (const purpose of ['terms', 'privacy_policy'] as const) {
        const consent = await prisma.privacyConsent.findFirst({
          where: { userId: user.id, purpose },
        });
        if (!consent) {
          await prisma.privacyConsent.create({
            data: { userId: user.id, purpose, policyVersion: POLICY_VERSION, granted: true },
          });
        }
      }
    }

    // ── Organization (tenant) + OWNER membership ───────────────────────────
    const organization = await prisma.organization.upsert({
      where: { slug: 'atlas-verts' },
      update: {},
      create: {
        name: 'Association Atlas Verts',
        slug: 'atlas-verts',
        organizationType: 'ASSOCIATION',
        description: 'Environmental association based in Algiers (demo dataset).',
        // Presentation (public): a cover band + logo on the profile page —
        // original SVG mark, CC0 photo from the P11 batch.
        logo: '/photos/logo-atlas-verts.svg',
        coverImage: '/photos/environment-park.jpg',
        officialEmail: 'org@bladna.dz',
        countryId: country.id,
        wilayaId: must(wilayaIds.get('16'), 'wilaya 16'),
        cityId: must(cityIds.get('16'), 'city Algiers'),
        address: 'Hydra, Alger',
        status: 'ACTIVE',
        verificationStatus: 'VERIFIED',
        trustLevel: 'LEVEL_2_ORGANIZATION_VERIFIED',
        verifiedAt: new Date('2026-09-01T09:00:00.000Z'),
      },
    });

    await prisma.organizationMember.upsert({
      where: {
        organizationId_userId: { organizationId: organization.id, userId: orgOwner.id },
      },
      update: {},
      create: {
        organizationId: organization.id,
        userId: orgOwner.id,
        role: 'OWNER',
        status: 'ACTIVE',
        joinedAt: new Date('2026-09-01T09:05:00.000Z'),
      },
    });

    // The demo volunteer joins the org as well — her opted-in public profile
    // is what the public team preview on the org profile page renders.
    await prisma.organizationMember.upsert({
      where: {
        organizationId_userId: { organizationId: organization.id, userId: volunteer.id },
      },
      update: {},
      create: {
        organizationId: organization.id,
        userId: volunteer.id,
        role: 'STAFF',
        status: 'ACTIVE',
        joinedAt: new Date('2026-09-05T10:00:00.000Z'),
      },
    });

    // ── Demo conversation (org ↔ volunteer) — /messages opens on a real
    // thread instead of an empty list (P17). Guarded by the subject. ──────
    const demoSubject = 'Winter campaign volunteers (demo)';
    const existingConversation = await prisma.conversation.findFirst({
      where: { subject: demoSubject },
    });
    if (!existingConversation) {
      const conversation = await prisma.conversation.create({
        data: {
          type: 'DIRECT',
          subject: demoSubject,
          createdAt: new Date('2026-09-29T16:05:00.000Z'),
          updatedAt: new Date('2026-09-30T10:05:00.000Z'),
        },
      });
      await prisma.conversationMember.createMany({
        data: [
          { conversationId: conversation.id, userId: orgOwner.id },
          { conversationId: conversation.id, userId: volunteer.id },
        ],
      });
      await prisma.message.createMany({
        data: [
          {
            conversationId: conversation.id,
            senderId: orgOwner.id,
            body: 'Salam Amina — can you lead the park cleanup briefing this Thursday at 18:00?',
            createdAt: new Date('2026-09-29T16:05:00.000Z'),
          },
          {
            conversationId: conversation.id,
            senderId: volunteer.id,
            body: 'Yes, I will be there. Should I bring the gloves from the last campaign?',
            createdAt: new Date('2026-09-29T16:22:00.000Z'),
          },
          {
            conversationId: conversation.id,
            senderId: orgOwner.id,
            body: 'Please do — and bring one teammate if you know someone interested.',
            createdAt: new Date('2026-09-30T09:40:00.000Z'),
          },
          {
            conversationId: conversation.id,
            senderId: volunteer.id,
            body: 'Perfect, see you Thursday.',
            createdAt: new Date('2026-09-30T10:05:00.000Z'),
          },
        ],
      });
    }

    // ── Volunteer profile (mirrors the register flow's allocation) ─────────
    let profile = await prisma.volunteerProfile.findUnique({ where: { userId: volunteer.id } });
    if (!profile) {
      const formatSetting = await prisma.setting.findUnique({
        where: { key: 'volunteerId.format' },
      });
      const format = parseVolunteerIdFormat(
        typeof formatSetting?.value === 'string' ? formatSetting.value : null,
      );
      const counter = await prisma.counter.upsert({
        where: { name: 'volunteer_id' },
        update: { value: { increment: 1 } },
        create: { name: 'volunteer_id', value: 1 },
      });
      profile = await prisma.volunteerProfile.create({
        data: {
          userId: volunteer.id,
          volunteerId: renderVolunteerId(format, counter.value),
          publicToken: generateOpaqueSecret(24),
          bio: 'Volunteer based in Algiers — environment and community actions (demo profile).',
          wilayaId: must(wilayaIds.get('16'), 'wilaya 16'),
          cityId: must(cityIds.get('16'), 'city Algiers'),
          availability: ['WEEKENDS', 'EVENINGS', 'FLEXIBLE'],
          publicProfile: true,
          internationalPreference: true,
          dateOfBirth: new Date('2001-03-14T00:00:00.000Z'),
        },
      });
    }

    // Skills — one organization-verified (unlocks SKILL_VERIFIED live).
    for (const nameEn of ['Teamwork', 'Communication', 'Fundraising', 'Photography'] as const) {
      const skillId = must(skillIds.get(nameEn), `skill ${nameEn}`);
      await prisma.volunteerSkill.upsert({
        where: { volunteerProfileId_skillId: { volunteerProfileId: profile.id, skillId } },
        update: {},
        create: { volunteerProfileId: profile.id, skillId, source: 'self' },
      });
    }
    const firstAidId = must(skillIds.get('First Aid'), 'skill First Aid');
    await prisma.volunteerSkill.upsert({
      where: {
        volunteerProfileId_skillId: { volunteerProfileId: profile.id, skillId: firstAidId },
      },
      update: {},
      create: {
        volunteerProfileId: profile.id,
        skillId: firstAidId,
        verificationLevel: 'ORGANIZATION_VERIFIED',
        verifiedByOrganizationId: organization.id,
        verifiedAt: new Date('2026-09-02T10:00:00.000Z'),
        source: 'atlas-verts',
        yearsExperience: 2,
      },
    });

    // Languages.
    const languageLinks = [
      { code: 'ar', level: 'NATIVE' as const },
      { code: 'fr', level: 'ADVANCED' as const },
      { code: 'en', level: 'INTERMEDIATE' as const },
    ];
    for (const link of languageLinks) {
      const languageId = must(languageIds.get(link.code), `language ${link.code}`);
      await prisma.volunteerLanguage.upsert({
        where: {
          volunteerProfileId_languageId: { volunteerProfileId: profile.id, languageId },
        },
        update: {},
        create: { volunteerProfileId: profile.id, languageId, level: link.level },
      });
    }

    // Interests.
    for (const code of ['environment', 'culture', 'youth'] as const) {
      const interestId = must(interestIds.get(code), `interest ${code}`);
      await prisma.volunteerInterest.upsert({
        where: {
          volunteerProfileId_interestId: { volunteerProfileId: profile.id, interestId },
        },
        update: {},
        create: { volunteerProfileId: profile.id, interestId },
      });
    }

    // ── Opportunities ──────────────────────────────────────────────────────
    // A: upcoming, PUBLISHED — what discovery surfaces; receives the application.
    const parkCleanup = await prisma.opportunity.upsert({
      where: { slug: 'algiers-park-cleanup' },
      update: { coverImage: '/photos/environment-park.jpg' },
      create: {
        slug: 'algiers-park-cleanup',
        organizationId: organization.id,
        titleAr: 'تنظيف الحديقة المركزية بالجزائر',
        titleFr: "Nettoyage du parc central d'Alger",
        titleEn: 'Algiers central park clean-up',
        descriptionAr:
          'ندعو المتطوعين لتنظيف وتأهيل الحديقة: جمع النفايات، إعادة زراعة الأشجار، وتركيب لوحات توعوية. يوفَّر التدريب والأدوات.',
        descriptionFr:
          'Recrutons des bénévoles pour nettoyer et réhabiliter le parc : collecte des déchets, replantation et pose de panneaux de sensibilisation. Formation et outils fournis.',
        descriptionEn:
          'Join us to clean and restore the city park: litter pick-up, replanting and awareness signage. Training and tools provided.',
        type: 'EVENT',
        categoryId: must(categoryIds.get('environment'), 'category environment'),
        locationType: 'PHYSICAL',
        countryId: country.id,
        wilayaId: must(wilayaIds.get('16'), 'wilaya 16'),
        cityId: must(cityIds.get('16'), 'city Algiers'),
        address: 'Parc central, Alger',
        // Card cover (P11): CC0/PDM art — design-refs/PHOTO-CREDITS.md.
        coverImage: '/photos/environment-park.jpg',
        startDate: PARK_CLEANUP_START,
        endDate: PARK_CLEANUP_END,
        applicationDeadline: new Date('2026-10-05T23:59:59.000Z'),
        capacity: 25,
        minimumAge: 16,
        estimatedHours: 4,
        status: 'PUBLISHED',
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date('2026-09-01T09:10:00.000Z'),
        publishedAt: new Date('2026-09-01T09:10:00.000Z'),
      },
    });

    // B: completed last week — the history (activity → attendance → hours →
    // certificate) hangs off this one so nothing claims a future event happened.
    const beachCleanup = await prisma.opportunity.upsert({
      where: { slug: 'sidi-fredj-beach-cleanup' },
      update: { coverImage: '/photos/environment-beach.jpg' },
      create: {
        slug: 'sidi-fredj-beach-cleanup',
        organizationId: organization.id,
        titleAr: 'تنظيف شاطئ سيدي فريدج',
        titleFr: 'Nettoyage de la plage de Sidi Fredj',
        titleEn: 'Sidi Fredj beach clean-up',
        descriptionAr:
          'حملة تنظيف شاطئ سيدي فريدج: جمع النفايات الساحلية وفرزها بالتعاون مع السكان المحليين.',
        descriptionFr:
          'Nettoyage de la plage de Sidi Fredj : collecte et tri des déchets côtiers avec les habitants locaux.',
        descriptionEn:
          'Sidi Fredj beach clean-up: coastal litter collection and sorting with local residents.',
        type: 'EVENT',
        categoryId: must(categoryIds.get('environment'), 'category environment'),
        locationType: 'PHYSICAL',
        countryId: country.id,
        wilayaId: must(wilayaIds.get('42'), 'wilaya 42'),
        cityId: must(cityIds.get('42'), 'city Tipaza'),
        address: 'Plage de Sidi Fredj, Tipaza',
        // Card cover (P11): CC0/PDM art — design-refs/PHOTO-CREDITS.md.
        coverImage: '/photos/environment-beach.jpg',
        startDate: new Date('2026-09-15T09:00:00.000Z'),
        endDate: new Date('2026-09-15T13:00:00.000Z'),
        applicationDeadline: new Date('2026-09-10T23:59:59.000Z'),
        capacity: 30,
        minimumAge: 16,
        estimatedHours: 4,
        status: 'PUBLISHED',
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date('2026-09-01T09:15:00.000Z'),
        publishedAt: new Date('2026-09-01T09:15:00.000Z'),
      },
    });

    // Application → the upcoming opportunity.
    const existingApplication = await prisma.opportunityApplication.findFirst({
      where: { opportunityId: parkCleanup.id, volunteerProfileId: profile.id },
      select: { id: true },
    });
    if (!existingApplication) {
      await prisma.opportunityApplication.create({
        data: {
          opportunityId: parkCleanup.id,
          volunteerProfileId: profile.id,
          status: 'ACCEPTED',
          motivation: 'I would like to help keep public spaces clean and green (demo application).',
          availability: 'Weekends',
          submittedAt: new Date('2026-09-10T10:00:00.000Z'),
          reviewedAt: new Date('2026-09-11T11:00:00.000Z'),
          reviewedById: orgOwner.id,
          decisionNote: 'Accepted (demo dataset).',
        },
      });
    }

    // ── Verified history on the completed opportunity ──────────────────────
    // Demo review (P24): the ACCEPTED application above qualifies this
    // volunteer to rate the park initiative. Deliberately seeded there (and
    // not on the beach initiative) because E2E runs its own review CRUD
    // against the beach one — this row must survive test runs untouched.
    const existingReview = await prisma.opportunityReview.findUnique({
      where: {
        opportunityId_authorId: { opportunityId: parkCleanup.id, authorId: volunteer.id },
      },
      select: { id: true },
    });
    if (!existingReview) {
      await prisma.opportunityReview.create({
        data: {
          opportunityId: parkCleanup.id,
          authorId: volunteer.id,
          rating: 5,
          body: 'Well organized and welcoming: the team briefed us clearly, tools were ready and the park looked great by the end of the morning. (demo review)',
          source: 'PARTICIPANT',
          // Same instant for both stamps — the row was written once, so the UI
          // must never flag it as "edited" (see reviews-section.tsx).
          createdAt: new Date('2026-09-12T12:00:00.000Z'),
          updatedAt: new Date('2026-09-12T12:00:00.000Z'),
        },
      });
    }

    let activity = await prisma.volunteerActivity.findFirst({
      where: {
        volunteerProfileId: profile.id,
        organizationId: organization.id,
        opportunityId: beachCleanup.id,
      },
    });
    if (!activity) {
      activity = await prisma.volunteerActivity.create({
        data: {
          volunteerProfileId: profile.id,
          organizationId: organization.id,
          opportunityId: beachCleanup.id,
          title: 'Sidi Fredj beach clean-up',
          description: 'Coastal litter collection and sorting (demo activity).',
          startedAt: new Date('2026-09-15T09:00:00.000Z'),
          endedAt: new Date('2026-09-15T13:00:00.000Z'),
          status: 'COMPLETED',
        },
      });
    }

    let attendance = await prisma.attendance.findFirst({
      where: {
        opportunityId: beachCleanup.id,
        volunteerProfileId: profile.id,
        date: ATTENDANCE_DAY,
      },
    });
    if (!attendance) {
      attendance = await prisma.attendance.create({
        data: {
          opportunityId: beachCleanup.id,
          volunteerProfileId: profile.id,
          activityId: activity.id,
          date: ATTENDANCE_DAY,
          checkInAt: new Date('2026-09-15T09:00:00.000Z'),
          checkOutAt: new Date('2026-09-15T13:00:00.000Z'),
          hours: 4,
          method: 'MANUAL',
          status: 'CONFIRMED',
          verifiedById: orgOwner.id,
        },
      });
    }

    let hourRow = await prisma.volunteerHour.findFirst({
      where: { volunteerProfileId: profile.id, attendanceId: attendance.id },
    });
    if (!hourRow) {
      hourRow = await prisma.volunteerHour.create({
        data: {
          volunteerProfileId: profile.id,
          organizationId: organization.id,
          activityId: activity.id,
          attendanceId: attendance.id,
          hours: 4,
          date: ATTENDANCE_DAY,
          status: 'VERIFIED',
          source: 'ATTENDANCE',
          verifiedById: orgOwner.id,
          verifiedAt: new Date('2026-09-16T10:00:00.000Z'),
        },
      });
    }

    let certificate = await prisma.volunteerCertificate.findFirst({
      where: { volunteerProfileId: profile.id, activityId: activity.id },
    });
    if (!certificate) {
      certificate = await prisma.volunteerCertificate.create({
        data: {
          volunteerProfileId: profile.id,
          organizationId: organization.id,
          activityId: activity.id,
          opportunityId: beachCleanup.id,
          title: 'Sidi Fredj beach clean-up — volunteer certificate',
          description: '4 hours of verified coastal clean-up service (demo dataset).',
          hours: 4,
          certificateNumber: nextCertificateNumber(),
          verificationToken: generateOpaqueSecret(24),
          status: 'VALID',
          issuedById: orgOwner.id,
          issuedAt: new Date('2026-09-16T10:05:00.000Z'),
        },
      });
    }

    // Unlocks that /me/achievements would materialize on first visit — persisted
    // so the demo database is inspectable without a live evaluation.
    for (const code of ['FIRST_ACTIVITY', 'SKILL_VERIFIED'] as const) {
      const achievement = await prisma.achievement.findUnique({ where: { code } });
      if (!achievement) continue;
      await prisma.volunteerAchievement.upsert({
        where: {
          volunteerProfileId_achievementId: {
            volunteerProfileId: profile.id,
            achievementId: achievement.id,
          },
        },
        update: {},
        create: { volunteerProfileId: profile.id, achievementId: achievement.id },
      });
    }

    // ── Campaign ───────────────────────────────────────────────────────────
    const winterCampaign = await prisma.campaign.upsert({
      where: { slug: 'winter-solidarity-2026' },
      update: {},
      create: {
        organizationId: organization.id,
        name: 'Winter Solidarity 2026',
        slug: 'winter-solidarity-2026',
        description:
          'Warm kits and food parcels for families across Algiers province (demo campaign).',
        goal: 'Deliver 500 winter kits to families across Algiers province.',
        startDate: new Date('2026-12-01T00:00:00.000Z'),
        endDate: new Date('2027-01-31T23:59:59.000Z'),
        status: 'ACTIVE',
        volunteerTarget: 100,
        hourTarget: 500,
        beneficiaryTarget: 500,
        budget: 1500000,
        currency: 'DZD',
      },
    });

    // ── Demo initiative content (spec §4, §12–§14) ────────────────────────────
    // Narrative / coordinates / contact for the two seeded initiatives
    // (blank-only backfill) — then a third, this-week initiative so time-based
    // filters and the map have content across several wilayas.
    await backfillInitiative(parkCleanup.id, parkCleanup, {
      problemAr:
        'تتراكم النفايات في الحديقة المركزية بالجزائر منذ أشهر، ما يهدد صحة السكان والنباتات ويقلص مساحات الراحة العامة.',
      problemFr:
        "Les déchets s'accumulent dans le parc central d'Alger depuis des mois : santé des résidents, végétation et espaces de loisir en pâtissent.",
      problemEn:
        'Waste has piled up in the Algiers central park for months, harming residents, vegetation and the public resting space.',
      objectiveAr:
        'جمع وفرز النفايات وإعادة زراعة الأشجار وتركيب لوحات توعوية، بشراكة مع السكان، لاستعادة الحديقة كفضاء نظيف وآمن.',
      objectiveFr:
        'Collecter et trier les déchets, replanter des arbres et poser des panneaux de sensibilisation avec les habitants pour rendre au parc sa propreté.',
      objectiveEn:
        'Collect and sort the litter, replant trees and install awareness signage with residents to restore the park as a clean, safe space.',
      latitude: 36.7538,
      longitude: 3.0588,
    });

    await backfillInitiative(beachCleanup.id, beachCleanup, {
      problemAr:
        'يتعرض شاطئ سيدي فريدج لتراكم النفايات البلاستيكية والأعوال، ما يضر بالحياة البحرية ويؤثر في جودة الوجهة الساحلية.',
      problemFr:
        "La plage de Sidi Fredj s'accumule de déchets plastiques et d'algues, nuisant à la vie marine et à la qualité du site côtier.",
      problemEn:
        'Sidi Fredj beach collects plastic litter and seaweed, damaging marine life and the quality of the coastal site.',
      objectiveAr:
        'حملة تنظيف وفرز بالتعاون مع السكان والسلطات المحلية، مع توعية الزوار بأهمية الفرز الصحيح للنفايات.',
      objectiveFr:
        'Une campagne de collecte et de tri avec les habitants et les autorités locales, sensibilisant les visiteurs au tri des déchets.',
      objectiveEn:
        'A clean-up and sorting campaign with residents and local authorities, raising visitors awareness about proper waste sorting.',
      latitude: 36.5897,
      longitude: 2.4486,
    });

    // C: this-week initiative (fresh dates relative to the demo window) so the
    // "this week" chip and near-me/wilaya filters surface a second upcoming row.
    const treePlanting = await prisma.opportunity.upsert({
      where: { slug: 'blida-tree-planting' },
      update: { coverImage: '/photos/environment.jpg' },
      create: {
        slug: 'blida-tree-planting',
        organizationId: organization.id,
        titleAr: 'زراعة الأشجار بحديقة البليدة',
        titleFr: "Plantation d'arbres au jardin public de Blida",
        titleEn: 'Tree planting in Blida public garden',
        descriptionAr:
          'حملة زراعة 120 شجرة محلية في الحديقة العمومية بالبليدة، مع سقاية وصيانة أولية لمدة سنة ومشاركة السكان والمتطوعين.',
        descriptionFr:
          'Plantation de 120 arbres locaux au jardin public de Blida, avec arrosage et entretien la première année et la participation des habitants.',
        descriptionEn:
          'Planting 120 native trees in the Blida public garden, with a first year of watering and maintenance and resident involvement.',
        problemAr:
          'تشهد مدينة البليدة نقصًا في التغطية الخضراء، ما يزيد الحرارة الصيفية ويقلل الفضاءات الطبيعية المفتوحة.',
        problemFr:
          'Blida manque de couverture verte : les étés sont plus chauds et les espaces naturels ouverts se raréfient.',
        problemEn:
          'Blida lacks green cover, which makes summers hotter and reduces open natural spaces.',
        objectiveAr:
          'زراعة 120 شجرة محلية مع سقاية وصيانة أولية لمدة سنة، بمشاركة السكان والمتطوعين.',
        objectiveFr:
          'Planter 120 arbres locaux avec arrosage et entretien la première année, en partenariat avec les habitants.',
        objectiveEn:
          'Plant 120 native trees with watering and initial maintenance for a year, involving residents and volunteers.',
        type: 'EVENT',
        categoryId: must(categoryIds.get('environment'), 'category environment'),
        locationType: 'PHYSICAL',
        countryId: country.id,
        wilayaId: must(wilayaIds.get('09'), 'wilaya 09'),
        cityId: must(cityIds.get('09'), 'city Blida'),
        address: 'Jardin public, Blida',
        latitude: 36.47,
        longitude: 2.83,
        // Card cover (P11): CC0/PDM art — design-refs/PHOTO-CREDITS.md.
        coverImage: '/photos/environment.jpg',
        startDate: new Date('2026-09-28T09:00:00.000Z'),
        endDate: new Date('2026-09-28T15:00:00.000Z'),
        applicationDeadline: new Date('2026-09-27T23:59:59.000Z'),
        capacity: 40,
        minimumAge: 12,
        estimatedHours: 5,
        contactName: 'Karim Haddad',
        contactPhone: '+213 555 12 34 56',
        contactEmail: 'org@bladna.dz',
        status: 'PUBLISHED',
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date('2026-09-20T09:00:00.000Z'),
        publishedAt: new Date('2026-09-20T09:00:00.000Z'),
      },
    });

    // ── Support needs (spec §13) — the upcoming initiative declares all four
    // kinds; `fulfilled` mirrors the accepted offers below (owner-tracked).
    const equipmentNeedId = await ensureNeed(parkCleanup.id, {
      kind: 'EQUIPMENT',
      labelAr: 'قفازات وأكياس نفايات',
      labelFr: 'Gants et sacs de collecte',
      labelEn: 'Gloves and waste bags',
      description:
        '40 pairs of heavy-duty gloves and 40 collection bags for the clean-up teams (demo dataset).',
      quantity: 40,
      fulfilled: 40,
      sortOrder: 1,
    });
    const materialNeedId = await ensureNeed(parkCleanup.id, {
      kind: 'MATERIAL',
      labelAr: 'حاويات للفرز المصدري',
      labelFr: 'Bacs de tri à la source',
      labelEn: 'Source-sorting bins',
      description: 'Six bins installed on site so waste is sorted at source (demo dataset).',
      quantity: 6,
      fulfilled: 0,
      sortOrder: 2,
    });
    const financialNeedId = await ensureNeed(parkCleanup.id, {
      kind: 'FINANCIAL',
      labelAr: 'كراء شاحنة لنقل النفايات',
      labelFr: "Location d'un camion pour le transport",
      labelEn: 'Truck rental for waste transport',
      description:
        'Rental of a truck to carry the collected waste to the sorting centre; paid by bank transfer to the association, outside the platform (demo dataset).',
      targetAmount: 60000,
      sortOrder: 3,
    });
    await ensureNeed(parkCleanup.id, {
      kind: 'SERVICE',
      labelAr: 'غسيل وتعقيم بالضغط العالي',
      labelFr: 'Nettoyage haute pression',
      labelEn: 'High-pressure cleaning service',
      description:
        'One high-pressure washing session on the paths after the collection (demo dataset).',
      quantity: 1,
      fulfilled: 0,
      sortOrder: 4,
    });

    // ── Support offers (spec §13): two decided, one left PENDING so the org
    // console has a live decision to take. Pledges are recorded only — money
    // moves bank → organization outside the platform.
    await ensureOffer(equipmentNeedId, volunteer.id, {
      description: '40 pairs of gloves and 40 bags from the volunteer centre stock (demo pledge).',
      quantity: 40,
      status: 'ACCEPTED',
      contactNote: 'Delivered to the association office, Hydra.',
      decidedById: orgOwner.id,
      decidedAt: new Date('2026-09-22T10:00:00.000Z'),
    });
    await ensureOffer(financialNeedId, volunteer.id, {
      description:
        '20,000 DZD pledged for the transport truck - bank transfer to the association account (demo pledge).',
      amount: 20000,
      status: 'ACCEPTED',
      contactNote: 'Transfer reference shared with the association by email.',
      decidedById: orgOwner.id,
      decidedAt: new Date('2026-09-23T11:00:00.000Z'),
    });
    await ensureOffer(materialNeedId, volunteer.id, {
      description: 'Two sorting bins available from a neighbourhood depot (demo pledge).',
      quantity: 2,
      contactNote: 'Available on weekends; needs pickup.',
    });

    // ── Impact metrics (spec §14) — actuals mirror rows that really exist
    // (attendance, hours, registrations); targets are the organizers plans.
    // Sources are labelled as demo data; `verified` stays false.
    await ensureMetric(beachCleanup.id, {
      metricType: 'VOLUNTEERS',
      name: 'Volunteers mobilized',
      actual: 1,
      unit: 'volunteers',
      source: 'Verified attendance records (demo dataset)',
    });
    await ensureMetric(beachCleanup.id, {
      metricType: 'HOURS',
      name: 'Volunteer hours served',
      actual: 4,
      unit: 'hours',
      source: 'Verified attendance records (demo dataset)',
    });
    await ensureMetric(beachCleanup.id, {
      metricType: 'BENEFICIARIES',
      name: 'Residents benefiting from the clean shore',
      actual: 120,
      unit: 'people',
      source: 'Organizer estimate (demo dataset)',
    });
    await ensureMetric(parkCleanup.id, {
      metricType: 'VOLUNTEERS',
      name: 'Registered volunteers',
      target: 25,
      actual: 1,
      unit: 'volunteers',
      source: 'Registration records (demo dataset)',
    });
    await ensureMetric(parkCleanup.id, {
      metricType: 'ACTIVITIES',
      name: 'Restoration stations prepared',
      target: 8,
      actual: 0,
      unit: 'stations',
      source: 'Activity plan (demo dataset)',
    });
    await ensureMetric(treePlanting.id, {
      metricType: 'TREES',
      name: 'Native trees to plant',
      target: 120,
      actual: 0,
      unit: 'trees',
      source: 'Planting plan (demo dataset)',
    });
    await ensureMetric(treePlanting.id, {
      metricType: 'VOLUNTEERS',
      name: 'Registered volunteers',
      target: 40,
      actual: 0,
      unit: 'volunteers',
      source: 'Registration records (demo dataset)',
    });

    // ── Public content pages, announcement, featured placements (P12) ───────
    // The public side of the CMS: /help renders PUBLISHED pages, the landing
    // and discover rails read placements, the banner reads the announcement.
    for (const page of CONTENT_PAGES) {
      await prisma.contentPage.upsert({
        where: { slug: page.slug },
        update: { ...page, status: 'PUBLISHED' },
        create: { ...page, status: 'PUBLISHED' },
      });
    }

    const announcementData = {
      titleEn: 'Verification takes seconds',
      titleFr: 'La vérification prend quelques secondes',
      titleAr: 'التحقق يستغرق ثوانٍ',
      bodyEn:
        'Paste a certificate number, a volunteer public code or an organization slug on the Verify page — the result shows the holder, the status and the date it was verified, with no account required.',
      bodyFr:
        'Saisissez un numéro de certificat, un code public de volontaire ou un identifiant d’organisation sur la page Vérifier — le résultat affiche le titulaire, le statut et la date de vérification, sans compte.',
      bodyAr:
        'أدخل رقم شهادة أو كود متطوع عام أو معرّف منظمة في صفحة «تحقّق» — تظهر النتيجة بصاحب الشهادة وحالتها وتاريخ التحقق، دون الحاجة إلى حساب.',
      active: true,
    };
    const announcement = await prisma.announcement.findFirst({
      where: { titleEn: announcementData.titleEn },
      select: { id: true },
    });
    if (announcement) {
      await prisma.announcement.update({
        where: { id: announcement.id },
        data: announcementData,
      });
    } else {
      await prisma.announcement.create({ data: announcementData });
    }

    await ensurePlacement('HOME_FEATURED_OPPORTUNITIES', 'OPPORTUNITY', parkCleanup.id, 1);
    await ensurePlacement('HOME_FEATURED_OPPORTUNITIES', 'OPPORTUNITY', treePlanting.id, 2);
    await ensurePlacement('HOME_FEATURED_ORGANIZATIONS', 'ORGANIZATION', organization.id, 1);
    await ensurePlacement('HOME_CAMPAIGNS', 'CAMPAIGN', winterCampaign.id, 1);
    await ensurePlacement('DISCOVER_FEATURED', 'OPPORTUNITY', parkCleanup.id, 1);

    console.log('[seed] demo data ready.');
    console.log(`  password (all demo accounts): ${DEMO_PASSWORD}`);
    console.log(
      '  admin@bladna.dz       — SUPER_ADMIN (enrol TOTP before /admin/* endpoints, §145)',
    );
    console.log(`  org@bladna.dz         — OWNER of ${organization.slug}`);
    console.log(`  volunteer@bladna.dz   — volunteer id ${profile.volunteerId}`);
    console.log(`  certificate: ${certificate.certificateNumber} (test it on /verify)`);
    console.log(
      `  opportunities: ${parkCleanup.slug} (upcoming), ${treePlanting.slug} (this week), ${beachCleanup.slug} (completed)`,
    );
    console.log('  support: 4 needs, 3 offers, 7 impact metrics (demo dataset, unverified)');
    console.log('  campaign: winter-solidarity-2026 (ACTIVE)');
    console.log(`  hours: ${hourRow.hours.toString()} verified, attendance ${attendance.status}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('[seed] failed:', error);
  process.exitCode = 1;
});
