import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppError } from '@bladna/types';
import { rateLimiter } from '@bladna/auth';
import {
  apiHandler,
  assertSameOrigin,
  body,
  buildContext,
  errorResponse,
  json,
  matchParams,
  originFor,
  pathParams,
  query,
} from './http';
import { env } from './env';

/**
 * HTTP layer unit tests (spec §55/§56/§88): context building, validation
 * helpers, envelopes, the same-origin (CSRF defense-in-depth) check and the
 * apiHandler pipeline — all DB-free. The origin check previously accepted
 * ANY well-formed Origin (`allowed.add(new URL(origin).origin)` whitelisted
 * the caller's own origin), so its rejection cases are pinned here.
 */

afterEach(() => {
  rateLimiter.reset();
  vi.restoreAllMocks();
});

describe('buildContext', () => {
  it('derives locale, requestId, ip and query from the request', () => {
    const request = new Request('http://local.test/api/v1/things?page=2&q=a%20b', {
      headers: {
        'user-agent': 'unit-test',
        'x-request-id': 'req-123',
        'x-locale': 'fr',
      },
    });
    const ctx = buildContext(request, ['things'], {});
    expect(ctx.locale).toBe('fr');
    expect(ctx.requestId).toBe('req-123');
    expect(ctx.method).toBe('GET');
    expect(ctx.userAgent).toBe('unit-test');
    expect(ctx.query.get('page')).toBe('2');
    expect(ctx.query.get('q')).toBe('a b');
    expect(ctx.params).toEqual({});
    expect(ctx.segments).toEqual(['things']);
  });

  it('defaults locale to ar and generates a requestId when absent', () => {
    const ctx = buildContext(new Request('http://local.test/api/v1'), [], {});
    expect(ctx.locale).toBe('ar');
    expect(ctx.requestId).toMatch(/^[0-9a-f-]{36}$/);
    // No proxy headers → honest sentinel instead of a made-up address.
    expect(ctx.ip).toBe('local');
  });

  it('truncates the user agent at 500 characters', () => {
    const ctx = buildContext(
      new Request('http://local.test/api/v1', { headers: { 'user-agent': 'x'.repeat(600) } }),
      [],
      {},
    );
    expect(ctx.userAgent).toHaveLength(500);
  });
});

describe('body / query / pathParams validation', () => {
  const schema = z.object({ name: z.string().min(2) });

  function ctxWith(
    bodyText?: string,
    url = 'http://local.test/api/v1/x',
  ): ReturnType<typeof buildContext> {
    const request = new Request(url, {
      method: 'POST',
      ...(bodyText !== undefined ? { body: bodyText } : {}),
    });
    return buildContext(request, ['x'], {});
  }

  it('parses a valid JSON body into typed output', async () => {
    await expect(body(ctxWith('{"name":"atlas"}'), schema)).resolves.toEqual({ name: 'atlas' });
  });

  it('rejects a non-JSON body with VALIDATION_ERROR', async () => {
    await expect(body(ctxWith('not-json'), schema)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects schema failures with field details', async () => {
    await expect(body(ctxWith('{"name":"a"}'), schema)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(body(ctxWith('{}'), schema)).rejects.toBeInstanceOf(AppError);
  });

  it('query() applies defaults and rejects invalid values', () => {
    const pageSchema = z.object({ page: z.coerce.number().int().min(1).default(1) });
    const ctx = ctxWith(undefined, 'http://local.test/api/v1/x?page=3');
    expect(query(ctx, pageSchema)).toEqual({ page: 3 });

    const bad = ctxWith(undefined, 'http://local.test/api/v1/x?page=zero');
    expect(() => query(bad, pageSchema)).toThrow(AppError);
    try {
      query(bad, pageSchema);
    } catch (error) {
      expect((error as AppError).code).toBe('VALIDATION_ERROR');
      expect((error as AppError).message).toContain('Invalid query parameters');
    }
  });

  it('pathParams() validates :param values', () => {
    const ok = buildContext(new Request('http://local.test/api/v1/x'), ['x'], {
      id: '3f1d2a4c-6b7e-4f8a-9c0d-1e2f3a4b5c6d',
    });
    expect(pathParams(ok, z.object({ id: z.string().uuid() }))).toEqual({
      id: '3f1d2a4c-6b7e-4f8a-9c0d-1e2f3a4b5c6d',
    });

    const bad = buildContext(new Request('http://local.test/api/v1/x'), ['x'], { id: 'nope' });
    expect(() => pathParams(bad, z.object({ id: z.string().uuid() }))).toThrow(AppError);
  });
});

describe('envelopes', () => {
  it('json() emits the success envelope with nosniff', async () => {
    const response = json({ hello: 'world' }, { requestId: 'r1' }, { status: 201 });
    expect(response.status).toBe(201);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.json()).toEqual({
      success: true,
      data: { hello: 'world' },
      meta: { requestId: 'r1' },
    });
  });

  it('errorResponse() maps AppErrors to status + failure envelope', async () => {
    const response = errorResponse(AppError.notFound('Gone.'), 'req-404');
    expect(response.status).toBe(404);
    expect(response.headers.get('x-request-id')).toBe('req-404');
    expect(await response.json()).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Gone.' },
    });
  });

  it('errorResponse() hides internal details of unexpected errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = errorResponse(new Error('database password leaked'), 'req-500');
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain('database password leaked');
    expect(JSON.parse(text).error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    });
    expect(spy).toHaveBeenCalled();
  });
});

