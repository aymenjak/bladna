import { env } from '../env';

/**
 * Feature flags (§99).
 *
 * Resolution order (explicit, no hidden defaults):
 *   1. `FEATURE_<KEY>=true|false` environment override (ops kill switch, wins)
 *   2. `FEATURE_FLAGS=KEY1,KEY2` — comma list of flag keys forced ON
 *   3. `FeatureFlag` rows in the database (managed at /admin/flags)
 *   4. built-in `DEFAULT_FLAGS` below (the product baseline)
 *
 * Flags are cached briefly to keep the hot path cheap; overrides are merged on
 * every read so an env change never needs a restart of the merge logic.
 */

export const DEFAULT_FLAGS: Record<string, boolean> = {
  VOLUNTEER_ID_ENABLED: true,
  QR_CHECKIN_ENABLED: true,
  CERTIFICATES_ENABLED: true,
  CAMPAIGNS_ENABLED: true,
  CSR_ENABLED: true,
  INTERNATIONAL_ENABLED: true,
  INTERNATIONAL_APPLICATIONS: true,
  INTERNATIONAL_PASSPORT: true,
  INTERNATIONAL_SAFETY: true,
  INTERNATIONAL_MATCHING: true,
  INTERNATIONAL_INGESTION: false,
  INTERNATIONAL_PARTNERS: false,
  MESSAGING_ENABLED: true,
  AI_MATCHING_ENABLED: true,
  PAYMENTS_ENABLED: true,
  REGISTRATION_OPEN: true,
  MAINTENANCE_MODE: false,
};

export type FlagMap = Record<string, boolean>;

let lastLoad = 0;
let cached: FlagMap | null = null;

/** Layer 1+2: process environment overrides. */
function envOverrides(): FlagMap {
  const out: FlagMap = {};
  for (const [key, value] of Object.entries(process.env)) {
    const m = key.match(/^FEATURE_([A-Z0-9_]+)$/);
    if (m && m[1] !== 'FLAGS' && (value === 'true' || value === 'false')) {
      out[m[1]] = value === 'true';
    }
  }
  for (const flag of env.featureFlagOverride) {
    const key = flag.toUpperCase();
    if (!(key in out)) out[key] = true;
  }
  return out;
}

export async function getFeatureFlags(force = false): Promise<FlagMap> {
  const now = Date.now();
  const overrides = envOverrides();
  if (!force && cached && now - lastLoad < 5000) return { ...cached, ...overrides };

  const dbFlags: FlagMap = { ...DEFAULT_FLAGS };
  try {
    const { getPrisma } = await import('@bladna/database');
    const prisma = getPrisma();
    const rows = await prisma.featureFlag.findMany({ select: { key: true, enabled: true } });
    for (const row of rows) dbFlags[row.key] = row.enabled;
  } catch {
    // Database unavailable (build time / boot) → defaults still apply.
  }

  cached = dbFlags;
  lastLoad = now;
  return { ...dbFlags, ...overrides };
}

export async function isFeatureEnabled(key: string): Promise<boolean> {
  const flags = await getFeatureFlags();
  return flags[key] ?? DEFAULT_FLAGS[key] ?? false;
}

export function clearFlagCache(): void {
  cached = null;
  lastLoad = 0;
}
