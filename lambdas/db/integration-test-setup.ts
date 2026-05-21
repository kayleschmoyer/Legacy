import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { InternalSchema, PublicSchema } from '@legacy-sports/db-client';

// Re-export the real production schemas — no hand-maintained SQLite mirror.
export { PublicSchema as integrationTestSchema };
// Export internal schema for inserting into app_internal.users (public.users is a view).
export { InternalSchema as integrationTestInternalSchema };

let pool: Pool | undefined;
let db: ReturnType<typeof drizzle<typeof PublicSchema>> | undefined;

function connectionString(): string {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DB integration tests require TEST_DATABASE_URL or DATABASE_URL.\n' +
        'Local: start Docker with `docker compose up -d postgres` then set DATABASE_URL in .env\n' +
        'CI:    provided automatically by the db-integration workflow.',
    );
  }
  return url;
}

// Local Postgres (Docker / CI service container) has no TLS — only enable SSL
// when talking to a remote managed instance. Centralised so individual specs
// that need a fresh, independent Pool (e.g. simulating Lambda cold-start) get
// the same gating as the shared test pool.
function shouldUseSsl(url: string): boolean {
  if (process.env.USE_LOCAL_CREDENTIALS === 'true') return false;
  return !/@(localhost|127\.0\.0\.1)[:/]/.test(url);
}

export function createTestPool(options: { max?: number } = {}): Pool {
  const url = connectionString();
  return new Pool({
    connectionString: url,
    max: options.max ?? 1,
    ssl: shouldUseSsl(url) ? { rejectUnauthorized: false } : false,
  });
}

// Shared test fixtures — seeded once per test run, never deleted.
// Tests that need a league owner reference these; only users.db.spec.ts
// creates and removes its own isolated test users.
export const TEST_USERS = [
  {
    id: 1,
    email: 'test.user@example.com',
    username: 'testuser',
    accessLevel: 'none' as const,
  },
  {
    id: 2,
    email: 'admin@example.com',
    username: 'admin',
    accessLevel: 'admin' as const,
  },
  {
    id: 3,
    email: 'league.owner@example.com',
    username: 'leagueowner',
    accessLevel: 'none' as const,
  },
] as const;

export type TestPlayer = {
  id: number;
  firstName: string;
  lastName: string;
  brefId: string;
};

// Populated by ensureTestFixtures() with real players from the DB.
let _testPlayers: TestPlayer[] = [];

/**
 * Returns real players fetched from the DB at setup time.
 * Guaranteed to have at least 8 entries (enough for 4-team snake-draft tests).
 * Must be called after setupIntegrationTestDatabase().
 */
export function getTestPlayers(): TestPlayer[] {
  if (_testPlayers.length === 0) {
    throw new Error(
      'No test players loaded — call setupIntegrationTestDatabase() first',
    );
  }
  return _testPlayers;
}

// Minimum players required for 4-team × 2-round snake-draft tests (4 × 2 = 8).
const MIN_TEST_PLAYERS = 8;

// Upsert test users and ensure enough player rows exist for draft tests.
// In environments backed by real data (dev RDS via SSM tunnel), the players
// table is already populated and the seed insert is a no-op via ON CONFLICT.
// In CI's ephemeral postgres service container, migrations create an empty
// schema — this seed makes the suite self-sufficient there.
async function ensureTestFixtures(): Promise<void> {
  await db!.execute(sql`
    INSERT INTO app_internal.users (id, email, username, access_level)
    VALUES
      (1, 'test.user@example.com', 'testuser', 'none'),
      (2, 'admin@example.com', 'admin', 'admin'),
      (3, 'league.owner@example.com', 'leagueowner', 'none')
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      username = EXCLUDED.username,
      access_level = EXCLUDED.access_level
  `);

  // Seed users above use explicit IDs (1–3), which do NOT advance the serial
  // sequence. Without this, the next default-id insert returns nextval=1 and
  // collides with the seed row (LS-4682). Fast-forward the sequence past any
  // pre-seeded explicit IDs.
  await db!.execute(sql`
    SELECT setval(
      pg_get_serial_sequence('app_internal.users', 'id'),
      GREATEST((SELECT COALESCE(MAX(id), 0) FROM app_internal.users), 1)
    )
  `);

  const { players } = PublicSchema;
  const [{ count: playerCount }] = await db!
    .select({ count: sql<number>`count(*)::int` })
    .from(players);

  if (playerCount < MIN_TEST_PLAYERS) {
    // bref_id is varchar(10) with a unique constraint. Test fixtures use the
    // `test_` prefix to make them obvious in any DB they leak into.
    await db!.execute(sql`
      INSERT INTO players (first_name, last_name, bref_id)
      VALUES
        ('Test', 'Player01', 'test_p01'),
        ('Test', 'Player02', 'test_p02'),
        ('Test', 'Player03', 'test_p03'),
        ('Test', 'Player04', 'test_p04'),
        ('Test', 'Player05', 'test_p05'),
        ('Test', 'Player06', 'test_p06'),
        ('Test', 'Player07', 'test_p07'),
        ('Test', 'Player08', 'test_p08')
      ON CONFLICT (bref_id) DO NOTHING
    `);
  }

  const rows = await db!
    .select({
      id: players.id,
      firstName: players.firstName,
      lastName: players.lastName,
      brefId: players.brefId,
    })
    .from(players)
    .limit(20);

  if (rows.length < MIN_TEST_PLAYERS) {
    throw new Error(
      `DB integration tests require at least ${MIN_TEST_PLAYERS} players in the players table (found ${rows.length})`,
    );
  }
  _testPlayers = rows;
}

export async function setupIntegrationTestDatabase(): Promise<void> {
  if (pool) return;
  pool = createTestPool({ max: 3 });
  db = drizzle(pool, { schema: PublicSchema });
  await ensureTestFixtures();
}

export async function getTestDatabase() {
  if (!db) await setupIntegrationTestDatabase();
  return db!;
}

// Delete only league-graph data created by tests. Leagues cascade-delete
// teams, drafts, matchups, draft_picks, league_members, etc.
// Test users (IDs 1–3) and real players are never deleted.
export async function cleanupTestData(): Promise<void> {
  if (!db)
    throw new Error(
      'DB not initialized — call setupIntegrationTestDatabase first',
    );
  await db.execute(sql`
    DELETE FROM leagues WHERE owner IN (1, 2, 3)
  `);
  // Also clean up any leagues created with bulk-test users (IDs 100–119)
  await db.execute(sql`
    DELETE FROM leagues WHERE owner BETWEEN 100 AND 119
  `);
  // Remove bulk test users themselves (created by leagues.db.spec bulk test)
  await db.execute(sql`
    DELETE FROM app_internal.users WHERE id BETWEEN 100 AND 119
  `);
}

export async function teardownIntegrationTestDatabase(): Promise<void> {
  await pool?.end();
  pool = undefined;
  db = undefined;
  _testPlayers = [];
}
