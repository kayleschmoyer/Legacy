# Skill Routing

**Epic:** LS-7922 — Agent-agnostic skill routing

Two complementary mechanisms route agents to the right skill at the right time:

| Layer                 | Mechanism                                                                       | When it fires                                                      |
| --------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Instruction**       | Agent reads the generated routing index `.agents/skills/INDEX.md` at task start | At task start or when the agent proactively loads a skill          |
| **Harness injection** | `PreToolUse` hooks in `.claude/settings.json` push reminders into context       | Immediately before any `Edit`/`Write` tool call on a matching path |

Harness injection is stronger: it fires mid-task, even when the agent drifted into a new directory after session start. SKILL.md frontmatter is the source of routing truth; the hooks are a deterministic backstop for the rows where a missed load is expensive.

---

# Instruction layer: the generated Skill Routing Index (LS-8355, supersedes the eager table of LS-7921)

## Goal

Keep the always-loaded agent context small: `AGENTS.md` carries only a short routing contract, and the full routing table lives in [`.agents/skills/INDEX.md`](../../.agents/skills/INDEX.md), read on demand at task start. The index is **generated** from each SKILL.md's frontmatter so it cannot drift.

## Principles

1. **Skill bodies live in exactly one place**: `.agents/skills/<name>/SKILL.md`. Never injected eagerly into any agent context; loaded only on `Read`.
2. **Routing facts live in exactly one place: SKILL.md frontmatter.** `description` is the load-when trigger; `metadata.scope` is the comma-separated path globs (`**` = repo-wide); `metadata.deprecated: 'true'` marks tombstone pointers. Adding a skill = write `SKILL.md` (frontmatter included) + `make sync-skill-index`.
3. **INDEX.md is generated output** (`scripts/generate-skill-index.mjs`), listed in `.prettierignore`, and drift-checked by `.github/checks/skill-index-sync.sh` in CI's custom-checks job. `make lint-skills` errors on a skill missing `metadata.scope`.
4. **AGENTS.md carries the contract, not the data**: a three-paragraph § Skills section instructing agents to read the index at task start and re-read it on directory change or after compaction, naming only `dev-process` and `mcp-first` as read-always skills.
5. **Scoping is metadata, not file location**: `frontend-design` scopes to `apps/web/**`, `apps/app/**`, `lib/shared-components/**` even though the skill file is in `.agents/skills/`.

## History: eager table (LS-7921) → lazy generated index (LS-8355)

LS-7921 (2026-06) put the routing table inline in AGENTS.md, arguing "eagerness is what makes instruction-routing reliable" and estimating the table at ~1K tokens. By 2026-07 the table had grown to ~15.6KB (~4K tokens, over half of AGENTS.md) and restated every skill's triggers — a standing "one home per fact" violation that the 2026-07 skills audit flagged as a top drift source. On 2026-07-07 the owner requested on-demand routing (LS-8355): the table moved behind a generated index, and reliability is now carried by (a) the short always-loaded contract in AGENTS.md § Skills, (b) the harness-injection hooks below, and (c) the CI drift check the LS-7921 design deferred as future work.

## Rejected Alternatives

| Alternative                                                                                                                  | Why rejected                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Symlinking `.claude/skills → .agents/skills`                                                                                 | Rejected in LS-7921 and again in LS-8355: re-eagerizes all skill descriptions (~2–4 K tokens/session, against the on-demand goal), collides with `.claude/commands` names (`database`, `work-ticket`, `slice`, …), Windows symlink + git friction. The stray `.claude/skills` file (committed as a plain file, mode 100644 — never a working symlink) was removed in LS-8355. |
| Moving skill bodies into project dirs (e.g. `frontend-design → lib/shared-components`)                                       | Saves zero tokens (bodies already lazy), breaks hardcoded cross-refs, mis-scopes triggers                                                                                                                                                                                                                                                                                     |
| Generated per-agent shims (nested CLAUDE.md, `.cursor/rules/*.mdc`, `.github/instructions` per skill, via `make skills-gen`) | Adds per-agent generator machinery; the single generated INDEX.md serves every agent that reads AGENTS.md                                                                                                                                                                                                                                                                     |
| Keeping the eager table in AGENTS.md (LS-7921 status quo)                                                                    | ~4K always-loaded tokens per session across every agent, and a hand-maintained restatement of frontmatter that demonstrably drifted                                                                                                                                                                                                                                           |

## Prose Migrations

Three blocks of AGENTS.md procedural prose were relocated to skill bodies in LS-7921:

| Prose                                                        | Destination                            | Content                                                                                                                                 |
| ------------------------------------------------------------ | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Atlassian plugin bug workarounds (LS-3715/LS-3771/LS-3810)   | `.agents/skills/mcp-first/SKILL.md`    | `getJiraIssue` returns wrong issue; `createJiraIssue`/`transitionJiraIssue` cold-start encoding bug; response-body verification pattern |
| `node_modules` pool mechanics + `pnpm exec nx reset` warning | `.agents/skills/repo-tooling/SKILL.md` | Immutable pool slots, setup commands, LS-5242 (`nx reset` destroys symlink)                                                             |
| CI watch/polling antipatterns                                | `.agents/skills/pr-lifecycle/SKILL.md` | Already present (Critical Rules 9, 11, 13); AGENTS.md now points there                                                                  |

## Drift Prevention (delivered in LS-8355)

- `scripts/generate-skill-index.mjs --check` (CI: `.github/checks/skill-index-sync.sh`; local: `make lint-skill-index`) fails when INDEX.md is stale — which also guarantees every skill directory has a row, since the generator enumerates `.agents/skills/*/`.
- `scripts/lint-skills.js` (CI custom-checks; local: `make lint-skills`) errors when a skill's frontmatter lacks `metadata.scope`.

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

| Path glob                        | Skill to load                                                                 | Why it matters                                                                                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `terraform/**/*.tf`              | `.agents/skills/terraform/SKILL.md` (and `references/permission-planning.md`) | A missed load costs CI AccessDenied cycles — `terraform plan` doesn't validate IAM; the skill enforces predict → diff → patch → local-plan-as-CI-role before push. |
| `lib/db-client/**/migrations/**` | `.agents/skills/database/SKILL.md` (or `/database` skill)                     | Migration immutability rules apply — applied migrations must never be edited; missed load leads to schema drift that blocks other developers.                      |
| `apps/web-e2e/**`                | `.agents/skills/testing/references/e2e-determinism.md`                        | E2E flake is a P1 bug; the 12-lever determinism checklist gates every PR touching E2E or integration tests.                                                        |

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

- [AGENTS.md § Skills](../../AGENTS.md#skills) — the always-loaded routing contract.
- [`.agents/skills/INDEX.md`](../../.agents/skills/INDEX.md) — the generated routing table agents read at task start.
- [`.claude/settings.json`](../../.claude/settings.json) — full hook configuration.
- [LS-7922](https://bkrupa.atlassian.net/browse/LS-7922) — epic; full design and rejected alternatives.
- [`.agents/skills/terraform/SKILL.md`](../../.agents/skills/terraform/SKILL.md) (and [`references/permission-planning.md`](../../.agents/skills/terraform/references/permission-planning.md))
- [`.agents/skills/database/SKILL.md`](../../.agents/skills/database/SKILL.md)
- [`.agents/skills/testing/references/e2e-determinism.md`](../../.agents/skills/testing/references/e2e-determinism.md)
