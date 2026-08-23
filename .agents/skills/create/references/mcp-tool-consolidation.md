# MCP Tool-Consolidation Standard

The token-discipline standard for the **tool surface** of our in-repo MCP servers
(`tools/mcp/*`). Foundation deliverable of epic **LS-9701** (LS-9702).
Third-party / hosted servers we don't control (Atlassian, Stripe,
Claude-in-Chrome, computer-use) are **out of scope** — do not touch them.

Companion to [mcp-response-format.md](mcp-response-format.md). The two cover
different costs and are not substitutes:

| Standard                                         | Cost it controls                                           | Paid                           |
| ------------------------------------------------ | ---------------------------------------------------------- | ------------------------------ |
| [mcp-response-format.md](mcp-response-format.md) | **Response** payload — what a tool returns                 | Once per call                  |
| **This file**                                    | **Definition** surface — name + description + input schema | Always resident, every session |

## Why

A tool definition is not free just because nobody calls the tool. Names,
descriptions, and input schemas are advertised to the model up front, so every
registered tool bills every session before a single call happens.

Measured 2026-08-23 (`scripts/mcp-token-measure/lib/tokenize.mjs` over
`docs/mcp/api-reference.json`): **256 tools, ~89,250 tokens of definitions**,
averaging 349 tokens/tool. The count has only ever gone up — 81 (April) → 173
(June) → 219 (August) — with no net removal.

Two facts should shape every decision here:

1. **Input schemas cost roughly 2× descriptions.** For `legacy-sports-github`:
   11,301 tokens of schema vs 5,651 of description. LS-1726 trimmed descriptions
   and left the larger half untouched. Optimize schemas first.
2. **Adding a tool is the expensive way to add a capability.** An `action` value
   on an existing tool reuses the name, the shared params, and the description
   framing. A new tool re-pays all of it.

> **Deferred tool loading is a mitigation, not a solution.** Some clients
> (Claude Code via `ToolSearch`) load schemas on demand, so the full surface
> isn't resident there. The Copilot cloud agent uses a static config with
> `tools: ["*"]` for most servers and gets everything. Design for the client
> that pays full price.

## The four rules

### 1. Prefer an action param over a new tool

Before adding a tool, ask: **could this be an `action` value, or an optional
param, on an existing tool in the same server?** Add a new tool only when the
answer is no.

Add an action to an existing tool when the operations:

- share a domain noun (`jira_transition`, `worktree_reset`, `ci_workflow_*`), **and**
- share most of their input schema, **and**
- are things one agent does in one stretch of work.

Add a genuinely new tool when:

