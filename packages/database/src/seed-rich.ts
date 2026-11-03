// Rich demo dataset (hackathon / showcase): a dozen organizations across the
// wilayas, sixty volunteers, ~34 initiatives (completed, this week, upcoming,
// pending review) with applications, attendance, verified hours,
// certificates, reviews, support needs, impact metrics and campaigns.
//
// Runs after the core seed (seed.ts) and reuses its taxonomies. Create-once:
// the first organization slug acts as the marker, so re-running the seed never
// duplicates rows. Dates are RELATIVE to the run date so "this week" and
// "upcoming" filters always have content. Randomness is a fixed-seed PRNG —
// the same database comes out of every fresh run.

import { randomBytes } from 'node:crypto';
import { generateOpaqueSecret } from '@bladna/auth';
import { parseVolunteerIdFormat, renderVolunteerId } from '@bladna/domain';
import type { getPrisma } from './index';
import { seedInternational } from './seed-international';

type Prisma = ReturnType<typeof getPrisma>;

export interface RichSeedContext {
  prisma: Prisma;
  countryId: string;
  wilayaIds: Map<string, string>;
  cityIds: Map<string, string>;
  categoryIds: Map<string, string>;
  skillIds: Map<string, string>;
  languageIds: Map<string, string>;
  interestIds: Map<string, string>;
  /** One scrypt hash of DEMO_PASSWORD reused for every rich-demo account. */
  passwordHash: string;
  policyVersion: string;
  /** The core demo volunteer (volunteer@bladna.dz) — joins a few initiatives. */
  demoVolunteer: { userId: string; profileId: string };
}

// ── Deterministic randomness ─────────────────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(2026);
const int = (min: number, max: number): number => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T;
function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

