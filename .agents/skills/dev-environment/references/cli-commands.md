# CLI Command Catalog

Every command registered in `apps/cli/src/main.ts`, grouped by task. Invocation wrappers and per-OS notes: [cli-overview.md](cli-overview.md). Examples below use `./ls-cli.sh` — substitute `.\ls-cli.ps1` (Windows) or `docker compose run --rm cli` (Docker) freely.

**Global options** (any command): `--use-dotenv-file` (default true — reads `.env`), `--log-file <path>` (tee logs to a file).

**Auth model**: commands marked 🔐 call the GraphQL API and need a CLI login (`auth login` — **user-only**, opens a device flow and by default an SSM DB tunnel). Commands without 🔐 talk to the database directly via `.env` credentials. On any auth/expired-token error: stop and surface the hint per [mcp-first Auth Model](../../mcp-first/references/auth-and-routing.md#auth-model).

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

| Command                       | Purpose                                                                                                                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `load-players`                | Load all players from Baseball Reference (`pnpm run cli:load-players`)                                                                                                                                |
| `load-career-stats`           | Career stats for players. `--limit N`, `--remote` (via SQS), `--prioritize-new`, `--show-summary`, `--quiet`                                                                                          |
| `load-single-player-stats`    | One player: `--player <bref_id>` (`--remote` for SQS)                                                                                                                                                 |
| `load-game-stats`             | Game-level stats: `--player <bref_id> --season <year>` (both required), `--position <pos>`                                                                                                            |
| `load-woba-weights`           | FanGraphs wOBA season weights → `woba_season_weights` (`--upsert`)                                                                                                                                    |
| `load-br-park-factors`        | Scrape BPF/PPF park factors → `park_factors` (`--upsert`, `--from`, `--to`)                                                                                                                           |
| `load-positional-adjustments` | Year-specific positional adjustments → `positional_adjustments` (`--upsert`)                                                                                                                          |
| `load-on-this-day-events`     | MLB Stats API transactions → `on_this_day_events` (`--from`, `--to`, `--delay <ms>`, `--upsert`)                                                                                                      |
| `ingest-retrosheet`           | Stage the Retrosheet game-level corpus in S3, one object per player-season. `--from`, `--to`, `--force`, `--dry-run`, `--bucket`, `--prefix`. See [annual refresh](#annual-retrosheet-corpus-refresh) |

### Annual Retrosheet corpus refresh

Retrosheet publishes each season's processed CSVs the winter after the season ends. `ingest-retrosheet` defaults to 1897 through last year, and an explicit `--to` can reach the current year. A season whose archive 404s (not published yet) is skipped with a warning, not an error (LS-10232). Until a season is ingested, its player-seasons fall back to the rate-limited Baseball Reference scraper.

- **When:** once a year, after Retrosheet announces the new season on [retrosheet.org](https://www.retrosheet.org/) (usually December–February). Check that `https://www.retrosheet.org/downloads/<year>/<year>csvs.zip` downloads.
- **How:** dispatch the [Corpus Ingest workflow](../../../../.github/workflows/corpus-ingest.yml) (`.github/workflows/corpus-ingest.yml`) with `source=retrosheet`, `from=<year>`, `to=<year>`. Run it first with the default `dry_run=true`, then again with `dry_run=false`. Every run waits for the owner's approval on the `corpus-ingest` environment, and only that environment can assume the `<name_prefix>-corpus-ingest` OIDC role (read/write, no delete, on the two corpus buckets only; LS-10562). The workflow targets the Terraform-managed `<name_prefix>-retrosheet-corpus` bucket, the same value the stats lambda reads from `RETROSHEET_S3_BUCKET`, and writes the per-season lines to the run summary. Agents may dispatch dry runs; a `dry_run=false` run is the owner's call.
- **Local fallback** (a maintainer with AWS credentials for the target account; agents cannot mint them):

  ```bash
  ./ls-cli.sh ingest-retrosheet --from <year> --to <year> --dry-run
  ./ls-cli.sh ingest-retrosheet --from <year> --to <year> --bucket <name_prefix>-retrosheet-corpus
  ```

- **Verify:** the `Season <year>: N player-seasons` log line reports thousands of player-seasons, and the `unmapped` count is small. Players who debuted that season may lack a Chadwick `key_retro` until the Register catches up; re-run with the same range later to pick them up (existing objects are skipped unless `--force`).

## Data loading — football

| Command                    | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `load-football-career`     | PFR career stats → `career_football_*`. One of `--player-id <id>`, `--all`, `--batch <file>`, or `--limit N` (resumable); `--start-season <year>`                                                                                                                                                                                                                                                                                                                                                                                                            |
| `queue-players`            | Discover + batch-enqueue players to the stats SQS queue. `--sport baseball\|football` (required), `--letter <x>`, `--skip-queue`. Football scrapes the PFR A–Z index first                                                                                                                                                                                                                                                                                                                                                                                   |
| `ingest-nflverse-football` | Stage the nflverse football corpus in S3, one object per player-season and per team-defense-season. `--from`, `--to`, `--force`, `--dry-run`, `--bucket`, `--prefix`. See [in-season refresh](#in-season-nflverse-corpus-refresh)                                                                                                                                                                                                                                                                                                                            |
| `seed-football-players`    | Insert football players PFR discovery missed (LS-9968 HOF gap) from nflverse `players.csv`, with authoritative `pfr_id`s and no PFR requests. Insert-only; dry run by default, `--apply` to write (shared dev DB, owner's call). Names come from `display_name` ("Joe Montana"), not the legal `first_name` ("Joseph"); `--repair-names-since <iso>` renames rows an earlier run inserted with the legal name. See [ADR 0023](../../../../docs/decisions/0023-football-player-identity-without-pfr.md) and [backfill order](#football-player-backfill-order) |
| `ingest-pfa-football`      | Stage the Pro Football Archives corpus (1960-1998) in S3, one object per player-season. Crawls profootballarchives.com (rate-limited) and crosswalks names against `players`. `--from`, `--to`, `--force`, `--dry-run`, `--bucket`, `--prefix`. See [PFA corpus ingest](#pfa-corpus-ingest)                                                                                                                                                                                                                                                                  |

### Football player backfill order

Adding missing football players (LS-9968) is a pipeline, and the order matters:

1. `seed-football-players --apply`: players active from 1974 on, with real `pfr_id`s.
2. `seed-pfa-football-players --apply`: players whose careers ended before 1974 (`pfr_id` NULL, `pfa_id` set). It crawls the PFA index and 1960-1998 box scores, so it takes hours.
3. [PFA corpus ingest](#pfa-corpus-ingest) (`source=pfa`): writes 1960-1998 corpus objects for the players added in steps 1-2.
4. `derive-football-season-stats --apply`, then `check-football-hof-coverage`, then `select public.refresh_football_player_scoring_cache(NULL)` so the draft board picks them up.

Do not run step 4 before step 3. `derive-football-season-stats` only picks players with **no** stat rows, so a player derived before their PFA objects exist gets 1999+ seasons only, and their 1960-1998 seasons are then locked out.

### In-season nflverse corpus refresh

Unlike Retrosheet, nflverse publishes the **current** season's weekly stats while the season is being played, so the corpus can (and should) be topped up during the season rather than once a year. `ingest-nflverse-football` defaults to 1999 through the current season — the season that started in September, so January–August still resolves to the previous season's label. A season whose weekly file 404s (not posted yet) is skipped with a warning and named in the final summary, not treated as an error (LS-10235).

- **When:** weekly during the NFL regular season and postseason (roughly September–February), and once more after the season ends to pick up any late corrections. Existing objects are skipped unless `--force`, so a re-run only writes what is new.
- **How:** a manual dispatch of the [Corpus Ingest workflow](../../../../.github/workflows/corpus-ingest.yml) (`.github/workflows/corpus-ingest.yml`) with `source=nflverse`, `from` and `to` set to the current season, `force=true`, and `dry_run=false` (it defaults to `true`; do a dry run first if in doubt). There is deliberately no scheduled trigger: the repo's CI is schedule-free (LS-8487), so each weekly refresh is a dispatch. Every run waits for the owner's approval on the `corpus-ingest` environment, and only that environment can assume the `<name_prefix>-corpus-ingest` OIDC role (LS-10562). The workflow targets the Terraform-managed `<name_prefix>-football-corpus` bucket, the same value the stats lambda reads from `FOOTBALL_CORPUS_S3_BUCKET`, and writes the per-season lines to the run summary. Agents may dispatch dry runs; a `dry_run=false` run is the owner's call.

  Use `force=true` for an in-progress season: the weekly file grows each week, and without it the player-season objects written earlier in the season are skipped as already present.

- **Local fallback** (a maintainer with AWS credentials for the target account; agents cannot mint them):

  ```bash
  ./ls-cli.sh ingest-nflverse-football --from <year> --to <year> --dry-run
  ./ls-cli.sh ingest-nflverse-football --from <year> --to <year> --force --bucket <name_prefix>-football-corpus
  ```

- **Verify:** the `Season <year>: N players in nflverse ...` log line reports the expected player count and the `unmapped` count is small. Players who debuted that season may lack a `pfr_id` in the nflverse crosswalk until it catches up; a later re-run picks them up.

### PFA corpus ingest

`ingest-pfa-football` builds the `pfa/v1/<pfrId>/<season>.json.gz` objects for 1960-1998 (LS-9995). Its name crosswalk resolves each PFA player against the football rows in `players` **at run time**, so a player who was not in `players` during an earlier ingest has no PFA objects. Re-run it after seeding new players (for example the HOF cohort from LS-10585; LS-9971).

- **Why Actions:** the CCR egress proxy rejects profootballarchives.com, so agents cannot run this crawl from a cloud session (LS-10587).
- **How:** dispatch the [Corpus Ingest workflow](../../../../.github/workflows/corpus-ingest.yml) with `source=pfa`. Run it with the default `dry_run=true` first. A dry run still crawls and reads `players`, so it proves both PFA reachability and DB access. Then run it with `dry_run=false`. Every run waits for the owner's approval on the `corpus-ingest` environment. Agents may dispatch dry runs. A `dry_run=false` run is the owner's call.
- **Runtime and splitting:** `PfaRateLimiter` spaces requests at least 3s apart. The full range is about 7,000 regular-season box scores plus the 28-page player index and kicker game logs, so a single 1960-1998 run takes around 6-7 hours. The job timeout for `pfa` is 12h, but the self-hosted pool runs on spot instances, so split the run into season ranges with `from`/`to`, for example `1960`-`1972`, `1973`-`1985`, `1986`-`1998`. Each run crawls the player index again (about 4 minutes). Objects are per season, so the ranges are independent. To resume after a failed or interrupted range, dispatch the same range again: objects already written are skipped unless `force=true`. The crawl is repeated, though, because the crawl itself is not resumable.
- **Verify:** the run summary shows the `PFA ingest: crosswalk resolved N/M` line, then `Season <year>: ...` per season, then `Ingest complete: ...`. A run for newly seeded players should show a higher resolved count than the previous ingest.

#### Prerequisites: DB access

Unlike `nflverse` and `retrosheet`, the `pfa` job reads the dev RDS (LS-10605):

1. **Network:** the job runs on `vars.CI_RUNNER_LABEL` (the self-hosted pool inside the VPC), because the dev RDS is private. `check-migrations-applied.yml` relies on the same path. If that variable is unset, the job falls back to `ubuntu-latest` and the `Check PFA runner` step fails.
2. **Credentials:** the job connects as `corpus_ingest_readonly`, a Postgres role with `SELECT` on `public.players` and the six `public.football_season_*` tables only (the crosswalk reads each player's season span from them; LS-10621). It reads the secret name from the SSM parameter `/legacy-sports/<env>/corpus-ingest/db-creds-secret-name` and passes it to the CLI as `DB_SECRET_NAME`. The `corpus-ingest` OIDC role can read that parameter and that secret, nothing else in SSM or Secrets Manager (`terraform/main/github-actions-corpus-ingest.tf`; the secret is in `terraform/main/secrets.tf`).

**One-time setup** (in this order):

1. `terraform apply` creates the password, the secret, the SSM parameter and the IAM grant.
2. Apply migration `20261005_160000_add_corpus_ingest_readonly_role.ts` (`db_migrate`). It creates the role **without a password**, so it cannot log in yet. A migration-time password env var can silently fall back to a placeholder ([password drift](../../database/references/mcp-role-password-drift.md)), so the migration doesn't set one.
3. A maintainer with AWS credentials sets the role's password from the secret:

   ```bash
   secret=$(aws ssm get-parameter --name /legacy-sports/dev/corpus-ingest/db-creds-secret-name --query Parameter.Value --output text)
   pnpm --prefix lib/db-client run db:resync-role -- --role corpus_ingest_readonly --secret-name "$secret"
   ```

   Re-run it after any regeneration of `random_password.corpus_ingest_readonly_db_password`.

4. Dispatch a short `source=pfa` dry run (for example `from=1998`, `to=1998`) to confirm the runner reaches both profootballarchives.com and RDS.

- **Local fallback** (a maintainer with AWS credentials and a DB connection; agents cannot do either):

  ```bash
  ./ls-cli.sh ingest-pfa-football --from <year> --to <year> --dry-run
  ./ls-cli.sh ingest-pfa-football --from <year> --to <year> --bucket <name_prefix>-football-corpus
  ```

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

| Symptom                              | Action                                                                                                                                                                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsx: not found` / module not found  | `make install` (worktrees: `node scripts/modules-pool/link.mjs`)                                                                                                                                                                                                                      |
| DB connection fails                  | `make dev-env-health`; verify `.env` (`DATABASE_URL`/`DB_*`); local stack up? (`docker compose ps`). If the error is auth/expired-token: stop and surface the hint per [mcp-first Auth Model](../../mcp-first/references/auth-and-routing.md#auth-model) — do not run `aws sso login` |
| `Authentication required` on 🔐 cmds | Ask the user to run `auth login`; verify with `auth status`                                                                                                                                                                                                                           |
| Unknown command                      | `./ls-cli.sh --help` prints the live list — it is the ground truth over this doc                                                                                                                                                                                                      |

## Provenance and maintenance

Written 2026-07-02 from the skills audit; catalog transcribed from `apps/cli/src/main.ts` command registrations (the pre-audit doc covered roughly a third of them and prescribed `aws sso login` as a fix — a Tier-1 violation). Re-verify: `grep -n "\.command(" apps/cli/src/main.ts` (command list), `grep -n "\"cli:" package.json` (pnpm shortcuts), `./ls-cli.sh --help` (live output).
