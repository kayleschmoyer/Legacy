---
name: planning
description: 'Structured planning phase for implementation tasks. Read relevant code, understand constraints, identify dependencies, classify risk (Low/Medium/High), and produce a mental model before writing code. Referenced as Phase 0 by workflow skills. Skip for trivial tasks (typo fixes, single-line changes, doc-only edits).'
---

# Skill: Planning

## Overview

Every non-trivial implementation task benefits from a structured planning phase before the first line of code is written. This skill defines a reusable methodology that ensures agents:

1. **Understand the problem** — read the ticket, read the code, understand what exists before proposing changes
2. **Assess risk** — classify the change by blast radius so the approach matches the stakes
3. **Articulate "why"** — maintain a clear narrative of the goal so implementation decisions stay aligned with intent

**Why this matters**: agents that skip planning produce code that works in isolation but misses constraints, breaks adjacent systems, or solves the wrong problem. A 5-minute planning phase prevents 45-minute rework cycles.

## When to Use

- Before implementing any Jira ticket (referenced as Phase 0 by `work-ticket`)
- Before fixing a bug (after reproduction, before writing the fix)
- Before implementing an MCP tool (understand the server's existing patterns)
- Before any multi-file or cross-boundary change

## When to Skip

- Single-file cosmetic changes (typo fix, comment update)
- Doc-only changes with no code impact
- Adding a test for existing, unchanged code
- Changes where the user has given extremely specific, line-level instructions

## Steps

### Step 1: Scope Assessment (30 seconds)

Before reading any code, classify the task scope to determine planning depth:

| Scope       | Planning Depth | Criteria                                                                    | Action                                          |
| ----------- | -------------- | --------------------------------------------------------------------------- | ----------------------------------------------- |
| **Trivial** | Skip           | Single-file cosmetic, typo, doc-only                                        | Proceed directly to implementation              |
| **Low**     | 2-3 minutes    | Single-concern change within one service boundary                           | Read target file + imports, note tests, proceed |
| **Medium**  | 5-10 minutes   | Multi-file within a service, schema changes, business logic, new components | Full reconnaissance + dependency mapping        |
| **High**    | 10-15 minutes  | Cross-service, auth, payments, infrastructure, data migrations              | Full planning + downstream impact analysis      |

**How to determine scope**: look at what the ticket touches. If it names a single file or function, likely Low. If it mentions "add a feature" or "change behavior", likely Medium. If it mentions auth, payments, infrastructure, database schema, or affects multiple services, it's High.

### Step 2: Code Reconnaissance

Read the code that will be affected. The goal is to build a mental model of the current state before proposing changes.

**What to read** (in order of priority):

1. **Target file(s)** — the file(s) named in the ticket or most likely to change
2. **Direct imports** — what the target file depends on (types, utilities, constants)
3. **Consumers** — what imports or calls the target code (use `Grep` to find references)
4. **Test files** — existing test coverage for the target code
5. **Configuration** — `project.json`, schema files, migration files, env vars if relevant

**What NOT to do**: don't read the entire codebase. Don't read files that are 3+ hops away from the change. Don't read generated files (they'll be regenerated). Stay focused on the blast radius.

```
# Example: planning a change to a GraphQL resolver
Read: lambdas/db/src/resolvers/<target>.ts        # the resolver itself
Grep: pattern="<ResolverName>", path="lambdas/db"  # find references
Read: lib/db-client/src/schema/<table>.ts           # the schema it queries
Grep: pattern="<operationName>", path="apps/web"    # frontend consumers
```

### Step 3: Constraint & Dependency Mapping

After reading the code, identify what constrains the implementation:

**Dependencies TO this code** (what breaks if you change it):

- Other files that import this module
- GraphQL operations that reference this type/field
- Tests that assert on this behavior
- Codegen that produces types from this schema

**Dependencies FROM this code** (what this code relies on):

- Database schema (need a migration?)
- External APIs (rate limits, auth requirements?)
- Environment variables (need new ones?)
- Shared libraries (version constraints?)

**Non-obvious constraints** (discovered by reading the code):

- Platform splits (`.native.ts` vs `.web.ts` — changes may need both)
- Feature flags or conditional logic
- Error handling paths that must be preserved
- Performance-sensitive code paths (data loaders, caching)

### Step 4: Risk Classification

> **Canonical source**: [`.agents/skills/dev-process/gates/risk-tiers.md`](../dev-process/gates/risk-tiers.md) is the authoritative reference for risk tiers, including the **Critical** tier and the full decision tree and per-tier requirements. The table below is a quick reference for the planning phase; consult the canonical doc when the choice is non-obvious or when an entrypoint other than new-feature applies.

Classify the change using this framework:

