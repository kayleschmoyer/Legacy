---
name: design-sync
description: 'Bridge Claude Design (claude.ai/design) and this repo. Phase 1 (Sync): cloud agent processes user-supplied design exports (WebFetch cannot reach Claude Design — LS-9000), diffs against docs/design/manifest.json, files one Jira ticket per changed design, and opens a single sync PR. Phase 1b (Local): the DesignSync MCP tool reads/writes Claude Design projects by project id — /pull-design pulls one design (the primary fetch pathway, including bulk re-sync waves); /push-design uploads a repo bundle so devs can iterate in Claude Design before pulling back (repo stays source of truth); the write flow also fixes designs at the source. Phase 2 (Consume): local agent reads a design ticket, runs a completeness gate, then notifies on gaps, implements directly, or slices into child tickets and spawns chips. Load when running /sync-designs (cloud), /pull-design, /push-design, or /implement-design (local), when updating a design via the DesignSync tool, or when designing the design-to-code pipeline.'
metadata:
  scope: 'docs/design/**'
---

# Skill: Design Sync

Two-phase workflow that pulls designs out of Claude Design and into shipped code.

Both phases are **manually dispatched by the user** via slash commands; nothing runs on a schedule. See [`docs/dev-process/design-sync.md`](../../../docs/dev-process/design-sync.md) for the human overview and diagrams.

## When to use

| Trigger                                                              | Phase      | Where                   |
| -------------------------------------------------------------------- | ---------- | ----------------------- |
| User runs `/sync-designs`                                            | Sync       | Cloud (Claude Code Web) |
| User runs `/pull-design <url>` or a design needs a fix at the source | Local sync | Local (DesignSync tool) |
| User runs `/push-design <id>` to iterate on a repo bundle            | Local push | Local (DesignSync tool) |
| User runs `/implement-design LS-####`                                | Consume    | Local                   |
| Designing changes to this pipeline                                   | Both       | Anywhere                |

> **Bucket fan-out command**: `/implement-design LS-####`. When `/work-ticket` is invoked on the design-sync bucket epic, Parent Dispatch Mode dispatches one chip per To Do child using this command (not `/work-ticket`). See [`.agents/skills/work-ticket/references/bucket-epic-routing.md`](../work-ticket/references/bucket-epic-routing.md).

## Phase 1: Sync (cloud agent)

The `/sync-designs` cloud procedure — preconditions, the LS-9000 fetch-pathway decision (why `WebFetch` cannot reach Claude Design from any environment, and why the supported pathway is local `/pull-design`), the ten-step procedure, and the per-design Jira ticket description template: **[references/phase1-cloud-sync.md](references/phase1-cloud-sync.md)**.

## Phase 1b: Local sync via the DesignSync tool

> Full access rules, caveats, and the write flow: [references/designsync-tool.md](references/designsync-tool.md). Pull procedure: [`.claude/commands/pull-design.md`](../../../.claude/commands/pull-design.md). Push procedure: [`.claude/commands/push-design.md`](../../../.claude/commands/push-design.md).

Local sessions cannot WebFetch design URLs (share URLs → 403, handoff URLs → 404 — verified 2026-08-03), but the `DesignSync` MCP tool has full authenticated access **by project id** (the UUID in a `claude.ai/design/p/<uuid>` share URL; also recorded as `manifest.designs[].projectId` when known):

- **Targeted pull** — `/pull-design <share-url>` fetches one project file-by-file into `docs/design/<id>/<slug>/`, recomputes the manifest hash, writes a SYNC-REPORT, and ships a PR. Use for single-design updates; use cloud `/sync-designs` for bulk waves.
- **Push for iteration** — `/push-design <id>` uploads a repo bundle's `project/` files to a Claude Design project (the dev's own, or a shared one they can edit) so the dev can iterate visually. **The repo is the source of truth**; a push is repo-read-only (no commit, ticket, or PR) and the roundtrip closes with `/pull-design`, which commits the result. `create_project` can mint a new design-system project in the dev's own account; page-design projects cannot be created via the tool (type is immutable) — those need an existing editable project.
- **Fixing designs at the source** — never hand-patch `docs/design/` bundle bytes and stop there: the next pull overwrites them. Either fix in Claude Design itself (read files, apply the fix, `finalize_plan` → `write_files`) and finish with a pull so the repo catches up, or fix in the repo bundle and `/push-design` it up so Claude Design stays in step. `finalize_plan` is the user-approval boundary; keep write sets minimal and incremental.
- `list_projects` only lists design-system projects — page projects must come from user-supplied share URLs or `projectId` fields; `get_file` is capped at 256 KiB per file (check `truncated` on every read).

