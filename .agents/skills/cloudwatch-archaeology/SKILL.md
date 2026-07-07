---
name: cloudwatch-archaeology
description: 'Recover the server-side truth from CloudWatch logs and the dev RDS when client-side narratives lie. Load when: E2E stdout is opaque (n/a, stuck, timeout, silent count mismatch), a Rollbar payload lacks the server story, a fix keeps shifting the symptom, or you need what a Lambda/cron actually did during a test window. Covers the query chain (log groups → filter → cross-reference IDs → DB fallback) and a worked example from LS-4295.'
metadata:
  scope: 'lambdas/**, apps/web-e2e/**'
---

# Skill: CloudWatch Log Archaeology

## Overview

E2E test stdout lies. A draft "stuck at pick 10" may actually mean the server advanced picks 1–13 successfully and then a cron stopped finding expired drafts. A `picksAutoMade=n/a` line may conceal a `ForbiddenError("You are not a member of this league")` that only surfaces in the Lambda logs.

This skill documents when to reach for CloudWatch (and the live RDS) instead of trusting the test reporter, and gives the concrete query chain to do it efficiently.

This is the second-most common debugging gotcha in this repo (after "make pc passes but live behavior is broken" — see the `debugging` skill). Reach for it early on any distributed system failure where the test narrative is opaque. Production-error triage (Rollbar tool surface + error-classification convention) is homed in [debugging/references/prod-errors.md](../debugging/references/prod-errors.md) — pivot here from there when the Rollbar payload lacks the server-side story.

