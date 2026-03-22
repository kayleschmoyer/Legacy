# Custom Fantasy Baseball Scoring Data Model

Project: LS-6 Custom Fantasy Baseball Scoring Platform / Story LS-7
Date: October 16, 2025
Status: In Progress (backend/API integration)
Branch: `LS-7/design-league-scoring-data-model`

## Objective

- Persist per-league scoring multipliers across batting, pitching, and fielding stats.
- Ensure multipliers stay within fantasy-friendly bounds with auditable validation.
- Support default seeding so existing leagues continue to compute scoring without manual input.

## References

- lib/scoring/src/baseball/DefaultScoring.ts (current default multipliers)
- lib/db-client/src/drizzle/public/models/Statistics.ts (stat column names)
- lib/db-client/src/drizzle/public/models/Leagues.ts (league and team tables)
- docs/architecture/database-schema.md (current ERD baseline)
- docs/api/graphql-schema.md (LeagueSettings.scoring placeholder)

## Implementation Notes

- Migration `lib/db-client/migrations/0009_create_league_scoring_tables.sql` defines the new enums, tables, triggers, and seeds and has been applied to the development database.
- `lib/db-client/src/drizzle/public/models/Scoring.ts` plus related type exports represent the schema in Drizzle.
- `ScoringService` (`lib/db-client/src/lib/services/ScoringService.ts`) exposes helpers to load multipliers and active profiles; `getScoringMultipliersForLeague` is now available for consumers.
- CLI command `apps/cli/src/commands/computeScoring.ts` reads league-specific multipliers when a `--league` argument is supplied, falling back to database defaults.
- GraphQL layer exposes scoring data via `leagueScoringProfile`, `defaultScoringProfile`, `scoringDefinitions`, and a `League.scoringProfile` field (`lambdas/db/src/schema/scoring.ts`).
- Commissioners can persist multiplier overrides via the `updateLeagueScoringProfile` GraphQL mutation, which enforces role-based access control and stat validation triggers.
- Mobile roster view (`apps/app/src/app/(app)/baseball/team/[teamId].tsx`) now loads `leagueScoringProfile` to apply league-configured multipliers in lineup projections and box scores.

## Current State Summary

- League scoring is hard-coded in application code (DefaultScoring exports) and not stored in PostgreSQL.
- There is no database representation of scoring profiles, so leagues cannot customize multipliers.
- Existing tables (`leagues`, `teams`, `matchups`, etc.) have no foreign keys that would conflict with new scoring tables.

## Proposed Database Additions

### New Enum: `scoring_stat_group`

Values: `batting`, `pitching`, `fielding`.

Used to segment stat definitions and drive downstream validation/UI grouping.

### Table: `scoring_stat_definitions`

| Column               | Type                     | Notes                                                     |
| -------------------- | ------------------------ | --------------------------------------------------------- |
| `id`                 | SERIAL PK                | Stable identifier for FK references.                      |
| `stat_key`           | VARCHAR(64) UNIQUE       | Machine key (e.g., `batting_hr`). Maps to code constants. |
| `group`              | `scoring_stat_group`     | Batting, pitching, or fielding.                           |
| `source_table`       | VARCHAR(48)              | References upstream table name (`season_batting`, etc.).  |
| `source_column`      | VARCHAR(48)              | Column in source table (`hr`, `outs_recorded`, etc.).     |
| `display_name`       | VARCHAR(80)              | Human label for UI.                                       |
| `description`        | TEXT                     | Longer explanation for docs/UI tooltips.                  |
| `default_multiplier` | NUMERIC(6,3)             | App defaults (copied from DefaultScoring today).          |
| `min_multiplier`     | NUMERIC(6,3)             | Lower bound for validation.                               |
| `max_multiplier`     | NUMERIC(6,3)             | Upper bound for validation.                               |
| `step_size`          | NUMERIC(4,3)             | Optional UI increment (default 0.5).                      |
| `created_at`         | TIMESTAMP WITH TIME ZONE | Default `now()`.                                          |
| `updated_at`         | TIMESTAMP WITH TIME ZONE | Managed by trigger.                                       |

Indexes and constraints:

- Unique constraint on `stat_key`.
- Partial index on `(group)` to support admin filtering.

### Table: `league_scoring_profiles`