### Large files: size the pull before you make it

`get_file` is capped at 256 KiB per file **and returns content inline** — there is no `outputPath` / `out_dir` option, so every byte of a pulled file lands in the model context. A file at the cap costs roughly **65k tokens to read, plus 65k again to write it back out** — about 130k tokens for a single file. State that cost out loud before pulling: it is a tradeoff to decide, not a surprise to discover halfway through.

> `DesignSync` is a Claude Code built-in, not one of this repo's MCP servers, so we cannot add `outputPath` to it. The analogous gap on our own surface was closed in LS-9429, when `worktree_show_file` and `github_get_file_content` gained `outputPath`; the design-sync path has no equivalent, so the workaround below is the whole remedy.

1. **Size the pull first.** `list_files` returns structure only — it carries no byte sizes. Where a prior sync exists, use the local bundle as the proxy: `worktree_file_info` (or `wc -c`) over `docs/design/<id>/<slug>/`. For a design with no local copy you are pulling blind — take the small files first and treat an unexpectedly large response as the signal to stop and re-plan.
2. **Anything within ~10% of the cap (≳236 KiB) does not go through `get_file`.** Route it to the user-assisted **Export → Project HTML (.zip)** path through the logged-in Chrome fallback — see [references/designsync-tool.md](references/designsync-tool.md) (access matrix and "When to use what"). Ask the user for the export; do not spend the context proving the file is too big.
3. **A deliberately skipped file MUST be recorded in the SYNC-REPORT** under a `## Not pulled` heading (the worked example titles it `## Not pulled in this pass`), with its path and the reason. Skipping one means the bundle is knowingly **not byte-exact** with the remote, and that has to be visible rather than silent — otherwise the completeness gate passes on a bundle it has no grounds to trust. [`docs/design/B8P9BQz8s6NZ9Q-FqWI_yA/SYNC-REPORT.md`](../../../docs/design/B8P9BQz8s6NZ9Q-FqWI_yA/SYNC-REPORT.md) is the worked example — `project/scratch/mockups/draft.html` at 259,625 bytes, within 1% of the cap.

**Prevention, not just mitigation**: the upstream fix is authoring designs that never produce an oversized file. [references/design-authoring-guidelines.md](references/design-authoring-guidelines.md) is the brief to hand the Claude Design agent — size budgets, the `@intent` production/option/scratch classification, page-splitting rules, and a `project/INDEX.md` size manifest that closes the "`list_files` carries no byte sizes" gap in step 1 above.

Truncation is the outcome this avoids: a `truncated: true` response means you have already paid the full context cost _and_ come away with a file you must not write into `docs/design/`.

## Phase 2: Consume (local agent)

> Full prompt: [`.claude/commands/implement-design.md`](../../../.claude/commands/implement-design.md)

**Preconditions**: local session, in a worktree, target ticket exists under the `design-sync` bucket epic.

**Procedure**:

