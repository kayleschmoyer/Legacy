# Skill Routing

**Epic:** LS-7922 — Agent-agnostic skill routing

Two complementary mechanisms route agents to the right skill at the right time:

| Layer                 | Mechanism                                                                 | When it fires                                                      |
| --------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Instruction**       | Agent reads the routing table in `AGENTS.md` / skill `SKILL.md` files     | At session start or when the agent proactively loads a skill       |
| **Harness injection** | `PreToolUse` hooks in `.claude/settings.json` push reminders into context | Immediately before any `Edit`/`Write` tool call on a matching path |

Harness injection is stronger: it fires mid-task, even when the agent drifted into a new directory after session start. The routing table in `AGENTS.md` remains the human-readable source of truth; the hooks are a deterministic backstop for the rows where a missed load is expensive.

---

# Instruction layer: the Skill Routing table (LS-7921)

## Goal

Replace AGENTS.md's inline prose trigger-lines with a compact Skill Routing table — the single source of scoping truth for ALL coding agents (Claude Code, Copilot, Cursor, Codex) — and push procedural prose into lazily-loaded skill bodies.

## Principles

1. **Skill bodies live in exactly one place**: `.agents/skills/<name>/SKILL.md`. Never injected eagerly into any agent context; loaded only on `Read`.
2. **Scoping lives in exactly one routing table**: the table in AGENTS.md. One row per skill directory. Adding a skill = write `SKILL.md` + add one table row.
3. **Per-agent files are static pointers**: they contain no skill data and cannot drift. Claude Code reads AGENTS.md natively; Codex/Copilot also read AGENTS.md; Cursor gets a routing instruction in `.cursor/rules/`; VS Code Copilot gets `.github/instructions/skill-routing.instructions.md`.
4. **Scoping is metadata, not file location**: `frontend-design` scopes to `apps/web/**`, `apps/app/**`, `lib/shared-components/**` even though the skill file is in `.agents/skills/`. The table is the only place that declares what paths trigger what skill.

## Table Format

```
| Scope (globs) | Skill | Load when |
| ------------- | ----- | --------- |
```

- **Scope**: one or more path globs (comma-separated if multiple). `**` means repo-wide.
- **Skill**: relative path to the skill directory (SKILL.md is implied).
- **Load when**: one-line trigger — the condition under which an agent reading the table should `Read` that skill's SKILL.md before proceeding.

## Preamble Instruction

The table is preceded by:

> Before starting work, and again whenever your task moves into a new directory, `Read` every skill whose scope matches the files you're touching.

## Why Eager Table, Not Lazy Pointer

The table stays in AGENTS.md (not behind an indirection) because eagerness is what makes instruction-routing reliable. An agent that doesn't know to look up a pointer will skip it entirely. ~52 rows ≈ ~1K eager tokens — negligible compared to the 10–12K the previous inline prose occupied.

## Rejected Alternatives

| Alternative                                                                                                                  | Why rejected                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Symlinking `.claude/skills → .agents/skills`                                                                                 | Re-eagerizes all 52 skill descriptions (~2–4 K tokens/session), name collisions with commands, Windows symlink + git friction |
| Moving skill bodies into project dirs (e.g. `frontend-design → lib/shared-components`)                                       | Saves zero tokens (bodies already lazy), breaks hardcoded cross-refs, mis-scopes triggers                                     |
| Generated per-agent shims (nested CLAUDE.md, `.cursor/rules/*.mdc`, `.github/instructions` per skill, via `make skills-gen`) | Adds generator + drift-check machinery solving a duplication problem the routing table eliminates outright                    |

## Prose Migrations

Three blocks of AGENTS.md procedural prose were relocated to skill bodies in LS-7921:

