import Database from 'better-sqlite3';
import { BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { sql } from 'drizzle-orm';
import * as integrationTestSchema from './integration-test-schema';

// Global SQLite database instance
let sqliteDb: Database.Database;
let db: BetterSQLite3Database<typeof integrationTestSchema>;

/**
 * Create essential tables for integration tests
 * We create a minimal schema needed for testing - not the full production schema
 */
async function createTestSchema(
  db: BetterSQLite3Database<typeof integrationTestSchema>,
) {
  console.log('🔄 Creating test database schema...');

  // For now, let's create the minimal tables needed for existing integration tests
  // We'll expand this as we add more integration tests

  // Create leagues table (matching Drizzle schema from Leagues.ts)
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS leagues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      owner INTEGER NOT NULL,
      max_roster_size INTEGER DEFAULT 25,
      current_matchup INTEGER,
      draft_status TEXT DEFAULT 'not-started',
      invite_code TEXT UNIQUE NOT NULL,
      min_games_per_season INTEGER DEFAULT 10,
      games_per_matchup INTEGER DEFAULT 5,
      trade_deadline_week INTEGER,
      roster_lock_timing TEXT DEFAULT 'matchup_start',
      scheduling_strategy TEXT DEFAULT 'round-robin',
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Create teams table
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      league_id INTEGER NOT NULL,
      FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
    )
  `);

  // Create users table (simplified for tests)
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password TEXT,
      access_level TEXT DEFAULT 'none',
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Create league_members table
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS league_members (
      league_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      team_id INTEGER,
      permission_level TEXT,
      PRIMARY KEY (league_id, user_id),
      FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
    )
  `);

  // Create players table (required for team_members foreign key)
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      bref_id TEXT UNIQUE NOT NULL
    )
  `);

  // Create team_members table (for CASCADE delete testing)
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS team_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL,
      league_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      position_id INTEGER,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
      UNIQUE(team_id, player_id)
    )
  `);

  // Create matchups table
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS matchups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      league_id INTEGER NOT NULL,
      week_number INTEGER NOT NULL,
      team1_id INTEGER,
      team2_id INTEGER,
      team1_score TEXT,
      team2_score TEXT,
      status TEXT DEFAULT 'scheduled',
      selected_season INTEGER,
      games_per_matchup INTEGER,
      start_time INTEGER,
      end_time INTEGER,
      UNIQUE(league_id, week_number),
      FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
      FOREIGN KEY (team1_id) REFERENCES teams(id) ON DELETE SET NULL,
      FOREIGN KEY (team2_id) REFERENCES teams(id) ON DELETE SET NULL
    )
  `);

  // Create matchup_players table
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS matchup_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      matchup_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      team_id INTEGER NOT NULL,
      FOREIGN KEY (matchup_id) REFERENCES matchups(id) ON DELETE CASCADE
    )
  `);

  // Create drafts table
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      league_id INTEGER NOT NULL,
      draft_type TEXT NOT NULL,
      date TEXT,
      draft_order TEXT NOT NULL,
      FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
    )
  `);

  // Create draft_teams table
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS draft_teams (
      draft_id INTEGER NOT NULL,
      team_id INTEGER NOT NULL,
      league_id INTEGER NOT NULL,
      draft_order INTEGER NOT NULL UNIQUE,
      FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE,
      FOREIGN KEY (team_id) REFERENCES teams(id),
      FOREIGN KEY (league_id) REFERENCES leagues(id)
    )
  `);

  console.log('✅ Test schema created successfully');
}

/**
 * Start in-memory SQLite database and create test schema
 * Called once before all integration tests
 * Idempotent: safe to call multiple times (lazy initialization)
 */
export async function setupIntegrationTestDatabase(): Promise<void> {
  // Already initialized - skip
  if (db && sqliteDb) {
    return;
  }

  console.log('🗄️  Creating in-memory SQLite database...');

  // Create in-memory SQLite database
  sqliteDb = new Database(':memory:');

  // Enable foreign keys (required for constraint enforcement)
  sqliteDb.pragma('foreign_keys = ON');

  console.log('✅ In-memory database created');

  // Initialize Drizzle ORM with SQLite schema for integration tests
  db = drizzle(sqliteDb, { schema: integrationTestSchema });

  // Create test schema
  await createTestSchema(db);
}

/**
 * Get the database instance for use in tests
 * Auto-initializes on first access (lazy initialization)
 */
export function getTestDatabase() {
  if (!db) {
    // Auto-initialize on first access (each test worker creates its own database)
    setupIntegrationTestDatabase();
  }
  if (!db) {
    throw new Error(
      'Test database not initialized. Did you call setupIntegrationTestDatabase()?',
    );
  }
  return db;
}

/**
 * Get the database client for direct SQL queries
 * Auto-initializes on first access (lazy initialization)
 */
export function getTestClient(): Database.Database {
  if (!sqliteDb) {
    // Auto-initialize on first access (each test worker creates its own database)
    setupIntegrationTestDatabase();
  }
  if (!sqliteDb) {
    throw new Error(
      'Test client not initialized. Did you call setupIntegrationTestDatabase()?',
    );
  }
  return sqliteDb;
}

/**
 * Clean up all data from database tables
 * Called before/after each test for isolation
 */
export async function cleanupTestData(): Promise<void> {
  if (!sqliteDb) {
    throw new Error('Test client not initialized');
  }

  // Delete in order respecting foreign key constraints
  const tables = [
    'league_week_player_seasons',
    'matchup_player_games',
    'matchup_players',
    'matchups',
    'team_members',
    'teams',
    'league_members',
    'league_positions',
    'league_messages',
    'league_scoring_change_log',
    'league_scoring_profile_entries',
    'league_scoring_profiles',
    'draft_teams',
    'drafts',
    'leagues',
    'users',
    'players',
  ];

  // SQLite doesn't have TRUNCATE, use DELETE instead
  for (const table of tables) {
    try {
      sqliteDb.prepare(`DELETE FROM ${table}`).run();
    } catch (error) {
      // Some tables might not exist yet - that's okay
      console.warn(`Warning: Could not clean table ${table}:`, error);
    }
  }

  // Reset auto-increment counters
  try {
    sqliteDb.prepare('DELETE FROM sqlite_sequence').run();
  } catch (error) {
    // Ignore if no auto-increment tables yet
  }
}

/**
 * Stop the database and cleanup resources
 * Called once after all integration tests
 */
export async function teardownIntegrationTestDatabase(): Promise<void> {
  console.log('🧹 Shutting down integration test environment...');

  if (sqliteDb) {
    sqliteDb.close();
    console.log('✅ Database closed');
  }

  console.log('✅ Integration test environment cleaned up');
}

// Export the schema for use in integration tests
export { integrationTestSchema };
