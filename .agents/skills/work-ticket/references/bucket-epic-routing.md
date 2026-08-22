# Bucket-epic routing

When `/work-ticket LS-####` is invoked with a **bucket epic** key, the orchestrator routes to a dispatch mode (see [SKILL.md](../SKILL.md) Step 1 and [dispatch-modes.md](dispatch-modes.md)) and fans out one chip per To Do child. The slash command embedded in each chip prompt depends on the bucket type — different buckets have different per-child workflows.

## Decision table

Identify the bucket by calling `jira_get_bucket_epic({ bucket: "<name>" })` for each known bucket name and matching the orchestrator's input epic key against the resolved keys. The registry is the **canonical and only** source of truth — if no known bucket resolves to the input epic, treat it as a generic bucket epic (fan out via `/work-ticket`) rather than guessing routing from labels or summary prefixes.

| Bucket             | Resolve via                                       | Per-child slash command                                                                                                                                                                                                | Extra chip context                                                                                                                                 |
| ------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **design-sync**    | `jira_get_bucket_epic({ bucket: "design-sync" })` | `/implement-design LS-####` — **except** children labeled `design-source-fix`, `design-brief`, or `design-sync` (or whose description carries a `DISPATCH NOTE` naming a command), which go via `/work-ticket LS-####` | `docs/design/<design-id>/` bundle path — derive `<design-id>` from the child's description or `originDesignId` field if surfaced                   |
| **mcp-gaps**       | `jira_get_bucket_epic({ bucket: "mcp-gaps" })`    | `/work-ticket LS-####`                                                                                                                                                                                                 | None — the child ticket already carries its full repro/scope                                                                                       |
| **client-bugs**    | `jira_get_bucket_epic({ bucket: "client-bugs" })` | `/work-ticket LS-####`                                                                                                                                                                                                 | None — the child ticket carries the bug repro. (`/work-bugs` is the **bucket-level dispatcher** with no `$ARGUMENTS`; do not invoke it per-child.) |
| Other bucket epics | no registry match                                 | `/work-ticket LS-####`                                                                                                                                                                                                 | One-line summary of the bucket's purpose if visible in the epic description; otherwise omit                                                        |

> The custom Jira MCP server's `jira_get_bucket_epic` is the canonical lookup. Hardcoded keys (e.g. LS-2981 for `mcp-gaps`) drift as buckets rotate; **never** hardcode.

## Chip prompt selection

Once the bucket is identified, swap the slash command and context section in the chip template — the rest of the chip template (claim atomically, load Skill, drive to merge) stays the same. See [dispatch-modes.md](dispatch-modes.md) Parent Dispatch Mode step 5 for the canonical template; the per-bucket variations:

**design-sync — two child kinds.** Bundle-implementation tickets (filed by `/sync-designs`, unlabeled) use the `/implement-design` chip below. Design-**source**-fix tickets (labeled `design-source-fix` — e.g. the LS-8954 re-run wave — plus process tickets labeled `design-brief`/`design-sync`) must instead use the canonical `/work-ticket` chip template from [dispatch-modes.md](dispatch-modes.md): their work happens **in Claude Design via the DesignSync tool**, and `/implement-design` would wrongly run the completeness gate and implement code from a stale bundle. When a child's description contains a `DISPATCH NOTE`, it wins over the table default.

**design-sync bundle-implementation (per-child chip):**

```
mcp__ccd_session__spawn_task({
  title: "Work LS-<child> (<short summary>)",
  tldr: "Implement design ticket LS-<child> (child of LS-<epic>).",
  prompt: `Implement Jira ticket LS-<child> via /implement-design.

Ticket: LS-<child> — <one-line summary, scrubbed>
Originating epic: LS-<epic> (design-sync bucket)
Design bundle: docs/design/<design-id>/

Claim the ticket atomically via jira_claim_ticket as your first action, then run the /implement-design command — which loads Skill(skill: "design-sync") + Skill(skill: "frontend-design") — and follow it end-to-end. /implement-design owns the design-bundle read, completeness gate, slicing decision, and drive-to-merge for design tickets.

Drive to merge per AGENTS.md. A task is complete only when the PR is MERGED and Jira is "Done".`
})
```

**mcp-gaps / client-bugs / generic (per-child chip):** use the canonical work-ticket chip template in [dispatch-modes.md](dispatch-modes.md) Parent Dispatch Mode step 5 verbatim — the per-child workflow is the same as a standalone leaf ticket.

## Gotcha: filing GAP bugs under a bucket's own Story

Some bucket tickets (e.g. an umbrella Story like "Feature Discovery Gaps Bucket") word their own acceptance criteria as "file GAP-### bugs as a child of this Story." Doing that literally — `jira_create_ticket({ type: "Bug", parent: "<story-key>" })` — 400s with `"Please select valid parent issue"`: Jira's hierarchy only allows an **Epic** to parent a Bug/Task, never a Story (LS-8481). `jira_create_ticket`'s error response now includes a `hint` field pointing at the workaround when it detects this case.

The established workaround (see LS-7607 → LS-7657/LS-7658): parent the GAP bug to the bucket's **page Epic** instead, then link it to the bucket Story with `jira_link_issues({ inwardKey: "<gap-bug-key>", outwardKey: "<story-key>", linkType: "Relates" })`. Full mechanics: [plan-ticket's umbrella grouping pattern](../../plan-ticket/references/create.md#umbrella-grouping-pattern).

## Scope skip-list (when fanning out)

Skip a child during fan-out when **any** of these are true:

- Status is `In Progress`, `In Review`, or `Done` (not `To Do`)
- blocker state shows unresolved blockers (surface in the user prompt rather than silently dispatching) — read it inline from the listing call (`includeBlockers: true`) or batch it with `jira_check_blockers({ keys: [...] })`
- A PR already exists for the ticket (`github_pr_dashboard(state: "all", limit: 50)` + filter by key)

A ticket skipped for any of these reasons remains visible in the user's pre-dispatch prompt (annotated) — it is not silently dropped.

## See also

- [SKILL.md](../SKILL.md) — Step 1 ticket inspection and mode routing
- [dispatch-modes.md](dispatch-modes.md) — Parent Dispatch Mode, batch dispatch, chip templates
- [`.agents/skills/design-sync/SKILL.md`](../../design-sync/SKILL.md) — design-sync bucket consumer flow
- [`.agents/skills/mcp-first/references/gaps.md`](../../mcp-first/references/gaps.md) — mcp-gaps bucket consumer flow
