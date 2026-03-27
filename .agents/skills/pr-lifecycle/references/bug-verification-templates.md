---
name: bug-verification-templates
description: 'PR body templates for proving bug fixes — screenshots, test output, query results, and log evidence. Load when writing the ## Verification section of a bug-fix PR.'
---

# Bug Verification Templates

Every bug-fix PR must include a `## Verification` section proving the bug existed and is now fixed. Use the template matching your bug category. For mixed bugs (e.g., UI caused by a resolver issue), use multiple templates — always include the layer the user experiences.

## UI / Visual Bugs

Use [agent-screenshots.md](agent-screenshots.md) to capture before/after. The screenshots must show the same page/state, differing only in the fix.

```markdown
## Verification

### Before

![bug-before](https://github.com/.../agent-screenshots/bug-before.png)

<description of what is broken — e.g., "Standings table shows duplicate rows for tied teams">

### After

![bug-after](https://github.com/.../agent-screenshots/bug-after.png)

<description of what is fixed — e.g., "Tied teams now appear once with correct tie-breaking order">
```

## Resolver / Logic Bugs

The failing test IS the before; the passing test IS the after. Include both outputs.

````markdown
## Verification

### Before (failing test)

```
FAIL lambdas/db/src/resolvers/standings/**tests**/standings.spec.ts
StandingsResolver > tiebreaker
x should rank teams by head-to-head record when points are equal
Expected: ["Team A", "Team B"]
Received: ["Team B", "Team A"]
```

### After (passing test)

```
PASS lambdas/db/src/resolvers/standings/**tests**/standings.spec.ts
StandingsResolver > tiebreaker
✓ should rank teams by head-to-head record when points are equal (12 ms)
```

**Regression test:** `standings.spec.ts` — kept as permanent coverage.
````

## Data / Query Bugs

Show the query and results before and after the fix.

````markdown
## Verification

### Before

```sql
SELECT team_id, points, rank FROM standings WHERE league_id = 42 ORDER BY rank;
```

| team_id | points | rank |
| ------- | ------ | ---- |
| 7       | 30     | 1    |
| 7       | 30     | 2    |

<description — e.g., "Team 7 appears twice due to missing DISTINCT in the standings query">

### After

```sql
-- same query
SELECT team_id, points, rank FROM standings WHERE league_id = 42 ORDER BY rank;
```

| team_id | points | rank |
| ------- | ------ | ---- |
| 7       | 30     | 1    |
| 12      | 28     | 2    |

<description — e.g., "Duplicate eliminated; standings reflect unique teams">
````

## Distributed System Bugs

Show log evidence or integration test output before and after.

````markdown
## Verification

### Before (error in logs / failing integration test)

```
ERROR [draft-processor] DraftPick handler failed: TypeError: Cannot read property 'teamId' of undefined
at DraftPickHandler.process (lambdas/draft-processor/src/handlers/draft-pick.ts:47)
```

OR

```
FAIL apps/web-e2e/src/integration/tests/draft-flow.spec.ts
Draft flow > auto-pick
x should auto-pick when timer expires
Timeout waiting for draft pick to complete
```

### After (clean logs / passing integration test)

```
INFO [draft-processor] DraftPick processed successfully: { odraftId: 123, odround: 3, pick: 7 }
```

OR

```
PASS apps/web-e2e/src/integration/tests/draft-flow.spec.ts
Draft flow > auto-pick
✓ should auto-pick when timer expires (1823 ms)
```

**Regression test:** `draft-flow.spec.ts` — kept as permanent coverage.
````

## Mixed Bugs (multiple layers)

Combine templates. Always include the user-facing layer.

```markdown
## Verification

### Root cause (resolver)

<test output before/after — use Resolver template above>

### User-facing fix (UI)

<screenshots before/after — use UI template above>
```

## When Reproduction Is Not Possible

If the bug cannot be reproduced locally (production-only data, mobile-specific, environment-specific), document why and show the regression test that covers the code path:

````markdown
## Verification

**Reproduction not possible locally:** <reason — e.g., "Bug requires production league data with 30+ teams; dev seed has max 16">

### Regression test

```
PASS lambdas/db/src/resolvers/standings/**tests**/standings.spec.ts
StandingsResolver > large league edge case
✓ should handle 32-team league without duplicate rows (8 ms)
```

**Code path covered:** The test exercises the same query path with a 32-team fixture, confirming the DISTINCT fix prevents duplicates regardless of team count.
````
