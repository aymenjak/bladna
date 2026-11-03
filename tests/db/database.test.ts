// DB-gated integration suite (spec §150/§151: integration tests exist and run
// wherever a database exists — and never fail a machine without one).
//
// Contract: a single connectivity probe runs at collection time and
// `describe.skipIf` skips every case when it fails, because vitest does not
// load the root `.env` and CI jobs (or dev machines) may have no reachable
// PostgreSQL:
//   - `DATABASE_URL` unset            → skip (fresh clone / CI without a DB),
//   - set but unreachable/auth-refused → skip (this machine: local postgres
//     lacks the `bladna_app` role; CI before the service step exists),
//   - set and reachable               → the assertions below run.
//
// All cases are strictly read-only. They cover what offline tooling cannot:
// migration state, migration `0006`'s exact contract, and schema ↔ database
// table coverage in both directions. CI applies migrations
// (`npm run db:migrate:deploy`) before `npm test`, so a reachable CI database
// is a migrated one.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { getPrisma, pingDatabase } from '@bladna/database';

// Same env contract as `next.config.ts` / `prisma.config.ts`: a missing root
// `.env` is a no-op and real environment variables win.
const rootEnv = path.join(process.cwd(), '.env');
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

const probe = process.env.DATABASE_URL
  ? await pingDatabase(5000)
  : { ok: false, error: 'DATABASE_URL not set' };

if (!probe.ok) {
  const reason = (probe.error ?? 'database unreachable').replace(/\s+/g, ' ').slice(0, 160);
  console.warn(
    `[tests/db] skipped — ${reason}. ` +
      'Set DATABASE_URL and run `npm run db:migrate:deploy` to enable this suite.',
  );
}

/** Model name → table name (`@@map` when declared, else the model name). */
function schemaTables(source: string): string[] {
  const tables: string[] = [];
  for (const match of source.matchAll(/^model\s+(\w+)\s*\{/gm)) {
    const start = match.index;
    let depth = 0;
    let index = start;
    for (; index < source.length; index++) {
      if (source[index] === '{') depth += 1;
      if (source[index] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const block = source.slice(start, index + 1);
    const mapped = /@@map\(\s*"([^"]+)"\s*\)/.exec(block);
    tables.push(mapped ? (mapped[1] as string) : (match[1] as string));
  }
  return tables;
}

const db = describe.skipIf(!probe.ok);

afterAll(async () => {
  await getPrisma()
    .$disconnect()
    .catch(() => undefined);
});

db('database integration', () => {
  const prisma = getPrisma();

  it('has every migration folder applied, finished and not rolled back', async () => {
    const migrationsDir = path.join(process.cwd(), 'packages', 'database', 'prisma', 'migrations');
    const expected = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(expected.length).toBeGreaterThanOrEqual(6);

    const rows = await prisma.$queryRaw<
      Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>
    >`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations`;

    // A failed attempt leaves a row with finished_at NULL next to its later
    // successful retry, so judge per name: finished at least once, never
    // rolled back — and exactly the folders that exist on disk.
    const finished = new Set(
      rows
        .filter((row) => row.finished_at !== null && row.rolled_back_at === null)
        .map((row) => row.migration_name),
    );
    expect([...finished].sort()).toEqual(expected);
    expect(
      rows.filter((row) => row.rolled_back_at !== null).map((row) => row.migration_name),
    ).toEqual([]);
  });

  it('applied migration 0006 as three NOT NULL boolean columns defaulting to true', async () => {
    const columns = await prisma.$queryRaw<
      Array<{ column_name: string; is_nullable: string; column_default: string | null }>
    >`
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'VolunteerProfile'
        AND column_name IN ('showWilaya', 'showHours', 'showCertificates')`;

    expect(columns.map((column) => column.column_name).sort()).toEqual([
      'showCertificates',
      'showHours',
      'showWilaya',
    ]);
    for (const column of columns) {
      expect(column.is_nullable, `${column.column_name} must be NOT NULL`).toBe('NO');
      expect(column.column_default, `${column.column_name} default`).toBe('true');
    }
  });

  it('keeps schema.prisma and the database tables in agreement (both directions)', async () => {
    const schemaSource = readFileSync(
      path.join(process.cwd(), 'packages', 'database', 'prisma', 'schema.prisma'),
      'utf8',
    );
    const declared = new Set(schemaTables(schemaSource));
    expect(declared.size).toBeGreaterThanOrEqual(70);

    const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
    const present = new Set(rows.map((row) => row.table_name));

    // Underscore tables are Prisma's own (`_prisma_migrations`).
    const missing = [...declared].filter((table) => !present.has(table)).sort();
    const extra = [...present]
      .filter((table) => !declared.has(table) && !table.startsWith('_'))
      .sort();
    expect(missing, 'tables the schema declares that migrations never created').toEqual([]);
    expect(extra, 'tables migrations created that the schema no longer declares').toEqual([]);
  });
});