| Prose                                                        | Destination                            | Content                                                                                                                                 |
| ------------------------------------------------------------ | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Atlassian plugin bug workarounds (LS-3715/LS-3771/LS-3810)   | `.agents/skills/mcp-first/SKILL.md`    | `getJiraIssue` returns wrong issue; `createJiraIssue`/`transitionJiraIssue` cold-start encoding bug; response-body verification pattern |
| `node_modules` pool mechanics + `pnpm exec nx reset` warning | `.agents/skills/repo-tooling/SKILL.md` | Immutable pool slots, setup commands, LS-5242 (`nx reset` destroys symlink)                                                             |
| CI watch/polling antipatterns                                | `.agents/skills/pr-lifecycle/SKILL.md` | Already present (Critical Rules 9, 11, 13); AGENTS.md now points there                                                                  |

## Drift Prevention (LS-7922 child — not LS-7921)

A future `custom-checks` CI assertion will verify:

- Every directory under `.agents/skills/` has a row in the routing table.
- Every path referenced in the table exists.

Until that lint lands, the table is maintained manually. Adding a skill requires a table row in the same PR.

## Dead/Potentially Unused Skills

Flagged during LS-7921 bucketing pass. Do not delete until a separate pruning ticket investigates usage:

| Skill                                               | Reason flagged                                                                                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cloud-teleport`                                    | Protocol described in skill body but not referenced by any other skill or workflow step; unclear if any agent implements it                                                    |
| `jira-rollover`                                     | Operational-only (sprint boundaries); no code path; may be superseded by manual or automated sprint tooling                                                                    |
| `pr-lifecycle` (sweep/sweep-prs/unblock references) | Consolidated under `pr-lifecycle` per LS-8231 — the former `open-prs`/`sweep-prs`/`unblock-prs` skills now live as references under `.agents/skills/pr-lifecycle/references/`. |

---

# Harness-injection layer: trigger-critical path hooks (LS-7925)

These hooks are registered in the `PreToolUse → ^(Edit|Write)$` entry in [`.claude/settings.json`](../../.claude/settings.json). The hook script is [`.claude/hooks/inject-skill-reminder.js`](../../.claude/hooks/inject-skill-reminder.js).

| Path glob                        | Skill to load                                             | Why it matters                                                                                                                                                     |
| -------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `terraform/**/*.tf`              | `.agents/skills/terraform-permission-planning/SKILL.md`   | A missed load costs CI AccessDenied cycles — `terraform plan` doesn't validate IAM; the skill enforces predict → diff → patch → local-plan-as-CI-role before push. |
| `lib/db-client/**/migrations/**` | `.agents/skills/database/SKILL.md` (or `/database` skill) | Migration immutability rules apply — applied migrations must never be edited; missed load leads to schema drift that blocks other developers.                      |
| `apps/web-e2e/**`                | `.agents/skills/testing/references/e2e-determinism.md`    | E2E flake is a P1 bug; the 12-lever determinism checklist gates every PR touching E2E or integration tests.                                                        |

### Behaviour

- The reminder fires **once per session per category** (deduplicated via session-scoped marker files under OS temp, keyed by `session_id`).
- The hook is **advisory only** — it never blocks a tool call (always exits 0).
- The hook is **pure Node** (`node .claude/hooks/inject-skill-reminder.js`) with `windowsHide: true` to prevent console window flash on Windows.
- Cursor and Copilot Coding Agent do not run Claude Code hooks (LS-7802); their backstop is CI (existing migration immutability check, etc.).

### Adding new rows

1. Add a `{ pattern, marker, message }` entry to the `RULES` array in `.claude/hooks/inject-skill-reminder.js`.
2. Add the corresponding row to the table above.
3. The pattern is a JavaScript `RegExp` tested against the normalized (forward-slash) absolute file path.

## See also

- [AGENTS.md § Skills](../../AGENTS.md#skills) — the instruction-routing table agents read at session start.
- [`.claude/settings.json`](../../.claude/settings.json) — full hook configuration.
- [LS-7922](https://bkrupa.atlassian.net/browse/LS-7922) — epic; full design and rejected alternatives.
- [`.agents/skills/terraform-permission-planning/SKILL.md`](../../.agents/skills/terraform-permission-planning/SKILL.md)
- [`.agents/skills/database/SKILL.md`](../../.agents/skills/database/SKILL.md)
- [`.agents/skills/testing/references/e2e-determinism.md`](../../.agents/skills/testing/references/e2e-determinism.md)
