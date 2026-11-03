// Server-side PDF rendering: certificates + volunteer card + CV (spec §33, §57, §72).
//
// pdfkit embeds a subset of the bundled OFL font (assets/fonts/Amiri-Regular.ttf,
// license in OFL-Amiri.txt) whose cmap covers Latin *and* Arabic, so an ar-locale
// document shapes correctly through fontkit's ArabicShaper (contextual forms +
// RTL glyph reversal) instead of rendering tofu. One font serves every locale.
//
// The font path resolves through cwd candidates because Next bundles route
// code (module paths do not survive bundling) while tests/scripts run from
// the repo root. A missing asset fails loudly — never a silently blank PDF.

import { existsSync } from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import {
  AppError,
  type AvailabilitySlot,
  type LanguageLevel,
  type LocaleCode,
} from '@bladna/types';
import { directionFor } from '@bladna/utils';

const FONT_BASENAME = 'assets/fonts/Amiri-Regular.ttf';

const FONT_CANDIDATES = [
  FONT_BASENAME, // cwd = apps/web (next dev/build/start via workspace scripts)
  path.join('apps', 'web', FONT_BASENAME), // cwd = repo root (vitest, tsx scripts)
];

export function resolveBundledFontPath(): string {
  for (const relative of FONT_CANDIDATES) {
    const absolute = path.resolve(process.cwd(), relative);
    if (existsSync(absolute)) return absolute;
  }
  throw AppError.internal(`Bundled font asset missing (${FONT_BASENAME}).`);
}

/** Fixed rendering metadata — both documents carry no data beyond the fields. */
const DATE_LOCALE: Record<LocaleCode, string> = { ar: 'ar-DZ', fr: 'fr-DZ', en: 'en-GB' };

function formatDate(value: Date | null, locale: LocaleCode): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString(DATE_LOCALE[locale], { timeZone: 'Africa/Algiers' });
}

export interface PdfLabels {
  certificateHeading: string;
  awardedTo: string;
  activity: string;
  hours: string;
  organization: string;
  number: string;
  issuedOn: string;
  verifyNote: string;
  statusValid: string;
  statusRevoked: string;
  statusExpired: string;
  cardHeading: string;
  volunteerIdLabel: string;
  cardNumber: string;
  status: string;
  statusActive: string;
  verification: string;
  verifUnverified: string;
  verifBasic: string;
  verifIdentity: string;
  // CV document (spec §57).
  cvHeading: string;
  summary: string;
  location: string;
  email: string;
  phone: string;
  availability: string;
  skills: string;
  languages: string;
  interests: string;
  certificates: string;
  achievements: string;
  experiences: string;
  verifiedFlag: string;
  yearsUnit: string;
  slotWeekdays: string;
  slotWeekends: string;
  slotEvenings: string;
  slotNights: string;
  slotHolidays: string;
  slotFlexible: string;
  levelBeginner: string;
  levelElementary: string;
  levelIntermediate: string;
  levelUpperIntermediate: string;
  levelAdvanced: string;
  levelNative: string;
}

