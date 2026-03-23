---
name: fix-bugs
description: 'Fix bugs by addressing the root cause rather than suppressing error reporting. Distinguishes legitimate error-swallowing (user-input and transient errors) from masking real bugs. Load this skill before fixing any bug that involves catching exceptions, silencing errors, or removing log output.'
---

# Skill: Fix Bugs at the Root Cause

## Overview

When fixing a bug, the instinct to silence an error log or swallow an exception is almost always wrong. This skill enforces a **root-cause-first** methodology and defines the narrow set of cases where suppressing error reporting is legitimate.

## CRITICAL RULE

> **Never fix a bug by silencing the error that reports it.** If you find yourself removing a `LOGGER.error(...)`, wrapping code in a bare `catch` that does nothing, or filtering an error out of Rollbar/Sentry — **STOP**. That hides the symptom. The underlying defect still runs; it just becomes invisible.

Silencing error reporting without fixing the cause:

- Makes future failures impossible to diagnose
- Gives false confidence that the system is healthy
- Removes the only signal that a code path is broken

---

## Root Cause vs. Cover-Up

### Cover-ups to avoid

```typescript
// Swallowing an unexpected exception — the bug still runs
try {
  processMatchup(matchupId);
} catch (err) {
  // silently ignore
}

// Removing the log instead of fixing the code
// LOGGER.error('Failed to load player stats', { err }); // <-- deleted

// Filtering a real error from Sentry so the alert goes away
if (err.message.includes('Cannot read properties of undefined')) {
  return; // don't report
}

// Catching and re-throwing as a softer level to avoid PagerDuty noise
try {
  sendNotification(payload);
} catch (err) {
  LOGGER.warn('notification failed', { err }); // was .error — demoted to hide it
}
```

### Root cause fixes

```typescript
// Guard the null that caused the TypeError
if (!player) {
  LOGGER.warn('Player not found, skipping stats load', { playerId });
  return;
}
processStats(player);

// Fix the race condition that caused the duplicate-key error
await acquireLeagueLock(leagueId);
await insertMatchup(matchup);

// Handle the missing config properly instead of catching the crash
const apiKey = env.STATS_API_KEY;
if (!apiKey) throw new Error('STATS_API_KEY is required but not set');
```

---

## When Swallowing Error Reporting IS Legitimate

Only two categories justify suppressing or downgrading error reporting without a corresponding code fix:

### 1. User-Input Errors

Errors caused by bad, invalid, or unexpected input from the end user are **not bugs**. They are expected outcomes of operating at a system boundary. Report them at an appropriate level (validation message, `warn`, or structured response) — do not fire Rollbar/Sentry alerts that page on-call.

**Criteria**: The error would have been prevented by the user providing valid input. The code behaved correctly.

```typescript
// User submitted an invalid promo code — not a bug; don't alert Sentry
try {
  await applyPromoCode(userId, promoCode);
} catch (err) {
  if (err instanceof InvalidPromoCodeError) {
    return { success: false, message: 'Invalid promo code' };
  }
  throw err; // unexpected errors still propagate
}

// GraphQL mutation validates required fields — UserInputError is expected
if (!leagueId) {
  throw new UserInputError('leagueId is required');
}
```

**Key test**: Would a reasonable, diligent user trigger this error through normal usage? If yes → user-input. If no → likely a bug.

### 2. Transient / Infrastructure Errors

Errors caused by temporary external conditions that automatically resolve — network blips, brief service unavailability, connection pool exhaustion — should generate a warning (not an alert), and the caller should retry or degrade gracefully.

**Criteria**: The error will likely succeed on retry without any code change. It is outside your system's control.

```typescript
// Network timeout on an external stats API — transient, retry with backoff
try {
  return await statsApiClient.fetchGameScore(gameId);
} catch (err) {
  if (isNetworkError(err) || isTimeoutError(err)) {
    LOGGER.warn('Stats API transient failure, will retry', { gameId, err });
    throw err; // SQS will retry; still propagate so the retry happens
  }
  throw err; // non-transient: let it surface as an error
}

// SQS message processing — don't report as error on first retry
// Rely on SQS dead-letter queue to surface persistent failures instead
```

