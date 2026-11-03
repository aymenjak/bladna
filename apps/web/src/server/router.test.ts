import { describe, expect, it } from 'vitest';
import { Router, matchPath } from './router';

/**
 * Router unit tests (spec §55): path matching and dispatch are pure functions
 * over a flat route table — no database, no Next.js. Handlers exercised here
 * are test stubs, so rate limiting/origin checks run against real module code
 * without touching business logic.
 */

describe('matchPath', () => {
  it('matches literal segments and rejects different ones', () => {
    expect(matchPath('/opportunities', '/opportunities')).toEqual({});
    expect(matchPath('/opportunities', '/other')).toBeNull();
    expect(matchPath('/auth/login', '/auth/logout')).toBeNull();
  });

  it('captures params and URL-decodes them', () => {
    expect(matchPath('/opportunities/:slug', '/opportunities/cleanup-day')).toEqual({
      slug: 'cleanup-day',
    });
    expect(matchPath('/opportunities/:slug', '/opportunities/hello%20world')).toEqual({
      slug: 'hello world',
    });
    expect(matchPath('/orgs/:orgId/members/:memberId', '/orgs/a/members/b')).toEqual({
      orgId: 'a',
      memberId: 'b',
    });
  });

  it('rejects segment-length mismatches in both directions', () => {
    expect(matchPath('/a', '/a/b')).toBeNull();
    expect(matchPath('/a/b', '/a')).toBeNull();
    expect(matchPath('/auth/login', '/auth/login/extra')).toBeNull();
  });

  it('captures the wildcard remainder (including nothing)', () => {
    expect(matchPath('/files/*', '/files/uploads/2026/a.png')).toEqual({
      '*': 'uploads/2026/a.png',
    });
    // The catch-all [[...segments]] route is mounted with `*`; an empty tail
    // still matches so `/api/v1` itself can be described by a route.
    expect(matchPath('/files/*', '/files')).toEqual({ '*': '' });
  });

  it('ignores empty segments when comparing', () => {
    expect(matchPath('/a/b', '//a//b')).toEqual({});
  });
});

describe('Router.handle (dispatch)', () => {
  const router = new Router().register([
    {
      method: 'GET',
      path: '/ping',
      handler: () => ({ pong: true }),
      auth: 'public',
      summary: 'Ping',
    },
    { method: 'GET', path: '/', handler: () => ({ root: true }) },
  ]);

  it('dispatches a registered GET and wraps the envelope', async () => {
    const response = await router.handle(new Request('http://local.test/api/v1/ping'), ['ping']);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ pong: true });
    expect(typeof body.meta.requestId).toBe('string');
  });

  it('dispatches the root path when no segments remain', async () => {
    const response = await router.handle(new Request('http://local.test/api/v1'), []);
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ root: true });
  });

  it('normalizes trailing slashes before matching', async () => {
    const response = await router.handle(new Request('http://local.test/api/v1/ping'), [
      'ping',
      '',
    ]);
    expect(response.status).toBe(200);
  });

  it('returns 404 NOT_FOUND for an unknown endpoint', async () => {
    const response = await router.handle(new Request('http://local.test/api/v1/nope'), ['nope']);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(response.headers.get('x-request-id')).toBeTruthy();
  });

  it('returns 405 METHOD_NOT_ALLOWED when the path exists under another method', async () => {
    const response = await router.handle(
      new Request('http://local.test/api/v1/ping', { method: 'POST' }),
      ['ping'],
    );
    expect(response.status).toBe(405);
    const body = await response.json();
    expect(body.error.code).toBe('METHOD_NOT_ALLOWED');
    expect(body.error.message).toContain('POST');
  });
});

describe('Router.describe', () => {
  it('prefixes /api/v1, defaults auth to public and keeps summaries', () => {
    const router = new Router().register([
      { method: 'GET', path: '/ping', handler: () => ({}), auth: 'public', summary: 'Ping' },
      { method: 'POST', path: '/things', handler: () => ({}) },
    ]);
    expect(router.describe()).toEqual([
      { method: 'GET', path: '/api/v1/ping', auth: 'public', summary: 'Ping' },
      { method: 'POST', path: '/api/v1/things', auth: 'public' },
    ]);
  });
});
