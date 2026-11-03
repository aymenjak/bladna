import { DEFAULT_LOCALE } from '@bladna/utils';
import type { LocaleCode } from '@bladna/types';
import { env } from '../env';

/**
 * Email templates (§47). All templates are trilingual (fr/en/ar), keyed by the
 * same locale codes as the UI so wording never drifts.
 * `text` is always provided (deliverability + accessibility).
 */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const LTR_LOCALES: LocaleCode[] = ['fr', 'en'];

function shell(
  locale: LocaleCode,
  title: string,
  bodyHtml: string,
  bodyText: string,
): RenderedEmail {
  const dir = LTR_LOCALES.includes(locale) ? 'ltr' : 'rtl';
  const align = dir === 'rtl' ? 'right' : 'left';
  const html = `<!doctype html>
<html dir="${dir}" lang="${locale}">
  <body style="margin:0;padding:24px;background:#f7f4ed;font-family:Segoe UI,Roboto,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;" dir="${dir}">
      <h1 style="margin:0 0 16px;font-size:20px;color:#211e19;text-align:${align};">${env.appName}</h1>
      <h2 style="margin:0 0 16px;font-size:17px;color:#37332c;text-align:${align};">${title}</h2>
      <div style="font-size:15px;line-height:1.6;color:#4f493f;text-align:${align};">${bodyHtml}</div>
      <hr style="margin:28px 0;border:none;border-top:1px solid #e5dfd1;" />
      <p style="font-size:12px;color:#746c5d;text-align:${align};">${env.appName} · ${env.appUrl}</p>
    </div>
  </body>
</html>`;
  return { subject: title, html, text: bodyText };
}

function safeLocale(locale: string): LocaleCode {
  return (['fr', 'en', 'ar'].includes(locale) ? locale : DEFAULT_LOCALE) as LocaleCode;
}

export function renderVerifyEmail(locale: string, token: string, name: string): RenderedEmail {
  const loc = safeLocale(locale);
  const url = `${env.appUrl}/${loc}/verify-email?token=${encodeURIComponent(token)}`;
  const copy = COPY[loc].verify;
  return shell(
    loc,
    copy.subject,
    `<p>${copy.greeting(name)}</p><p>${copy.body}</p><p><a href="${url}" style="display:inline-block;background:#18664a;color:#fff;padding:10px 18px;border-radius:12px;text-decoration:none;">${copy.cta}</a></p><p style="font-size:13px;color:#746c5d;">${copy.orPaste(url)}</p>`,
    `${copy.greeting(name)}\n\n${copy.body}\n\n${copy.cta}: ${url}`,
  );
}

export function renderResetEmail(locale: string, token: string, name: string): RenderedEmail {
  const loc = safeLocale(locale);
  const url = `${env.appUrl}/${loc}/reset-password?token=${encodeURIComponent(token)}`;
  const copy = COPY[loc].reset;
  return shell(
    loc,
    copy.subject,
    `<p>${copy.greeting(name)}</p><p>${copy.body}</p><p><a href="${url}" style="display:inline-block;background:#18664a;color:#fff;padding:10px 18px;border-radius:12px;text-decoration:none;">${copy.cta}</a></p><p style="font-size:13px;color:#746c5d;">${copy.expiry}</p>`,
    `${copy.greeting(name)}\n\n${copy.body}\n\n${copy.cta}: ${url}\n${copy.expiry}`,
  );
}

/** Generic notification email produced by the queue worker. */
export function renderNotificationEmail(
  template: string,
  locale: string,
  data: Record<string, unknown>,
): RenderedEmail {
  const loc = safeLocale(locale);
  const title = typeof data.title === 'string' ? data.title : template;
  const body = typeof data.body === 'string' ? data.body : '';
  const lines = Object.entries(data)
    .filter(([k]) => k !== 'title' && k !== 'body')
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join('\n');
  return shell(
    loc,
    title,
    `<p>${escapeHtml(title)}</p>${body ? `<p>${escapeHtml(body)}</p>` : ''}${lines ? `<pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(lines)}</pre>` : ''}`,
    `${title}\n${body}\n${lines}`,
  );
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

const COPY = {
  fr: {
    verify: {
      subject: 'Confirmez votre adresse e-mail',
      greeting: (n: string) => `Bonjour ${n},`,
      body: 'Merci de créer votre compte BLADNA. Cliquez ci-dessous pour confirmer votre adresse e-mail.',
      cta: 'Confirmer mon e-mail',
      orPaste: (url: string) => `Si le bouton ne fonctionne pas : ${url}`,
    },
    reset: {
      subject: 'Réinitialisation de votre mot de passe',
      greeting: (n: string) => `Bonjour ${n},`,
      body: 'Nous avons reçu une demande de réinitialisation de mot de passe.',
      cta: 'Choisir un nouveau mot de passe',
      expiry:
        "Ce lien expire dans 30 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.",
    },
  },
  en: {
    verify: {
      subject: 'Confirm your email address',
      greeting: (n: string) => `Hello ${n},`,
      body: 'Thanks for creating a BLADNA account. Click below to confirm your email address.',
      cta: 'Confirm my email',
      orPaste: (url: string) => `If the button does not work: ${url}`,
    },
    reset: {
      subject: 'Reset your password',
      greeting: (n: string) => `Hello ${n},`,
      body: 'We received a request to reset your password.',
      cta: 'Choose a new password',
      expiry:
        'This link expires in 30 minutes. If you did not request it, you can ignore this email.',
    },
  },
  ar: {
    verify: {
      subject: 'تأكيد بريدك الإلكتروني',
      greeting: (n: string) => `مرحبا ${n}،`,
      body: 'شكرا لإنشاء حساب على بلادنا. انقر أدناه لتأكيد بريدك الإلكتروني.',
      cta: 'تأكيد بريدي',
      orPaste: (url: string) => `إذا لم يعمل الزر: ${url}`,
    },
    reset: {
      subject: 'إعادة تعيين كلمة المرور',
      greeting: (n: string) => `مرحبا ${n}،`,
      body: 'تلقينا طلبًا لإعادة تعيين كلمة المرور الخاصة بك.',
      cta: 'اختر كلمة مرور جديدة',
      expiry: 'ينتهي الرابط خلال 30 دقيقة. إذا لم تطلب ذلك، يمكنك تجاهل هذا البريد.',
    },
  },
} as const;
