---
name: skill-authoring
description: 'How to write and maintain SKILL.md files in this repo. Load when: creating a new skill, restructuring an existing skill, or reviewing skill guidance for clarity and enforceability. Encodes the precondition + TaskCreate pattern that replaces prevention-style "never X" prohibitions.'
---

# Skill: Skill Authoring

Conventions for writing `.agents/skills/<name>/SKILL.md` files so that future agents act on the guidance reliably.

## Core principle: preconditions and TaskCreate beat prohibitions

Prevention-style negatives ("Never do X", "⛔ Do not Y", "Avoid Z") are weaker than:

1. **Preconditions** — "Before X, verify Y" / "When in state A, do B first"
2. **Explicit TaskCreate / checklist items** — "Add `TaskCreate({ subject: 'Run migrations' })` to the task list before validating"

A future agent skimming the skill reads positive imperatives as load-bearing instructions and reads negative imperatives as background warnings. The same content lands differently depending on which voice you use.

### Why preconditions are stronger

- A prohibition tells the agent what _not_ to do but leaves the next action implicit. The agent still has to derive the right move, and may pick a different wrong move.
- A precondition names the gate (a thing to check) and the action (what to do once the gate is satisfied). Both halves are explicit.
- Preconditions read as part of the workflow rather than as a warning sidebar, so they survive context compaction.

### Why TaskCreate entries are stronger

- A checklist item the agent writes into its own task list at the start of work persists across compaction, hooks, and subagent boundaries.
- Marking a task `completed` requires the agent to have actually done the thing, so the gate is mechanically checkable.
- A prohibition in prose can be skimmed past; a `pending` task in the task list cannot.

## Reframing patterns

| Prevention phrasing                                         | Precondition phrasing                                                                                                                                                                              |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Never use `gh pr create`"                                  | "Prefer `github_create_pr` — it resolves the worktree path automatically, so the PR opens from the correct branch in multi-worktree sessions."                                                     |
| "⛔ Never use `Start-Sleep` or polling loops"               | "After pushing, continue to the next workflow step — Claude Code surfaces CI failures and review events as push notifications, so polling never provides earlier signal."                          |
| "⛔ Never start implementation while any AC is ambiguous"   | "Before writing code, self-quiz on each AC: what must be true when done? If you cannot answer from the ticket alone, run the [define](../define/SKILL.md) skill first to enrich the ticket."       |
| "Do not apply `merge-when-ready` manually"                  | "When the Reviewer Bot approves, it labels the PR with `merge-when-ready` itself — proceed to the watch step and let the merge queue pick it up."                                                  |
| "MUST result in a merged PR — never stop after PR creation" | TaskCreate at the start of `/work-ticket`: `[ ] Open draft PR`, `[ ] Mark ready`, `[ ] Reply to all bot threads`, `[ ] PR merged`, `[ ] Jira Done`, `[ ] MCP gap audit`. Each task gates the next. |

## When prohibitions are still appropriate

Some statements genuinely have no positive companion. Keep them as prohibitions when:

- The action is **catastrophic and irreversible** (commit to `main`, force-push to a shared branch, embed secrets in tool calls). These belong in the Tier 1 list in [AGENTS.md](../../../AGENTS.md), not buried in a skill.
- The action **silently breaks tooling** with no useful alternative (e.g. "never manually create `node_modules` junctions — use the setup script"). Even here, prefer "Use X. If X fails, do Y. Manual junctions are not a supported fallback."
- The agent has demonstrated a strong reflex to do the wrong thing and the prohibition is the only thing keeping it on rails. In that case, pair the prohibition with the precondition: "Before doing X, do Y. Skipping Y and doing X directly will Z."

## SKILL.md structure

Required frontmatter:

```yaml
---
name: <kebab-case slug matching directory name>
description: 'One-sentence trigger description. Load when: <comma-separated triggers>.'
---
```

The `description` field powers auto-discovery — write it as a trigger, not a summary. "Load when: writing new tests, debugging E2E flake, or updating Playwright config" tells the agent when to read the skill; "Testing utilities reference" does not.

Recommended sections (in order):

1. **One-paragraph purpose** — what the skill covers and when it applies.
2. **Critical preconditions** — the gates an agent must satisfy _before_ taking action in this domain. Phrase each as "Before X, do Y" or "When in state A, verify B."
3. **Workflow / checklist** — the explicit sequence the agent should run through, ideally numbered, ideally suitable for transcribing into TaskCreate entries.
4. **Detailed references** — link out to `references/*.md` for anything longer than a paragraph or two. Keep SKILL.md skimmable.
5. **Related skills** — cross-link with `[name](../name/SKILL.md)` so agents can navigate the graph.

## Editing existing skills

When updating a skill that contains prevention-style guidance:

1. Identify each "Never" / "Don't" / "⛔" / "Do not" bullet.
2. For each, ask: _what should the agent do instead?_ If you can answer, rewrite as "Prefer X — Y" or "Before X, do Y."
3. If the right answer is a workflow gate, suggest in the surrounding prose that the agent add it to TaskCreate at the start of the relevant workflow.
4. Keep prohibitions only for the catastrophic / silently-breaking cases above, and pair them with the positive alternative inline.

## Related skills

- [standards](../standards/SKILL.md) — coding standards that skills should reference rather than re-state.
- [dev-process](../dev-process/SKILL.md) — the workflow framework skills slot into.
- [mcp-first](../mcp-first/SKILL.md) — example of a skill that benefited from converting "never use `gh`" prohibitions into "prefer the MCP tool because…" preconditions.
