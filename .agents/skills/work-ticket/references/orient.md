# Step 1 — Orient: Read the Whole Ticket

> Loaded from [work-ticket SKILL](../SKILL.md).

## Step 1: Orient — read the whole ticket

```
jira_view(key: "LS-####")
```

After `jira_view` returns, **rename the current session** to include the ticket key and summary:

```
worktree_rename_session(title: "LS-#### <summary, truncated to 80 chars>")
```

**⚠️ Critical — read the full description before continuing.** The ticket summary is never sufficient. The single most common failure mode for this skill is agents skimming the title, building a mental model from the summary alone, and producing a PR that misses ACs or violates `Out of Scope`. Defeat that mode here:

1. **Read the full `jira_view` response body** — every section, end to end. No skimming. Always pass `include: ['comments']` — clarifications, scope adjustments, and additional ACs are routinely added as comments after ticket creation.
2. **Quote back the ticket structure into your next assistant message** before any state-changing tool call (no transitions, no worktree creation, no code edits until this is done). Use this exact format. If a section is missing from the ticket, write `MISSING` — do not invent content:

   ```
   Ticket: LS-####
   Problem / Context: <quote or paraphrase>
   Acceptance Criteria:
     AC1: <verbatim>
     AC2: <verbatim>
     AC3: <verbatim>
     ...
   Technical Approach: <quote or paraphrase>
   Out of Scope: <quote or list MISSING>
   Open Questions: <quote or list MISSING>
   ```

   Numbering ACs (`AC1`, `AC2`, ...) is required — you will check each one off explicitly in the Leaf Mode self-review gate before being allowed to mark the PR ready.

3. **Self-quiz before proceeding.** You may not move past this gate until you can answer all of the following from the ticket body alone:
   - What specifically must be true when this ticket is Done?
   - What must I build, change, or delete to get there?
   - Which files or systems are in scope, and which are explicitly out of scope?
   - Is there any AC I cannot currently see a path to satisfying?

> **Precondition for implementation**: every AC must be readable, unambiguous, and answerable from the ticket body alone. If you cannot answer every self-quiz question above, the ticket is underspecified — go to Step 1c for enrichment **before planning begins**. Reading the ticket carefully now costs less than a rejected PR later.

Determine the ticket type and whether it has leaf descendants by fetching the full subtree in one call:

```
jira_get_all_descendants(key: "LS-####", status: "To Do")
```

This call traverses the full tree (not just two levels) and returns all leaf-typed To Do descendants annotated with inline blocker status (`blocked` and `blockers[]` per descendant) — no separate `jira_check_blockers` calls are needed.

| Condition                                                                         | Mode                                                                                                             |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `total == 0` (no To Do leaf descendants)                                          | **Leaf mode** — [references/leaf-mode.md](leaf-mode.md)                                                          |
| `type == "Epic"` (any epic, with or without descendants)                          | **Batch dispatch** — auto-dispatch chips, no user prompt — [references/dispatch-modes.md](dispatch-modes.md)     |
| `total > 0`, `type` in `{Story, Task}`, `--batch` flag absent                     | **Parent Dispatch** — ask the user how to dispatch — [references/dispatch-modes.md](dispatch-modes.md)           |
| `total > 0`, `--batch` present (or implied by user text or bucket-epic detection) | **Batch dispatch** — one chip per unblocked To Do descendant — [references/dispatch-modes.md](dispatch-modes.md) |

> **Bucket epic handling — per-child slash command varies by bucket.** Identify the bucket by calling `jira_get_bucket_epic` once per known bucket name (`design-sync`, `mcp-gaps`, `client-bugs`) and matching the input epic key against each returned key. Recognized bucket epics skip the user prompt and auto-batch-dispatch. Never hardcode bucket-epic keys — they rotate; no registry match → treat as a generic bucket epic (`/work-ticket` per child). Decision table: [references/bucket-epic-routing.md](bucket-epic-routing.md).