export const PDF_LABELS: Record<LocaleCode, PdfLabels> = {
  ar: {
    certificateHeading: 'شهادة مشاركة',
    awardedTo: 'تُمنح لفائدة',
    activity: 'النشاط',
    hours: 'ساعات التطوع',
    organization: 'المنظمة',
    number: 'رقم الشهادة',
    issuedOn: 'بتاريخ',
    verifyNote: 'امسح رمز الاستجابة السريعة للتحقق من الشهادة',
    statusValid: 'صالحة',
    statusRevoked: 'ملغاة',
    statusExpired: 'منتهية الصلاحية',
    cardHeading: 'بطاقة متطوع',
    volunteerIdLabel: 'رقم المتطوع',
    cardNumber: 'رقم البطاقة',
    status: 'الحالة',
    statusActive: 'نشطة',
    verification: 'مستوى التحقق',
    verifUnverified: 'غير موثّق',
    verifBasic: 'موثّق أساسي',
    verifIdentity: 'موثّق الهوية',
    cvHeading: 'سيرة ذاتية تطوعية',
    summary: 'نبذة',
    location: 'الموقع',
    email: 'البريد الإلكتروني',
    phone: 'الهاتف',
    availability: 'التوفر',
    skills: 'المهارات',
    languages: 'اللغات',
    interests: 'الاهتمامات',
    certificates: 'الشهادات',
    achievements: 'الإنجازات',
    experiences: 'الخبرة التطوعية الدولية',
    verifiedFlag: 'موثّق',
    yearsUnit: 'سنوات',
    slotWeekdays: 'أيام الأسبوع',
    slotWeekends: 'عطلات نهاية الأسبوع',
    slotEvenings: 'المساء',
    slotNights: 'الليل',
    slotHolidays: 'العطل',
    slotFlexible: 'مرن',
    levelBeginner: 'مبتدئ',
    levelElementary: 'أساسي',
    levelIntermediate: 'متوسط',
    levelUpperIntermediate: 'فوق المتوسط',
    levelAdvanced: 'متقدم',
    levelNative: 'اللغة الأم',
  },
  fr: {
    certificateHeading: 'Certificat de participation',
    awardedTo: 'Décerné à',
    activity: 'Activité',
    hours: 'Heures de bénévolat',
    organization: 'Organisation',
    number: 'N° du certificat',
    issuedOn: 'Émis le',
    verifyNote: 'Scannez le QR pour vérifier ce certificat',
    statusValid: 'Valide',
    statusRevoked: 'Révoquée',
    statusExpired: 'Expirée',
    cardHeading: 'Carte de bénévole',
    volunteerIdLabel: 'N° de bénévole',
    cardNumber: 'N° de carte',
    status: 'Statut',
    statusActive: 'Active',
    verification: 'Niveau de vérification',
    verifUnverified: 'Non vérifié',
    verifBasic: 'Vérifié (basique)',
    verifIdentity: 'Identité vérifiée',
    cvHeading: 'CV de bénévole',
    summary: 'Résumé',
    location: 'Localisation',
    email: 'E-mail',
    phone: 'Téléphone',
    availability: 'Disponibilités',
    skills: 'Compétences',
    languages: 'Langues',
    interests: 'Centres d’intérêt',
    certificates: 'Certificats',
    achievements: 'Réalisations',
    experiences: 'Expérience internationale',
    verifiedFlag: 'Vérifiée',
    yearsUnit: 'ans',
    slotWeekdays: 'Jours de semaine',
    slotWeekends: 'Fin de semaine',
    slotEvenings: 'Soirs',
    slotNights: 'Nuits',
    slotHolidays: 'Jours fériés',
    slotFlexible: 'Flexible',
    levelBeginner: 'Débutant',
    levelElementary: 'Élémentaire',
    levelIntermediate: 'Intermédiaire',
    levelUpperIntermediate: 'Intermédiaire (supérieur)',
    levelAdvanced: 'Avancé',
    levelNative: 'Langue maternelle',
  },
  en: {
    certificateHeading: 'Certificate of Participation',
    awardedTo: 'Awarded to',
    activity: 'Activity',
    hours: 'Volunteer hours',
    organization: 'Organization',
    number: 'Certificate number',
    issuedOn: 'Issued on',
    verifyNote: 'Scan the QR code to verify this certificate',
    statusValid: 'Valid',
    statusRevoked: 'Revoked',
    statusExpired: 'Expired',
    cardHeading: 'Volunteer card',
    volunteerIdLabel: 'Volunteer ID',
    cardNumber: 'Card number',
    status: 'Status',
    statusActive: 'Active',
    verification: 'Verification level',
    verifUnverified: 'Unverified',
    verifBasic: 'Basic verified',
    verifIdentity: 'Identity verified',
    cvHeading: 'Volunteer CV',
    summary: 'Summary',
    location: 'Location',
    email: 'Email',
    phone: 'Phone',
    availability: 'Availability',
    skills: 'Skills',
    languages: 'Languages',
    interests: 'Interests',
    certificates: 'Certificates',
    achievements: 'Achievements',
    experiences: 'International experience',
    verifiedFlag: 'Verified',
    yearsUnit: 'yrs',
    slotWeekdays: 'Weekdays',
    slotWeekends: 'Weekends',
    slotEvenings: 'Evenings',
    slotNights: 'Nights',
    slotHolidays: 'Holidays',
    slotFlexible: 'Flexible',
    levelBeginner: 'Beginner',
    levelElementary: 'Elementary',
    levelIntermediate: 'Intermediate',
    levelUpperIntermediate: 'Upper intermediate',
    levelAdvanced: 'Advanced',
    levelNative: 'Native',
  },
};