| Column                   | Type                               | Notes                                                                                      |
| ------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `id`                     | SERIAL PK                          | Profile identifier.                                                                        |
| `league_id`              | INTEGER FK -> `leagues.id`         | Owning league.                                                                             |
| `profile_name`           | VARCHAR(64)                        | Defaults to `Default`.                                                                     |
| `season_year`            | SMALLINT                           | Null initially; reserved for future seasonal versioning.                                   |
| `status`                 | ENUM (`draft`,`active`,`archived`) | Use existing `draft_status`? Proposed new enum `scoring_profile_status`. Default `active`. |
| `is_default`             | BOOLEAN                            | Exactly one true per league enforced by partial unique index.                              |
| `copied_from_profile_id` | INTEGER FK self-reference          | Optional pointer for cloning history.                                                      |
| `created_at`             | TIMESTAMP WITH TIME ZONE           | Default `now()`.                                                                           |
| `updated_at`             | TIMESTAMP WITH TIME ZONE           | Updated on write.                                                                          |
| `activated_at`           | TIMESTAMP WITH TIME ZONE           | When profile became active.                                                                |

Indexes and constraints:

- Unique partial index `league_scoring_profiles_unique_default` on `(league_id)` where `is_default = true`.
- Foreign keys on `league_id` and `copied_from_profile_id` (self FK with `ON DELETE SET NULL`).

### Table: `league_scoring_profile_entries`

| Column               | Type                                        | Notes                                                         |
| -------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| `id`                 | SERIAL PK                                   | Entry identifier.                                             |
| `profile_id`         | INTEGER FK -> `league_scoring_profiles.id`  | Owning profile.                                               |
| `stat_definition_id` | INTEGER FK -> `scoring_stat_definitions.id` | Which stat is customized.                                     |
| `multiplier`         | NUMERIC(6,3)                                | Custom multiplier.                                            |
| `is_enabled`         | BOOLEAN                                     | Allows disabling a stat without deleting entry. Default true. |
| `created_at`         | TIMESTAMP WITH TIME ZONE                    | Default `now()`.                                              |
| `updated_at`         | TIMESTAMP WITH TIME ZONE                    | Updated on write.                                             |

Indexes and constraints:

- Unique constraint on `(profile_id, stat_definition_id)`.
- Check constraint `CHECK (multiplier BETWEEN -50 AND 50)` as coarse safeguard.
- Trigger `validate_multiplier_bounds` to enforce stat-specific min/max from `scoring_stat_definitions`.

### Table: `league_scoring_change_log` (audit)

| Column                | Type                                        | Notes                             |
| --------------------- | ------------------------------------------- | --------------------------------- |
| `id`                  | BIGSERIAL PK                                |                                   |
| `profile_id`          | INTEGER FK -> `league_scoring_profiles.id`  |                                   |
| `stat_definition_id`  | INTEGER FK -> `scoring_stat_definitions.id` |                                   |
| `previous_multiplier` | NUMERIC(6,3)                                | Null for inserts.                 |
| `new_multiplier`      | NUMERIC(6,3)                                |                                   |
| `changed_by`          | INTEGER FK -> `users.id` (nullable)         | Tracks commissioner/automation.   |
| `changed_at`          | TIMESTAMP WITH TIME ZONE                    | Default `now()`.                  |
| `change_reason`       | VARCHAR(120)                                | Optional justification.           |
| `action`              | ENUM (`created`,`updated`,`disabled`)       | New enum `scoring_change_action`. |

Rationale: provides audit trail for commissioner approvals and rollback decisions.

### Relationships Overview

- `leagues` 1 -> N `league_scoring_profiles` (default profile flagged by boolean).
- `league_scoring_profiles` 1 -> N `league_scoring_profile_entries`.
- `scoring_stat_definitions` 1 -> N `league_scoring_profile_entries`.
- `league_scoring_profile_entries` 1 -> N `league_scoring_change_log`.

### Triggers and Functions

1. `set_timestamp_columns` on all new tables to keep `updated_at` current.
2. `validate_multiplier_bounds` on `league_scoring_profile_entries` to ensure `multiplier` is between `min_multiplier` and `max_multiplier` from `scoring_stat_definitions` (raise exception with context message).
3. `log_scoring_profile_change` AFTER INSERT/UPDATE/DELETE on `league_scoring_profile_entries` writing to `league_scoring_change_log`.
4. Optional `enforce_single_active_profile` trigger on `league_scoring_profiles` to prevent multiple `status='active' AND is_default=true` per league if we allow archived records to retain `is_default` flag.

## Default Seeding Strategy