- the schemas have little in common (forcing them together produces a wide
  union of mutually-exclusive optional params — that is worse, not better;
  see [Anti-pattern: the union schema](#anti-pattern-the-union-schema)), or
- the domains are unrelated, or
- a session would plausibly need one and never the other.

### 2. Deregister what you supersede — in the same PR

**A consolidation PR MUST remove the superseded tool's registration.** Keeping
it as a "thin alias" yields **zero** token savings and is explicitly forbidden.

This is not hypothetical. `jira_transition` absorbed the claim and bulk actions
and grew to 1,361 tokens — the second most expensive definition in the repo —
while `jira_claim_ticket` (622) and `jira_bulk_transition` (171) stayed
registered as aliases. Net effect: **+740 tokens for a change intended to save.**
The same happened on github with `github_list_review_comments` (319) and
`github_list_pr_inline_comments` (294) after `github_list_pr_comments` replaced
them.

A consolidation PR is not done until:

- [ ] The superseded tool's registration is removed from the stdio server.
- [ ] It is removed from the **hosted Lambda mirror** too. `lambda.ts` drifts
      behind `index.ts` (LS-9509) — diff the tool literals, don't assume.
- [ ] Every call site is updated: `.agents/skills/**`, `.claude/commands/**`,
      `.github/prompts/**`, `.cursor/`, `.opencode/`, `.codex/`, `docs/**`.
      Grep the bare tool name; a dangling pointer is worse than the alias was.
- [ ] `make mcp-api-reference` regenerated and committed.
- [ ] The measured token delta is in the PR description (rule 4).

Back-compat belongs at the **param** level, not the tool level: keeping
`prNumber` accepted as an alias for `number` costs a schema entry; keeping a
whole tool costs a full definition.

### 3. Per-action detail goes in a skill, not the description

The tool description is always-resident. A skill under `.agents/skills/` loads
only when an agent is actually doing that work. Put the minimum in the
description that lets a model **choose** the tool, and put everything needed to
**use it well** in the skill.

| Belongs in the description                  | Belongs in the skill                                    |
| ------------------------------------------- | ------------------------------------------------------- |
| What the tool does, in one or two sentences | When to prefer action A over action B                   |
| The `action` enum values, terse             | Param-combination recipes and worked examples           |
| Hard safety constraints ("READ-ONLY")       | Precedence rules, fallback chains, env-var interactions |
| A pointer to the skill                      | Gotchas, failure modes, ticket history                  |

`jira_transition` is the current worst offender: its description carries
multi-paragraph claim-precedence prose (assignee resolution order, env-var
fallbacks, shared-Lambda caveats) that matters only to a session claiming a
ticket — which is exactly a session that has already loaded
[work-ticket](../../work-ticket/references/leaf-mode.md).

### 4. Measure the delta

Any PR that adds, consolidates, or re-describes a tool records **before/after
definition tokens** in its description:

```bash
node scripts/mcp-token-measure/measure.mjs --json
```

Cite absolute token counts, not just percentages. Use
`--backend=anthropic` when the PR needs exact, citable numbers; the default
offline estimator is fine for ranking and relative deltas.

CI enforces per-server ceilings on both count and definition tokens
(`make lint-mcp-api-reference`). When a consolidation lands, **lower the ceiling
to the new measured value in the same commit** — otherwise the savings are
quietly re-spent by the next tool that gets added.

## The action-enum pattern

One tool per domain verb. Minimal shared schema. `action` as a Zod `.enum()`
with per-action params `.optional()`.

```ts
server.tool(
  'jira_transition',
  // Terse. The "how" lives in .agents/skills/work-ticket/.
  'Transition ticket(s) to a new status. Accepts a single key or an array (1-50). ' +
    "action='claim' sets the assignee and transitions atomically.",
  {
    // Shared across every action — carries most of the schema weight once.
    keys: z
      .union([TICKET_KEY, z.array(TICKET_KEY).min(1).max(50)])
      .describe('Ticket key or array of ticket keys'),
    status: z.string().min(1).describe('Target status'),

    action: z.enum(['transition', 'claim']).default('transition'),

    // Action-scoped — optional, and named so the scoping is obvious.
    assignee: z.string().email().optional().describe("action='claim' only"),
  },
  handler,
);
```

Prefer widening an existing param over adding a new one. `jira_view`'s
`key: string | string[]` and github's `number` / `prs` scalar-or-array shape
each collapse what would otherwise be a second tool into one `z.union`.

### Anti-pattern: the union schema

Consolidation is a win only when the actions **share** schema. Merging unrelated
tools produces a schema that is the union of all their params, every one
optional, with the real constraints expressed only in prose:

```ts
// Don't. This costs more than two tools and validates nothing.
{
  action: z.enum(['tail_logs', 'describe_secret', 'run_command', 'get_policy']),
  logGroup: z.string().optional(),   // tail_logs only
  secretId: z.string().optional(),   // describe_secret only
  instanceId: z.string().optional(), // run_command only
  policyArn: z.string().optional(),  // get_policy only
  // ...12 more mutually-exclusive optionals
}
```

If more than roughly half the params are action-scoped, the tools don't belong
together. Keep them separate and trim their schemas instead.

## Batch and bulk variants

Batch variants are a **frequent source of avoidable tool growth**. The default
is now: **widen the existing tool's param to accept a scalar or an array**,
rather than registering a second tool.

```ts
keys: z.union([TICKET_KEY, z.array(TICKET_KEY).min(1).max(50)]);
```

Register a separate `bulk_*` / `*_batch` tool only when the batch path needs a
materially different schema or result shape — not merely because it loops. Full
result-shape, partial-failure, and size-limit contract:
[mcp-batch-tool-convention.md](mcp-batch-tool-convention.md).

## Trimming an existing tool's schema

Schemas are the larger half. In priority order:

1. **Collapse duplicate params.** The `number` / `prNumber` alias pair appears in
   ~18 github tools and is pure duplication in every schema carrying it. Pick a
   canonical name; keep the alias accepted at runtime only if call sites still
   need it.
2. **Replace wide flag sets with an enum.** Six booleans is six schema entries
   plus six descriptions; one `.enum()` is one.
3. **Drop dead params.** Grep the repo before assuming a param is live — plenty
   were added speculatively and no skill or command passes them.
4. **Shorten `.describe()` on obvious params.** `key: 'Ticket key'` needs no
   sentence. Reserve description budget for params whose semantics are genuinely
   non-obvious.

Every param still needs a `.describe()` — this is about length, not omission.

## Review checklist note

Reviewers: see **pattern #48** in
[`common-review-patterns.md`](../../pr-lifecycle/references/common-review-patterns.md)
— a new tool where an action param would do, or a consolidation that leaves the
superseded tool registered.

## See also

- [mcp-response-format.md](mcp-response-format.md) — the response-payload standard.
- [mcp-batch-tool-convention.md](mcp-batch-tool-convention.md) — batch result shape.
- [create-mcp-server.md](create-mcp-server.md) — server scaffolding and registration.
- `scripts/mcp-token-measure/README.md` — the measurement harness.