export type CertificateStatus = 'VALID' | 'REVOKED' | 'EXPIRED';
export type CardStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';
export type CardVerificationStatus = 'UNVERIFIED' | 'BASIC_VERIFIED' | 'IDENTITY_VERIFIED';
/** Same value set as the card's — both read VolunteerVerificationStatus. */
export type CvVerificationStatus = 'UNVERIFIED' | 'BASIC_VERIFIED' | 'IDENTITY_VERIFIED';

export interface CertificatePdfInput {
  locale: LocaleCode;
  title: string;
  description: string | null;
  holderName: string;
  volunteerId: string;
  organizationName: string;
  hours: number;
  certificateNumber: string;
  issuedAt: Date | null;
  status: CertificateStatus;
  verifyUrl: string;
  qr: Buffer;
}

export interface CardPdfInput {
  locale: LocaleCode;
  holderName: string;
  volunteerId: string;
  cardNumber: string;
  cardStatus: CardStatus;
  verificationStatus: CardVerificationStatus;
  issuedAt: Date | null;
  verifyUrl: string;
  qr: Buffer;
}

/**
 * CV document (spec §57) — the PDF rendering of the `GET /me/cv` aggregate.
 * Names arrive already localized (the handler uses pickLocalized); raw enums
 * arrive as stored values and are mapped to labels here, next to every other
 * renderer decision.
 */
export interface CvPdfInput {
  locale: LocaleCode;
  name: string;
  volunteerId: string;
  verificationStatus: CvVerificationStatus;
  location: string | null;
  email: string;
  phone: string | null;
  bio: string | null;
  availability: readonly AvailabilitySlot[];
  skills: ReadonlyArray<{ name: string; years: number | null }>;
  languages: ReadonlyArray<{ name: string; level: LanguageLevel }>;
  interests: readonly string[];
  verifiedHours: number;
  certificates: ReadonlyArray<{
    number: string;
    title: string;
    organization: string;
    hours: number;
    issuedAt: Date | null;
    status: CertificateStatus;
  }>;
  achievements: readonly string[];
  experiences: ReadonlyArray<{
    organizationName: string;
    program: string | null;
    activity: string | null;
    country: string | null;
    startDate: Date | null;
    endDate: Date | null;
    hours: number | null;
    verified: boolean;
  }>;
}

/** Collect a pdfkit stream into one Buffer (rejects on synchronous layout errors). */
function collect(
  options: { size: 'A4' | [number, number]; margin: number; title: string },
  draw: (doc: InstanceType<typeof PDFDocument>) => void,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: options.size,
      margin: options.margin,
      info: { Title: options.title, Producer: 'BLADNA', Creator: 'BLADNA' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      draw(doc);
    } finally {
      doc.end();
    }
  });
}

function statusLabelForCertificate(status: CertificateStatus, labels: PdfLabels): string {
  if (status === 'REVOKED') return labels.statusRevoked;
  if (status === 'EXPIRED') return labels.statusExpired;
  return labels.statusValid;
}

function statusLabelForCard(status: CardStatus, labels: PdfLabels): string {
  if (status === 'REVOKED') return labels.statusRevoked;
  if (status === 'EXPIRED') return labels.statusExpired;
  return labels.statusActive;
}

