import { existsSync } from 'node:fs';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import {
  PDF_LABELS,
  pdfResponse,
  renderCardPdf,
  renderCertificatePdf,
  renderCvPdf,
  resolveBundledFontPath,
  type CertificatePdfInput,
  type CardPdfInput,
  type CvPdfInput,
} from './pdf';

async function qr(): Promise<Buffer> {
  return QRCode.toBuffer('https://bladna.dz/verify?code=BLD-CERT-TEST0001', {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 512,
  });
}

const certInput = async (locale: 'ar' | 'fr' | 'en'): Promise<CertificatePdfInput> => ({
  locale,
  title: 'حملة تنظيف شاطئ سيدي فرج',
  description: 'مشاركة في حملة التنظيف السنوية.',
  holderName: 'أمين بن سالم',
  volunteerId: 'BLD-ALG-000001',
  organizationName: 'جمعية أطلس الأخضر',
  hours: 12,
  certificateNumber: 'BLD-CERT-TEST0001',
  issuedAt: new Date('2026-01-15T00:00:00Z'),
  status: 'VALID',
  verifyUrl: 'https://bladna.dz/verify?code=BLD-CERT-TEST0001',
  qr: await qr(),
});

const cardInput = async (locale: 'ar' | 'fr' | 'en'): Promise<CardPdfInput> => ({
  locale,
  holderName: 'أمين بن سالم',
  volunteerId: 'BLD-ALG-000001',
  cardNumber: 'BLD-CARD-00000042',
  cardStatus: 'ACTIVE',
  verificationStatus: 'BASIC_VERIFIED',
  issuedAt: new Date('2026-02-01T00:00:00Z'),
  verifyUrl: 'https://bladna.dz/verify?code=public-token',
  qr: await qr(),
});

/** Fully-populated CV exercising every section, enum mapping and status line. */
const cvInput = (locale: 'ar' | 'fr' | 'en'): CvPdfInput => ({
  locale,
  name: 'أمين بن سالم',
  volunteerId: 'BLD-ALG-000001',
  verificationStatus: 'BASIC_VERIFIED',
  location: 'باب الزوار، الجزائر',
  email: 'amine@example.dz',
  phone: '+213 555 01 02 03',
  bio: 'متطوع منذ 2020، شغوف بحماية السواحل وتعليم القراءة.',
  availability: ['WEEKENDS', 'EVENINGS', 'FLEXIBLE'],
  skills: [
    { name: 'إسعافات أولية', years: 5 },
    { name: 'React', years: null },
  ],
  languages: [
    { name: 'العربية', level: 'NATIVE' },
    { name: 'الفرنسية', level: 'UPPER_INTERMEDIATE' },
  ],
  interests: ['حماية البيئة', 'التعليم'],
  verifiedHours: 128,
  certificates: [
    {
      number: 'BLD-CERT-TEST0001',
      title: 'حملة تنظيف شاطئ سيدي فرج',
      organization: 'جمعية أطلس الأخضر',
      hours: 12,
      issuedAt: new Date('2026-01-15T00:00:00Z'),
      status: 'VALID',
    },
    {
      number: 'BLD-CERT-TEST0002',
      title: 'ملتقى الشباب والEnvironment', // mixed-script data must not break shaping
      organization: 'جمعية أطلس الأخضر',
      hours: 6,
      issuedAt: new Date('2025-09-01T00:00:00Z'),
      status: 'REVOKED',
    },
  ],
  achievements: ['عشر ساعات تطوع', 'شهر متتالٍ من المشاركة'],
  experiences: [
    {
      organizationName: 'TEE France',
      program: 'Été solidaire',
      activity: 'Nettoyage des alpes',
      country: 'فرنسا',
      startDate: new Date('2025-07-01T00:00:00Z'),
      endDate: new Date('2025-07-21T00:00:00Z'),
      hours: 40,
      verified: true,
    },
  ],
});

describe('pdf infrastructure', () => {
  it('resolves the bundled OFL font asset', () => {
    expect(existsSync(resolveBundledFontPath())).toBe(true);
  });

  it('covers Latin AND Arabic with the bundled font', () => {
    const doc = new PDFDocument();
    doc.font(resolveBundledFontPath());
    // A character the font certainly lacks renders as .notdef: a real glyph
    // must not share its advance width (this is what "tofu" looks like here).
    const notdefWidth = doc.widthOfString('');
    const arabicWidth = doc.widthOfString('ا'); // single alef
    const latinWidth = doc.widthOfString('A');
    expect(arabicWidth).toBeGreaterThan(0);
    expect(latinWidth).toBeGreaterThan(0);
    expect(arabicWidth).not.toBe(notdefWidth);
    expect(latinWidth).not.toBe(notdefWidth);
    doc.end();
  });

  it('provides every label in every locale', () => {
    const keys = Object.keys(PDF_LABELS.ar) as (keyof typeof PDF_LABELS.ar)[];
    expect(keys.length).toBeGreaterThan(10);
    for (const locale of ['ar', 'fr', 'en'] as const) {
      for (const key of keys) {
        expect(PDF_LABELS[locale][key], `${locale}.${key}`).toBeTruthy();
      }
    }
  });

  it('renders a certificate PDF for all locales (%PDF magic, real size)', async () => {
    for (const locale of ['ar', 'fr', 'en'] as const) {
      const pdf = await renderCertificatePdf(await certInput(locale));
      expect(pdf.subarray(0, 4).toString('ascii')).toBe('%PDF');
      expect(pdf.byteLength).toBeGreaterThan(10_000);
    }
  });

  it('renders a card PDF for all locales (%PDF magic, real size)', async () => {
    for (const locale of ['ar', 'fr', 'en'] as const) {
      const pdf = await renderCardPdf(await cardInput(locale));
      expect(pdf.subarray(0, 4).toString('ascii')).toBe('%PDF');
      expect(pdf.byteLength).toBeGreaterThan(10_000);
    }
  });

  it('renders a CV PDF for all locales (%PDF magic, real size)', async () => {
    for (const locale of ['ar', 'fr', 'en'] as const) {
      const pdf = await renderCvPdf(cvInput(locale));
      expect(pdf.subarray(0, 4).toString('ascii')).toBe('%PDF');
      expect(pdf.byteLength).toBeGreaterThan(10_000);
    }
  });

  it('renders a sparse CV (header + hours only) without errors', async () => {
    const pdf = await renderCvPdf({
      ...cvInput('en'),
      location: null,
      phone: null,
      bio: null,
      availability: [],
      skills: [],
      languages: [],
      interests: [],
      certificates: [],
      achievements: [],
      experiences: [],
    });
    expect(pdf.subarray(0, 4).toString('ascii')).toBe('%PDF');
    expect(pdf.byteLength).toBeGreaterThan(5_000);
  });

  it('sets the documented response headers', () => {
    const response = pdfResponse(
      Buffer.from('%PDF-test'),
      'bladna-certificate-X.pdf',
      'public, max-age=300',
    );
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toBe(
      'inline; filename="bladna-certificate-X.pdf"',
    );
    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