**Key test**: Would re-running the exact same code moments later likely succeed? If yes → transient. If no → likely a bug that needs a fix.

---

## Decision Tree

```
Is the error caused by the user providing bad input?
  ├── YES → Return a validation error / user message. Do NOT alert Sentry/Rollbar.
  │          Keep the error out of error-rate dashboards.
  └── NO ↓

Is the error caused by a temporary external condition (network, infra)?
  ├── YES → Log at WARN. Retry if appropriate. Do NOT alert Sentry/Rollbar.
  │          Rely on DLQ / retry exhaustion for escalation.
  └── NO ↓

This is a BUG. Find and fix the root cause.
  → Do NOT silence the error log
  → Do NOT downgrade .error() to .warn() to reduce noise
  → Do NOT add a try/catch that swallows the exception
  → Fix the code path that produces the bad state
```

---

## LOGGER.error() — Pass Error Objects Directly

A common mistake when fixing bugs is wrapping the caught error in an object:

```typescript
// WRONG — Error nested inside { error }, Rollbar can't extract the stack trace
catch (error) {
  LOGGER.error('Operation failed', { error });
}

// CORRECT — Error as a direct argument, Rollbar extracts the stack trace
catch (error) {
  LOGGER.error('Operation failed', error);
}

// CORRECT — Error as direct arg + extra context as a separate object
catch (error) {
  LOGGER.error('Operation failed', error, { userId, leagueId });
}
```

**Why**: `RollbarOutputDestination` scans `LOGGER.error()` args with `arg instanceof Error`. When the Error is wrapped in `{ error }`, `instanceof` returns false and Rollbar synthesizes a generic error — **losing the original stack trace**. This makes production debugging impossible.

See the full explanation in the [fix-lint skill](../../repo-tooling/SKILL.md#loggererror--error-objects-must-be-direct-arguments).

---

## CLIENT_FACING_CODES — Classifying Error Severity

Not all errors deserve `LOGGER.error()`. The `CLIENT_FACING_CODES` set in `lambdas/db/src/server/graphql-error-codes.ts` defines error codes that represent **expected, client-visible conditions**: validation failures, auth errors, bad input, premium gating.

```typescript
import { CLIENT_FACING_CODES } from './graphql-error-codes';

// In error handling (e.g. Apollo formatError):
const code = err.extensions?.code;
if (CLIENT_FACING_CODES.has(code)) {
  // Expected client error — don't report to Rollbar/Sentry
  LOGGER.warn('Client error', { code, message: err.message });
} else {
  // Unexpected server error — report to Rollbar/Sentry
  LOGGER.error('Unexpected server error', err.originalError ?? err);
}
```

This pattern prevents noise in error tracking while ensuring genuine bugs are never silenced. When you encounter an error handler that logs everything at `error` level, consider whether the error code belongs in `CLIENT_FACING_CODES` rather than demoting the log level.

---

## Log Level Guide

| Situation                              | Level   | Report to Sentry/Rollbar? |
| -------------------------------------- | ------- | ------------------------- |
| Unexpected exception / unhandled state | `error` | Yes                       |
| Client-facing code (auth, validation)  | `warn`  | No                        |
| Transient failure, will retry          | `warn`  | No                        |
| User input validation failure          | `warn`  | No                        |
| Expected no-op (e.g. nothing to do)    | `info`  | No                        |
| Diagnostic breadcrumb                  | `debug` | No                        |

---

## Common Mistake: Reducing Noise by Demoting Log Level

When production logs are noisy, the temptation is to downgrade `LOGGER.error` → `LOGGER.warn`. **Do not do this** unless the error genuinely fits the user-input or transient criteria above.

Instead, fix the code so the error doesn't occur:

```typescript
// Noise reduction via demotion — hides real failures
LOGGER.warn('Could not find league', { leagueId }); // was .error

// Fix the code so null leagues are handled at their source
const league = await db.query.leagues.findFirst({
  where: eq(leagues.id, leagueId),
});
if (!league) throw new NotFoundError(`League ${leagueId} not found`);
```

---

## Related Skills

- `no-lint-disable` — same principle applied to lint/TypeScript suppressions
- `fix-lint` — fix ESLint errors without suppression
- `fix-types` — fix TypeScript errors without suppression