**Access precondition:** every step needs AWS read access. Prefer the MCP tools (`aws_logs_filter`, `aws_logs_tail`, `aws_secretsmanager_*` from the aws server; `db_query` from the hosted DB server) over raw `aws` CLI — see [mcp-first](../mcp-first/SKILL.md). If any call returns an auth/expired-token error, stop and surface the hint verbatim; auth-generation commands are user-only (Tier 1, see [mcp-first Auth Model](../mcp-first/SKILL.md#auth-model)). Cloud agents have no AWS — route through [cloud-teleport](../cloud-teleport/SKILL.md).

## When to Invoke

Invoke this skill when **any** of the following is true:

- Test stdout reports an opaque failure: `n/a`, "stuck", "timeout", `undefined`, or a bare count mismatch with no actionable cause
- A previous fix appears to have shifted the symptom rather than resolved it (oscillation pattern across multiple regressions — e.g. LS-4289)
- A mutation or cron job is suspected of returning an error but the test only logs a top-level result, not the server response
- You need to know what the server actually did during a test window — pick counts advanced, cron firings, JWT issuance — rather than what the client reported
- Any time the server's perspective on draft / league / mutation state would resolve ambiguity that client logs cannot

**Do not use** this skill for single-tool-call answers (a TypeScript error, a missing import, a CSS regression) or failures the project's existing test reports already explain fully. See [When NOT to Use](#when-not-to-use).

## Core Methodology

### Step 1 — Establish the Failure Window

Read `stats.startTime` and `duration` from the Playwright JSON report to get absolute UTC bounds. Then cross-reference with test elapsed-time markers in stdout (e.g. `+251.4s miss #10`) to convert relative timestamps to absolute UTC.

```bash
# Playwright JSON report lives in test output directory
cat playwright-report/results.json | python3 -c "
import json, sys
r = json.load(sys.stdin)
print(r['stats']['startTime'], r['stats']['duration'])
"
```

This gives you `--start-time` / `--end-time` values in milliseconds for `aws logs filter-log-events`.

### Step 2 — Pick the Log Group

Deployed Lambda log groups follow `/aws/lambda/legacy-sports-dev-<name>` (Terraform `function_name = "${local.name_prefix}-<name>"` with `name_prefix = legacy-sports-dev`). Quick recent-errors view by short name: `aws_logs_tail(function: "graphql")` (short names: `graphql`, `db`, `oauth-proxy`, `game-selection`, `stats-lambda`, `draft-processor`, `websocket`, ...).

Common log groups for draft/league flows:

| Group                                          | What it captures                                 |
| ---------------------------------------------- | ------------------------------------------------ |
| `/aws/lambda/legacy-sports-dev-graphql`        | All resolver calls, inline JSON with IDs, errors |
| `/aws/lambda/legacy-sports-dev-game-selection` | Cron job firings (`autoProcessDraftPicks`)       |
| `/aws/lambda/legacy-sports-dev-oauth-proxy`    | JWT issuance — confirms which userId is active   |
| EventBridge / SQS DLQ logs                     | Async flow failures, cron mis-fires              |

Shell fallback for listing groups (note the Windows quirk below):

```bash
MSYS_NO_PATHCONV=1 aws logs describe-log-groups \
  --log-group-name-prefix "/aws/lambda/legacy-sports"
```

> **Windows Git Bash**: `MSYS_NO_PATHCONV=1` is **required** for any AWS CLI argument starting with `/`. Without it, MSYS path conversion mangles the leading slash (e.g. `/aws/lambda/...` becomes `C:/aws/lambda/...`). The `aws_logs_filter` MCP tool has no such problem — another reason to prefer it.

### Step 3 — Filter Narrowly First

**MCP (preferred):**

```
aws_logs_filter(
  logGroup: "/aws/lambda/legacy-sports-dev-graphql",
  filterPattern: "\"autoProcessDraftPicks\"",
  startTime: 1714000000000,   # epoch ms
  endTime:   1714003600000
)
```

**Shell fallback** — double-quoted phrases inside single quotes are **required** for `filter-log-events`:

```bash
# Correct — phrase in double quotes inside single quotes
MSYS_NO_PATHCONV=1 aws logs filter-log-events \
  --log-group-name "/aws/lambda/legacy-sports-dev-graphql" \
  --start-time 1714000000000 \
  --end-time   1714003600000 \
  --filter-pattern '"autoProcessDraftPicks"'

# Wrong — will match nothing or behave unexpectedly
--filter-pattern 'autoProcessDraftPicks'
```

Good entry points for draft/league failures:

- Resolver name: `'"autoProcessDraftPicks"'`
- Operation: `'"Draft pick made"'`
- Error string: `'"member of this league"'`
- League/draft ID (if known): `'"leagueId\":\"<uuid>\""'`

Sub-second precision: `--start-time` / `--end-time` are in **milliseconds** (`$(date +%s)000` on Linux/Git Bash works; PowerShell needs `[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()`).

### Step 4 — Cross-Reference IDs Across Log Groups

GraphQL log lines embed JSON inline. Extract `leagueId`, `draftId`, `teamId`, `userId` from the graphql group and follow them across other groups:

```
graphql → game-selection  (did the cron see this draftId?)
graphql → oauth-proxy     (did the JWT issuance match the expected userId?)
graphql → eventbridge     (was the cron triggered at all?)
```

This cross-referencing is what turns "the draft is stuck" into "the cron fired 3 times, found the draft, but returned ForbiddenError on every pick attempt."

### Step 5 — Fall Back to the Database

Use the RDS database when:

- Log retention has aged out the relevant event (CloudWatch default: 14–30 days)
- You need to inspect schema or state not surfaced in logs (e.g. team membership rows, pick table state)
- You want to confirm whether the server actually committed a mutation

**Primary path — no tunnel:** the hosted DB MCP server reaches the dev RDS over HTTPS and serves read-only `db_query` (plus `db_migration_status`) in every session type. Tool table and setup live in [database](../database/SKILL.md). Use this first.

**Fallback — SSM port-forward tunnel** (only when the hosted DB server is unavailable or you need an interactive `psql`; requires AWS credentials and bash — the Make target is stubbed on Windows cmd):

```bash
# 1. Discover the SSM target: the NAT instance. Its ID changes when the
#    instance is replaced (see terraform/main/nat-instance.tf, LS-5247) —
#    discover it by tag, never hardcode an instance ID.
DB_TUNNEL_TARGET=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=legacy-sports-dev-nat-instance" \
            "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)

# 2. Discover the RDS endpoint
DB_TUNNEL_HOST=$(aws rds describe-db-instances \
  --db-instance-identifier legacy-sports-dev-postgres \
  --query 'DBInstances[0].Endpoint.Address' --output text)

# 3. Open the tunnel (leave running; connect from a second shell)
DB_TUNNEL_TARGET="$DB_TUNNEL_TARGET" DB_TUNNEL_HOST="$DB_TUNNEL_HOST" \
  LOCAL_PORT=15432 make db-tunnel
```

**Credentials**: the superuser secret lives in Secrets Manager under the `legacy-sports-dev-db-creds-` name prefix (Terraform appends a random suffix) — find it with `aws_secretsmanager_list_secrets`, read it with `aws_secretsmanager_get_secret_value`.

Key connection parameters (through the tunnel):

| Parameter | Value                                                                                                                                                                             |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host      | `localhost:15432` (whatever `LOCAL_PORT` you chose)                                                                                                                               |
| Database  | `postgres` (NOT `legacy_sports` — Terraform `database_name` default)                                                                                                              |
| SSL       | required; the RDS cert can't match `localhost`, so use `rejectUnauthorized: false` (psql: `sslmode=require`) and **clear `DB_CERT_PATH`** so `lib/db-client` doesn't pin the cert |
| User      | superuser from the `legacy-sports-dev-db-creds-*` secret                                                                                                                          |

> **Easy mistake**: the database name is `postgres`, not `legacy_sports`. Always double-check this when adapting tunnel commands.

**Pre-run sweep warning**: the integration global teardown (`apps/web-e2e/src/integration/global-teardown.ts` — gated by `INTEGRATION_TEARDOWN=true`, skipped in sharded runs) deletes test leagues, and the next run's `global-setup.ts` sweeps stale test leagues left behind. If your investigation requires the actual rows, snapshot the relevant tables _before_ re-running tests.

## Tool Quirks

| Quirk                                    | Detail                                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `MSYS_NO_PATHCONV=1` on Windows Git Bash | **Required** for any AWS CLI argument starting with `/` — without it MSYS mangles the path     |
| `filter-log-events` pattern quoting      | Search phrase must be double-quoted **inside** the pattern string: `'"phrase"'` not `'phrase'` |
| Default DB name                          | `postgres`, not `legacy_sports` — easy mistake when adapting tunnel commands                   |
| Timestamp units                          | `--start-time`/`--end-time` are in **milliseconds**, not seconds                               |
| Log retention                            | CloudWatch groups have 14–30 day retention; fall back to RDS for older events                  |
| Test teardown deletes rows               | Global teardown removes test leagues — snapshot DB state before re-running if you need it      |

## When NOT to Use

- **Client-only failures** — TypeScript errors, missing imports, CSS regressions — the stack trace is already complete; CloudWatch adds no signal
- **Failures the test reporter already explains** — if the error message, file, and line are clear, fix directly
- **Every E2E failure** — only reach for this when stdout is genuinely opaque or when you've exhausted the client-side narrative

## Worked Example — LS-4295: "Stuck at Pick 10"

### What the test stdout said

```
+251.4s  miss #10  picksAutoMade=n/a
+263.1s  miss #11  picksAutoMade=n/a
+274.8s  miss #12  picksAutoMade=n/a
TIMEOUT: draft stuck at pick 10 after 300s
```

The test's local `pickCount` read 10 for the entire observation window. The obvious hypothesis: the WebSocket update stopped delivering pick events, or pick 10 itself was failing on the server.

### What CloudWatch revealed

Filtering `/aws/lambda/legacy-sports-dev-game-selection` for `'"autoProcessDraftPicks"'` over the test window:

```json
{ "message": "Draft pick made", "draftId": "...", "pickNumber": 1,  "teamId": "..." }
{ "message": "Draft pick made", "draftId": "...", "pickNumber": 2,  "teamId": "..." }
...
{ "message": "Draft pick made", "draftId": "...", "pickNumber": 13, "teamId": "..." }
{ "message": "No expired drafts found", "checkedAt": "..." }   ← cron stopped here
```

The server had **actually advanced picks 1–13** over 3.5 minutes. The test's `pickCount` was out of sync due to a `wasAccepted` race condition in the client — the local counter never updated past 10.

### What the opaque `n/a` actually meant

Filtering `/aws/lambda/legacy-sports-dev-graphql` for `'"member of this league"'`:

```json
{
  "error": "ForbiddenError: You are not a member of this league",
  "resolver": "nudgeDraft",
  "leagueId": "...",
  "userId": "..."
}
```

Every `picksAutoMade=n/a` line in the test was a client nudge returning `ForbiddenError`. The test printed `n/a` because the nudge resolver returned an error rather than a pick count — but the test reporter only logged the top-level shape, not the error payload. PR [#3772](https://github.com/bkrupa/legacy-sports/pull/3772) surfaced this by adding explicit error logging to the nudge response path.

### Actual queries used

```bash
# Step 1 — establish the failure window from the Playwright report
# startTime from results.json: 2024-04-25T14:32:10.000Z → 1714054330000
# duration: 310s → end: 1714054640000

# Step 2 — list Lambda log groups
MSYS_NO_PATHCONV=1 aws logs describe-log-groups \
  --log-group-name-prefix "/aws/lambda/legacy-sports"

# Step 3a — find cron activity
MSYS_NO_PATHCONV=1 aws logs filter-log-events \
  --log-group-name "/aws/lambda/legacy-sports-dev-game-selection" \
  --start-time 1714054330000 \
  --end-time   1714054640000 \
  --filter-pattern '"autoProcessDraftPicks"'

# Step 3b — find the actual error behind picksAutoMade=n/a
MSYS_NO_PATHCONV=1 aws logs filter-log-events \
  --log-group-name "/aws/lambda/legacy-sports-dev-graphql" \
  --start-time 1714054330000 \
  --end-time   1714054640000 \
  --filter-pattern '"member of this league"'

# Step 4 — cross-reference: was the right userId in the JWT?
MSYS_NO_PATHCONV=1 aws logs filter-log-events \
  --log-group-name "/aws/lambda/legacy-sports-dev-oauth-proxy" \
  --start-time 1714054330000 \
  --end-time   1714054640000 \
  --filter-pattern '"leagueId\":\"<uuid>\""'
```

**Key lesson**: the "stuck at pick 10" narrative was entirely a client-side sync artifact. The server had long since moved on. Two log queries resolved in 5 minutes what a UI/WebSocket debugging chase would have taken 2+ hours to find.

## pg_stat_statements Reporting — Known-Noise Allowlist

When ranking the dev/prod RDS by `pg_stat_statements.total_exec_time` (the snapshot query in LS-4687), some of the top-call-count rows are **infrastructure probes, not application queries**. They are 0–1 ms per call, have no actionable per-call performance issue, and exist only to dominate the call-count column. Filter them out before drawing conclusions about app workload.

Append the following predicate to the standard top-20 snapshot query:

```sql
AND query NOT ILIKE '%current_setting%pg_postmaster_start_time%'  -- RDS Proxy session-pinning probe (LS-4699)
```

| Pattern (substring `ILIKE` match)              | Origin                                                                                                                                                                                           | Why it's noise                                                                                                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `current_setting … pg_postmaster_start_time()` | RDS Proxy session-pinning / health-check probe. Fires when the proxy hands a backend connection to a new client session to determine whether the client's `SET` state forces connection pinning. | 0.33 ms mean, ~2.7M calls observed on 2026-05-21 (queryid `4396094900050806745`). Volume is a function of client connection churn, not app behavior. Tuning `IdleClientTimeout` on the proxy parameter group can reduce call volume. |

When proposing fixes from a `pg_stat_statements` report, **explicitly skip allowlisted patterns** and call out the skip in the ticket — do not file remediation tickets against them. If a new infrastructure probe shows up that fits the same shape (very high call count, sub-millisecond mean, query references `pg_*` introspection functions or `current_setting`), add it here rather than filing a remediation ticket.

## Related Skills

[debugging](../debugging/SKILL.md) · [database](../database/SKILL.md) · [testing](../testing/SKILL.md) · [read-playwright-report](../read-playwright-report/SKILL.md) · [cloud-teleport](../cloud-teleport/SKILL.md)

## See Also

- [debugging/SKILL.md](../debugging/SKILL.md) — core debugging methodology and verification-by-bug-type table
- [debugging/references/distributed-debugging.md](../debugging/references/distributed-debugging.md) — Lambda / SQS / EventBridge failure patterns
- [debugging/references/prod-errors.md](../debugging/references/prod-errors.md) — Rollbar triage; pivots here when the payload lacks the server story
- PR [#3772](https://github.com/bkrupa/legacy-sports/pull/3772) — diagnostic surfacing fix that made `picksAutoMade=n/a` → `ForbiddenError` visible
- LS-4295 — the investigation that prompted this skill
- LS-4299 — follow-up root-cause work from the same investigation
- LS-4699 — RDS Proxy session-pinning probe allowlist entry (the noisy `current_setting … pg_postmaster_start_time()` row)

## Provenance and maintenance

Revised 2026-07-02 by the skills audit (debugging-playbook refresh): MCP-first log tools (`aws_logs_filter` / `aws_logs_tail`) made primary, log-group names corrected to the `legacy-sports-dev-*` prefix, the unresolvable "memory entry" tunnel reference replaced with the checked-in `db_query`-first + `make db-tunnel` recipe, and global setup/teardown filenames corrected (`global-setup.ts` / `global-teardown.ts`). Re-verify volatile facts:

- Log-group prefix: `grep -n "function_name" terraform/main/lambda-graphql.tf` (with `name_prefix` in `terraform/main/main.tf`)
- AWS log tool surface + short names: `grep -n "LAMBDA_FUNCTIONS" -A 25 tools/mcp/aws-server/src/tools/logs-tail.ts`
- Tunnel target/env vars: `grep -n "db-tunnel:" -A 8 Makefile`
- DB name default: `grep -n -A 4 'variable "database_name"' terraform/main/variables.tf`
- Credentials secret prefix: `grep -n -A 2 'resource "aws_secretsmanager_secret" "database_credentials"' terraform/main/secrets.tf`
- Setup/teardown filenames: `grep -n "globalSetup\|globalTeardown" apps/web-e2e/playwright.integration.config.ts`
