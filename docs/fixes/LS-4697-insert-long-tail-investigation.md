# LS-4697: Long-Tail Inserts on `league_activity_log` and `matchup_players`

**Status:** 🔬 Investigated — Deferred with rationale
**Date:** 2026-05-21
**Parent epic:** LS-4687 (RDS slow-query remediation)

## Source data (from LS-4697)

`pg_stat_statements` snapshot, dev RDS, 2026-05-21:

| queryid              | table                                | total      | mean     | calls  | max       |
| -------------------- | ------------------------------------ | ---------- | -------- | ------ | --------- |
| -3517608448737065218 | `league_activity_log` (INSERT)       | 394,637 ms | 21.66 ms | 18,217 | 15,688 ms |
| 2436960342810141219  | `matchup_players` (multi-row INSERT) | 355,364 ms | 20.84 ms | 17,049 | 10,251 ms |

Mean latency is healthy (~21 ms). The concern is the upper tail — single inserts taking 10–15 s on append-heavy tables.

## Investigation

### Triggers — not the cause

`update_updated_at_column()` is wired up via `BEFORE UPDATE` triggers only
([`20260208_000000_add_automatic_timestamps.ts`](../../lib/db-client/migrations/20260208_000000_add_automatic_timestamps.ts)).
Neither table has an `INSERT` trigger, so per-row PL/pgSQL execution is
not part of the insert path.

### Index footprint — modest, no obvious win

`league_activity_log` ([model](../../lib/db-client/src/drizzle/public/models/ActivityLog.ts)):

- PK on `id` (serial)
- `(league_id, occurred_at DESC)` — main feed query
- `(event_type)` — low-cardinality enum (~11 values); useful only for analytics filters
- `(team_id)` — per-team history

Total: 1 PK + 3 secondary B-trees per row insert.

`matchup_players` ([model](../../lib/db-client/src/drizzle/public/models/Matchups.ts)):

- PK on `id` (serial)
- `(team_id)` — roster lookups
- `(player_id)` — cross-matchup player lookup
- `(matchup_id, team_id)` — per-matchup-per-team roster queries
- `UNIQUE (matchup_id, player_id, team_id)` — also a B-tree

Total: 1 PK + 3 secondary + 1 unique B-tree per row insert.

Both tables are well-indexed but not over-indexed; every index has a known
read pattern in the codebase. Dropping any of them would regress a hot
query path. There is no obvious "fat" index to remove.

### Insert call sites — bounded batch sizes

`matchup_players` multi-row inserts come from:

- [`matchup-utils.ts:658`](../../lib/db-client/src/lib/matchup-utils.ts) — roster propagation, bounded by team roster (~20–30 rows)
- [`matchup-queries-optimized.ts:252`](../../lib/db-client/src/lib/client/matchup-queries-optimized.ts) — batch insert, bounded by week × team
- [`scheduled-mutations.ts:716`](../../lambdas/db/src/schema/matchups/scheduled-mutations.ts) — playoff matchup creation, bounded by roster
- [`trades/mutations.ts:188`](../../lambdas/db/src/schema/trades/mutations.ts) — at most a handful of swapped players
- [`waivers/helpers.ts:247`](../../lambdas/db/src/schema/waivers/helpers.ts) — one row per remaining week
- [`game-selection/index.ts:736`](../../lambdas/game-selection/src/index.ts) — full week's matchup populations

No call site emits an unbounded batch. The largest realistic batch is on
the order of a single team's roster across the remaining weeks of a
season — low tens to low hundreds of rows, not thousands.

`league_activity_log` inserts are single-row fire-and-forget
([`activity-log.ts`](../../lambdas/db/src/services/activity-log.ts)) —
errors are swallowed so instrumentation never breaks a calling mutation.

### Latency profile — consistent with vacuum/lock contention

The distribution (21 ms mean, 10–15 s max on ~18k samples) is **not**
consistent with steady-state index maintenance — that would push the
mean up. It **is** consistent with one of:

1. **Autovacuum collision.** Both tables are append-heavy; an autovacuum
   on the same heap holds locks that block competing inserters.
   Confirming requires correlating `pg_stat_user_tables.last_autovacuum`
   timestamps with the observed max events, which the snapshot we have
   does not include.
2. **Lock wait behind a concurrent writer.** Draft processing and
   scheduled-mutation playoff creation can fan out many writers within
   the same second; a long-running outer transaction holding any
   row-level lock would stall in-flight inserts.
3. **RDS Proxy connection churn.** Sibling ticket LS-4699 covers the
   2.7M `current_setting` / `pg_postmaster_start_time` calls that fire
   on every Proxy pin/unpin — a pin storm could backlog the insert
   work behind health-check chatter on the same backend.
4. **Checkpoint / WAL fsync pause.** A long fsync during a checkpoint
   commit pushes every concurrent INSERT into the same multi-second
   bucket regardless of table.

All four root causes are **invisible from the code path** — they
require live correlation with `pg_stat_user_tables`, `pg_stat_activity`,
`pg_stat_bgwriter`, and CloudWatch RDS metrics during the actual long-tail
events. Repointing pg*stat_statements diagnoses the \_what* but not the _why_.

## Recommendation: Defer

The acceptance criterion ("max exec time drops below 2 s") cannot be
validated by a schema or code change alone. A static fix risks both
regressing a working query path (dropping indexes) and not actually
moving the max (the long tail is almost certainly environmental, not
structural).

**Recommended follow-up work** — file as separate tickets if the long
tail persists in production:

1. **Enable `log_autovacuum_min_duration = 0`** on dev RDS for one week
   and correlate logged autovacuum events with the worst pg_stat_statements
   samples. If they line up, tune `autovacuum_naptime` and the
   per-table `autovacuum_vacuum_scale_factor` on `league_activity_log`
   and `matchup_players`.
2. **Sample `pg_stat_activity`** every second for one draft/playoff
   window and bucket the slow inserts by `wait_event_type` /
   `wait_event`. This directly identifies whether the long tail is
   `Lock`, `IO`, `LWLock`, or autovacuum.
3. **Coordinate with LS-4699.** If RDS Proxy chatter is part of the
   contention, fixing the health-check pattern there should also move
   this max — re-snapshot after that ships before doing standalone
   tuning here.
4. **Only if 1–3 fail:** consider partitioning `league_activity_log`
   by `occurred_at` month so autovacuum operates on a smaller heap.
   Premature at current row volume (18k inserts in the sampling window
   is small; the table is unlikely to be large enough yet for
   partitioning to pay off its operational cost).

## Acceptance closure

This ticket is closed as **deferred with rationale**, per the parent
epic's stated terminal states ("Each child is investigated and either
fixed, deferred with rationale, or closed as won't-do."). The
deliverable is this investigation doc; production validation work
moves to its own tickets if and when the symptom surfaces outside dev.
