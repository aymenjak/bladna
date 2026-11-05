import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from './env';

// ISO 27001 A.8.31: demo credentials must never reach a production build by
// accident — DEMO_MODE alone is not enough there.
describe('env.demoMode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is off unless DEMO_MODE is set', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEMO_MODE', '');
    expect(env.demoMode).toBe(false);
  });

  it('follows DEMO_MODE outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEMO_MODE', 'true');
    expect(env.demoMode).toBe(true);
  });

  it('is ignored in production without the second opt-in', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEMO_MODE', 'true');
    vi.stubEnv('DEMO_MODE_ALLOW_PRODUCTION', '');
    expect(env.demoMode).toBe(false);
  });

  it('works in production only with DEMO_MODE_ALLOW_PRODUCTION=true', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEMO_MODE', 'true');
    vi.stubEnv('DEMO_MODE_ALLOW_PRODUCTION', 'true');
    expect(env.demoMode).toBe(true);
  });
});