function verificationLabel(value: CardVerificationStatus, labels: PdfLabels): string {
  if (value === 'BASIC_VERIFIED') return labels.verifBasic;
  if (value === 'IDENTITY_VERIFIED') return labels.verifIdentity;
  return labels.verifUnverified;
}

function availabilitySlotLabel(value: AvailabilitySlot, labels: PdfLabels): string {
  switch (value) {
    case 'WEEKDAYS':
      return labels.slotWeekdays;
    case 'WEEKENDS':
      return labels.slotWeekends;
    case 'EVENINGS':
      return labels.slotEvenings;
    case 'NIGHTS':
      return labels.slotNights;
    case 'HOLIDAYS':
      return labels.slotHolidays;
    case 'FLEXIBLE':
      return labels.slotFlexible;
  }
}

function languageLevelLabel(value: LanguageLevel, labels: PdfLabels): string {
  switch (value) {
    case 'BEGINNER':
      return labels.levelBeginner;
    case 'ELEMENTARY':
      return labels.levelElementary;
    case 'INTERMEDIATE':
      return labels.levelIntermediate;
    case 'UPPER_INTERMEDIATE':
      return labels.levelUpperIntermediate;
    case 'ADVANCED':
      return labels.levelAdvanced;
    case 'NATIVE':
      return labels.levelNative;
  }
}

