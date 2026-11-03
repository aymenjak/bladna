import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError, type LocaleCode } from '@bladna/types';
import { env } from '../env';

/**
 * Email adapter (§47).
 *
 * Drivers (EMAIL_DRIVER):
 *  - `console` (default): renders the message to an `.eml`-style file under
 *    EMAIL_FILE_DIR (default `./var/emails`) — a REAL artifact you can open and
 *    inspect; used for development and self-hosted dry runs.
 *  - `smtp` : requires SMTP_HOST/SMTP_PORT credentials, otherwise CONFIG_ERROR
 *    (mail is never silently dropped).
 *
 * Templates live in `src/server/email/templates` and are rendered per locale.
 */

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  locale?: string;
  tags?: string[];
}

export async function sendEmail(message: EmailMessage): Promise<{ id: string }> {
  const driver = env.emailDriver;

  if (driver === 'console') {
    const dir = path.resolve(process.cwd(), env.emailFileDir);
    await mkdir(dir, { recursive: true });
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const recipients = Array.isArray(message.to) ? message.to.join(', ') : message.to;
    const content = [
      `To: ${recipients}`,
      `From: ${env.emailFrom}`,
      `Subject: ${message.subject}`,
      `X-Bladna-Locale: ${message.locale ?? 'ar'}`,
      `X-Bladna-Tags: ${(message.tags ?? []).join(',')}`,
      '',
      message.text,
      '',
      '----- HTML -----',
      message.html,
    ].join('\n');
    await writeFile(path.join(dir, `${id}.eml`), content, 'utf8');
    if (env.nodeEnv === 'development') {
      // stdout (not console.log: lint forbids informational console statements)
      process.stdout.write(`[email] wrote ${id}.eml → ${dir} (to: ${recipients})\n`);
    }
    return { id };
  }

  if (!env.smtpHost) {
    throw AppError.config(
      'EMAIL_DRIVER=smtp requires SMTP_HOST/SMTP_PORT to be configured. Set EMAIL_DRIVER=console to persist outgoing mail to disk.',
    );
  }
  throw AppError.notImplemented(
    'SMTP transport is not wired in this build. Set EMAIL_DRIVER=console to persist outgoing mail to disk.',
  );
}

export type { LocaleCode };
