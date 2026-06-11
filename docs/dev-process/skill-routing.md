# Skill Routing

Two complementary mechanisms route agents to the right skill at the right time:

| Layer                 | Mechanism                                                                 | When it fires                                                      |
| --------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Instruction**       | Agent reads the routing table in `AGENTS.md` / skill `SKILL.md` files     | At session start or when the agent proactively loads a skill       |
| **Harness injection** | `PreToolUse` hooks in `.claude/settings.json` push reminders into context | Immediately before any `Edit`/`Write` tool call on a matching path |

Harness injection is stronger: it fires mid-task, even when the agent drifted into a new directory after session start. The routing table in `AGENTS.md` remains the human-readable source of truth; the hooks are a deterministic backstop for the rows where a missed load is expensive.

## Trigger-Critical Path Hooks (LS-7925)

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
- [`.agents/skills/terraform-permission-planning/SKILL.md`](../../.agents/skills/terraform-permission-planning/SKILL.md)
- [`.agents/skills/database/SKILL.md`](../../.agents/skills/database/SKILL.md)
- [`.agents/skills/testing/references/e2e-determinism.md`](../../.agents/skills/testing/references/e2e-determinism.md)
