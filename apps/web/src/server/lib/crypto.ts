// AES-256-GCM encryption for secrets-at-rest (TOTP seeds, API keys).
// Key is derived from AUTH_SECRET via scrypt; format: v1.<iv>.<tag>.<data> (base64url).

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { AppError } from '@bladna/types';
import { env } from '../env';

const VERSION = 'v1';
const CONTEXT = 'bladna-secrets-v1';

function deriveKey(): Buffer {
  return scryptSync(env.authSecret, CONTEXT, 32);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptSecret(stored: string): string {
  const parts = stored.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw AppError.internal('Malformed encrypted secret.');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  try {
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(), Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch (error) {
    throw AppError.internal('Failed to decrypt secret.', error);
  }
}
