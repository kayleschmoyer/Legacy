# CLI Command Catalog

Every command registered in `apps/cli/src/main.ts`, grouped by task. Invocation wrappers and per-OS notes: [../SKILL.md](../SKILL.md#the-legacy-sports-cli). Examples below use `./ls-cli.sh` — substitute `.\ls-cli.ps1` (Windows) or `docker compose run --rm cli` (Docker) freely.

**Global options** (any command): `--use-dotenv-file` (default true — reads `.env`), `--log-file <path>` (tee logs to a file).

**Auth model**: commands marked 🔐 call the GraphQL API and need a CLI login (`auth login` — **user-only**, opens a device flow and by default an SSM DB tunnel). Commands without 🔐 talk to the database directly via `.env` credentials. On any auth/expired-token error: stop and surface the hint per [mcp-first Auth Model](../../mcp-first/SKILL.md#auth-model).

**Destructive commands** are marked ⚠️ and gated behind `--confirm`/`--yes`; run `--dry-run` first where available.

## Database connectivity and inspection

| Command               | Purpose                                                  | pnpm shortcut                      |
| --------------------- | -------------------------------------------------------- | ---------------------------------- |
| `test-connection`     | Test DB connection and environment variables             | `pnpm run cli:test-connection`     |
| `test-db`             | Basic DB connectivity test                               | `pnpm run cli:test-db`             |
| `test-raw-connection` | Raw `pg`-driver connection test (bypasses the ORM)       | `pnpm run cli:test-raw-connection` |
| `inspect-database`    | List tables, schemas, and migration status               | `pnpm run cli:inspect-database`    |
| `query-db`            | Run SQL: `query-db --query "SELECT ..." [--format json]` | —                                  |
| `test-internal`       | Check `app_internal` schema state                        | `pnpm run cli:test-internal`       |
| `graphql-test` 🔐     | Execute arbitrary GraphQL queries against the API        | —                                  |

For schema changes never use `query-db` — migrations only ([database](../../database/SKILL.md)).

## Database administration

| Command           | Purpose                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| `run-migrations`  | Apply pending migrations (same engine as `lib/db-client` `db:up`)                                     |
| `reset-database`  | ⚠️ Drop all tables and schemas. Requires `--confirm` and `--db-name <name>` matching the connected DB |
| `fix-users-table` | Create a missing `app_internal.users` table (`pnpm run cli:fix-users-table`)                          |

## Seeding

| Command                 | Purpose                                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seed-dev-data`         | Seed local DB with players + career stats from Baseball Reference. `--letters a,b`, `--stats-limit 25`, `--skip-stats`, `--skip-players`. Idempotent enough to re-run |
| `seed-disclosure-facts` | Populate `player_facts` for the Who Am I? game (`/games/disclosure`). Idempotent                                                                                      |
| `seed-stripe`           | Seed Stripe **test-mode** features/product/prices from the workspace entitlement constants. Refuses `sk_live_` keys; requires `STRIPE_SECRET_KEY`. Idempotent         |

## Data loading — baseball

| Command                       | Purpose                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `load-players`                | Load all players from Baseball Reference (`pnpm run cli:load-players`)                                       |
| `load-career-stats`           | Career stats for players. `--limit N`, `--remote` (via SQS), `--prioritize-new`, `--show-summary`, `--quiet` |
| `load-single-player-stats`    | One player: `--player <bref_id>` (`--remote` for SQS)                                                        |
| `load-game-stats`             | Game-level stats: `--player <bref_id> --season <year>` (both required), `--position <pos>`                   |
| `load-woba-weights`           | FanGraphs wOBA season weights → `woba_season_weights` (`--upsert`)                                           |
| `load-br-park-factors`        | Scrape BPF/PPF park factors → `park_factors` (`--upsert`, `--from`, `--to`)                                  |
| `load-positional-adjustments` | Year-specific positional adjustments → `positional_adjustments` (`--upsert`)                                 |
| `load-on-this-day-events`     | MLB Stats API transactions → `on_this_day_events` (`--from`, `--to`, `--delay <ms>`, `--upsert`)             |

## Data loading — football

| Command                | Purpose                                                                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `load-football-career` | PFR career stats → `career_football_*`. One of `--player-id <id>`, `--all`, `--batch <file>`, or `--limit N` (resumable); `--start-season <year>`                          |
| `queue-players`        | Discover + batch-enqueue players to the stats SQS queue. `--sport baseball\|football` (required), `--letter <x>`, `--skip-queue`. Football scrapes the PFR A–Z index first |

## Stats pipeline operations

| Command                  | Purpose                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `check-stats-status`     | Status of season stats loading                                                                                 |
| `stats-loading-status`   | Per-league/matchup game-stats loading progress. `--league <id>`, `--matchup <id>`, `--watch`, `--interval <s>` |
| `retry-failed-players`   | Re-queue failed player stat loads. `--league`, `--matchup`, `--dry-run`, `--process-dlq` (redrive the DLQ)     |
| `trigger-game-selection` | Trigger game selection to queue pending stats loading                                                          |
| `inspect-sqs-queue`      | Inspect/manage the draft SQS queue (`pnpm run sqs:inspect` / `pnpm run draft:inspect`)                         |

## Player stats readout

Baseball (`--player <bref_id>`, `--format table|json`, `--limit <seasons>`): `get-player-batting`, `get-player-pitching`, `get-player-fielding`, plus `list-players` (`pnpm run cli:list-players`) and `test-add-player`. Detailed walkthrough: [docs/guides/cli-player-stats-commands.md](../../../../docs/guides/cli-player-stats-commands.md).

Football (`--player-id <id>`): `get-player-passing`, `get-player-rushing`, `get-player-receiving`, `get-player-kicking`, `get-player-defense`.

## Users and accounts

| Command                   | Purpose                                                                                                                                                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `add-user`                | Add a user (required before OAuth login works): `--email <email>` required, `--access-level none\|admin`                                                                                                                          |
| `list-users`              | List users with IDs and emails (direct DB)                                                                                                                                                                                        |
| `list-users-auth` 🔐      | Same via authenticated GraphQL (auth-system smoke test)                                                                                                                                                                           |
| `set-user-type`           | Set access level: `--email <email> --type none\|admin`. Runbook: [docs/operations/promote-user-to-admin.md](../../../../docs/operations/promote-user-to-admin.md)                                                                 |
| `find-duplicate-accounts` | Detect duplicate-account pairs from overlapping provider/identity emails (LS-7821). `--limit`, `--format json`                                                                                                                    |
| `merge-accounts`          | ⚠️ Guided merge of a secondary account into a primary (transfers leagues, memberships, identities, subscriptions; anonymises the secondary — LS-7827). `--primary-id`, `--secondary-id` required; `--dry-run` first, then `--yes` |
| `cleanup-test-users`      | ⚠️ Admin-only: delete leaked `int-*@test.legacysports.dev` users (LS-4917). `--dry-run`, `--min-age-days <n>` (default 7), `--yes`                                                                                                |

## Leagues, matchups, drafts

| Command                                      | Purpose                                                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `create-matchup`                             | Create matchup records for players in a matchup (`pnpm run cli:create-matchup`)                                                             |
| `unblock-league`                             | **Recovery**: create all matchups for a stuck league (draft finished, no matchups). `--id <leagueId>` required                              |
| `start-draft`                                | Start a draft (`pnpm run cli:start-draft`)                                                                                                  |
| `test-draft-timer`                           | Inspect/exercise draft pick deadlines and auto-pick. `--league-id`, `--set-deadline <s>`, `--process`, `--status`, `--dry-run`              |
| `compute-scoring`                            | Compute scoring for a matchup                                                                                                               |
| `test-workflow` 🔐                           | End-to-end smoke: create league → draft → matchups → game selection. `--user`, `--teams`, `--weeks`, `--final-week-games`, `--skip-cleanup` |
| `investigate-matchup <matchupId>`            | Why does a matchup have null game numbers                                                                                                   |
| `find-matchup-from-player <matchupPlayerId>` | Map matchup-player ID → matchup ID                                                                                                          |
| `get-league-seasons <leagueId>`              | Seasons with stats available for a league                                                                                                   |
| `investigate-league-13`                      | Historical one-off investigation (kept for reference)                                                                                       |
| `cleanup-test-leagues`                       | ⚠️ Bulk-delete test leagues from E2E/`test-workflow`. `--dry-run`, `--all`, `--pattern <regex>`, `--yes`                                    |
| `delete-league`                              | ⚠️ Permanently delete one league + all related data via CASCADE. `--id` required, `--yes`                                                   |

## Auth and JWT

| Command         | Purpose                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth <action>` | **User-only.** `login` / `logout` / `status` / `switch` / `list`. Login runs a device flow and by default opens an SSM DB tunnel (`--no-db-tunnel`, `--local-port`, `--profile` to adjust) |
| `generate-jwt`  | **User-only.** Device-flow JWT; prints metadata only unless `--reveal` (incompatible with `--log-file`)                                                                                    |
| `decode-jwt`    | Decode/analyze a JWT: `--token <jwt>` required, `--pretty`. Safe for agents — read-only                                                                                                    |

Agents may run `auth status` / `auth list` / `decode-jwt`; `auth login`, `auth switch`, and `generate-jwt` create credentials and are user-only (AGENTS.md Tier 1).

## Reporting

| Command                        | Purpose                                                                                                                                                                                                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `report-to-jira-epic <report>` | Fetch a Playwright report (name like `nightly-12345` / `pr-42` or a GitHub Pages URL) and file a Jira epic + one child per failing test. `--project`, `--epic-summary`, `--issue-type`, `--dry-run`. Needs `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` unless `--dry-run` |

## Troubleshooting

| Symptom                              | Action                                                                                                                                                                                                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsx: not found` / module not found  | `make install` (worktrees: `node scripts/modules-pool/link.mjs`)                                                                                                                                                                                                |
| DB connection fails                  | `make dev-env-health`; verify `.env` (`DATABASE_URL`/`DB_*`); local stack up? (`docker compose ps`). If the error is auth/expired-token: stop and surface the hint per [mcp-first Auth Model](../../mcp-first/SKILL.md#auth-model) — do not run `aws sso login` |
| `Authentication required` on 🔐 cmds | Ask the user to run `auth login`; verify with `auth status`                                                                                                                                                                                                     |
| Unknown command                      | `./ls-cli.sh --help` prints the live list — it is the ground truth over this doc                                                                                                                                                                                |

## Provenance and maintenance

Written 2026-07-02 from the skills audit; catalog transcribed from `apps/cli/src/main.ts` command registrations (the pre-audit doc covered roughly a third of them and prescribed `aws sso login` as a fix — a Tier-1 violation). Re-verify: `grep -n "\.command(" apps/cli/src/main.ts` (command list), `grep -n "\"cli:" package.json` (pnpm shortcuts), `./ls-cli.sh --help` (live output).
