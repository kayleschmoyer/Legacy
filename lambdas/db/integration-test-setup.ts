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

// Upsert test users so they exist before any test runs.
// Players are real data already in the DB — no insert needed.
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

  // Load real players from the DB for use in tests
  const { players } = PublicSchema;
  const rows = await db!
    .select({
      id: players.id,
      firstName: players.firstName,
      lastName: players.lastName,
      brefId: players.brefId,
    })
    .from(players)
    .limit(20);

  if (rows.length < 8) {
    throw new Error(
      `DB integration tests require at least 8 players in the players table (found ${rows.length})`,
    );
  }
  _testPlayers = rows;
}

export async function setupIntegrationTestDatabase(): Promise<void> {
  if (pool) return;
  pool = new Pool({
    connectionString: connectionString(),
    max: 3,
    ssl: { rejectUnauthorized: false },
  });
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