| Risk Level   | Criteria                                                                                                                | Examples                                                                                         | Planning Response                                                                                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Low**      | Cosmetic, docs, test-only, single-file, no schema/infra changes                                                         | Fix a typo, add a test, update a doc, rename a variable                                          | Proceed with confidence. Standard `make pc` validation is sufficient.                                                                                               |
| **Medium**   | Business logic, multiple files, schema changes, new UI components, GraphQL resolver changes                             | New resolver + frontend query, UI feature with state, refactor across files                      | Read all affected files. Identify test coverage gaps. Plan the change sequence (schema first? types first?).                                                        |
| **High**     | Auth/security, payments/billing, infrastructure (Terraform), data migrations, cross-service changes, WebSocket protocol | OAuth flow change, Stripe webhook handler, DB migration on production data, Lambda configuration | Full dependency analysis. Consider rollback strategy. Identify what could break in production. Plan verification beyond `make pc` (manual testing, staging deploy). |
| **Critical** | Production incidents, security exploitation, reverts of merged changes affecting prod                                   | Hotfix for live outage, CVE response, rollback of broken deploy                                  | Speed AND rigor maximized. Incident commander, postmortem mandatory. See [dev-process entrypoints 01, 03, 13](../dev-process/entrypoints/).                         |

**Risk escalation**: if you discover during reconnaissance that the change is higher-risk than the ticket suggests (e.g., a "simple UI fix" requires a schema migration), update your risk classification and adjust your approach accordingly.

### Step 5: Planning Output

Produce a structured mental model before proceeding to implementation. This is NOT written to a file — it is your internal working state that guides every subsequent decision.

The output has five parts:

1. **Goal statement**: "I am changing [X] because [Y], which will [outcome]"
2. **Risk assessment**: "[Low|Medium|High] — [reasoning based on what was discovered]"
3. **File plan**: ordered list of files to modify and what changes each needs
4. **Constraints**: non-obvious things discovered during reconnaissance that must be respected
5. **Verification plan**: how you will confirm the change works (which tests to run, what to check)

**Example planning output** (for a Medium-risk ticket "add team name validation"):

```
Goal: I am adding server-side team name validation to prevent duplicate and empty
team names, because users are creating teams with blank names that break the
team roster display.

Risk: Medium — touches the GraphQL resolver (lambdas/db), adds a DB query for
uniqueness check, and requires a new error type that the frontend must handle.

File plan:
1. lambdas/db/src/resolvers/team.ts — add validation before insert
2. lib/db-client/src/queries/team.ts — add findByName query
3. apps/web/src/features/teams/CreateTeamForm.tsx — handle validation error
4. lambdas/db/src/resolvers/__tests__/team.spec.ts — add validation test cases

Constraints:
- Team names are case-insensitive in the UI but case-sensitive in the DB — need
  to normalize for the uniqueness check (LOWER() in SQL)
- The CreateTeamForm already has client-side empty-string validation, so the
  server-side check is a safety net, not the primary UX

Verification: run team resolver tests, create a team with empty name via GraphQL
playground, confirm error response, confirm frontend displays the error.
```

## Ticket Description Template

When creating Jira tickets (via `jira_create_ticket`), use the optional structured fields to capture planning context for future agents:

```
jira_create_ticket(
  summary: "feat(teams): add server-side team name validation",
  type: "Task",
  description: "Users can create teams with blank names, which breaks the roster display. Add server-side validation for empty and duplicate team names.",
  context: "Blank team names are a recurring user-reported issue (3 Rollbar errors/week). Client-side validation exists but is bypassable via API.",
  risk: "Medium — modifies team resolver, adds DB query, requires frontend error handling for new error type",
  planningNotes: "Target files: lambdas/db/src/resolvers/team.ts, lib/db-client/src/queries/team.ts, apps/web/src/features/teams/CreateTeamForm.tsx. Constraint: team names are case-insensitive in UI but case-sensitive in DB.",
  parent: "LS-XXXX",
  sprint: "current"
)
```

## Gotchas

- **Don't over-plan trivial tasks** — Step 1 (Scope Assessment) exists specifically to gate planning depth. A typo fix does not need 10 minutes of reconnaissance.
- **Don't plan without reading** — planning based on assumptions is worse than no planning. The reconnaissance step must involve actually reading code, not guessing what it does.
- **Risk can change during implementation** — if you discover mid-implementation that the change is higher-risk than planned, pause and re-plan. Don't push through a High-risk change with a Low-risk plan.
- **Planning output is ephemeral** — it lives in agent context, not in files. The Jira ticket `context`, `risk`, and `planningNotes` fields are where the durable record goes.

## Related Skills

- [work-ticket](../work-ticket/SKILL.md) — references this skill as Phase 0
- [debugging](../debugging/SKILL.md) — planning after reproduction, before fix
- [mcp-gaps](../mcp-gaps/SKILL.md) — planning before MCP tool implementation
- [standards](../standards/SKILL.md) — informs risk assessment with review finding patterns
