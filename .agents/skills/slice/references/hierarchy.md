# Slice — Hierarchy (convert, shared children, repair)

> Sub-reference of [`slice`](../SKILL.md) Step 4 (LS-11007).

#### 4a. Make the parent a container

A `Story` / `Task` / `Bug` cannot parent a `Task` (`jira_set_parent` / `parent:` 400s — the message may read "Issues with this Issue Type must be created in the same project as the parent" or "Please select valid parent issue"; both are an issue-type hierarchy error, not a project mismatch). See [plan-ticket → Hierarchy](../../plan-ticket/references/create.md#hierarchy).

| Parent type    | Action                                                                                                                                                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Epic`         | Nothing to do — parent children directly.                                                                                                                                                                                                                                   |
| Story/Task/Bug | **Convert it to an Epic first** (default): `jira_view` it, remember its parent Epic, then `jira_edit_ticket({ key, type: "Epic" })`. Once sliced, its own scope _is_ the children, so it becomes a pure container. Preserve its description — it remains the umbrella spec. |

After converting, **verify** with `jira_view(key)` that `type` is `Epic` and that its original parent Epic is still set; if the type change dropped the parent (LS-7218 ended with an empty parent), restore it with `jira_set_parent({ key, parent: "<original-epic>" })` — Epic→Epic parentage is valid in this project and keeps bucket/page roll-ups intact. Do this _before_ creating children so a failed conversion costs nothing.

Skip the conversion and fall back to the [umbrella grouping pattern](../../plan-ticket/references/create.md#umbrella-grouping-pattern) (children under the grandparent Epic, `Relates`-linked to the Story) **only** when the ticket must remain a Story/Task — e.g. it has an open PR or a branch/status that cannot move, or the user declines the conversion. In that fallback, mark the Story so `/work-ticket` cannot mistake it for a leaf: `jira_edit_ticket({ key, addLabels: ["sliced"] })` and `jira_add_comment` a line `Sliced into: LS-a, LS-b, …` (see 4c). If the `type` change itself is rejected, create a fresh Epic and `jira_set_parent` the original under it as a child; if that also fails, file an MCP-gap ticket (`/mcp-gap-audit`) and use the fallback.

#### 4c. Children shared with a sibling story

A child has exactly one parent. When another ticket covers the same work (e.g. LS-7220 "premium parity" shares every child of LS-7218 "non-premium"), do **not** duplicate the children and do not create a second slice:

1. **Pick one primary owner** — the ticket you are slicing (or, if you are slicing the second of a pair, the sibling that is already an Epic). It becomes the Epic that parents the shared children. Never make the shared children a Relates-only slice of both.
2. **Leave the sibling a thin tracking ticket.** Keep it a Story/Task (do not also convert it — it would be an Epic with zero children) and, for every shared child, `jira_link_issues({ inwardKey: "<child>", outwardKey: "<sibling>", linkType: "Relates" })`, plus the Epic itself. Then `jira_edit_ticket({ key: "<sibling>", addLabels: ["sliced"] })` and `jira_add_comment` with `Sliced into: <shared child keys> (owned by <primary Epic>). Do not implement this ticket directly; it is Done when those children are Done.`
3. **If the sibling has distinct ACs** (e.g. "prioritise for premium"), file those as their own children under the primary Epic and `Relates`-link them to the sibling.
4. The sibling's status is closed manually (or by `/work-ticket <sibling>`'s sliced-tracking branch) once every shared child is Done — jira-branch-sync does not aggregate across `Relates` links.

#### 4d. Sub-tasks (children bundled in one PR)

Use `Sub-task` children only for checklist-style steps that make sense inside a single PR of a Story/Task/Bug that stays a Story/Task/Bug — they are not independently mergeable, so they are not a real slice (a real slice converts the parent per 4a). `jira_get_all_descendants` returns Sub-tasks as leaf descendants, so `/work-ticket` on the parent will see them. `jira_create_ticket`'s `type` enum has no `Sub-task`; create them with the Atlassian plugin (`createJiraIssue` with `issueTypeName: "Subtask"` and `parent: "<story-key>"`) and note the missing tool support for the end-of-session `/mcp-gap-audit`.

### Repairing an already-sliced Story

For a Story whose children were created Relates-only under the grandparent Epic (LS-7218 -> LS-10410..LS-10415): `jira_edit_ticket({ key, type: "Epic" })`, verify type/parent with `jira_view`, `jira_set_parent` each child to it, confirm with `jira_get_all_descendants(key)`.