const DAY = 24 * 60 * 60 * 1000;
/** Run date + `days`, at `hour`:00 UTC. */
function day(days: number, hour = 9): Date {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

function certificateNumber(): string {
  const suffix = BigInt(`0x${randomBytes(6).toString('hex')}`)
    .toString(36)
    .toUpperCase()
    .padStart(9, '0');
  return `BLD-CERT-${suffix}`;
}

// ── Geography: extra cities so the map spans the country ────────────────────
const EXTRA_CITIES = [
  { wilayaCode: '19', nameAr: 'سطيف', nameFr: 'Sétif', nameEn: 'Setif', lat: 36.19, lng: 5.41 },
  {
    wilayaCode: '47',
    nameAr: 'غرداية',
    nameFr: 'Ghardaïa',
    nameEn: 'Ghardaia',
    lat: 32.49,
    lng: 3.67,
  },
  { wilayaCode: '07', nameAr: 'بسكرة', nameFr: 'Biskra', nameEn: 'Biskra', lat: 34.85, lng: 5.73 },
  {
    wilayaCode: '11',
    nameAr: 'تمنراست',
    nameFr: 'Tamanrasset',
    nameEn: 'Tamanrasset',
    lat: 22.79,
    lng: 5.52,
  },
  {
    wilayaCode: '30',
    nameAr: 'ورقلة',
    nameFr: 'Ouargla',
    nameEn: 'Ouargla',
    lat: 31.95,
    lng: 5.33,
  },
  {
    wilayaCode: '27',
    nameAr: 'مستغانم',
    nameFr: 'Mostaganem',
    nameEn: 'Mostaganem',
    lat: 35.93,
    lng: 0.09,
  },
  { wilayaCode: '17', nameAr: 'الجلفة', nameFr: 'Djelfa', nameEn: 'Djelfa', lat: 34.67, lng: 3.26 },
  { wilayaCode: '18', nameAr: 'جيجل', nameFr: 'Jijel', nameEn: 'Jijel', lat: 36.82, lng: 5.77 },
  {
    wilayaCode: '39',
    nameAr: 'الوادي',
    nameFr: 'El Oued',
    nameEn: 'El Oued',
    lat: 33.37,
    lng: 6.86,
  },
  { wilayaCode: '02', nameAr: 'الشلف', nameFr: 'Chlef', nameEn: 'Chlef', lat: 36.17, lng: 1.33 },
] as const;

/** City display names + coordinates for every wilaya the rich dataset uses. */
const CITY: Record<string, { ar: string; fr: string; en: string; lat: number; lng: number }> = {
  '05': { ar: 'باتنة', fr: 'Batna', en: 'Batna', lat: 35.5567, lng: 6.1741 },
  '06': { ar: 'بجاية', fr: 'Béjaïa', en: 'Bejaia', lat: 36.751, lng: 5.081 },
  '09': { ar: 'البليدة', fr: 'Blida', en: 'Blida', lat: 36.47, lng: 2.83 },
  '13': { ar: 'تلمسان', fr: 'Tlemcen', en: 'Tlemcen', lat: 34.8828, lng: -1.3167 },
  '15': { ar: 'تيزي وزو', fr: 'Tizi Ouzou', en: 'Tizi Ouzou', lat: 36.7118, lng: 4.0497 },
  '16': { ar: 'الجزائر العاصمة', fr: 'Alger', en: 'Algiers', lat: 36.7538, lng: 3.0588 },
  '23': { ar: 'عنابة', fr: 'Annaba', en: 'Annaba', lat: 36.9, lng: 7.7667 },
  '25': { ar: 'قسنطينة', fr: 'Constantine', en: 'Constantine', lat: 36.365, lng: 6.6147 },
  '31': { ar: 'وهران', fr: 'Oran', en: 'Oran', lat: 35.6971, lng: -0.6308 },
  '35': { ar: 'بومرداس', fr: 'Boumerdès', en: 'Boumerdes', lat: 36.76, lng: 3.47 },
  '42': { ar: 'تيبازة', fr: 'Tipaza', en: 'Tipaza', lat: 36.5897, lng: 2.4486 },
  ...Object.fromEntries(
    EXTRA_CITIES.map((c) => [
      c.wilayaCode,
      { ar: c.nameAr, fr: c.nameFr, en: c.nameEn, lat: c.lat, lng: c.lng },
    ]),
  ),
};

// ── People ───────────────────────────────────────────────────────────────────
const FIRST_NAMES = [
  'Yacine',
  'Sarah',
  'Karim',
  'Lina',
  'Mohamed',
  'Meriem',
  'Amine',
  'Yasmine',
  'Rachid',
  'Imane',
  'Sofiane',
  'Nour',
  'Bilal',
  'Khadija',
  'Walid',
  'Rania',
  'Nassim',
  'Sabrina',
  'Hichem',
  'Lydia',
  'Riad',
  'Feriel',
  'Islam',
  'Asma',
  'Ayoub',
  'Chaima',
  'Mehdi',
  'Nesrine',
  'Samir',
  'Houda',
  'Lyes',
  'Kenza',
  'Anis',
  'Dounia',
  'Abdelkader',
  'Thiziri',
  'Redouane',
  'Wissam',
  'Fares',
  'Malika',
] as const;
const LAST_NAMES = [
  'Bouzid',
  'Saidi',
  'Mebarki',
  'Boudiaf',
  'Khelifi',
  'Amrani',
  'Belkacem',
  'Cherif',
  'Hamidi',
  'Zerrouki',
  'Larbi',
  'Mansouri',
  'Benamar',
  'Ait Ahmed',
  'Bensalem',
  'Ouali',
  'Kaci',
  'Brahimi',
  'Djebbar',
  'Rahmani',
  'Taleb',
  'Messaoudi',
  'Guerroudj',
  'Bekkouche',
  'Hadjadj',
  'Benyoucef',
  'Chikhi',
  'Ferhat',
  'Lounis',
  'Slimani',
] as const;
const BIOS = [
  'طالب جامعي متحمس للعمل التطوعي وخدمة الحي.',
  'Étudiante en médecine, bénévole lors des collectes de sang et des caravanes médicales.',
  'مهندس شاب أحب البيئة وأشارك في حملات التشجير كل شهر.',
  'Enseignante, j’anime des ateliers de lecture pour les enfants le week-end.',
  'متطوعة في العمل الخيري منذ 5 سنوات، أحب تنظيم الحملات التضامنية.',
  'Photographe amateur, je documente les initiatives de ma wilaya.',
  'Développeur web, j’aide les associations à se digitaliser.',
  'رياضي وأنظم دوريات كرة القدم للأطفال في الحي.',
  'Infirmière, engagée dans la sensibilisation à la santé.',
  'أهتم بالتراث والثقافة الأمازيغية وأشارك في المهرجانات المحلية.',
] as const;
const AVAILABILITY = ['WEEKENDS', 'EVENINGS', 'WEEKDAYS', 'FLEXIBLE'] as const;
const SKILLS = [
  'Teamwork',
  'Communication',
  'First Aid',
  'Teaching',
  'Fundraising',
  'Event Management',
  'Driving',
  'Photography',
  'Web Development',
  'Translation',
] as const;
const INTERESTS = ['environment', 'education', 'health', 'culture', 'youth'] as const;
const VOLUNTEER_WILAYAS = [
  '16',
  '16',
  '31',
  '25',
  '23',
  '15',
  '06',
  '19',
  '13',
  '09',
  '42',
  '35',
  '47',
  '07',
  '27',
  '18',
  '05',
  '30',
  '39',
  '02',
] as const;

// ── Organizations ────────────────────────────────────────────────────────────
interface OrgSpec {
  slug: string;
  name: string;
  type:
    | 'ASSOCIATION'
    | 'NGO'
    | 'FOUNDATION'
    | 'EDUCATIONAL_INSTITUTION'
    | 'YOUTH_ORGANIZATION'
    | 'COMMUNITY_INITIATIVE';
  wilaya: string;
  cover: string;
  description: string;
  address: string;
  pending?: boolean;
}

const ORGS: OrgSpec[] = [
  {
    slug: 'nour-el-amal',
    name: 'جمعية نور الأمل للتضامن — Nour El Amal',
    type: 'ASSOCIATION',
    wilaya: '31',
    cover: 'humanitarian',
    description:
      'جمعية خيرية بوهران تنظم توزيع القفف الشتوية ومطاعم الرحمة ومرافقة العائلات المعوزة منذ 2012.',
    address: 'Hai Es-Salam, Oran',
  },
  {
    slug: 'ifri-culture',
    name: 'Association culturelle Ifri',
    type: 'ASSOCIATION',
    wilaya: '15',
    cover: 'culture',
    description:
      'Association culturelle de Tizi Ouzou : ateliers d’artisanat, festivals de musique et transmission du patrimoine amazigh.',
    address: 'Nouvelle-Ville, Tizi Ouzou',
  },
  {
    slug: 'sahara-verte',
    name: 'Sahara Verte — الصحراء الخضراء',
    type: 'NGO',
    wilaya: '47',
    cover: 'op-oasis',
    description:
      'منظمة بيئية في غرداية تعمل على حماية الواحات وغرس النخيل وترشيد استعمال المياه في الجنوب.',
    address: 'Bouhraoua, Ghardaïa',
  },
  {
    slug: 'ilm-pour-tous',
    name: 'جمعية العلم للجميع — Ilm Pour Tous',
    type: 'ASSOCIATION',
    wilaya: '25',
    cover: 'education',
    description: 'دروس دعم مجانية لتلاميذ المتوسط والثانوي ومكتبات متنقلة للقرى في ولاية قسنطينة.',
    address: 'Ali Mendjeli, Constantine',
  },
  {
    slug: 'sante-solidarite-annaba',
    name: 'Santé & Solidarité Annaba',
    type: 'NGO',
    wilaya: '23',
    cover: 'health',
    description:
      'Collectes de sang, caravanes médicales et campagnes de prévention dans la région d’Annaba, en lien avec les hôpitaux.',
    address: 'Centre-ville, Annaba',
  },
  {
    slug: 'jeunesse-active-setif',
    name: 'Jeunesse Active Sétif — شباب سطيف النشط',
    type: 'YOUTH_ORGANIZATION',
    wilaya: '19',
    cover: 'youth',
    description:
      'منظمة شبابية تنظم مخيمات قيادية ودوريات رياضية ونشاطات لإدماج الشباب في الحياة الجمعوية.',
    address: 'Cité 1014, Sétif',
  },
  {
    slug: 'mer-propre-bejaia',
    name: 'Mer Propre Béjaïa',
    type: 'ASSOCIATION',
    wilaya: '06',
    cover: 'environment-beach',
    description:
      'Protection du littoral de Béjaïa et de Jijel : nettoyage des plages, sensibilisation des estivants et suivi de la faune marine.',
    address: 'Boulevard de la Soummam, Béjaïa',
  },
  {
    slug: 'refuge-rahma',
    name: 'ملجأ الرحمة للحيوانات — Refuge Rahma',
    type: 'ASSOCIATION',
    wilaya: '09',
    cover: 'animal-welfare',
    description:
      'ملجأ للحيوانات الضالة في البليدة: علاج وتعقيم وحملات تبنٍّ مسؤول بالتعاون مع البياطرة المتطوعين.',
    address: 'Ouled Yaïch, Blida',
  },
  {
    slug: 'hay-tadamoun',
    name: 'مبادرة حي التضامن — Hay Tadamoun',
    type: 'COMMUNITY_INITIATIVE',
    wilaya: '16',
    cover: 'community',
    description:
      'مبادرة أحياء في العاصمة: تزيين المدارس، مرافقة كبار السن، وأسواق تضامنية للمنتجات المحلية.',
    address: 'Bab El Oued, Alger',
  },
  {
    slug: 'fondation-tlemcen-patrimoine',
    name: 'Fondation Tlemcen Patrimoine',
    type: 'FOUNDATION',
    wilaya: '13',
    cover: 'op-ghardaia',
    description:
      'Fondation dédiée à la restauration et à la documentation du patrimoine andalou et ottoman de Tlemcen.',
    address: 'Médina, Tlemcen',
  },
  {
    slug: 'oasis-biskra',
    name: 'جمعية واحات بسكرة — Oasis Biskra',
    type: 'ASSOCIATION',
    wilaya: '07',
    cover: 'op-oasis',
    description: 'حماية واحات الزيبان وتثمين التمور المحلية ومرافقة الفلاحين الشباب.',
    address: 'Sidi Okba, Biskra',
  },
  {
    slug: 'club-scientifique-mostaganem',
    name: 'Club scientifique — Université de Mostaganem',
    type: 'EDUCATIONAL_INSTITUTION',
    wilaya: '27',
    cover: 'op-bac-students',
    description:
      'Club étudiant : ateliers de programmation, soutien scolaire et vulgarisation scientifique pour les lycéens.',
    address: 'Université Abdelhamid Ibn Badis, Mostaganem',
  },
  {
    slug: 'ahaggar-jeunes',
    name: 'Ahaggar Jeunes — شباب الأهقار',
    type: 'YOUTH_ORGANIZATION',
    wilaya: '11',
    cover: 'op-hikers',
    description:
      'Nouvelle association de jeunes à Tamanrasset — dossier de vérification en cours d’examen.',
    address: 'Centre-ville, Tamanrasset',
    pending: true,
  },
];

// ── Initiative templates ─────────────────────────────────────────────────────
type Lang3 = { ar: string; fr: string; en: string };
type MetricType = 'VOLUNTEERS' | 'HOURS' | 'BENEFICIARIES' | 'ACTIVITIES' | 'TREES';

interface Template {
  category: string;
  cover: string;
  hours: number;
  capacity: number;
  minAge: number;
  title: Lang3; // `{c}` = city name in that language
  description: Lang3;
  problem: Lang3;
  objective: Lang3;
  beneficiaries: number;
  extraMetric?: { type: MetricType; name: string; unit: string; target: number };
  needs: Array<{
    kind: 'FINANCIAL' | 'EQUIPMENT' | 'MATERIAL' | 'SERVICE';
    label: Lang3;
    description: string;
    quantity?: number;
    targetAmount?: number;
  }>;
}

const T: Record<string, Template> = {
  reforestation: {
    category: 'environment',
    cover: 'op-cedar',
    hours: 5,
    capacity: 40,
    minAge: 14,
    title: {
      ar: 'تشجير غابة {c}',
      fr: 'Reboisement de la forêt de {c}',
      en: 'Reforesting the {c} forest',
    },
    description: {
      ar: 'نغرس معًا 300 شتلة من الأرز والصنوبر في المناطق التي أتلفتها الحرائق، مع تدريب على الغرس والسقي.',
      fr: 'Plantons ensemble 300 plants de cèdre et de pin dans les zones touchées par les incendies, avec une initiation à la plantation et à l’arrosage.',
      en: 'Together we plant 300 cedar and pine saplings in fire-damaged areas, with a hands-on introduction to planting and watering.',
    },
    problem: {
      ar: 'فقدت غابة {c} مساحات واسعة بسبب الحرائق الصيفية، ما يهدد التربة والتنوع البيولوجي.',
      fr: 'La forêt de {c} a perdu de vastes surfaces lors des incendies d’été, menaçant les sols et la biodiversité.',
      en: 'The {c} forest lost large areas to summer wildfires, threatening soil and biodiversity.',
    },
    objective: {
      ar: 'إعادة تشجير 3 هكتارات ومتابعة الشتلات لمدة سنة كاملة.',
      fr: 'Reboiser 3 hectares et suivre les plants pendant une année complète.',
      en: 'Reforest 3 hectares and monitor the saplings for a full year.',
    },
    beneficiaries: 2000,
    extraMetric: { type: 'TREES', name: 'الشتلات المغروسة', unit: 'شجرة', target: 300 },
    needs: [
      {
        kind: 'MATERIAL',
        label: {
          ar: 'شتلات أرز وصنوبر',
          fr: 'Plants de cèdre et de pin',
          en: 'Cedar and pine saplings',
        },
        description: 'شتلات محلية من المشتلة الغابية الجهوية.',
        quantity: 300,
      },
      {
        kind: 'EQUIPMENT',
        label: { ar: 'معاول وقفازات', fr: 'Pioches et gants', en: 'Hoes and gloves' },
        description: 'أدوات يدوية لفرق الغرس.',
        quantity: 40,
      },
    ],
  },
  beach: {
    category: 'environment',
    cover: 'op-ain-taya',
    hours: 4,
    capacity: 50,
    minAge: 12,
    title: {
      ar: 'حملة تنظيف شاطئ {c}',
      fr: 'Grand nettoyage de la plage de {c}',
      en: '{c} beach clean-up day',
    },
    description: {
      ar: 'جمع النفايات البلاستيكية وفرزها على طول الشاطئ، وتوعية العائلات بأهمية الحفاظ على البحر.',
      fr: 'Collecte et tri des déchets plastiques le long de la plage, et sensibilisation des familles à la protection de la mer.',
      en: 'Collect and sort plastic litter along the shore, and raise families’ awareness about protecting the sea.',
    },
    problem: {
      ar: 'تتراكم النفايات البلاستيكية على شاطئ {c} بعد كل موسم صيف.',
      fr: 'Les déchets plastiques s’accumulent sur la plage de {c} après chaque saison estivale.',
      en: 'Plastic waste piles up on the {c} beach after every summer season.',
    },
    objective: {
      ar: 'جمع طن من النفايات وتركيب 10 حاويات فرز دائمة.',
      fr: 'Collecter une tonne de déchets et installer 10 bacs de tri permanents.',
      en: 'Collect one tonne of waste and install 10 permanent sorting bins.',
    },
    beneficiaries: 5000,
    needs: [
      {
        kind: 'EQUIPMENT',
        label: { ar: 'أكياس وقفازات', fr: 'Sacs et gants', en: 'Bags and gloves' },
        description: 'أكياس متينة وقفازات لـ 50 متطوعًا.',
        quantity: 100,
      },
      {
        kind: 'SERVICE',
        label: { ar: 'نقل النفايات', fr: 'Transport des déchets', en: 'Waste transport' },
        description: 'شاحنة لنقل النفايات المفروزة إلى مركز الرسكلة.',
        quantity: 1,
      },
    ],
  },
  oasis: {
    category: 'environment',
    cover: 'op-oasis',
    hours: 6,
    capacity: 30,
    minAge: 14,
    title: {
      ar: 'غرس النخيل وحماية واحة {c}',
      fr: 'Palmiers et protection de l’oasis de {c}',
      en: 'Palm planting to protect the {c} oasis',
    },
    description: {
      ar: 'غرس فسائل النخيل وتنظيف السواقي التقليدية مع فلاحي الواحة.',
      fr: 'Plantation de rejets de palmiers et curage des seguias traditionnelles avec les agriculteurs de l’oasis.',
      en: 'Plant palm offshoots and clear the traditional irrigation channels with the oasis farmers.',
    },
    problem: {
      ar: 'تتراجع واحة {c} بسبب الجفاف وزحف الرمال وإهمال السواقي.',
      fr: 'L’oasis de {c} recule sous l’effet de la sécheresse, de l’ensablement et de l’abandon des seguias.',
      en: 'The {c} oasis is shrinking from drought, sand encroachment and neglected channels.',
    },
    objective: {
      ar: 'غرس 150 فسيلة وتنظيف 2 كلم من السواقي.',
      fr: 'Planter 150 rejets et curer 2 km de seguias.',
      en: 'Plant 150 offshoots and clear 2 km of irrigation channels.',
    },
    beneficiaries: 800,
    extraMetric: { type: 'TREES', name: 'فسائل النخيل المغروسة', unit: 'شجرة', target: 150 },
    needs: [
      {
        kind: 'MATERIAL',
        label: { ar: 'فسائل نخيل', fr: 'Rejets de palmiers', en: 'Palm offshoots' },
        description: 'فسائل دقلة نور من الفلاحين المحليين.',
        quantity: 150,
      },
    ],
  },
  cedarTrail: {
    category: 'environment',
    cover: 'op-cedar-road',
    hours: 5,
    capacity: 25,
    minAge: 15,
    title: {
      ar: 'تنظيف مسار الأرز في {c}',
      fr: 'Nettoyage du sentier des cèdres de {c}',
      en: 'Cedar trail clean-up in {c}',
    },
    description: {
      ar: 'جولة جبلية لتنظيف المسار ووضع لافتات توعوية لحماية غابة الأرز.',
      fr: 'Une randonnée pour nettoyer le sentier et installer des panneaux de sensibilisation à la protection des cèdres.',
      en: 'A mountain walk to clean the trail and install signs about protecting the cedar forest.',
    },
    problem: {
      ar: 'يترك الزوار نفايات كثيرة على مسار الأرز في {c}.',
      fr: 'Les visiteurs laissent beaucoup de déchets sur le sentier des cèdres de {c}.',
      en: 'Visitors leave a lot of litter along the {c} cedar trail.',
    },
    objective: {
      ar: 'تنظيف 8 كلم من المسار وتركيب 12 لافتة.',
      fr: 'Nettoyer 8 km de sentier et installer 12 panneaux.',
      en: 'Clean 8 km of trail and install 12 signs.',
    },
    beneficiaries: 3000,
    needs: [],
  },
  park: {
    category: 'environment',
    cover: 'environment-park',
    hours: 4,
    capacity: 35,
    minAge: 10,
    title: {
      ar: 'يوم بيئي في حديقة {c}',
      fr: 'Journée verte au parc de {c}',
      en: 'Green day at the {c} park',
    },
    description: {
      ar: 'غرس الأزهار وتنظيف الممرات وورشات توعية بيئية للأطفال.',
      fr: 'Plantation de fleurs, nettoyage des allées et ateliers de sensibilisation pour les enfants.',
      en: 'Flower planting, path cleaning and environmental workshops for children.',
    },
    problem: {
      ar: 'تحتاج حديقة {c} إلى صيانة وتجديد مساحاتها الخضراء.',
      fr: 'Le parc de {c} a besoin d’entretien et de renouveler ses espaces verts.',
      en: 'The {c} park needs maintenance and renewed green spaces.',
    },
    objective: {
      ar: 'تجديد 1000 م² من المساحات الخضراء بمشاركة العائلات.',
      fr: 'Renouveler 1 000 m² d’espaces verts avec les familles.',
      en: 'Renew 1,000 m² of green space together with families.',
    },
    beneficiaries: 4000,
    needs: [],
  },
  tutoring: {
    category: 'education',
    cover: 'op-bac-students',
    hours: 3,
    capacity: 20,
    minAge: 18,
    title: {
      ar: 'دروس دعم مجانية لتلاميذ البكالوريا في {c}',
      fr: 'Soutien scolaire gratuit pour le bac à {c}',
      en: 'Free baccalaureate tutoring in {c}',
    },
    description: {
      ar: 'نبحث عن طلبة وأساتذة متطوعين لتقديم حصص دعم في الرياضيات والفيزياء والفلسفة.',
      fr: 'Nous cherchons des étudiants et enseignants bénévoles pour des cours de maths, physique et philosophie.',
      en: 'We are looking for student and teacher volunteers to give maths, physics and philosophy sessions.',
    },
    problem: {
      ar: 'لا تستطيع عائلات كثيرة في {c} تحمل تكاليف الدروس الخصوصية.',
      fr: 'De nombreuses familles de {c} ne peuvent pas payer de cours particuliers.',
      en: 'Many families in {c} cannot afford private tutoring.',
    },
    objective: {
      ar: 'مرافقة 120 تلميذًا حتى امتحان البكالوريا.',
      fr: 'Accompagner 120 élèves jusqu’à l’examen du bac.',
      en: 'Support 120 students through to the baccalaureate exam.',
    },
    beneficiaries: 120,
    needs: [
      {
        kind: 'MATERIAL',
        label: { ar: 'كتب وحوليات', fr: 'Livres et annales', en: 'Books and past papers' },
        description: 'كتب مراجعة وحوليات امتحانات سابقة.',
        quantity: 60,
      },
    ],
  },
  library: {
    category: 'education',
    cover: 'op-outdoor-class',
    hours: 6,
    capacity: 15,
    minAge: 18,
    title: {
      ar: 'مكتبة متنقلة لأطفال قرى {c}',
      fr: 'Bibliothèque itinérante dans les villages de {c}',
      en: 'Mobile library for village children in {c}',
    },
    description: {
      ar: 'نجول بالكتب والقصص على قرى الولاية ونقرأ مع الأطفال ونوزع الكتب.',
      fr: 'Nous sillonnons les villages avec des livres, lisons avec les enfants et distribuons des ouvrages.',
      en: 'We tour the villages with books, read with the children and hand out books.',
    },
    problem: {
      ar: 'أطفال قرى {c} بعيدون عن المكتبات العمومية.',
      fr: 'Les enfants des villages de {c} sont loin des bibliothèques publiques.',
      en: 'Children in the villages of {c} live far from public libraries.',
    },
    objective: {
      ar: 'الوصول إلى 10 قرى وتوزيع 1500 كتاب.',
      fr: 'Atteindre 10 villages et distribuer 1 500 livres.',
      en: 'Reach 10 villages and distribute 1,500 books.',
    },
    beneficiaries: 900,
    needs: [
      {
        kind: 'MATERIAL',
        label: { ar: 'كتب أطفال', fr: 'Livres pour enfants', en: 'Children’s books' },
        description: 'كتب أطفال بالعربية والأمازيغية والفرنسية.',
        quantity: 1500,
      },
      {
        kind: 'FINANCIAL',
        label: { ar: 'وقود الحافلة', fr: 'Carburant du minibus', en: 'Minibus fuel' },
        description: 'وقود الجولة، بتحويل بنكي إلى حساب الجمعية.',
        targetAmount: 40000,
      },
    ],
  },
  coding: {
    category: 'education',
    cover: 'education',
    hours: 3,
    capacity: 18,
    minAge: 18,
    title: {
      ar: 'ورشة برمجة للشباب في {c}',
      fr: 'Atelier de programmation pour les jeunes à {c}',
      en: 'Coding workshop for young people in {c}',
    },
    description: {
      ar: 'نعلّم أساسيات البرمجة وصناعة المواقع لتلاميذ الثانوي خلال 6 حصص.',
      fr: 'Initiation à la programmation et à la création de sites web pour les lycéens, en 6 séances.',
      en: 'An introduction to programming and building websites for high-school students, over 6 sessions.',
    },
    problem: {
      ar: 'يفتقر شباب {c} إلى فرص تعلم المهارات الرقمية.',
      fr: 'Les jeunes de {c} manquent d’occasions d’apprendre le numérique.',
      en: 'Young people in {c} lack opportunities to learn digital skills.',
    },
    objective: {
      ar: 'تكوين 60 شابًا ومرافقتهم في أول مشروع رقمي.',
      fr: 'Former 60 jeunes et les accompagner dans leur premier projet numérique.',
      en: 'Train 60 young people and mentor their first digital project.',
    },
    beneficiaries: 60,
    needs: [
      {
        kind: 'EQUIPMENT',
        label: { ar: 'حواسيب محمولة', fr: 'Ordinateurs portables', en: 'Laptops' },
        description: 'حواسيب مستعملة في حالة جيدة.',
        quantity: 15,
      },
    ],
  },
  winterKits: {
    category: 'humanitarian',
    cover: 'humanitarian',
    hours: 5,
    capacity: 40,
    minAge: 16,
    title: {
      ar: 'توزيع قفف الشتاء على العائلات في {c}',
      fr: 'Distribution de colis d’hiver à {c}',
      en: 'Winter parcel distribution in {c}',
    },
    description: {
      ar: 'تحضير وتوزيع قفف غذائية وأغطية على العائلات المعوزة المسجلة لدى الجمعية.',
      fr: 'Préparation et distribution de colis alimentaires et de couvertures aux familles inscrites auprès de l’association.',
      en: 'Prepare and deliver food parcels and blankets to families registered with the association.',
    },
    problem: {
      ar: 'يشتد البرد على العائلات الهشة في {c} كل شتاء.',
      fr: 'Le froid frappe durement les familles vulnérables de {c} chaque hiver.',
      en: 'The cold hits vulnerable families in {c} hard every winter.',
    },
    objective: {
      ar: 'إيصال 400 قفة و300 غطاء قبل نهاية ديسمبر.',
      fr: 'Livrer 400 colis et 300 couvertures avant fin décembre.',
      en: 'Deliver 400 parcels and 300 blankets before the end of December.',
    },
    beneficiaries: 400,
    needs: [
      {
        kind: 'MATERIAL',
        label: { ar: 'أغطية صوفية', fr: 'Couvertures en laine', en: 'Wool blankets' },
        description: 'أغطية جديدة أو نظيفة.',
        quantity: 300,
      },
      {
        kind: 'FINANCIAL',
        label: { ar: 'مواد غذائية', fr: 'Denrées alimentaires', en: 'Food supplies' },
        description: 'دقيق وزيت وعدس وسميد — بتحويل بنكي إلى حساب الجمعية.',
        targetAmount: 600000,
      },
    ],
  },
  solidarityKitchen: {
    category: 'humanitarian',
    cover: 'op-bakery',
    hours: 4,
    capacity: 20,
    minAge: 16,
    title: {
      ar: 'مطعم الرحمة: وجبات ساخنة في {c}',
      fr: 'Restaurant solidaire : repas chauds à {c}',
      en: 'Solidarity kitchen: hot meals in {c}',
    },
    description: {
      ar: 'طهي وتوزيع وجبات ساخنة لعابري السبيل والمحتاجين كل مساء.',
      fr: 'Cuisiner et servir des repas chauds aux personnes dans le besoin chaque soir.',
      en: 'Cook and serve hot meals to people in need every evening.',
    },
    problem: {
      ar: 'يحتاج عابرو السبيل والمشردون في {c} إلى وجبة ساخنة يومية.',
      fr: 'Les personnes sans abri de {c} ont besoin d’un repas chaud quotidien.',
      en: 'Homeless people in {c} need a daily hot meal.',
    },
    objective: {
      ar: 'تقديم 150 وجبة يوميًا لمدة شهر.',
      fr: 'Servir 150 repas par jour pendant un mois.',
      en: 'Serve 150 meals a day for a month.',
    },
    beneficiaries: 150,
    needs: [
      {
        kind: 'SERVICE',
        label: { ar: 'طباخ متطوع', fr: 'Cuisinier bénévole', en: 'Volunteer cook' },
        description: 'طباخ ذو خبرة لقيادة فريق المطبخ.',
        quantity: 2,
      },
    ],
  },
  bloodDrive: {
    category: 'health',
    cover: 'op-hospital',
    hours: 4,
    capacity: 30,
    minAge: 18,
    title: {
      ar: 'حملة التبرع بالدم في {c}',
      fr: 'Collecte de sang à {c}',
      en: 'Blood donation drive in {c}',
    },
    description: {
      ar: 'استقبال المتبرعين وتنظيم الطوابير وتوعية المواطنين بالتعاون مع المستشفى الجامعي.',
      fr: 'Accueil des donneurs, organisation des files et sensibilisation, en partenariat avec le CHU.',
      en: 'Welcome donors, organise queues and raise awareness, in partnership with the university hospital.',
    },
    problem: {
      ar: 'تعاني بنوك الدم في {c} من نقص مستمر خاصة في الصيف.',
      fr: 'Les banques de sang de {c} manquent régulièrement de poches, surtout l’été.',
      en: 'Blood banks in {c} face recurring shortages, especially in summer.',
    },
    objective: {
      ar: 'جمع 300 كيس دم في يوم واحد.',
      fr: 'Collecter 300 poches de sang en une journée.',
      en: 'Collect 300 blood bags in one day.',
    },
    beneficiaries: 900,
    needs: [],
  },
  medicalCaravan: {
    category: 'health',
    cover: 'health',
    hours: 8,
    capacity: 20,
    minAge: 20,
    title: {
      ar: 'قافلة طبية للمناطق النائية في {c}',
      fr: 'Caravane médicale dans les zones isolées de {c}',
      en: 'Medical caravan to remote areas of {c}',
    },
    description: {
      ar: 'أطباء وممرضون وطلبة طب يقدمون فحوصًا مجانية ويوزعون الأدوية في القرى البعيدة.',
      fr: 'Médecins, infirmiers et étudiants offrent des consultations gratuites et distribuent des médicaments.',
      en: 'Doctors, nurses and medical students offer free check-ups and hand out medicines in remote villages.',
    },
    problem: {
      ar: 'تبعد بعض قرى {c} أكثر من 50 كلم عن أقرب مستشفى.',
      fr: 'Certains villages de {c} sont à plus de 50 km de l’hôpital le plus proche.',
      en: 'Some villages in {c} are more than 50 km from the nearest hospital.',
    },
    objective: {
      ar: 'فحص 600 مريض وتوجيه الحالات المستعجلة.',
      fr: 'Examiner 600 patients et orienter les cas urgents.',
      en: 'Examine 600 patients and refer urgent cases.',
    },
    beneficiaries: 600,
    needs: [
      {
        kind: 'MATERIAL',
        label: { ar: 'أدوية أساسية', fr: 'Médicaments essentiels', en: 'Essential medicines' },
        description: 'تُقدَّم عبر الصيدليات الشريكة فقط.',
        quantity: 500,
      },
    ],
  },
  healthRun: {
    category: 'health',
    cover: 'op-running',
    hours: 5,
    capacity: 45,
    minAge: 16,
    title: {
      ar: 'ماراثون الصحة والتوعية في {c}',
      fr: 'Course santé et prévention à {c}',
      en: 'Health awareness run in {c}',
    },
    description: {
      ar: 'تنظيم سباق شعبي مع أكشاك للكشف عن السكري وضغط الدم.',
      fr: 'Organisation d’une course populaire avec des stands de dépistage du diabète et de la tension.',
      en: 'Organise a public run with diabetes and blood-pressure screening stands.',
    },
    problem: {
      ar: 'ترتفع نسب السكري وارتفاع الضغط في {c} دون كشف مبكر.',
      fr: 'Le diabète et l’hypertension progressent à {c} sans dépistage précoce.',
      en: 'Diabetes and hypertension are rising in {c} without early screening.',
    },
    objective: {
      ar: 'إشراك 1000 عدّاء وإجراء 500 كشف.',
      fr: 'Mobiliser 1 000 coureurs et réaliser 500 dépistages.',
      en: 'Bring together 1,000 runners and carry out 500 screenings.',
    },
    beneficiaries: 1000,
    needs: [],
  },
  crafts: {
    category: 'culture',
    cover: 'culture',
    hours: 3,
    capacity: 15,
    minAge: 14,
    title: {
      ar: 'ورشة الحرف التقليدية في {c}',
      fr: 'Atelier d’artisanat traditionnel à {c}',
      en: 'Traditional crafts workshop in {c}',
    },
    description: {
      ar: 'تتعلم الشابات من الحرفيات الخبيرات فنون النسيج والطرز والفخار.',
      fr: 'Les jeunes apprennent le tissage, la broderie et la poterie auprès d’artisanes expérimentées.',
      en: 'Young people learn weaving, embroidery and pottery from experienced craftswomen.',
    },
    problem: {
      ar: 'تختفي الحرف التقليدية في {c} مع غياب من يتعلمها.',
      fr: 'L’artisanat traditionnel de {c} disparaît faute de relève.',
      en: 'Traditional crafts in {c} are disappearing for lack of apprentices.',
    },
    objective: {
      ar: 'تكوين 40 متربصة وتنظيم معرض للمنتجات.',
      fr: 'Former 40 apprenties et organiser une exposition.',
      en: 'Train 40 apprentices and organise an exhibition.',
    },
    beneficiaries: 40,
    needs: [
      {
        kind: 'MATERIAL',
        label: { ar: 'صوف وخيوط', fr: 'Laine et fils', en: 'Wool and thread' },
        description: 'مواد أولية لأنوال النسيج.',
        quantity: 50,
      },
    ],
  },
  festival: {
    category: 'culture',
    cover: 'op-chaoui-dance',
    hours: 6,
    capacity: 60,
    minAge: 16,
    title: {
      ar: 'مهرجان الفنون الشعبية في {c}',
      fr: 'Festival des arts populaires de {c}',
      en: '{c} folk arts festival',
    },
    description: {
      ar: 'استقبال الزوار وتنظيم العروض ومرافقة الفرق الفنية خلال يومين من الاحتفال.',
      fr: 'Accueil du public, organisation des spectacles et accompagnement des troupes pendant deux jours.',
      en: 'Welcome visitors, run the shows and support the troupes over two days of celebration.',
    },
    problem: {
      ar: 'يحتاج مهرجان {c} إلى فريق كبير لاستقبال آلاف الزوار.',
      fr: 'Le festival de {c} a besoin d’une grande équipe pour accueillir des milliers de visiteurs.',
      en: 'The {c} festival needs a large team to welcome thousands of visitors.',
    },
    objective: {
      ar: 'تنظيم 20 عرضًا واستقبال 8000 زائر.',
      fr: 'Organiser 20 spectacles et accueillir 8 000 visiteurs.',
      en: 'Stage 20 shows and welcome 8,000 visitors.',
    },
    beneficiaries: 8000,
    needs: [],
  },
  heritage: {
    category: 'culture',
    cover: 'op-ghardaia',
    hours: 5,
    capacity: 20,
    minAge: 18,
    title: {
      ar: 'توثيق وترميم التراث المعماري في {c}',
      fr: 'Documenter et restaurer le patrimoine de {c}',
      en: 'Documenting and restoring heritage in {c}',
    },
    description: {
      ar: 'تصوير وتوثيق المباني التاريخية والمشاركة في أعمال ترميم بسيطة تحت إشراف مختصين.',
      fr: 'Photographier et documenter les bâtiments historiques et participer à de petits travaux de restauration encadrés.',
      en: 'Photograph and document historic buildings and help with supervised minor restoration work.',
    },
    problem: {
      ar: 'تتدهور معالم {c} التاريخية بسرعة دون توثيق.',
      fr: 'Les monuments historiques de {c} se dégradent rapidement sans être documentés.',
      en: 'Historic landmarks in {c} are deteriorating fast without documentation.',
    },
    objective: {
      ar: 'توثيق 30 معلمًا ونشر أرشيف رقمي مفتوح.',
      fr: 'Documenter 30 monuments et publier une archive numérique ouverte.',
      en: 'Document 30 landmarks and publish an open digital archive.',
    },
    beneficiaries: 10000,
    needs: [
      {
        kind: 'EQUIPMENT',
        label: { ar: 'آلات تصوير', fr: 'Appareils photo', en: 'Cameras' },
        description: 'آلات تصوير أو هواتف حديثة تُعار للمتطوعين.',
        quantity: 5,
      },
    ],
  },
  kidsArt: {
    category: 'culture',
    cover: 'op-kids-painting',
    hours: 3,
    capacity: 12,
    minAge: 18,
    title: {
      ar: 'ورشة الرسم للأطفال في {c}',
      fr: 'Atelier de peinture pour enfants à {c}',
      en: 'Painting workshop for children in {c}',
    },
    description: {
      ar: 'نرافق الأطفال في ورشات رسم أسبوعية ونختم بمعرض للعائلات.',
      fr: 'Nous accompagnons les enfants dans des ateliers de peinture hebdomadaires, clôturés par une exposition.',
      en: 'We guide children through weekly painting workshops, ending with an exhibition for families.',
    },
    problem: {
      ar: 'قلة الأنشطة الفنية المجانية للأطفال في {c}.',
      fr: 'Peu d’activités artistiques gratuites pour les enfants de {c}.',
      en: 'Few free art activities for children in {c}.',
    },
    objective: {
      ar: 'إشراك 80 طفلًا في 8 ورشات.',
      fr: 'Faire participer 80 enfants à 8 ateliers.',
      en: 'Involve 80 children in 8 workshops.',
    },
    beneficiaries: 80,
    needs: [
      {
        kind: 'MATERIAL',
        label: { ar: 'ألوان ولوحات', fr: 'Peintures et toiles', en: 'Paints and canvases' },
        description: 'ألوان غواش وفرش ولوحات.',
        quantity: 80,
      },
    ],
  },
  leadershipCamp: {
    category: 'youth',
    cover: 'youth',
    hours: 16,
    capacity: 30,
    minAge: 18,
    title: {
      ar: 'مخيم القيادة الشبابية في {c}',
      fr: 'Camp de leadership pour jeunes à {c}',
      en: 'Youth leadership camp in {c}',
    },
    description: {
      ar: 'مخيم لمدة يومين لتأطير شباب الجمعيات في التخطيط وإدارة المشاريع.',
      fr: 'Un camp de deux jours pour former les jeunes des associations à la gestion de projets.',
      en: 'A two-day camp training young association members in project management.',
    },
    problem: {
      ar: 'تحتاج جمعيات {c} إلى قيادات شابة مكوّنة.',
      fr: 'Les associations de {c} ont besoin de jeunes responsables formés.',
      en: 'Associations in {c} need trained young leaders.',
    },
    objective: {
      ar: 'تكوين 100 قائد شاب في 3 دورات.',
      fr: 'Former 100 jeunes leaders en 3 sessions.',
      en: 'Train 100 young leaders over 3 sessions.',
    },
    beneficiaries: 100,
    needs: [],
  },
  football: {
    category: 'youth',
    cover: 'op-kids-play',
    hours: 4,
    capacity: 20,
    minAge: 18,
    title: {
      ar: 'دوري الأحياء لكرة القدم في {c}',
      fr: 'Tournoi de football inter-quartiers à {c}',
      en: 'Neighbourhood football tournament in {c}',
    },
    description: {
      ar: 'تحكيم المباريات وتأطير الفرق وتنظيم حفل الختام لأطفال الأحياء.',
      fr: 'Arbitrage, encadrement des équipes et cérémonie de clôture pour les enfants des quartiers.',
      en: 'Refereeing, team coaching and a closing ceremony for neighbourhood children.',
    },
    problem: {
      ar: 'يقضي أطفال أحياء {c} العطل دون أنشطة منظمة.',
      fr: 'Les enfants des quartiers de {c} passent les vacances sans activité encadrée.',
      en: 'Children in {c} neighbourhoods spend the holidays without organised activities.',
    },
    objective: {
      ar: 'إشراك 16 فريقًا و200 طفل.',
      fr: 'Faire jouer 16 équipes et 200 enfants.',
      en: 'Involve 16 teams and 200 children.',
    },
    beneficiaries: 200,
    needs: [
      {
        kind: 'EQUIPMENT',
        label: { ar: 'كرات وأقمصة', fr: 'Ballons et maillots', en: 'Balls and jerseys' },
        description: 'كرات وأطقم أقمصة لـ 16 فريقًا.',
        quantity: 16,
      },
    ],
  },
  hike: {
    category: 'youth',
    cover: 'op-hikers',
    hours: 7,
    capacity: 25,
    minAge: 16,
    title: {
      ar: 'رحلة استكشافية وتنظيف المسارات في {c}',
      fr: 'Randonnée éco-citoyenne à {c}',
      en: 'Eco hike and trail clean-up in {c}',
    },
    description: {
      ar: 'رحلة جبلية للشباب مع جمع النفايات والتعرف على النباتات المحلية.',
      fr: 'Une randonnée pour les jeunes avec ramassage des déchets et découverte de la flore locale.',
      en: 'A hike for young people with litter picking and a discovery of local plants.',
    },
    problem: {
      ar: 'المسارات الجبلية في {c} مهددة بالنفايات.',
      fr: 'Les sentiers de montagne de {c} sont menacés par les déchets.',
      en: 'Mountain trails in {c} are threatened by litter.',
    },
    objective: {
      ar: 'تنظيف 12 كلم وتعريف 50 شابًا بالسياحة البيئية.',
      fr: 'Nettoyer 12 km et initier 50 jeunes à l’écotourisme.',
      en: 'Clean 12 km and introduce 50 young people to eco-tourism.',
    },
    beneficiaries: 50,
    needs: [],
  },
  strays: {
    category: 'animal-welfare',
    cover: 'animal-welfare',
    hours: 4,
    capacity: 15,
    minAge: 18,
    title: {
      ar: 'رعاية الحيوانات الضالة وتعقيمها في {c}',
      fr: 'Soins et stérilisation des animaux errants à {c}',
      en: 'Stray animal care and neutering in {c}',
    },
    description: {
      ar: 'مساعدة البياطرة المتطوعين في الإمساك الآمن بالحيوانات وعلاجها وتلقيحها.',
      fr: 'Aider les vétérinaires bénévoles à capturer en douceur, soigner et vacciner les animaux.',
      en: 'Help volunteer vets safely catch, treat and vaccinate animals.',
    },
    problem: {
      ar: 'يتزايد عدد الحيوانات الضالة المريضة في {c}.',
      fr: 'Le nombre d’animaux errants malades augmente à {c}.',
      en: 'The number of sick stray animals is growing in {c}.',
    },
    objective: {
      ar: 'تعقيم وتلقيح 200 حيوان.',
      fr: 'Stériliser et vacciner 200 animaux.',
      en: 'Neuter and vaccinate 200 animals.',
    },
    beneficiaries: 200,
    needs: [
      {
        kind: 'FINANCIAL',
        label: { ar: 'لقاحات', fr: 'Vaccins', en: 'Vaccines' },
        description: 'لقاحات ضد داء الكلب — بتحويل بنكي إلى الملجأ.',
        targetAmount: 120000,
      },
    ],
  },
  adoption: {
    category: 'animal-welfare',
    cover: 'op-farm',
    hours: 5,
    capacity: 12,
    minAge: 16,
    title: {
      ar: 'يوم التبني المسؤول في {c}',
      fr: 'Journée d’adoption responsable à {c}',
      en: 'Responsible adoption day in {c}',
    },
    description: {
      ar: 'تعريف العائلات بالحيوانات القابلة للتبني ومرافقتهم في الإجراءات.',
      fr: 'Présenter les animaux adoptables aux familles et les accompagner dans les démarches.',
      en: 'Introduce families to adoptable animals and guide them through the process.',
    },
    problem: {
      ar: 'يمتلئ ملجأ {c} بحيوانات تنتظر عائلة.',
      fr: 'Le refuge de {c} est plein d’animaux qui attendent une famille.',
      en: 'The {c} shelter is full of animals waiting for a family.',
    },
    objective: {
      ar: 'إيجاد عائلات لـ 40 حيوانًا.',
      fr: 'Trouver une famille pour 40 animaux.',
      en: 'Find families for 40 animals.',
    },
    beneficiaries: 40,
    needs: [],
  },
  market: {
    category: 'community',
    cover: 'op-market',
    hours: 6,
    capacity: 25,
    minAge: 16,
    title: {
      ar: 'سوق تضامني للمنتجات المحلية في {c}',
      fr: 'Marché solidaire des produits locaux à {c}',
      en: 'Solidarity market for local products in {c}',
    },
    description: {
      ar: 'دعم الفلاحين والحرفيين الصغار ببيع منتجاتهم مباشرة للمواطنين بأسعار عادلة.',
      fr: 'Soutenir petits agriculteurs et artisans en vendant directement leurs produits à prix justes.',
      en: 'Support small farmers and artisans by selling their products directly at fair prices.',
    },
    problem: {
      ar: 'يجد صغار المنتجين في {c} صعوبة في الوصول إلى الزبائن.',
      fr: 'Les petits producteurs de {c} peinent à atteindre les clients.',
      en: 'Small producers in {c} struggle to reach customers.',
    },
    objective: {
      ar: 'استقبال 40 منتجًا و3000 زائر.',
      fr: 'Accueillir 40 producteurs et 3 000 visiteurs.',
      en: 'Host 40 producers and 3,000 visitors.',
    },
    beneficiaries: 3000,
    needs: [
      {
        kind: 'EQUIPMENT',
        label: { ar: 'خيام وطاولات', fr: 'Tentes et tables', en: 'Tents and tables' },
        description: 'أكشاك لـ 40 منتجًا.',
        quantity: 40,
      },
    ],
  },
  schoolPaint: {
    category: 'community',
    cover: 'op-art-workshop',
    hours: 6,
    capacity: 30,
    minAge: 14,
    title: {
      ar: 'طلاء وتزيين مدرسة الحي في {c}',
      fr: 'Repeindre l’école du quartier à {c}',
      en: 'Repainting the neighbourhood school in {c}',
    },
    description: {
      ar: 'طلاء الأقسام ورسم جداريات تعليمية مع التلاميذ وأوليائهم.',
      fr: 'Repeindre les classes et réaliser des fresques pédagogiques avec les élèves et leurs parents.',
      en: 'Repaint classrooms and create educational murals with pupils and parents.',
    },
    problem: {
      ar: 'تحتاج مدرسة الحي في {c} إلى تجديد قبل الدخول المدرسي.',
      fr: 'L’école du quartier de {c} a besoin d’un rafraîchissement.',
      en: 'The neighbourhood school in {c} needs a refresh.',
    },
    objective: {
      ar: 'تجديد 12 قسمًا ورسم 4 جداريات.',
      fr: 'Rénover 12 classes et peindre 4 fresques.',
      en: 'Renovate 12 classrooms and paint 4 murals.',
    },
    beneficiaries: 450,
    needs: [
      {
        kind: 'MATERIAL',
        label: { ar: 'دهان', fr: 'Peinture', en: 'Paint' },
        description: 'دهان قابل للغسل، دلاء 20 لترًا.',
        quantity: 30,
      },
    ],
  },
  elders: {
    category: 'community',
    cover: 'community',
    hours: 3,
    capacity: 20,
    minAge: 18,
    title: {
      ar: 'مرافقة كبار السن في {c}',
      fr: 'Accompagner les personnes âgées à {c}',
      en: 'Keeping elderly people company in {c}',
    },
    description: {
      ar: 'زيارات أسبوعية لكبار السن المعزولين، مساعدة في المشتريات والمواعيد الطبية.',
      fr: 'Visites hebdomadaires aux personnes âgées isolées, aide aux courses et aux rendez-vous médicaux.',
      en: 'Weekly visits to isolated elderly people, help with shopping and medical appointments.',
    },
    problem: {
      ar: 'يعيش عدد متزايد من كبار السن وحدهم في {c}.',
      fr: 'De plus en plus de personnes âgées vivent seules à {c}.',
      en: 'More and more elderly people live alone in {c}.',
    },
    objective: {
      ar: 'مرافقة 60 مسنًّا بانتظام.',
      fr: 'Accompagner régulièrement 60 aînés.',
      en: 'Regularly accompany 60 elderly people.',
    },
    beneficiaries: 60,
    needs: [],
  },
  bay: {
    category: 'environment',
    cover: 'op-bay',
    hours: 5,
    capacity: 30,
    minAge: 16,
    title: {
      ar: 'تنظيف قاع البحر في خليج {c}',
      fr: 'Nettoyage des fonds marins de la baie de {c}',
      en: 'Seabed clean-up in the {c} bay',
    },
    description: {
      ar: 'غواصون متطوعون يرفعون النفايات من القاع، وفريق على الشاطئ يفرزها.',
      fr: 'Des plongeurs bénévoles remontent les déchets, une équipe à terre les trie.',
      en: 'Volunteer divers lift waste from the seabed while a shore team sorts it.',
    },
    problem: {
      ar: 'تتراكم الشباك والبلاستيك في قاع خليج {c}.',
      fr: 'Filets et plastiques s’accumulent au fond de la baie de {c}.',
      en: 'Nets and plastic accumulate on the seabed of the {c} bay.',
    },
    objective: {
      ar: 'رفع 500 كلغ من النفايات البحرية.',
      fr: 'Remonter 500 kg de déchets marins.',
      en: 'Lift 500 kg of marine waste.',
    },
    beneficiaries: 2500,
    needs: [
      {
        kind: 'SERVICE',
        label: { ar: 'قارب دعم', fr: 'Bateau d’appui', en: 'Support boat' },
        description: 'قارب مع ربّان لدعم فرق الغوص.',
        quantity: 1,
      },
    ],
  },
};

/** Skills each category asks for: [required, optional] (feeds matching). */
const CATEGORY_SKILLS: Record<string, [string[], string[]]> = {
  environment: [['Teamwork'], ['Driving', 'Photography']],
  education: [['Teaching'], ['Communication', 'Web Development']],
  humanitarian: [['Teamwork'], ['Driving', 'Fundraising']],
  health: [['First Aid'], ['Communication']],
  culture: [['Event Management'], ['Photography', 'Translation']],
  youth: [['Event Management'], ['Teamwork', 'Communication']],
  'animal-welfare': [['First Aid'], ['Teamwork']],
  community: [['Teamwork'], ['Communication', 'Fundraising']],
};

type Timing = 'completed' | 'thisWeek' | 'upcoming' | 'pending';

/** [template, organization slug, wilaya code, timing] */
const INITIATIVES: Array<[keyof typeof T, string, string, Timing]> = [
  ['winterKits', 'nour-el-amal', '31', 'upcoming'],
  ['solidarityKitchen', 'nour-el-amal', '31', 'thisWeek'],
  ['winterKits', 'nour-el-amal', '27', 'completed'],
  ['crafts', 'ifri-culture', '15', 'completed'],
  ['festival', 'ifri-culture', '15', 'upcoming'],
  ['kidsArt', 'ifri-culture', '15', 'thisWeek'],
  ['oasis', 'sahara-verte', '47', 'upcoming'],
  ['oasis', 'sahara-verte', '30', 'completed'],
  ['heritage', 'sahara-verte', '47', 'upcoming'],
  ['tutoring', 'ilm-pour-tous', '25', 'thisWeek'],
  ['library', 'ilm-pour-tous', '25', 'upcoming'],
  ['tutoring', 'ilm-pour-tous', '05', 'completed'],
  ['bloodDrive', 'sante-solidarite-annaba', '23', 'thisWeek'],
  ['medicalCaravan', 'sante-solidarite-annaba', '23', 'upcoming'],
  ['healthRun', 'sante-solidarite-annaba', '23', 'completed'],
  ['leadershipCamp', 'jeunesse-active-setif', '19', 'upcoming'],
  ['football', 'jeunesse-active-setif', '19', 'completed'],
  ['hike', 'jeunesse-active-setif', '05', 'upcoming'],
  ['beach', 'mer-propre-bejaia', '06', 'completed'],
  ['bay', 'mer-propre-bejaia', '18', 'upcoming'],
  ['reforestation', 'mer-propre-bejaia', '06', 'upcoming'],
  ['strays', 'refuge-rahma', '09', 'thisWeek'],
  ['adoption', 'refuge-rahma', '09', 'upcoming'],
  ['schoolPaint', 'hay-tadamoun', '16', 'upcoming'],
  ['elders', 'hay-tadamoun', '16', 'completed'],
  ['market', 'hay-tadamoun', '16', 'thisWeek'],
  ['heritage', 'fondation-tlemcen-patrimoine', '13', 'completed'],
  ['crafts', 'fondation-tlemcen-patrimoine', '13', 'upcoming'],
  ['oasis', 'oasis-biskra', '07', 'upcoming'],
  ['market', 'oasis-biskra', '39', 'completed'],
  ['coding', 'club-scientifique-mostaganem', '27', 'upcoming'],
  ['tutoring', 'club-scientifique-mostaganem', '27', 'completed'],
  ['reforestation', 'club-scientifique-mostaganem', '02', 'upcoming'],
  ['hike', 'ahaggar-jeunes', '11', 'pending'],
];

const MOTIVATIONS = [
  'أريد أن أساهم في خدمة ولايتي وأكتسب خبرة جديدة.',
  'J’ai déjà participé à des actions similaires et j’aimerais continuer.',
  'I want to give back to my community and meet motivated people.',
  'لدي خبرة في هذا المجال وأستطيع تأطير فريق صغير.',
  'Je suis disponible le week-end et motivé·e pour aider.',
  'هذه المبادرة تهمني كثيرًا لأنها تمس حيّنا مباشرة.',
] as const;
const REVIEWS = [
  [5, 'تنظيم ممتاز وفريق رائع، شعرت أن مساهمتي كانت مهمة فعلًا.'],
  [5, 'Très bien organisé, encadrement clair et ambiance chaleureuse. Je reviendrai !'],
  [4, 'Great experience; the briefing could have started a bit earlier, but the impact was real.'],
  [5, 'تجربة لا تنسى، تعرفت على أصدقاء جدد وتعلمت الكثير.'],
  [4, 'Bonne initiative, il faudrait juste plus de matériel pour tout le monde.'],
  [5, 'Everything was ready on arrival and the hours were confirmed the next day.'],
] as const;

// ─────────────────────────────────────────────────────────────────────────────

export async function seedRichDemo(ctx: RichSeedContext): Promise<void> {
  const { prisma } = ctx;
  const marker = await prisma.organization.findUnique({ where: { slug: ORGS[0]!.slug } });
  if (marker) {
    console.log('[seed:rich] already present — skipped.');
    return;
  }

  // ── Extra cities ────────────────────────────────────────────────────────
  const cityIds = new Map(ctx.cityIds);
  for (const c of EXTRA_CITIES) {
    const wilayaId = ctx.wilayaIds.get(c.wilayaCode);
    if (!wilayaId) continue;
    const existing = await prisma.city.findFirst({ where: { wilayaId, nameFr: c.nameFr } });
    const row =
      existing ??
      (await prisma.city.create({
        data: {
          wilayaId,
          nameAr: c.nameAr,
          nameFr: c.nameFr,
          nameEn: c.nameEn,
          latitude: c.lat,
          longitude: c.lng,
        },
      }));
    cityIds.set(c.wilayaCode, row.id);
  }
  const wilaya = (code: string): string => {
    const id = ctx.wilayaIds.get(code);
    if (!id) throw new Error(`rich seed: wilaya ${code} missing`);
    return id;
  };

  async function createUser(
    email: string,
    firstName: string,
    lastName: string,
    roles: Array<'USER' | 'VOLUNTEER'>,
  ) {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: ctx.passwordHash,
        firstName,
        lastName,
        preferredLanguage: pick(['AR', 'AR', 'FR', 'EN'] as const),
        roles,
        status: 'ACTIVE',
        emailVerifiedAt: day(-int(30, 200)),
        createdAt: day(-int(30, 200)),
      },
    });
    await prisma.privacyConsent.createMany({
      data: (['terms', 'privacy_policy'] as const).map((purpose) => ({
        userId: user.id,
        purpose,
        policyVersion: ctx.policyVersion,
        granted: true,
      })),
    });
    return user;
  }

  // ── Organizations + owners ──────────────────────────────────────────────
  const orgs = new Map<string, { id: string; ownerId: string; spec: OrgSpec }>();
  for (const [i, spec] of ORGS.entries()) {
    const owner = await createUser(
      `${spec.slug}@demo.bladna.dz`,
      FIRST_NAMES[(i * 7) % FIRST_NAMES.length]!,
      LAST_NAMES[(i * 5) % LAST_NAMES.length]!,
      ['USER'],
    );
    const verifiedAt = day(-int(60, 300));
    const org = await prisma.organization.create({
      data: {
        name: spec.name,
        slug: spec.slug,
        organizationType: spec.type,
        description: spec.description,
        coverImage: `/photos/${spec.cover}.jpg`,
        officialEmail: `${spec.slug}@demo.bladna.dz`,
        phone: `+213 ${pick(['5', '6', '7'])}${int(10, 99)} ${int(10, 99)} ${int(10, 99)} ${int(10, 99)}`,
        countryId: ctx.countryId,
        wilayaId: wilaya(spec.wilaya),
        cityId: cityIds.get(spec.wilaya),
        address: spec.address,
        status: spec.pending ? 'PENDING_VERIFICATION' : 'ACTIVE',
        verificationStatus: spec.pending ? 'UNDER_REVIEW' : 'VERIFIED',
        trustLevel: spec.pending
          ? 'LEVEL_0_UNVERIFIED'
          : i % 4 === 0
            ? 'LEVEL_3_TRUSTED_PARTNER'
            : 'LEVEL_2_ORGANIZATION_VERIFIED',
        verifiedAt: spec.pending ? null : verifiedAt,
        createdAt: day(-int(120, 400)),
      },
    });
    await prisma.organizationMember.create({
      data: {
        organizationId: org.id,
        userId: owner.id,
        role: 'OWNER',
        status: 'ACTIVE',
        title: 'Président(e)',
        joinedAt: verifiedAt,
      },
    });
    orgs.set(spec.slug, { id: org.id, ownerId: owner.id, spec });
  }

  // ── Volunteers ──────────────────────────────────────────────────────────
  const formatSetting = await prisma.setting.findUnique({ where: { key: 'volunteerId.format' } });
  const format = parseVolunteerIdFormat(
    typeof formatSetting?.value === 'string' ? formatSetting.value : null,
  );
  const volunteers: Array<{ userId: string; profileId: string; name: string }> = [];
  for (let i = 0; i < 60; i++) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length]!;
    const last = LAST_NAMES[(i * 7 + 3) % LAST_NAMES.length]!;
    const email = `${first.toLowerCase()}.${last.toLowerCase().replace(/\s+/g, '')}${i}@demo.bladna.dz`;
    const user = await createUser(email, first, last, ['USER', 'VOLUNTEER']);
    const counter = await prisma.counter.upsert({
      where: { name: 'volunteer_id' },
      update: { value: { increment: 1 } },
      create: { name: 'volunteer_id', value: 1 },
    });
    const wilayaCode = VOLUNTEER_WILAYAS[i % VOLUNTEER_WILAYAS.length]!;
    const profile = await prisma.volunteerProfile.create({
      data: {
        userId: user.id,
        volunteerId: renderVolunteerId(format, counter.value),
        publicToken: generateOpaqueSecret(24),
        bio: BIOS[i % BIOS.length],
        wilayaId: wilaya(wilayaCode),
        cityId: cityIds.get(wilayaCode),
        availability: shuffle(AVAILABILITY).slice(0, int(1, 2)),
        publicProfile: i % 5 !== 0,
        // Most volunteers completed the basic check (verified email + phone);
        // a few went further with an identity document review.
        verificationStatus:
          i % 6 === 0 ? 'UNVERIFIED' : i % 3 === 0 ? 'IDENTITY_VERIFIED' : 'BASIC_VERIFIED',
        createdAt: user.createdAt,
        internationalPreference: i % 3 === 0,
        dateOfBirth: new Date(Date.UTC(int(1988, 2005), int(0, 11), int(1, 28))),
      },
    });
    for (const skill of shuffle(SKILLS).slice(0, int(2, 4))) {
      const skillId = ctx.skillIds.get(skill);
      if (skillId) {
        await prisma.volunteerSkill.create({
          data: { volunteerProfileId: profile.id, skillId, source: 'self' },
        });
      }
    }
    const langs: Array<['ar' | 'fr' | 'en' | 'ber', 'NATIVE' | 'ADVANCED' | 'INTERMEDIATE']> = [
      ['ar', 'NATIVE'],
      ['fr', pick(['ADVANCED', 'INTERMEDIATE'] as const)],
    ];
    if (rand() < 0.5) langs.push(['en', 'INTERMEDIATE']);
    if (['15', '06', '05'].includes(wilayaCode)) langs.push(['ber', 'NATIVE']);
    for (const [code, level] of langs) {
      const languageId = ctx.languageIds.get(code);
      if (languageId) {
        await prisma.volunteerLanguage.create({
          data: { volunteerProfileId: profile.id, languageId, level },
        });
      }
    }
    for (const code of shuffle(INTERESTS).slice(0, int(1, 3))) {
      const interestId = ctx.interestIds.get(code);
      if (interestId) {
        await prisma.volunteerInterest.create({
          data: { volunteerProfileId: profile.id, interestId },
        });
      }
    }
    volunteers.push({ userId: user.id, profileId: profile.id, name: `${first} ${last}` });
  }

  // ── Organization teams: a few volunteers help run each organization ─────
  for (const { id, spec } of orgs.values()) {
    if (spec.pending) continue;
    for (const [m, v] of shuffle(volunteers).slice(0, int(2, 4)).entries()) {
      await prisma.organizationMember.create({
        data: {
          organizationId: id,
          userId: v.userId,
          role: m === 0 ? 'MANAGER' : 'STAFF',
          status: 'ACTIVE',
          title: m === 0 ? 'منسق المتطوعين' : 'متطوع دائم',
          joinedAt: day(-int(20, 200)),
        },
      });
    }
  }

  // ── Campaigns ───────────────────────────────────────────────────────────
  const campaigns = new Map<string, string>();
  const CAMPAIGNS: Array<{
    slug: string;
    org: string;
    name: string;
    description: string;
    goal: string;
    cover: string;
    start: number;
    end: number;
    status: 'ACTIVE' | 'COMPLETED';
    volunteers: number;
    hours: number;
    beneficiaries: number;
    budget: number;
  }> = [
    {
      slug: 'hiver-solidaire-oran',
      org: 'nour-el-amal',
      name: 'شتاء دافئ — Hiver solidaire Oran',
      description: 'قفف شتوية وأغطية ووجبات ساخنة للعائلات المعوزة في وهران ومستغانم.',
      goal: '1 000 familles accompagnées cet hiver.',
      cover: 'humanitarian',
      start: -20,
      end: 90,
      status: 'ACTIVE',
      volunteers: 150,
      hours: 1200,
      beneficiaries: 1000,
      budget: 2500000,
    },
    {
      slug: 'algerie-verte-2026',
      org: 'mer-propre-bejaia',
      name: 'Algérie Verte 2026 — الجزائر الخضراء',
      description: 'Reboisement des forêts touchées par les incendies et nettoyage du littoral.',
      goal: '10 000 arbres plantés et 20 plages nettoyées.',
      cover: 'environment',
      start: -45,
      end: 120,
      status: 'ACTIVE',
      volunteers: 400,
      hours: 3000,
      beneficiaries: 50000,
      budget: 4000000,
    },
    {
      slug: 'reussite-bac-2027',
      org: 'ilm-pour-tous',
      name: 'نجاح البكالوريا 2027',
      description: 'دروس دعم مجانية ومكتبات متنقلة لتلاميذ الثانوي في الشرق الجزائري.',
      goal: '500 élèves accompagnés jusqu’au bac.',
      cover: 'education',
      start: -10,
      end: 200,
      status: 'ACTIVE',
      volunteers: 80,
      hours: 2000,
      beneficiaries: 500,
      budget: 800000,
    },
    {
      slug: 'sante-pour-tous-est',
      org: 'sante-solidarite-annaba',
      name: 'Santé pour tous — Est algérien',
      description: 'Collectes de sang et caravanes médicales dans les zones rurales de l’Est.',
      goal: '2 000 consultations gratuites.',
      cover: 'health',
      start: -90,
      end: -5,
      status: 'COMPLETED',
      volunteers: 120,
      hours: 1500,
      beneficiaries: 2000,
      budget: 1500000,
    },
  ];
  for (const c of CAMPAIGNS) {
    const org = orgs.get(c.org)!;
    const row = await prisma.campaign.create({
      data: {
        organizationId: org.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        goal: c.goal,
        coverImage: `/photos/${c.cover}.jpg`,
        startDate: day(c.start, 0),
        endDate: day(c.end, 23),
        status: c.status,
        volunteerTarget: c.volunteers,
        hourTarget: c.hours,
        beneficiaryTarget: c.beneficiaries,
        budget: c.budget,
        currency: 'DZD',
      },
    });
    campaigns.set(c.org, row.id);
    // Pledges (bank transfer to the organization, recorded on the platform):
    // most confirmed by the organizer, a few still pending.
    for (const donor of shuffle(volunteers).slice(0, int(6, 14))) {
      const confirmed = rand() < 0.75;
      const amount = Math.max(2000, Math.round((c.budget * (0.004 + rand() * 0.02)) / 500) * 500);
      await prisma.campaignContribution.create({
        data: {
          campaignId: row.id,
          userId: donor.userId,
          amount,
          currency: 'DZD',
          status: confirmed ? 'CONFIRMED' : 'PENDING',
          reference: `VIR-${int(100000, 999999)}`,
          decidedById: confirmed ? org.ownerId : null,
          decidedAt: confirmed ? day(c.start + int(2, 10)) : null,
          createdAt: day(c.start + int(1, 8)),
        },
      });
    }
    for (const v of shuffle(volunteers).slice(0, int(12, 28))) {
      await prisma.campaignParticipant.create({
        data: {
          campaignId: row.id,
          volunteerProfileId: v.profileId,
          status: c.status === 'COMPLETED' ? 'COMPLETED' : pick(['REGISTERED', 'ACTIVE'] as const),
          hours: c.status === 'COMPLETED' ? int(4, 24) : int(0, 12),
          participationDate: day(c.start + int(1, 15)),
        },
      });
    }
  }

  // The core seed's upcoming winter campaign gets early sign-ups too.
  const winter = await prisma.campaign.findUnique({ where: { slug: 'winter-solidarity-2026' } });
  if (winter) {
    for (const v of shuffle(volunteers).slice(0, 14)) {
      await prisma.campaignParticipant.create({
        data: {
          campaignId: winter.id,
          volunteerProfileId: v.profileId,
          status: 'REGISTERED',
          participationDate: day(-int(1, 10)),
        },
      });
    }
  }

  // ── Initiatives ─────────────────────────────────────────────────────────
  const created: Array<{ id: string; slug: string; timing: Timing; org: string }> = [];
  let totalCertificates = 0;
  let totalHours = 0;
  let totalApplications = 0;
  const usedSlugs = new Set<string>();

  for (const [index, [key, orgSlug, wilayaCode, timing]] of INITIATIVES.entries()) {
    const tpl = T[key]!;
    const org = orgs.get(orgSlug)!;
    const city = CITY[wilayaCode]!;
    const fill = (s: string, lang: 'ar' | 'fr' | 'en'): string => s.replaceAll('{c}', city[lang]);
    let slug = `${String(key)
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase()}-${city.en.toLowerCase().replace(/[^a-z]+/g, '-')}`;
    if (usedSlugs.has(slug)) slug = `${slug}-${index}`;
    usedSlugs.add(slug);

    const startOffset =
      timing === 'completed'
        ? -int(6, 70)
        : timing === 'thisWeek'
          ? int(1, 5)
          : timing === 'pending'
            ? int(20, 40)
            : int(8, 75);
    const durationHours = Math.min(tpl.hours, 8);
    const start = day(startOffset, pick([8, 9, 10, 14]));
    const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
    const published = timing !== 'pending';
    const publishedAt = day(Math.min(startOffset - int(10, 30), -1));

    const opportunity = await prisma.opportunity.create({
      data: {
        slug,
        organizationId: org.id,
        campaignId: campaigns.get(orgSlug) ?? null,
        titleAr: fill(tpl.title.ar, 'ar'),
        titleFr: fill(tpl.title.fr, 'fr'),
        titleEn: fill(tpl.title.en, 'en'),
        descriptionAr: tpl.description.ar,
        descriptionFr: tpl.description.fr,
        descriptionEn: tpl.description.en,
        problemAr: fill(tpl.problem.ar, 'ar'),
        problemFr: fill(tpl.problem.fr, 'fr'),
        problemEn: fill(tpl.problem.en, 'en'),
        objectiveAr: tpl.objective.ar,
        objectiveFr: tpl.objective.fr,
        objectiveEn: tpl.objective.en,
        type: tpl.hours >= 16 ? 'EVENT' : pick(['EVENT', 'LOCAL'] as const),
        categoryId: ctx.categoryIds.get(tpl.category),
        locationType: 'PHYSICAL',
        countryId: ctx.countryId,
        wilayaId: wilaya(wilayaCode),
        cityId: cityIds.get(wilayaCode),
        address: city.fr,
        latitude: city.lat + (rand() - 0.5) * 0.06,
        longitude: city.lng + (rand() - 0.5) * 0.06,
        coverImage: `/photos/${tpl.cover}.jpg`,
        startDate: start,
        endDate: end,
        applicationDeadline: new Date(start.getTime() - DAY),
        capacity: tpl.capacity,
        minimumAge: tpl.minAge,
        estimatedHours: tpl.hours,
        contactName: org.spec.name.split(' — ')[0],
        contactPhone: `+213 5${int(50, 59)} ${int(10, 99)} ${int(10, 99)} ${int(10, 99)}`,
        contactEmail: `${orgSlug}@demo.bladna.dz`,
        status: published ? 'PUBLISHED' : 'PENDING_REVIEW',
        verificationStatus: published ? 'VERIFIED' : 'PENDING',
        verifiedAt: published ? publishedAt : null,
        publishedAt: published ? publishedAt : null,
        viewCount: published ? int(40, 900) : 0,
        createdAt: new Date(publishedAt.getTime() - 2 * DAY),
      },
    });
    created.push({ id: opportunity.id, slug, timing, org: orgSlug });
    const [requiredSkills, optionalSkills] = CATEGORY_SKILLS[tpl.category] ?? [[], []];
    for (const [names, required] of [
      [requiredSkills, true],
      [optionalSkills, false],
    ] as const) {
      for (const name of names) {
        const skillId = ctx.skillIds.get(name);
        if (skillId) {
          await prisma.opportunitySkill.create({
            data: { opportunityId: opportunity.id, skillId, required },
          });
        }
      }
    }
    if (!published) continue;

    // Applications
    const pool = shuffle(volunteers);
    const applicants =
      timing === 'completed'
        ? pool.slice(0, int(6, Math.min(14, tpl.capacity)))
        : pool.slice(0, int(3, Math.min(14, tpl.capacity - 1)));
    let accepted = 0;
    const attendees: typeof volunteers = [];
    for (const v of applicants) {
      const status =
        timing === 'completed'
          ? 'ACCEPTED'
          : pick([
              'ACCEPTED',
              'ACCEPTED',
              'ACCEPTED',
              'SUBMITTED',
              'SUBMITTED',
              'UNDER_REVIEW',
              'WAITLISTED',
            ] as const);
      const submittedAt = new Date(
        Math.min(start.getTime() - 2 * DAY, Date.now() - DAY) - int(1, 10) * DAY,
      );
      await prisma.opportunityApplication.create({
        data: {
          opportunityId: opportunity.id,
          volunteerProfileId: v.profileId,
          status,
          motivation: pick(MOTIVATIONS),
          availability: pick(['Weekends', 'Evenings', 'Flexible']),
          submittedAt,
          reviewedAt:
            status === 'SUBMITTED' ? null : new Date(submittedAt.getTime() + int(1, 3) * DAY),
          reviewedById: status === 'SUBMITTED' ? null : org.ownerId,
        },
      });
      totalApplications++;
      if (status === 'ACCEPTED') {
        accepted++;
        attendees.push(v);
      }
    }
    await prisma.opportunity.update({
      where: { id: opportunity.id },
      data: {
        applicationCount: applicants.length,
        acceptedCount: accepted,
        hasOpenSpots: accepted < tpl.capacity,
      },
    });

    // Verified history for completed initiatives.
    if (timing === 'completed') {
      let servedHours = 0;
      for (const v of attendees) {
        const attended = rand() < 0.9;
        if (!attended) continue;
        const hours = Math.max(2, durationHours - int(0, 1));
        const activity = await prisma.volunteerActivity.create({
          data: {
            volunteerProfileId: v.profileId,
            organizationId: org.id,
            opportunityId: opportunity.id,
            title: fill(tpl.title.ar, 'ar'),
            startedAt: start,
            endedAt: end,
            status: 'COMPLETED',
          },
        });
        const attendance = await prisma.attendance.create({
          data: {
            opportunityId: opportunity.id,
            volunteerProfileId: v.profileId,
            activityId: activity.id,
            date: new Date(
              Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
            ),
            checkInAt: start,
            checkOutAt: end,
            hours,
            method: pick(['QR', 'QR', 'MANUAL'] as const),
            status: 'CONFIRMED',
            verifiedById: org.ownerId,
          },
        });
        await prisma.volunteerHour.create({
          data: {
            volunteerProfileId: v.profileId,
            organizationId: org.id,
            activityId: activity.id,
            attendanceId: attendance.id,
            hours,
            date: attendance.date,
            status: 'VERIFIED',
            source: 'ATTENDANCE',
            verifiedById: org.ownerId,
            verifiedAt: new Date(end.getTime() + DAY),
          },
        });
        await prisma.volunteerCertificate.create({
          data: {
            volunteerProfileId: v.profileId,
            organizationId: org.id,
            activityId: activity.id,
            opportunityId: opportunity.id,
            title: `شهادة تطوع — ${fill(tpl.title.ar, 'ar')}`,
            description: `${hours} ساعات تطوع موثّقة.`,
            hours,
            certificateNumber: certificateNumber(),
            verificationToken: generateOpaqueSecret(24),
            status: 'VALID',
            issuedById: org.ownerId,
            issuedAt: new Date(end.getTime() + DAY + 60 * 60 * 1000),
          },
        });
        servedHours += hours;
        totalCertificates++;
      }
      totalHours += servedHours;

      for (const [r, v] of attendees.slice(0, int(2, 4)).entries()) {
        const [rating, body] = REVIEWS[(index + r) % REVIEWS.length]!;
        const at = new Date(end.getTime() + int(2, 5) * DAY);
        await prisma.opportunityReview.create({
          data: {
            opportunityId: opportunity.id,
            authorId: v.userId,
            rating,
            body,
            source: 'PARTICIPANT',
            createdAt: at,
            updatedAt: at,
          },
        });
      }

      const metrics: Array<{
        metricType: MetricType;
        name: string;
        target?: number;
        actual: number;
        unit: string;
        source: string;
      }> = [
        {
          metricType: 'VOLUNTEERS',
          name: 'المتطوعون المشاركون',
          target: tpl.capacity,
          actual: attendees.length,
          unit: 'متطوع',
          source: 'سجلات الحضور الموثّقة',
        },
        {
          metricType: 'HOURS',
          name: 'ساعات التطوع المنجزة',
          actual: servedHours,
          unit: 'ساعة',
          source: 'سجلات الحضور الموثّقة',
        },
        {
          metricType: 'BENEFICIARIES',
          name: 'المستفيدون',
          target: tpl.beneficiaries,
          actual: Math.round(tpl.beneficiaries * (0.7 + rand() * 0.4)),
          unit: 'شخص',
          source: 'تقرير الجمعية',
        },
      ];
      if (tpl.extraMetric) {
        metrics.push({
          metricType: tpl.extraMetric.type,
          name: tpl.extraMetric.name,
          target: tpl.extraMetric.target,
          actual: Math.round(tpl.extraMetric.target * (0.8 + rand() * 0.3)),
          unit: tpl.extraMetric.unit,
          source: 'تقرير الجمعية',
        });
      }
      for (const m of metrics) {
        await prisma.impactMetric.create({ data: { opportunityId: opportunity.id, ...m } });
      }
    } else {
      // Upcoming: declared needs, some already pledged, plus planning metrics.
      for (const [n, need] of tpl.needs.entries()) {
        const row = await prisma.supportNeed.create({
          data: {
            opportunityId: opportunity.id,
            kind: need.kind,
            labelAr: need.label.ar,
            labelFr: need.label.fr,
            labelEn: need.label.en,
            description: need.description,
            quantity: need.quantity,
            targetAmount: need.targetAmount,
            fulfilled: 0,
            sortOrder: n + 1,
          },
        });
        const donors = shuffle(volunteers).slice(0, int(0, 2));
        let fulfilled = 0;
        for (const donor of donors) {
          const accept = rand() < 0.6;
          const qty = need.quantity
            ? Math.max(1, Math.round(need.quantity * (0.15 + rand() * 0.3)))
            : undefined;
          const amount = need.targetAmount
            ? Math.round((need.targetAmount * (0.1 + rand() * 0.3)) / 1000) * 1000
            : undefined;
          await prisma.supportOffer.create({
            data: {
              supportNeedId: row.id,
              userId: donor.userId,
              description: need.targetAmount
                ? `مساهمة بـ ${amount?.toLocaleString('fr-FR')} دج بتحويل بنكي إلى الجمعية.`
                : `أستطيع توفير ${qty} — ${need.label.ar}.`,
              quantity: qty,
              amount,
              status: accept ? 'ACCEPTED' : 'PENDING',
              decidedById: accept ? org.ownerId : undefined,
              decidedAt: accept ? day(-int(1, 5)) : undefined,
            },
          });
          if (accept && qty) fulfilled += qty;
        }
        if (fulfilled > 0) {
          await prisma.supportNeed.update({
            where: { id: row.id },
            data: { fulfilled: Math.min(fulfilled, need.quantity ?? fulfilled) },
          });
        }
      }
      await prisma.impactMetric.create({
        data: {
          opportunityId: opportunity.id,
          metricType: 'VOLUNTEERS',
          name: 'المتطوعون المسجّلون',
          target: tpl.capacity,
          actual: accepted,
          unit: 'متطوع',
          source: 'سجلات التسجيل',
        },
      });
      if (tpl.extraMetric) {
        await prisma.impactMetric.create({
          data: {
            opportunityId: opportunity.id,
            metricType: tpl.extraMetric.type,
            name: tpl.extraMetric.name,
            target: tpl.extraMetric.target,
            actual: 0,
            unit: tpl.extraMetric.unit,
            source: 'خطة المبادرة',
          },
        });
      }
    }
  }

  // ── The core demo volunteer gets a rich record too ──────────────────────
  const demo = ctx.demoVolunteer;
  const completed = created.filter((c) => c.timing === 'completed').slice(0, 3);
  const upcoming = created
    .filter((c) => c.timing === 'upcoming' || c.timing === 'thisWeek')
    .slice(0, 3);
  for (const c of [...completed, ...upcoming]) {
    const exists = await prisma.opportunityApplication.findFirst({
      where: { opportunityId: c.id, volunteerProfileId: demo.profileId },
    });
    if (exists) continue;
    const opp = await prisma.opportunity.findUniqueOrThrow({ where: { id: c.id } });
    const org = orgs.get(c.org)!;
    const status = c.timing === 'completed' ? 'ACCEPTED' : pick(['ACCEPTED', 'SUBMITTED'] as const);
    await prisma.opportunityApplication.create({
      data: {
        opportunityId: c.id,
        volunteerProfileId: demo.profileId,
        status,
        motivation: MOTIVATIONS[0],
        availability: 'Weekends',
        submittedAt: day(-int(10, 20)),
        reviewedAt: status === 'ACCEPTED' ? day(-int(2, 9)) : null,
        reviewedById: status === 'ACCEPTED' ? org.ownerId : null,
      },
    });
    await prisma.opportunity.update({
      where: { id: c.id },
      data: {
        applicationCount: { increment: 1 },
        ...(status === 'ACCEPTED' ? { acceptedCount: { increment: 1 } } : {}),
      },
    });
    if (c.timing !== 'completed' || !opp.startDate || !opp.endDate) continue;
    const hours = Number(opp.estimatedHours ?? 4);
    const activity = await prisma.volunteerActivity.create({
      data: {
        volunteerProfileId: demo.profileId,
        organizationId: org.id,
        opportunityId: c.id,
        title: opp.titleAr,
        startedAt: opp.startDate,
        endedAt: opp.endDate,
        status: 'COMPLETED',
      },
    });
    const date = new Date(
      Date.UTC(
        opp.startDate.getUTCFullYear(),
        opp.startDate.getUTCMonth(),
        opp.startDate.getUTCDate(),
      ),
    );
    const attendance = await prisma.attendance.create({
      data: {
        opportunityId: c.id,
        volunteerProfileId: demo.profileId,
        activityId: activity.id,
        date,
        checkInAt: opp.startDate,
        checkOutAt: opp.endDate,
        hours,
        method: 'QR',
        status: 'CONFIRMED',
        verifiedById: org.ownerId,
      },
    });
    await prisma.volunteerHour.create({
      data: {
        volunteerProfileId: demo.profileId,
        organizationId: org.id,
        activityId: activity.id,
        attendanceId: attendance.id,
        hours,
        date,
        status: 'VERIFIED',
        source: 'ATTENDANCE',
        verifiedById: org.ownerId,
        verifiedAt: new Date(opp.endDate.getTime() + DAY),
      },
    });
    await prisma.volunteerCertificate.create({
      data: {
        volunteerProfileId: demo.profileId,
        organizationId: org.id,
        activityId: activity.id,
        opportunityId: c.id,
        title: `شهادة تطوع — ${opp.titleAr}`,
        description: `${hours} ساعات تطوع موثّقة.`,
        hours,
        certificateNumber: certificateNumber(),
        verificationToken: generateOpaqueSecret(24),
        status: 'VALID',
        issuedById: org.ownerId,
        issuedAt: new Date(opp.endDate.getTime() + DAY + 60 * 60 * 1000),
      },
    });
    totalCertificates++;
    totalHours += hours;
  }

  // Notifications so the bell is alive for the demo volunteer.
  const NOTIFS: Array<{
    type:
      'APPLICATION_ACCEPTED' | 'CERTIFICATE_ISSUED' | 'HOURS_VERIFIED' | 'NEW_MATCHING_OPPORTUNITY';
    title: string;
    body: string;
    days: number;
    read: boolean;
  }> = [
    {
      type: 'NEW_MATCHING_OPPORTUNITY',
      title: 'مبادرة جديدة تناسبك',
      body: 'نُشرت مبادرة بيئية جديدة قريبة من ولايتك.',
      days: -1,
      read: false,
    },
    {
      type: 'APPLICATION_ACCEPTED',
      title: 'تم قبول ترشحك',
      body: 'قبلت الجمعية ترشحك، تفقد تفاصيل الموعد.',
      days: -2,
      read: false,
    },
    {
      type: 'CERTIFICATE_ISSUED',
      title: 'شهادة جديدة',
      body: 'صدرت شهادتك الموثقة ويمكن التحقق منها برمز.',
      days: -6,
      read: true,
    },
    {
      type: 'HOURS_VERIFIED',
      title: 'تم تأكيد ساعاتك',
      body: 'أكدت الجمعية ساعات تطوعك الأخيرة.',
      days: -7,
      read: true,
    },
  ];
  for (const n of NOTIFS) {
    await prisma.notification.create({
      data: {
        userId: demo.userId,
        type: n.type,
        title: n.title,
        body: n.body,
        createdAt: day(n.days, 10),
        readAt: n.read ? day(n.days + 1, 10) : null,
      },
    });
  }

  // Featured rails: a mix of upcoming initiatives, organizations and campaigns.
  const featured = created.filter((c) => c.timing === 'upcoming' || c.timing === 'thisWeek');
  for (const [i, c] of featured.slice(0, 4).entries()) {
    await prisma.featuredPlacement.upsert({
      where: {
        section_targetType_targetId: {
          section: 'HOME_FEATURED_OPPORTUNITIES',
          targetType: 'OPPORTUNITY',
          targetId: c.id,
        },
      },
      update: {},
      create: {
        section: 'HOME_FEATURED_OPPORTUNITIES',
        targetType: 'OPPORTUNITY',
        targetId: c.id,
        position: 10 + i,
      },
    });
  }
  for (const [i, slug] of [
    'nour-el-amal',
    'sante-solidarite-annaba',
    'mer-propre-bejaia',
  ].entries()) {
    await prisma.featuredPlacement.upsert({
      where: {
        section_targetType_targetId: {
          section: 'HOME_FEATURED_ORGANIZATIONS',
          targetType: 'ORGANIZATION',
          targetId: orgs.get(slug)!.id,
        },
      },
      update: {},
      create: {
        section: 'HOME_FEATURED_ORGANIZATIONS',
        targetType: 'ORGANIZATION',
        targetId: orgs.get(slug)!.id,
        position: 10 + i,
      },
    });
  }
  for (const [i, id] of [...campaigns.values()].entries()) {
    await prisma.featuredPlacement.upsert({
      where: {
        section_targetType_targetId: {
          section: 'HOME_CAMPAIGNS',
          targetType: 'CAMPAIGN',
          targetId: id,
        },
      },
      update: {},
      create: { section: 'HOME_CAMPAIGNS', targetType: 'CAMPAIGN', targetId: id, position: 10 + i },
    });
  }

  const internationalOffers = await seedInternational(prisma, volunteers, demo.profileId);
  console.log(`[seed:rich] international: ${internationalOffers} offers abroad.`);

  console.log(
    `[seed:rich] ${orgs.size} organizations, ${volunteers.length} volunteers, ${created.length} initiatives, ` +
      `${totalApplications} applications, ${totalCertificates} certificates, ${totalHours} verified hours, ` +
      `${campaigns.size} campaigns.`,
  );
}
