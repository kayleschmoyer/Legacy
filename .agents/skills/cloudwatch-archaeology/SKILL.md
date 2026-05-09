---
name: cloudwatch-archaeology
description: 'Use CloudWatch logs and the live RDS database as the authoritative source of truth when E2E test stdout is misleading or opaque. Covers when to invoke, the concrete query chain (log groups → filter → cross-reference IDs → DB fallback), Windows Git Bash quirks, and a worked example from LS-4295 (stuck-at-pick-10 turned out to be picks-1-13-succeeded + ForbiddenError).'
---

# Skill: CloudWatch Log Archaeology

## Overview

E2E test stdout lies. A draft "stuck at pick 10" may actually mean the server advanced picks 1–13 successfully and then a cron stopped finding expired drafts. A `picksAutoMade=n/a` line may conceal a `ForbiddenError("You are not a member of this league")` that only surfaces in the Lambda logs.

This skill documents when to reach for CloudWatch (and the live RDS) instead of trusting the test reporter, and gives the concrete query chain to do it efficiently.

This is the second-most common debugging gotcha in this repo (after "make pc passes but live behavior is broken" — see the `debugging` skill). Reach for it early on any distributed system failure where the test narrative is opaque.

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

### Step 2 — List Relevant Log Groups

```bash
MSYS_NO_PATHCONV=1 aws logs describe-log-groups \
  --log-group-name-prefix "/aws/lambda/legacy-sports"
```

> **Windows Git Bash**: `MSYS_NO_PATHCONV=1` is **required** for any AWS CLI argument starting with `/`. Without it, MSYS path conversion mangles the leading slash (e.g. `/aws/lambda/...` becomes `C:/aws/lambda/...`).

Common log groups for draft/league flows:

| Group                                      | What it captures                                 |
| ------------------------------------------ | ------------------------------------------------ |
| `/aws/lambda/legacy-sports-graphql`        | All resolver calls, inline JSON with IDs, errors |
| `/aws/lambda/legacy-sports-game-selection` | Cron job firings (`autoProcessDraftPicks`)       |
| `/aws/lambda/legacy-sports-oauth-proxy`    | JWT issuance — confirms which userId is active   |
| EventBridge / SQS DLQ logs                 | Async flow failures, cron mis-fires              |

### Step 3 — Filter Narrowly First

Double-quoted patterns inside single quotes are **required** for `filter-log-events`:

```bash
# Correct — phrase in double quotes inside single quotes
MSYS_NO_PATHCONV=1 aws logs filter-log-events \
  --log-group-name "/aws/lambda/legacy-sports-graphql" \
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

**Setup**: SSM port-forward — see memory entry `reference_dev_rds_tunnel.md` (NAT instance `i-0823762e35dd87563`, postgres superuser secret, **must clear `DB_CERT_PATH`**).

Key connection parameters:

| Parameter | Value                                   |
| --------- | --------------------------------------- |
| Host      | `localhost:15432` (after tunnel)        |
| Database  | `postgres` (NOT `legacy_sports`)        |
| SSL       | required (`rejectUnauthorized: false`)  |
| User      | postgres superuser from Secrets Manager |

> **Easy mistake**: the database name is `postgres`, not `legacy_sports`. Always double-check this when adapting tunnel commands.

**Pre-test snapshot warning**: the global test setup/teardown (`apps/web-e2e/src/integration/globalSetup.ts` / `globalTeardown.ts`) deletes test leagues after each run. If your investigation requires the actual rows, snapshot the relevant tables _before_ re-running tests.

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

Filtering `/aws/lambda/legacy-sports-game-selection` for `'"autoProcessDraftPicks"'` over the test window:

```json
{ "message": "Draft pick made", "draftId": "...", "pickNumber": 1,  "teamId": "..." }
{ "message": "Draft pick made", "draftId": "...", "pickNumber": 2,  "teamId": "..." }
...
{ "message": "Draft pick made", "draftId": "...", "pickNumber": 13, "teamId": "..." }
{ "message": "No expired drafts found", "checkedAt": "..." }   ← cron stopped here
```

The server had **actually advanced picks 1–13** over 3.5 minutes. The test's `pickCount` was out of sync due to a `wasAccepted` race condition in the client — the local counter never updated past 10.

### What the opaque `n/a` actually meant

Filtering `/aws/lambda/legacy-sports-graphql` for `'"member of this league"'`:

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
  --log-group-name "/aws/lambda/legacy-sports-game-selection" \
  --start-time 1714054330000 \
  --end-time   1714054640000 \
  --filter-pattern '"autoProcessDraftPicks"'

# Step 3b — find the actual error behind picksAutoMade=n/a
MSYS_NO_PATHCONV=1 aws logs filter-log-events \
  --log-group-name "/aws/lambda/legacy-sports-graphql" \
  --start-time 1714054330000 \
  --end-time   1714054640000 \
  --filter-pattern '"member of this league"'

# Step 4 — cross-reference: was the right userId in the JWT?
MSYS_NO_PATHCONV=1 aws logs filter-log-events \
  --log-group-name "/aws/lambda/legacy-sports-oauth-proxy" \
  --start-time 1714054330000 \
  --end-time   1714054640000 \
  --filter-pattern '"leagueId\":\"<uuid>\""'
```

**Key lesson**: the "stuck at pick 10" narrative was entirely a client-side sync artifact. The server had long since moved on. Two log queries resolved in 5 minutes what a UI/WebSocket debugging chase would have taken 2+ hours to find.

## Related Skills

`debugging` · `database` · `testing` · `read-playwright-report` · `distributed-debugging`

## See Also

- `.agents/skills/debugging/SKILL.md` — core debugging methodology and verification-by-bug-type table
- `.agents/skills/debugging/references/distributed-debugging.md` — Lambda / SQS / EventBridge failure patterns
- Memory entry `reference_dev_rds_tunnel.md` — SSM port-forward setup for the dev RDS instance
- PR [#3772](https://github.com/bkrupa/legacy-sports/pull/3772) — diagnostic surfacing fix that made `picksAutoMade=n/a` → `ForbiddenError` visible
- LS-4295 — the investigation that prompted this skill
- LS-4299 — follow-up root-cause work from the same investigation