1. **Parse ticket key** from `$ARGUMENTS` (e.g. `LS-4561`).
2. **Re-fetch ticket** via `jira_view` for ground truth; do not trust the slash-command argument blindly.
3. **Resolve designId** — read the design id from the ticket description (look for a line like `Design id: <id>` or a path `docs/design/<id>/`), or scan `docs/design/manifest.json` for an entry whose `jiraKey == LS-####`.
4. **Load bundle** — resolve the slug from `manifest.designs[].slug` (fallback: the single non-`SYNC-REPORT.md` directory under `docs/design/<designId>/`), then read `docs/design/<designId>/<slug>/README.md`, every transcript under `<slug>/chats/`, and enumerate `<slug>/project/`. There is no `bundle.json` — the manifest entry plus the README plus the chat transcripts are the bundle metadata.
5. **Completeness gate** — apply [completeness-gate.md](references/completeness-gate.md). On any **block-level** miss: post a Jira comment with a checklist of what's missing, transition the ticket to **Blocked**, stop. Warnings: log them and continue.
6. **Slicing heuristic** — apply [slicing-heuristic.md](references/slicing-heuristic.md). Two outcomes:
   - **Implement-in-one** → proceed with the new-feature entrypoint (worktree → code → `make pc` → self-review → PR → bot review → merge). The original ticket is what gets closed.
   - **Slice** → create N child tickets (one per page or major component, parent = original ticket, ACs scoped to that slice), spawn one chip per child via `mcp__ccd_session__spawn_task`, transition the parent ticket to **In Review** as a tracker. The parent does not get its own implementation PR.

**Notification template** (when the completeness gate fails):

```markdown
**Design bundle incomplete** — cannot implement until the following are added in Claude Design and re-synced:

- [ ] <missing-field-1> — <what to add and where>
- [ ] <missing-field-2> — <what to add and where>

Once addressed, run `/sync-designs` from a cloud session (or `/pull-design <share-url>` locally) to update `docs/design/<id>/`, then re-dispatch `/implement-design LS-####` locally.
```

## Common failure modes and recoveries

| Failure                                         | Recovery                                                                                                                                                                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WebFetch` returns 401/403/404 for a design URL | Expected, not a failure to recover from — `WebFetch` cannot reach Claude Design from any environment (LS-9000). Use `/pull-design` locally instead; do not retry `WebFetch`.                                                                            |
| Bucket epic not registered                      | Stop and instruct the user to `jira_set_bucket_epic({ bucket: "design-sync", epicKey: "..." })`.                                                                                                                                                        |
| Listing endpoint absent and manifest empty      | Stop and ask the user to seed at least one URL in `manifest.designs[].url`.                                                                                                                                                                             |
| Open sync PR from prior run                     | Stop, link to that PR, ask the user whether to abandon (close the open PR) or pick it up via `/drive-pr`.                                                                                                                                               |
| File at or near the 256 KiB `get_file` cap      | Do not pull it through `get_file` — route it to the Chrome Export → Project HTML (.zip) fallback, or skip it and record the path and reason under `## Not pulled` in the SYNC-REPORT. See [Large files](#large-files-size-the-pull-before-you-make-it). |
| Bundle hash differs but file diff is empty      | Hash algorithm bug. Fall back to a literal file-tree diff; if also empty, mark `unchanged`. File a `design-sync` ticket noting the discrepancy.                                                                                                         |
| Consumer can't resolve `designId` from ticket   | Notify on the ticket with "ticket description missing `Design:` line — manual recovery needed". Do not guess.                                                                                                                                           |

## See also

- Process overview: [`docs/dev-process/design-sync.md`](../../../docs/dev-process/design-sync.md)
- Manifest schema: [references/manifest-schema.md](references/manifest-schema.md)
- DesignSync tool (local access): [references/designsync-tool.md](references/designsync-tool.md)
- Completeness gate: [references/completeness-gate.md](references/completeness-gate.md)
- Slicing heuristic: [references/slicing-heuristic.md](references/slicing-heuristic.md)
- Design authoring guidelines (hand to the Claude Design agent): [references/design-authoring-guidelines.md](references/design-authoring-guidelines.md)
- Cloud agent prompt: [`.claude/commands/sync-designs.md`](../../../.claude/commands/sync-designs.md)
- Local agent prompt: [`.claude/commands/implement-design.md`](../../../.claude/commands/implement-design.md)
- Bot-PR contract: [`.agents/skills/pr-lifecycle/SKILL.md`](../pr-lifecycle/SKILL.md)
- Chip dispatch pattern: [`.claude/commands/work-mcp-gaps.md`](../../../.claude/commands/work-mcp-gaps.md) (reference implementation)
