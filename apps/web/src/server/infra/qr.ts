import { createHmac, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import { AppError } from '@bladna/types';
import { env } from '../env';

/**
 * QR generation & verification (§26 attendance, §72 public verification).
 *
 * Codes are signed payloads: `bladna:<kind>:<id>.<sig>` where `sig` is an
 * HMAC-SHA256 over the payload with QR_SIGNING_SECRET, truncated to 32 hex
 * chars. Verification needs only the secret (offline-friendly) and is
 * tamper-evident — an altered id fails signature validation.
 */

export type QrKind = 'attendance' | 'certificate' | 'profile' | 'opportunity';

function sign(payload: string): string {
  return createHmac('sha256', env.qrSigningSecret).update(payload).digest('hex').slice(0, 32);
}

export function encodeQrToken(kind: QrKind, id: string): string {
  const payload = `bladna:${kind}:${id}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyQrToken(token: string): { kind: QrKind; id: string } {
  const idx = token.lastIndexOf('.');
  if (idx < 0) throw AppError.validation('Malformed QR token.');
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw AppError.validation('QR signature mismatch.');
  }
  const parts = payload.split(':');
  if (parts.length !== 3 || parts[0] !== 'bladna') {
    throw AppError.validation('Malformed QR payload.');
  }
  return { kind: parts[1] as QrKind, id: parts[2] };
}

export async function qrToDataUrl(token: string): Promise<string> {
  return QRCode.toDataURL(token, { errorCorrectionLevel: 'M', margin: 2, width: 512 });
}

export async function qrToPng(token: string): Promise<Buffer> {
  return QRCode.toBuffer(token, { type: 'png', errorCorrectionLevel: 'M', margin: 2, width: 512 });
}