export function renderCertificatePdf(input: CertificatePdfInput): Promise<Buffer> {
  const labels = PDF_LABELS[input.locale];

  return collect(
    { size: 'A4', margin: 48, title: `${labels.number}: ${input.certificateNumber}` },
    (doc) => {
      doc.registerFont('Bladna', resolveBundledFontPath());
      doc.font('Bladna');

      const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      doc.moveDown(2);
      doc.fontSize(28).text(labels.certificateHeading, { align: 'center' });
      doc.moveDown(0.6);
      doc.fontSize(13).text(labels.awardedTo, { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(30).text(input.holderName, { align: 'center' });
      doc.moveDown(0.3);
      doc
        .fontSize(11)
        .text(`${labels.volunteerIdLabel}: ${input.volunteerId}`, { align: 'center' });
      doc.moveDown(0.9);
      doc.fontSize(17).text(`${labels.activity}: ${input.title}`, { align: 'center', width });
      if (input.description) {
        doc.moveDown(0.4);
        doc.fontSize(11).text(input.description, { align: 'center', width });
      }
      doc.moveDown(0.7);
      doc.fontSize(13).text(`${labels.hours}: ${input.hours}`, { align: 'center' });
      doc.moveDown(0.25);
      doc.fontSize(13).text(`${labels.organization}: ${input.organizationName}`, {
        align: 'center',
        width,
      });
      doc.moveDown(0.25);
      doc.fontSize(13).text(`${labels.number}: ${input.certificateNumber}`, { align: 'center' });
      doc.moveDown(0.25);
      doc.fontSize(11).text(`${labels.issuedOn}: ${formatDate(input.issuedAt, input.locale)}`, {
        align: 'center',
      });
      if (input.status !== 'VALID') {
        doc.moveDown(0.35);
        doc
          .fillColor('#B91C1C')
          .fontSize(13)
          .text(`${labels.status}: ${statusLabelForCertificate(input.status, labels)}`, {
            align: 'center',
          });
        doc.fillColor('#000000');
      }

      // QR → public verification page; content matches what GET /public/verify accepts.
      const qrSize = 108;
      const qrX = (doc.page.width - qrSize) / 2;
      const qrY = doc.y + 18;
      doc.image(input.qr, qrX, qrY, { width: qrSize, height: qrSize });
      doc.fontSize(9).text(labels.verifyNote, 0, qrY + qrSize + 8, {
        align: 'center',
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      });
      doc.fontSize(7).text(input.verifyUrl, 0, doc.y + 2, { align: 'center', width });
    },
  );
}

export function renderCardPdf(input: CardPdfInput): Promise<Buffer> {
  const labels = PDF_LABELS[input.locale];
  const rtl = directionFor(input.locale) === 'rtl';

  // Credit-card proportions: 85.6 × 54 mm in PDF points.
  return collect(
    { size: [243, 153], margin: 10, title: `${labels.cardNumber}: ${input.cardNumber}` },
    (doc) => {
      doc.registerFont('Bladna', resolveBundledFontPath());
      doc.font('Bladna');

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;

      // Header bar with the document title (jade brand-900, P9 retheme).
      doc.rect(0, 0, pageWidth, 32).fill('#0f4030');
      doc
        .fillColor('#FFFFFF')
        .fontSize(14)
        .text(labels.cardHeading, 12, 10, { width: pageWidth - 24, align: rtl ? 'right' : 'left' });
      doc.fillColor('#000000');

      // QR on the opposite side of the text anchor.
      const qrSize = 74;
      const qrX = rtl ? 12 : pageWidth - qrSize - 12;
      const qrY = 40;
      doc.image(input.qr, qrX, qrY, { width: qrSize, height: qrSize });

      const textX = rtl ? qrX + qrSize + 8 : 12;
      const textWidth = pageWidth - qrSize - 34;
      const align = rtl ? ('right' as const) : ('left' as const);

      let y = qrY;
      doc.fontSize(13).text(input.holderName, textX, y, { width: textWidth, align });
      y = doc.y + 1;
      doc.fontSize(8).text(`${labels.volunteerIdLabel}: ${input.volunteerId}`, textX, y, {
        width: textWidth,
        align,
      });
      y = doc.y + 1;
      doc.fontSize(8).text(`${labels.cardNumber}: ${input.cardNumber}`, textX, y, {
        width: textWidth,
        align,
      });
      y = doc.y + 1;
      doc
        .fontSize(8)
        .text(`${labels.status}: ${statusLabelForCard(input.cardStatus, labels)}`, textX, y, {
          width: textWidth,
          align,
        });
      y = doc.y + 1;
      doc
        .fontSize(8)
        .text(
          `${labels.verification}: ${verificationLabel(input.verificationStatus, labels)}`,
          textX,
          y,
          { width: textWidth, align },
        );
      if (input.issuedAt) {
        y = doc.y + 1;
        doc
          .fontSize(7)
          .text(`${labels.issuedOn}: ${formatDate(input.issuedAt, input.locale)}`, textX, y, {
            width: textWidth,
            align,
          });
      }

      doc
        .fontSize(6)
        .text(input.verifyUrl, 12, pageHeight - 20, { width: pageWidth - 24, align: 'center' });
    },
  );
}

/**
 * Volunteer CV as a paginated A4 document (spec §57) — the PDF twin of the
 * `GET /me/cv` JSON export: same owner-only aggregate, rendered for humans.
 * Every section except the header is conditional, so a sparse profile renders
 * a short honest CV instead of empty scaffolding. Contact data is the owner's
 * own (privacy flags govern the public surface, never self-export).
 */
export function renderCvPdf(input: CvPdfInput): Promise<Buffer> {
  const labels = PDF_LABELS[input.locale];
  const rtl = directionFor(input.locale) === 'rtl';
  const align = rtl ? ('right' as const) : ('left' as const);

  return collect({ size: 'A4', margin: 48, title: `${labels.cvHeading}: ${input.name}` }, (doc) => {
    doc.registerFont('Bladna', resolveBundledFontPath());
    doc.font('Bladna');
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // Header — identity block, always rendered.
    doc.moveDown(1.4);
    doc.fontSize(24).text(labels.cvHeading, { align: 'center' });
    doc.moveDown(0.4);
    doc.fontSize(26).text(input.name, { align: 'center' });
    doc.moveDown(0.4);
    doc.fontSize(11).text(`${labels.volunteerIdLabel}: ${input.volunteerId}`, { align: 'center' });
    doc
      .fontSize(10)
      .text(`${labels.verification}: ${verificationLabel(input.verificationStatus, labels)}`, {
        align: 'center',
      });
    if (input.location) {
      doc.fontSize(10).text(`${labels.location}: ${input.location}`, { align: 'center' });
    }
    doc.fontSize(9).text(`${labels.email}: ${input.email}`, { align: 'center' });
    if (input.phone) {
      doc.fontSize(9).text(`${labels.phone}: ${input.phone}`, { align: 'center' });
    }

    /** Section heading + body font, mirroring the certificate renderer. */
    const section = (heading: string): void => {
      doc.moveDown(0.9);
      doc.fontSize(14).text(heading, { align });
      doc.moveDown(0.2);
      doc.fontSize(10);
    };
    const bullet = (line: string): void => {
      doc.text(`• ${line}`, { align, width });
    };
    const metaLine = (bits: string[]): void => {
      doc.text(`   ${bits.join(' · ')}`, { align, width });
    };

    if (input.bio) {
      section(labels.summary);
      doc.text(input.bio, { align, width });
    }

    if (input.availability.length > 0) {
      section(labels.availability);
      doc.text(input.availability.map((slot) => availabilitySlotLabel(slot, labels)).join(' · '), {
        align,
        width,
      });
    }

    if (input.skills.length > 0) {
      section(labels.skills);
      for (const skill of input.skills) {
        bullet(
          skill.years === null ? skill.name : `${skill.name} — ${skill.years} ${labels.yearsUnit}`,
        );
      }
    }

    if (input.languages.length > 0) {
      section(labels.languages);
      for (const language of input.languages) {
        bullet(`${language.name} — ${languageLevelLabel(language.level, labels)}`);
      }
    }

    if (input.interests.length > 0) {
      section(labels.interests);
      doc.text(input.interests.join(' · '), { align, width });
    }

    // Headline stat — always shown, 0 is a fact like any other.
    doc.moveDown(0.9);
    doc.fontSize(13).text(`${labels.hours}: ${input.verifiedHours}`, { align, width });

    if (input.certificates.length > 0) {
      section(labels.certificates);
      for (const certificate of input.certificates) {
        bullet(`${certificate.title} — ${certificate.organization}`);
        const bits = [
          `${labels.number}: ${certificate.number}`,
          `${labels.hours}: ${certificate.hours}`,
          `${labels.issuedOn}: ${formatDate(certificate.issuedAt, input.locale)}`,
        ];
        if (certificate.status !== 'VALID') {
          bits.push(`${labels.status}: ${statusLabelForCertificate(certificate.status, labels)}`);
        }
        metaLine(bits);
      }
    }

    if (input.achievements.length > 0) {
      section(labels.achievements);
      for (const achievement of input.achievements) bullet(achievement);
    }

    if (input.experiences.length > 0) {
      section(labels.experiences);
      for (const experience of input.experiences) {
        bullet(
          experience.country
            ? `${experience.organizationName} — ${experience.country}`
            : experience.organizationName,
        );
        const bits = [
          `${formatDate(experience.startDate, input.locale)} – ${
            experience.endDate ? formatDate(experience.endDate, input.locale) : '…'
          }`,
        ];
        if (experience.program) bits.push(experience.program);
        if (experience.activity) bits.push(experience.activity);
        if (experience.hours !== null) bits.push(`${labels.hours}: ${experience.hours}`);
        if (experience.verified) bits.push(labels.verifiedFlag);
        metaLine(bits);
      }
    }
  });
}

/**
 * Raw binary response for generated PDFs. Callers pass filenames built from
 * generated identifiers (`BLD-CERT-…` / `BLD-CARD-…`: `[A-Z0-9-]` only).
 */
export function pdfResponse(pdf: Buffer, filename: string, cacheControl: string): Response {
  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-length': String(pdf.byteLength),
      'content-disposition': `inline; filename="${filename}"`,
      'cache-control': cacheControl,
      'x-content-type-options': 'nosniff',
    },
  });
}
