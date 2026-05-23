# Cloud-to-Local Teleport Handoff

## Session Info

- **Branch**: `claude/exciting-sagan-bkakZ`
- **PR**: [#4133](https://github.com/bkrupa/legacy-sports/pull/4133) — `LS-2549 fix(oauth-proxy): close account-enumeration leak on /oauth/register`
- **Ticket**: [LS-2549](https://bkrupa.atlassian.net/browse/LS-2549) — In Review
- **Date**: 2026-05-22

> No secrets in this file.

## Completed Steps

- [x] Jira LS-2549 transitioned: To Do → In Progress → In Review
- [x] Code implementation complete on `claude/exciting-sagan-bkakZ`
- [x] Unit tests written and passing (58/58 oauth-proxy)
- [x] `make pc` passes (lint, typecheck, test, build)
- [x] Branch rebased onto latest `origin/main` (7ed0d00)
- [x] Pushed to remote
- [x] PR #4133 created and marked ready
- [x] Labels applied: `agent-in-progress`, `bot:ready-for-review`
- [x] Copilot review requested
- [x] Implementation notes appended to Jira description
- [x] Follow-up tickets filed: **LS-4739** (verification email flow), **LS-4740** (per-IP rate limiting)

## Blocked Step

**Operation**: Drive PR #4133 to merge — handle Copilot review feedback, CI failures, and final merge.
**Reason**: User requested teleport to local session for review-cycle handling.
**Category**: User-initiated handoff (not a capability boundary).

## Remaining Steps

1. Watch PR #4133 for events:
   - **Copilot review** (in progress at handoff): triage threads using the Author Agent Contract (`FIX: <sha>` / `JUSTIFY: <rationale>` per AGENTS.md). Cap at 2 review rounds.
   - **CI**: respond to failures per `.agents/skills/pr-lifecycle/SKILL.md`.
2. After CI green + bot APPROVED, merge.
3. Verify Jira LS-2549 auto-transitions to Done (Jira Branch Sync); fall back to manual transition if it lags.
4. Run MCP gap audit (`Skill: mcp-gap-audit`) if session exceeded threshold.
5. (Optional) Decide whether to chip-dispatch LS-4739 and LS-4740 follow-ups now or defer to backlog.

## Context for the Local Agent

### What was built

**LS-2549** is a security bug — `/oauth/register` returned `409 'An account with this email already exists'` when the email was already registered, enabling account enumeration. Same problem on `/oauth/discord/link`.

User explicitly chose **option 1 (uniform-response + email follow-up)** over options 2 (generic-error only) or 3 (full per-IP rate limiting) when asked via `AskUserQuestion`. The fix:

- **`lambdas/oauth-proxy/src/handlers/Local.ts`**: `/oauth/register` now returns identical `200 {status:'pending'}` body for new and existing emails. No JWT or auth cookies issued. Always hashes the password for timing parity.
- **`lambdas/oauth-proxy/src/handlers/Discord.ts`**: `/oauth/discord/link` returns generic `409 'Could not link Discord account'` instead of confirming "already linked to another user". Detail kept in server warn log.
- **`apps/web-e2e/src/utils/test-user-auth.ts`**: e2e bootstrap performs a second `POST /oauth/login` after a successful register (since register no longer returns a JWT).
- **`lambdas/oauth-proxy/src/handlers/Local.spec.ts`**: rewrote with proper module mocks (previous file failed locally because it imported `@legacy-sports/db-client` without mocking, which throws on missing `DB_PASSWORD` at module-init). 8 new tests cover uniform response, no-JWT body, user-creation behavior, and timing-parity hash.
- **`lambdas/oauth-proxy/src/handlers/Discord.spec.ts`**: added `handleDiscordLink` test block covering the generic-error path and the successful-link path.

### Accepted tradeoffs (anticipate these in review)

- **Squatting risk**: the uniform response still creates a user record on a new unverified email. An attacker can register `victim@example.com` with a password they choose, locking out the real owner. This is **out of scope for LS-2549** (which targets enumeration, not squatting) and is closed by **LS-4739** (verification email flow). Documented in the PR body and the ticket's Implementation Notes — reviewers may flag this; the response is "covered by LS-4739, not in this ticket's scope".
- **Timing parity is best-effort**: bcrypt dominates the new-user path but the existing-user path also hashes; the DB read is non-uniform between the two. Sufficient to make timing a poor oracle in practice but not constant-time.
- **`handleDiscordLink` second 409** (`'A different Discord account is already linked — unlink it first'`) is intentionally left as-is: it describes the _calling user's own_ state, not other users', so it's not an enumeration vector.

### Pre-existing failing tests (out of scope)

The previous `Local.spec.ts` had 8 of 9 tests failing locally because they exercised handlers without mocking DB modules (module-init throws on missing `DB_PASSWORD`). The new spec file replaces it with mocked tests that pass. The old tests for "password too short" hinted at a `min(8)` schema that never existed — that mismatch was pre-existing and not in scope here.

## Files Changed

```
apps/web-e2e/src/utils/test-user-auth.ts         |  42 +++-
lambdas/oauth-proxy/src/handlers/Discord.spec.ts |  65 ++++-
lambdas/oauth-proxy/src/handlers/Discord.ts      |  15 +-
lambdas/oauth-proxy/src/handlers/Local.spec.ts   | 229 ++++++++++++------
lambdas/oauth-proxy/src/handlers/Local.ts        |  58 ++--
```

## To Resume Locally

```bash
git fetch origin claude/exciting-sagan-bkakZ
git checkout claude/exciting-sagan-bkakZ

# PR:        https://github.com/bkrupa/legacy-sports/pull/4133
# Ticket:    https://bkrupa.atlassian.net/browse/LS-2549
# Follow-up: https://bkrupa.atlassian.net/browse/LS-4739 (verification email)
# Follow-up: https://bkrupa.atlassian.net/browse/LS-4740 (per-IP rate limiting)
```
