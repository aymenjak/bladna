import { describe, expect, it } from 'vitest';
import { isAppError, type AppError } from '@bladna/types';
import {
  assertUploadAcceptable,
  decodeBase64Upload,
  extensionForType,
  magicMatches,
  sha256Hex,
} from './upload';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PDF_BYTES = Buffer.from('%PDF-1.7\n4 0 obj\nendobj\n', 'latin1');

function webpBytes(): Buffer {
  const bytes = Buffer.alloc(32);
  bytes.write('RIFF', 0, 'latin1');
  bytes.write('WEBP', 8, 'latin1');
  return bytes;
}

/** Asserts the callback rejects with the API's VALIDATION_ERROR code. */
function expectValidation(run: () => unknown): void {
  try {
    run();
  } catch (error) {
    expect(isAppError(error)).toBe(true);
    expect((error as AppError).code).toBe('VALIDATION_ERROR');
    return;
  }
  throw new Error('expected a VALIDATION_ERROR to be thrown');
}

describe('decodeBase64Upload', () => {
  it('round-trips valid base64', () => {
    const decoded = decodeBase64Upload(PNG_BYTES.toString('base64'));
    expect(decoded.equals(PNG_BYTES)).toBe(true);
  });

  it('tolerates line-wrapped payloads', () => {
    const wrapped = PNG_BYTES.toString('base64').replace(/(.{4})/g, '$1\n');
    expect(decodeBase64Upload(wrapped).equals(PNG_BYTES)).toBe(true);
  });

  it('rejects content that is not base64', () => {
    expectValidation(() => decodeBase64Upload('this is not base64!!'));
  });

  it('rejects empty content', () => {
    expectValidation(() => decodeBase64Upload('   '));
  });

  it('rejects payloads beyond the size cap before decoding', () => {
    // The length check runs first, so oversized input never allocates a Buffer.
    expectValidation(() => decodeBase64Upload('A'.repeat(14_000_000)));
  });
});

describe('magicMatches', () => {
  it('accepts every allowed type', () => {
    expect(magicMatches(PNG_BYTES, 'image/png')).toBe(true);
    expect(magicMatches(JPEG_BYTES, 'image/jpeg')).toBe(true);
    expect(magicMatches(PDF_BYTES, 'application/pdf')).toBe(true);
    expect(magicMatches(webpBytes(), 'image/webp')).toBe(true);
  });

  it('rejects content that disagrees with the declared type', () => {
    expect(magicMatches(JPEG_BYTES, 'image/png')).toBe(false);
    expect(magicMatches(PNG_BYTES, 'application/pdf')).toBe(false);
    expect(magicMatches(PDF_BYTES, 'image/webp')).toBe(false);
  });

  it('never matches a type outside the allow-list', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'latin1');
    expect(magicMatches(svg, 'image/svg+xml')).toBe(false);
  });

  it('rejects truncated signatures', () => {
    expect(magicMatches(Buffer.from([0x89, 0x50]), 'image/png')).toBe(false);
  });
});

describe('assertUploadAcceptable', () => {
  it('accepts a well-formed png and returns its extension', () => {
    expect(
      assertUploadAcceptable({ fileName: 'scan.png', mimeType: 'image/png', bytes: PNG_BYTES }),
    ).toBe('.png');
  });

  it('accepts .jpeg alongside .jpg for jpeg uploads (case-insensitive)', () => {
    expect(
      assertUploadAcceptable({
        fileName: 'passport.JPEG',
        mimeType: 'image/jpeg',
        bytes: JPEG_BYTES,
      }),
    ).toBe('.jpg');
  });

  it('rejects a content type outside the allow-list', () => {
    expectValidation(() =>
      assertUploadAcceptable({
        fileName: 'logo.svg',
        mimeType: 'image/svg+xml',
        bytes: PNG_BYTES,
      }),
    );
  });

  it('rejects an extension that contradicts the declared type', () => {
    expectValidation(() =>
      assertUploadAcceptable({
        fileName: 'report.pdf',
        mimeType: 'image/png',
        bytes: PNG_BYTES,
      }),
    );
  });

  it('rejects a file name with no recognized extension', () => {
    expectValidation(() =>
      assertUploadAcceptable({ fileName: 'evidence', mimeType: 'image/png', bytes: PNG_BYTES }),
    );
  });

  it('rejects bytes whose magic disagrees with the declared type', () => {
    expectValidation(() =>
      assertUploadAcceptable({
        fileName: 'photo.png',
        mimeType: 'image/png',
        bytes: JPEG_BYTES,
      }),
    );
  });

  it('rejects empty content', () => {
    expectValidation(() =>
      assertUploadAcceptable({
        fileName: 'empty.png',
        mimeType: 'image/png',
        bytes: Buffer.alloc(0),
      }),
    );
  });
});

describe('extensionForType', () => {
  it('maps every accepted type and rejects the rest', () => {
    expect(extensionForType('image/png')).toBe('.png');
    expect(extensionForType('image/webp')).toBe('.webp');
    expect(extensionForType('application/pdf')).toBe('.pdf');
    expect(extensionForType('image/svg+xml')).toBeNull();
  });
});

describe('sha256Hex', () => {
  it('produces a stable 64-character hex digest', () => {
    const digest = sha256Hex(PNG_BYTES);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex(PNG_BYTES)).toBe(digest);
    expect(sha256Hex(JPEG_BYTES)).not.toBe(digest);
  });
});