1. Insert rows in `scoring_stat_definitions` for every stat currently present in DefaultScoring (batting, pitching, fielding). Use existing multipliers for `default_multiplier`, and populate generic bounds:
   - Batting: min -10, max 10, step 0.5.
   - Pitching: min -15, max 15, step 0.5 (outs recorded capped at 5.0 to prevent runaway values).
   - Fielding: min -10, max 10, step 0.5.
2. For each existing league in `leagues`, create a `league_scoring_profiles` record (`profile_name = 'Default'`, `is_default = true`, `status = 'active'`).
3. Bulk insert `league_scoring_profile_entries` using `default_multiplier` from definitions.
4. Record each seed insert in `league_scoring_change_log` with `action='created'` and `changed_by = null` but `change_reason = 'Initial migration seed'`.
5. Update application code to retrieve scoring via `league_scoring_profile_entries`, falling back to `default_multiplier` if a profile is missing (defensive coding for partially migrated environments).

## Validation Rules for Multipliers

- Enforce numeric bounds via per-stat `min_multiplier` and `max_multiplier` columns and trigger.
- Require increments of 0.5 by checking `((multiplier * 2) % 1 = 0)` inside trigger (allows 0.5 increments). Allow configuration per stat using `step_size`.
- Disallow disabling critical stats if `is_enabled=false` leads to zero scoring (list of required stats configured in definition table with boolean `is_required` flag). Add `is_required` column to `scoring_stat_definitions` to support this rule.
- For stats with known negative direction (e.g., strikeouts, earned runs), store `enforce_negative` boolean to prevent positive multipliers that would reward negative outcomes.
- Validate that positive-only stats (e.g., home runs) cannot have negative multipliers if `enforce_positive` flag set.
- Provide check to ensure multipliers are not null; empty entries must use `is_enabled=false` rather than null multiplier.

## Migration Plan

1. Create enums `scoring_stat_group`, `scoring_profile_status`, and `scoring_change_action`.
2. Create tables in order: `scoring_stat_definitions`, `league_scoring_profiles`, `league_scoring_profile_entries`, `league_scoring_change_log`.
3. Define triggers and supporting PL/pgSQL functions (timestamp update, multiplier validation, audit logging).
4. Seed `scoring_stat_definitions` with records derived from DefaultScoring constants.
5. Seed `league_scoring_profiles` and `league_scoring_profile_entries` for existing leagues inside a transaction. Use `INSERT ... SELECT` to bulk seed.
6. Backfill audit log entries for seed data.
7. Grant access rights in `public` schema for API role if required (match existing migration patterns).
8. Deploy application changes that read scoring from the new tables, retaining fallback to default constants until migration verified.

### Rollback Strategy

- Application code should tolerate missing tables by relying on existing DefaultScoring constants.
- To rollback database changes: drop audit triggers, drop new tables in reverse dependency order, drop new enums last. Because seed inserts occur in the same migration transaction, a failure automatically reverts. Provide a down migration script that removes default profile rows and definitions if rollback occurs after deployment.

## Acceptance Test Outline (Post-Migration)

1. **Schema verification**: Confirm tables, indexes, and triggers exist (check `information_schema` via automated migration test).
2. **Seed data integrity**: For a known league, the number of profile entries matches number of stat definitions and multipliers equal defaults.
3. **Validation enforcement**:
   - Attempt to insert multiplier outside of bounds -> expect error `scoring_multiplier_out_of_range`.
   - Attempt to set positive multiplier on stat flagged `enforce_negative=true` -> expect error.
   - Attempt to insert value off step size -> expect error.
4. **Audit logging**: Update a multiplier and verify new row in `league_scoring_change_log` with previous and new values.
5. **Default fallback**: Temporarily delete a league profile (test fixture) and ensure app/service falls back to definitions defaults without error.
6. **Performance smoke**: Run scoring computation job using new profile data; ensure `computeScoring` receives multiplier map built from DB and execution time within existing budget (measure on staging sample).

## Open Questions for Backend Lead

- Do we anticipate multiple concurrent scoring profiles per league (e.g., preseason editing)? If yes, add `effective_start`/`effective_end` columns and unique constraint on overlapping ranges.
- Should `league_scoring_change_log.changed_by` reference `league_members.user_id` instead of global `users.id`?
- Are there additional stat groups beyond batting/pitching/fielding we should reserve for (e.g., team defense)?
- Confirm acceptable multiplier bounds and step sizes; adjust defaults accordingly.
