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

| Prevention phrasing                                         | Precondition phrasing                                                                                                                                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "Never use `gh pr create`"                                  | "Prefer `github_create_pr` — pass `head` set to the local branch name (from `worktree_status().headRefName`) so the PR opens from the correct branch in multi-worktree sessions."                            |
| "⛔ Never use `Start-Sleep` or polling loops"               | "After pushing, continue to the next workflow step — Claude Code surfaces CI failures and review events as push notifications, so polling never provides earlier signal."                                    |
| "⛔ Never start implementation while any AC is ambiguous"   | "Before writing code, self-quiz on each AC: what must be true when done? If you cannot answer from the ticket alone, run the [define flow](../plan-ticket/references/define.md) first to enrich the ticket." |
| "Do not apply `merge-when-ready` manually"                  | "When the Reviewer Bot approves, it labels the PR with `merge-when-ready` itself — proceed to the watch step and let the merge queue pick it up."                                                            |
| "MUST result in a merged PR — never stop after PR creation" | TaskCreate at the start of `/work-ticket`: `[ ] Open draft PR`, `[ ] Mark ready`, `[ ] Reply to all bot threads`, `[ ] PR merged`, `[ ] Jira Done`, `[ ] MCP gap audit`. Each task gates the next.           |

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

## Anti-drift rules (2026-07-02 audit)

The 2026-07 skills audit found ~90 material contradictions across the corpus, nearly all produced by the same few mechanical failure modes. Every one of these rules exists because its violation was found live, multiple times. `scripts/lint-skills.js` enforces the mechanically-checkable subset (run `node scripts/lint-skills.js`); the rest are review gates for any PR touching a skill.

### 1. One home per fact

State each fact (an ordering, a cap, a port, a label rule, a path) in **exactly one** file; everywhere else, link to that home. Restating "for convenience" is how drift happens: the audit found the ticket-to-merge step ordering restated-and-drifted in 4+ files, and a closed incident typically updated 2 of ~6 restatements. Before writing a fact, ask: does this fact already have a home? If yes, link — `[pr-lifecycle](../pr-lifecycle/SKILL.md)` — and state at most a one-line binding ("validation chunks: see X").

Specifically: **step ordering for the ticket-to-merge flow has one home** — `workflow-overview/references/ticket-to-merge-spine.md`. No other skill may enumerate a numbered sequence that contains both a PR-creation step and a validation step; write "follow the spine, steps N–M" plus any local binding instead. (`lint-skills.js` warns on likely violations; the rule itself is manual.)

### 2. Cite anchors and symbols, never line numbers

`file.ts:NNN`-style citations (a path plus a literal line number) were wrong in 6+ places the audit checked — line numbers rot on the next edit and nothing detects it. Cite instead:

- a heading anchor: `[the skip-ci footgun](...#the-skip-ci-footgun-pr-stuck-at-expected)`
- a symbol or constant: "`MAX_CYCLE` in `.github/scripts/reviewer/lib/cycle-counter.mjs`"
- a stable marker string: "the `_PC_*_CMD` block in the Makefile"

`lint-skills.js` warns on `:<digits>` citations in skill files.

### 3. No unmaintained counts

"56 skills", "19 packages", "40 workflows" — all three were wrong at audit time. Never write a count of things that can grow; write "see `.agents/skills/`" or "the lambdas under `lambdas/`". Counts are acceptable only for closed sets that change via explicit decision (e.g. "the 4 required merge contexts") and must then name the source of truth.

### 4. Verify before citing

Never copy a command, flag, path, port, tool name, or target from another doc — docs were the #1 source of wrong facts. Verify against ground truth first: the actual config, the actual server tool registry, the actual script. Recipes per claim type live in [ground-truth-verification](../ground-truth-verification/SKILL.md). Corollary: **never reference a skill or MCP tool that you have not confirmed exists** (`ls .agents/skills/<name>`, grep the server's `src/` registry). `lint-skills.js` errors on unresolvable relative links and on a denylist of known-retired tool names.

### 5. Date-stamp volatile facts

Any fact that is a snapshot of external or mutable state (live ruleset status, launch state, an open bug, "X is being fixed") gets an inline date: "as of 2026-07-02, …". Undated snapshots become silent lies. Unproven or open items stay labeled **OPEN** or **candidate** — no oversell.

### 6. End every skill with Provenance and maintenance

Every new skill and every fully-rewritten SKILL.md ends with a `## Provenance and maintenance` section containing: the date, what produced/last-verified it, and a one-line re-verification command for each volatile fact in the file, e.g.:

```markdown
## Provenance and maintenance

- 2026-07-02: rewritten from the skills audit (scratch/skills-audit/).
- Verify port: `grep -n '"port"' apps/web/project.json`
- Verify tool list: `grep -A1 "^server.tool(" tools/mcp/<server>/src/index.ts`
```

This makes the next editor's freshness check copy-pasteable instead of archaeological.

## Related skills

- [standards](../standards/SKILL.md) — coding standards that skills should reference rather than re-state.
- [dev-process](../dev-process/SKILL.md) — the workflow framework skills slot into.
- [ground-truth-verification](../ground-truth-verification/SKILL.md) — per-claim-type verification recipes backing anti-drift rule 4.
- [mcp-first](../mcp-first/SKILL.md) — example of a skill that benefited from converting "never use `gh`" prohibitions into "prefer the MCP tool because…" preconditions.

## Provenance and maintenance

- 2026-07-02: anti-drift rules added from the skills audit (`scratch/skills-audit/synthesis.json`); earlier sections predate it.
- Verify lint enforcement matches this doc: `node scripts/lint-skills.js` and read the check list at the top of `scripts/lint-skills.js`.
- Verify spine home still exists: `ls .agents/skills/workflow-overview/references/ticket-to-merge-spine.md`
