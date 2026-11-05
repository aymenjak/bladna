// Typed environment access. Fails fast with a clear message on missing
// production-critical values, never logs secret values.

import { AppError } from '@bladna/types';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw AppError.internal(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

function int(name: string, fallback: number): number {
  const raw = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(raw) ? raw : fallback;
}

export const env = {
  get nodeEnv() {
    return optional('NODE_ENV', 'development');
  },
  get isProduction() {
    return this.nodeEnv === 'production';
  },
  get isTest() {
    return this.nodeEnv === 'test';
  },
  get appName() {
    return optional('APP_NAME', 'BLADNA');
  },
  get appUrl() {
    return optional('APP_URL', 'http://localhost:3000').replace(/\/$/, '');
  },
  get policyVersion() {
    return optional('POLICY_VERSION', '2026-01-01');
  },
  get publicAppUrl() {
    return optional('PUBLIC_APP_URL', optional('APP_URL', 'http://localhost:3000')).replace(
      /\/$/,
      '',
    );
  },
  /**
   * Demo mode publishes the seeded demo credentials on the login page, so a
   * production build ignores it unless DEMO_MODE_ALLOW_PRODUCTION is also set —
   * a second, deliberate opt-in for a local presentation (ISO 27001 A.8.31).
   */
  get demoMode() {
    if (!bool('DEMO_MODE', false)) return false;
    return !this.isProduction || bool('DEMO_MODE_ALLOW_PRODUCTION', false);
  },
  get authSecret(): string {
    const secret = required('AUTH_SECRET');
    if (secret.length < 32) {
      throw AppError.internal('AUTH_SECRET must be at least 32 characters.');
    }
    return secret;
  },
  get sessionSecret(): string {
    return optional('SESSION_SECRET', optional('AUTH_SECRET'));
  },
  get accessTokenTtl() {
    return int('ACCESS_TOKEN_TTL', 900);
  },
  get refreshTokenTtl() {
    return int('REFRESH_TOKEN_TTL', 30 * 24 * 3600);
  },
  get cookieDomain() {
    return optional('COOKIE_DOMAIN');
  },
  get redisUrl() {
    return optional('REDIS_URL');
  },
  get storageDriver(): 'local' | 's3' {
    return optional('STORAGE_DRIVER', 'local') === 's3' ? 's3' : 'local';
  },
  get storageLocalDir() {
    return optional('STORAGE_LOCAL_DIR', './var/storage');
  },
  get emailDriver(): 'console' | 'smtp' {
    return optional('EMAIL_DRIVER', 'console') === 'smtp' ? 'smtp' : 'console';
  },
  get emailFrom() {
    return optional('EMAIL_FROM', 'BLADNA <no-reply@bladna.local>');
  },
  get emailFileDir() {
    return optional('EMAIL_FILE_DIR', './var/emails');
  },
  get smtpHost() {
    return optional('SMTP_HOST');
  },
  get smtpPort() {
    return int('SMTP_PORT', 587);
  },
  get smtpUser() {
    return optional('SMTP_USER');
  },
  get smtpPass() {
    return optional('SMTP_PASS');
  },
  /** HMAC secret for signed QR payloads (attendance / certificates). */
  get qrSigningSecret() {
    const secret = optional(
      'QR_SIGNING_SECRET',
      optional('SESSION_SECRET', optional('AUTH_SECRET')),
    );
    if (!secret) {
      throw AppError.internal('Missing required environment variable: QR_SIGNING_SECRET');
    }
    return secret;
  },
  get paymentProvider() {
    return optional('PAYMENT_PROVIDER', 'bank_transfer');
  },
  get stripeSecretKey() {
    return optional('STRIPE_SECRET_KEY');
  },
  get paypalClientId() {
    return optional('PAYPAL_CLIENT_ID');
  },
  get paypalClientSecret() {
    return optional('PAYPAL_CLIENT_SECRET');
  },
  get googleMapsApiKey() {
    return optional('GOOGLE_MAPS_API_KEY');
  },
  get mapPublicKey() {
    return optional('MAP_PUBLIC_KEY');
  },
  /** GDPR gate: personal documents may only be sent to an external AI provider when true. */
  get aiSendDocuments() {
    return bool('AI_SEND_DOCUMENTS', false);
  },
  get aiProvider() {
    return optional('AI_PROVIDER');
  },
  get aiBaseUrl() {
    return optional('AI_BASE_URL');
  },
  get aiApiKey() {
    return optional('AI_API_KEY');
  },
  get mapProvider() {
    return optional('MAP_PROVIDER');
  },
  get featureFlagOverride(): Set<string> {
    return new Set(
      optional('FEATURE_FLAGS')
        .split(',')
        .map((flag) => flag.trim())
        .filter(Boolean),
    );
  },
  get trustProxy() {
    return bool('TRUST_PROXY', false);
  },
  get errorMonitorDsn() {
    return optional('ERROR_MONITOR_DSN');
  },
};

export type Env = typeof env;