describe('assertSameOrigin (CSRF defense in depth)', () => {
  const url = 'http://test.local/api/v1/me/privacy';

  it('skips non-mutating methods even cross-origin', () => {
    expect(() =>
      assertSameOrigin(new Request(url, { headers: { origin: 'http://evil.example' } })),
    ).not.toThrow();
  });

  it('allows mutations without an Origin header (non-browser clients)', () => {
    expect(() => assertSameOrigin(new Request(url, { method: 'POST' }))).not.toThrow();
  });

  it('allows same-origin mutations', () => {
    expect(() =>
      assertSameOrigin(
        new Request(url, { method: 'POST', headers: { origin: 'http://test.local' } }),
      ),
    ).not.toThrow();
  });

  it('allows the configured app URL from another request host (proxy setups)', () => {
    expect(() =>
      assertSameOrigin(new Request(url, { method: 'POST', headers: { origin: env.appUrl } })),
    ).not.toThrow();
  });

  it('REJECTS a well-formed foreign origin', () => {
    // Regression: this case used to pass because the old code added the
    // request's own Origin to the allowlist.
    expect(() =>
      assertSameOrigin(
        new Request(url, { method: 'POST', headers: { origin: 'http://evil.example' } }),
      ),
    ).toThrow(AppError);
    try {
      assertSameOrigin(
        new Request(url, { method: 'POST', headers: { origin: 'http://evil.example' } }),
      );
    } catch (error) {
      expect((error as AppError).code).toBe('FORBIDDEN');
      expect((error as AppError).message).toBe('Cross-origin request rejected.');
    }
  });

  it('REJECTS malformed and non-normalized Origin headers', () => {
    for (const origin of ['not a url', 'null', 'http://test.local:80']) {
      let thrown: unknown;
      try {
        assertSameOrigin(new Request(url, { method: 'POST', headers: { origin } }));
      } catch (error) {
        thrown = error;
      }
      expect(thrown, `origin=${origin}`).toBeInstanceOf(AppError);
      expect((thrown as AppError).code).toBe('FORBIDDEN');
      expect((thrown as AppError).message).toBe('Invalid Origin header.');
    }
  });
});

