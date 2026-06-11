# 0008. Reach for CloudWatch first when test stdout is opaque

Date: 2026-01-10

## Status

Accepted

## Context

The test suite includes E2E and integration tests that exercise the full stack:
React/React Native client → GraphQL API Lambda → RDS PostgreSQL. When a test fails,
the primary debugging signal is Playwright's test reporter output.

The problem: **test stdout lies in distributed system failures.** A real example
(LS-4295): an E2E test reported "draft stuck at pick 10." The actual server state
was that picks 1–13 had succeeded and the cron job stopped finding expired drafts
because a `ForbiddenError` was silently swallowed by the client-side request handler.
The test's pick-count assertion saw a stale number, not a server error.

Common patterns where test stdout misleads:

- Opaque values: `n/a`, `undefined`, bare count mismatches with no cause.
- Oscillation: a "fix" moves the failure one step later rather than resolving it.
- Client-only view: the test reports what the client received, not what the server
  did. Lambda errors, cron firings, JWT issuance, and DB state changes are invisible
  to Playwright.

The prior default was to add more `console.log` / `page.evaluate` calls on the
client side and re-run. This iterative approach took multiple CI cycles before the
real root cause (a server-side `ForbiddenError`) was found.

## Decision

We will treat **CloudWatch Logs and the live RDS database as the authoritative
source of truth** for any distributed system test failure where stdout is opaque,
and we will reach for them as the **first** debugging step, not a last resort.

- When test output is `n/a`, "stuck", "timeout", or a bare count mismatch, query
  CloudWatch for the test window's Lambda logs before adding any client-side logging.
- The concrete query chain is documented in `.agents/skills/cloudwatch-archaeology/SKILL.md`:
  establish the failure window from the Playwright JSON report, filter the relevant
  log groups, cross-reference entity IDs, then fall back to a DB query if log
  evidence is ambiguous.
- Only after CloudWatch and DB state confirm client-side behavior is the root cause
  should client-side debugging (additional `console.log`, `page.evaluate`) be added.

## Consequences

### Easier

- Root cause is typically found in one CloudWatch query session rather than across
  multiple CI re-runs with escalating client-side instrumentation.
- Lambda errors (500s, authorization failures, unhandled rejections) surface
  immediately even when the client reports only a timeout or a stale count.
- The DB cross-reference step confirms whether the server actually committed
  the expected state, distinguishing "server succeeded but client didn't receive
  the response" from "server failed before committing."

### Harder

- CloudWatch queries require AWS SSO authentication (`aws sso login --profile default`);
  developers must have the correct IAM permissions for the relevant log groups.
- Correlating a test's failure window with a Lambda invocation requires reading
  the Playwright JSON report's `startTime` + `duration` and converting to UTC —
  a manual step that takes familiarity with the tooling.
- The CloudWatch Logs Insights query syntax has its own learning curve; see
  the worked example in the skill for a copy-paste starting point.

### Now constrained

- **Do not add client-side `console.log` as a first debugging step for server-related
  failures.** This masks the root cause and burns CI cycles. If test stdout is opaque,
  CloudWatch is the required first step.
- **The `cloudwatch-archaeology` skill is the authoritative procedure.** Do not
  invent ad-hoc querying strategies for log archaeology; the skill documents the
  correct log group naming conventions, filter patterns, and cross-reference approach.
