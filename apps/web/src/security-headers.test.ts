import { describe, expect, it } from 'vitest';
import {
  HSTS_HEADER,
  applySecurityHeaders,
  buildContentSecurityPolicy,
  newNonce,
} from './security-headers';

describe('security headers', () => {
  it('mints unique hex nonces on the CSP base64-value charset', () => {
    const a = newNonce();
    const b = newNonce();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(b).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });

  it('builds a nonce document CSP with no unsafe-inline scripts', () => {
    const nonce = 'abc123';
    const csp = buildContentSecurityPolicy('document', nonce, true);
    const scriptSrc = /script-src ([^;]+)/.exec(csp)?.[1] ?? '';
    expect(scriptSrc).toContain(`'nonce-${nonce}'`);
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).not.toContain('unsafe-inline');
    // Structural assertions: lockdown directives that must always be present.
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("object-src 'none'");
    // Styles keep 'unsafe-inline' (React inline style attributes cannot run script).
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    // QR data URLs render client-side from the API.
    expect(csp).toContain("img-src 'self' data: blob:");
    // No production HMR websocket allowance in production builds.
    expect(csp).not.toContain('ws://localhost:3000');
  });

  it('adds the dev HMR websocket to connect-src outside production', () => {
    const csp = buildContentSecurityPolicy('document', 'n', false);
    expect(csp).toContain('ws://localhost:3000');
    expect(csp).toContain('ws://127.0.0.1:3000');
  });

  it('refuses to build a document policy without a nonce', () => {
    expect(() => buildContentSecurityPolicy('document', undefined, true)).toThrow(/nonce/i);
  });

  it('locks API responses down as non-documents', () => {
    const csp = buildContentSecurityPolicy('api', undefined, true);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).not.toContain('script-src'); // scripts never allowed at all
  });

  it('applies the full header set', () => {
    const headers = new Headers();
    applySecurityHeaders(headers, 'document', 'feedbeef');
    expect(headers.get('content-security-policy')).toContain("script-src 'self' 'nonce-feedbeef");
    expect(headers.get('strict-transport-security')).toBe(HSTS_HEADER);
    expect(HSTS_HEADER).toBe('max-age=31536000; includeSubDomains');
    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(headers.get('x-frame-options')).toBe('DENY');
    expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    const permissions = headers.get('permissions-policy') ?? '';
    expect(permissions).toContain('camera=(self)');
    expect(permissions).toContain('geolocation=(self)');
    expect(permissions).toContain('payment=()');
  });
});
