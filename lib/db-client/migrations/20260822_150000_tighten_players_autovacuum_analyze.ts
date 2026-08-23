import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Tighten per-table autoanalyze thresholds on players (LS-9485)
 *
 * Root-cause context: players.last_autoanalyze sat at 2026-06-05 for 2.5
 * months (found 2026-08-20) despite n_mod_since_analyze reaching 171,250 —
 * ~77x the default analyze-eligibility threshold (50 + 0.05 * n_live_tup ≈
 * 2,233 for this table's ~43.7k rows). Comparing pg_stat_user_tables across
 * the schema shows every other busy table (player_scoring_cache,
 * matchup_player_games, football_season_* stat tables, etc.) autoanalyzed
 * correctly and recently, several within the same day this was investigated —
 * so this is not a global autovacuum misconfiguration (autovacuum is on,
 * default thresholds, autovacuum_max_workers = 3, no per-table reloption
 * override existed on `players`). Plain autovacuum (VACUUM) on `players`
 * continued to run successfully throughout the window (19 autovacuum cycles,
 * most recently the same morning as the LS-9477 nfl_team backfill migration),
 * ruling out a persistent table-level lock or long-running-transaction block
 * for the whole quarter — that would have stalled VACUUM too, since both
 * acquire the same ShareUpdateExclusiveLock. No replication slots, prepared
 * transactions, or idle-in-transaction sessions were present at investigation
 * time either.
 *
 * `players` is also the single busiest churn point for schema DDL in the
 * repo: 15+ `ALTER TABLE players ADD COLUMN` migrations plus a
 * `CREATE INDEX CONCURRENTLY` migration landed in the same window
 * (2026-06-10 through 2026-07-27) immediately following the last successful
 * autoanalyze — the only table in the schema with this DDL density. This
 * dev instance has no CloudWatch log export and both Performance Insights
 * and Enhanced Monitoring are disabled (terraform/main/database.tf, cost
 * savings), so there is no way to retrieve the actual autovacuum
 * skip/error reason from that window — the exact trigger inside autovacuum
 * could not be conclusively proven from database state alone, only that the
 * failure is specific to this table and correlates with its DDL churn.
 *
 * Remediation: rather than rely on pinning the exact mechanism, tighten this
 * table's own autoanalyze trigger well below the schema default so any
 * future skip (whatever the cause) self-heals in a small fraction of the
 * modification volume instead of accumulating for a full quarter. New
 * threshold: 20 + 0.01 * n_live_tup (~456 rows at current size, vs ~2,233
 * under the default) — roughly 5x more sensitive.
 *
 * See LS-9485 Jira comments for the full investigation writeup and the
 * monitoring-gap note answering "what would have caught this sooner."
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase generic is untyped across the runner/lambda sandbox boundary
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.players SET (
      autovacuum_analyze_scale_factor = 0.01,
      autovacuum_analyze_threshold = 20
    );
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase generic is untyped across the runner/lambda sandbox boundary
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.players RESET (
      autovacuum_analyze_scale_factor,
      autovacuum_analyze_threshold
    );
  `);
};