describe('originFor (outbound link origin)', () => {
  it('follows a configured app URL host with its own scheme', () => {
    expect(originFor(new Request(`${env.appUrl}/api/v1/attendance/sessions`))).toBe(
      new URL(env.appUrl).origin,
    );
  });

  it('honours X-Forwarded-Proto on a configured host (behind the proxy)', () => {
    expect(
      originFor(
        new Request(`${env.appUrl}/api/v1/attendance/sessions`, {
          headers: { 'x-forwarded-proto': 'https' },
        }),
      ),
    ).toBe(`https://${new URL(env.appUrl).host}`);
  });

  it('follows a local dev host on the request scheme (any port)', () => {
    expect(originFor(new Request('http://localhost:3002/api/v1/attendance/sessions'))).toBe(
      'http://localhost:3002',
    );
    expect(originFor(new Request('http://127.0.0.1:3002/api/v1/attendance/sessions'))).toBe(
      'http://127.0.0.1:3002',
    );
  });

  it('falls back to the public app URL for a forged/foreign host', () => {
    // A crafted Host/X-Forwarded-Host must never rewrite generated links.
    expect(originFor(new Request('https://evil.example/api/v1/attendance/sessions'))).toBe(
      env.publicAppUrl,
    );
    expect(
      originFor(
        new Request('https://evil.example/api/v1/attendance/sessions', {
          headers: { host: 'evil.example', 'x-forwarded-host': 'evil.example' },
        }),
      ),
    ).toBe(env.publicAppUrl);
  });
});

describe('apiHandler pipeline', () => {
  it('runs the handler and wraps its return value', async () => {
    const handler = vi.fn(() => ({ ok: true }));
    const response = await apiHandler({ method: 'GET', path: '/x', handler })(
      new Request('http://local.test/api/v1/x'),
      ['x'],
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('passes a raw Response through unchanged', async () => {
    const raw = new Response('csv-data', { status: 202, headers: { 'content-type': 'text/csv' } });
    const response = await apiHandler({ method: 'GET', path: '/x', handler: () => raw })(
      new Request('http://local.test/api/v1/x'),
      ['x'],
    );
    expect(response.status).toBe(202);
    expect(await response.text()).toBe('csv-data');
  });

  it('converts handler errors into the failure envelope', async () => {
    const response = await apiHandler({
      method: 'GET',
      path: '/x',
      handler: () => {
        throw AppError.businessRule('Not allowed.');
      },
    })(new Request('http://local.test/api/v1/x'), ['x']);
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe('BUSINESS_RULE_ERROR');
  });

  it('enforces the route rate-limit tier', async () => {
    // passwordReset = 5 requests / 15 min — the 6th call must be rejected.
    const route = {
      method: 'GET' as const,
      path: '/limited',
      handler: () => ({ ok: true }),
      options: { rateLimit: 'passwordReset' as const },
    };
    for (let i = 0; i < 5; i++) {
      const allowed = await apiHandler(route)(new Request('http://local.test/api/v1/limited'), [
        'limited',
      ]);
      expect(allowed.status).toBe(200);
    }
    const blocked = await apiHandler(route)(new Request('http://local.test/api/v1/limited'), [
      'limited',
    ]);
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error.code).toBe('RATE_LIMITED');
  });

  it('rejects cross-origin mutations before the handler runs', async () => {
    const handler = vi.fn(() => ({ ok: true }));
    const response = await apiHandler({ method: 'POST', path: '/x', handler })(
      new Request('http://local.test/api/v1/x', {
        method: 'POST',
        headers: { origin: 'http://evil.example' },
      }),
      ['x'],
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('FORBIDDEN');
    expect(handler).not.toHaveBeenCalled();
  });

  it('honours skipOriginCheck for infrastructure routes', async () => {
    const handler = vi.fn(() => ({ ok: true }));
    const response = await apiHandler({
      method: 'POST',
      path: '/x',
      handler,
      options: { skipOriginCheck: true },
    })(
      new Request('http://local.test/api/v1/x', {
        method: 'POST',
        headers: { origin: 'http://evil.example' },
      }),
      ['x'],
    );
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe('matchParams', () => {
  it('extracts and decodes :param values from concrete segments', () => {
    expect(
      matchParams('/orgs/:orgId/members/:memberId', ['orgs', 'a', 'members', 'b%20c']),
    ).toEqual({ orgId: 'a', memberId: 'b c' });
  });

  it('skips params without a corresponding segment', () => {
    expect(matchParams('/orgs/:orgId', ['orgs'])).toEqual({});
    expect(matchParams('/plain', ['plain'])).toEqual({});
  });
});
