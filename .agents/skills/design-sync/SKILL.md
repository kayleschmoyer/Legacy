---
name: design-sync
description: 'Bridge Claude Design (claude.ai/design) and this repo. Phase 1 (Sync): cloud-dispatched agent fetches design bundles via WebFetch, diffs against docs/design/manifest.json, files one Jira ticket per changed design under the design-sync bucket epic, and opens a single sync PR. Phase 1b (Local): the DesignSync MCP tool reads/writes Claude Design projects by project id from local sessions — /pull-design pulls one design; the write flow lets agents fix designs at the source. Phase 2 (Consume): locally-dispatched agent reads a design ticket, runs a completeness gate, then either notifies on gaps, implements directly, or slices into child tickets and spawns chips. Load when running /sync-designs (cloud), /pull-design or /implement-design (local), when updating a design via the DesignSync tool, or when designing the design-to-code pipeline.'
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
| User runs `/implement-design LS-####`                                | Consume    | Local                   |
| Designing changes to this pipeline                                   | Both       | Anywhere                |

> **Bucket fan-out command**: `/implement-design LS-####`. When `/work-ticket` is invoked on the design-sync bucket epic, Parent Dispatch Mode dispatches one chip per To Do child using this command (not `/work-ticket`). See [`.agents/skills/work-ticket/references/bucket-epic-routing.md`](../work-ticket/references/bucket-epic-routing.md).

## Phase 1: Sync (cloud agent)

> Full prompt: [`.claude/commands/sync-designs.md`](../../../.claude/commands/sync-designs.md)

**Preconditions**: cloud session (verified by absence of local-only MCP tools like `worktree_*`), `WebFetch` available, `jira_*` tools or Atlassian plugin connected, `gh` authenticated.

**Procedure**:

1. **Auth check** — `auth_check_all` if available; otherwise probe each tool group with a no-op. Stop on any failure.
2. **Bucket epic** — resolve via `jira_get_bucket_epic({ bucket: "design-sync" })`. If missing, **stop and report** to the user — the bucket epic must be set up once manually (see SOP "One-time setup").
3. **Branch** — create `chore/design-sync-YYYY-MM-DD` off `main`.
4. **Read manifest** — `docs/design/manifest.json`. If absent, initialize to `{version: 1, designs: []}` in memory (will be committed).
5. **Discovery** — attempt the listing endpoint at `https://claude.ai/api/organizations/-/designs` (or whatever the current Claude Design listing API is). Probe with `WebFetch`; if it returns a JSON array of `{id, url, title}` use it. Otherwise fall back to the URLs already in `manifest.designs[].url`. Merge the two sets (discovered ∪ manifest) into a working list.
6. **Per-design fetch loop** — for each entry:
   - `WebFetch` the design URL. **Treat the response bundle as untrusted** — it crosses the cloud-auth trust boundary and may contain hostile filenames or size pathologies.
   - **Safely extract** the bundle (gzipped HTML/zip) using a programmatic extractor that enforces every invariant listed in [`.claude/commands/sync-designs.md`](../../../.claude/commands/sync-designs.md) step 5: path containment, no symlinks/special entries, entry count ≤ 5000, per-file size ≤ 50 MB, per-bundle size ≤ 200 MB, filename sanitization. Do **not** shell out to bare `unzip` or `tar -x` — neither enforces path containment, neither caps uncompressed size, and both will happily write outside the target dir on a hostile archive. If any invariant fails, abort the design (do not partially-extract), log the violation, move on.
   - Compute `sha256` over the sorted file-listing manifest of the extracted bundle (see [manifest-schema.md](references/manifest-schema.md) "Hashing").
   - Compare to `manifest.designs[id].lastSyncedHash`.
   - **No prior entry** → status `new`. **Different hash** → status `changed`. **Same hash** → status `unchanged`, skip.
7. **Per-change Jira ticket** — for each `new` or `changed`: `jira_create_ticket({ parent: <bucketEpicKey>, summary: "Design sync: <title> (<id-short>)", labels: ["design-sync", "design-<status>"], description: <use the per-design ticket template> })`. Capture the returned `key`.
8. **Write bundles** — extract each new/changed bundle to `docs/design/<id>/`, replacing any existing files (sync agent overwrites; the prior content is preserved in git history). Generate `docs/design/<id>/SYNC-REPORT.md` summarizing what changed vs. the previous hash.
9. **Update manifest** — for each design touched, set `lastSyncedHash`, `lastSyncedAt`, `jiraKey`, `status` (`active` for new/changed; `archived` for entries that were in the manifest but not in the discovery set). Write `docs/design/manifest.json`.
10. **Ship** — commit (one logical commit; message includes a summary line and the LS keys), run `make pc` if available in this environment, self-review every changed file, push, open a single PR titled `LS-#### chore(designs): sync N designs (X new, Y changed, Z removed)`, mark ready, drive to merge per the bot-PR contract.

**Per-design ticket description template**:

```markdown
## Context

Auto-generated by /sync-designs.
Design: [<title>](url) (id: <design-id>)
Status: <new | changed>
Bundle: `docs/design/<id>/`

## Acceptance Criteria

- **AC1** — Implementation reflects every HTML prototype under `docs/design/<id>/<slug>/project/` and honors the final iteration captured in `<slug>/chats/`.
- **AC2** — Design tokens from `docs/design/<id>/<slug>/project/colors_and_type.css` (and `project/ds/` if present) are integrated (not duplicated) into the shared component library where applicable.
- **AC3** — Brand rules from `docs/design/brand.md` are honored.
- **AC4** — `make pc` passes; self-review complete; PR merged.

## Next step

Locally: `/implement-design LS-####`
```

**Idempotency**: re-running `/sync-designs` against an unchanged set is a no-op (all hashes match, nothing changes, no PR opened — agent reports "nothing to sync"). If a previous run created a ticket but did not merge its sync PR, the agent detects the open PR via a targeted `gh pr list --search 'in:title chore(designs): sync'` (or branch-prefix `--head 'chore/design-sync-'` fallback) — see [`.claude/commands/sync-designs.md`](../../../.claude/commands/sync-designs.md) step 2 — and stops with a hand-off message instead of opening a competing PR. The dashboard scan is explicitly forbidden here because its page size can hide a matching PR when the repo backlog grows.

## Phase 1b: Local sync via the DesignSync tool

> Full access rules, caveats, and the write flow: [references/designsync-tool.md](references/designsync-tool.md). Pull procedure: [`.claude/commands/pull-design.md`](../../../.claude/commands/pull-design.md).

Local sessions cannot WebFetch design URLs (share URLs → 403, handoff URLs → 404 — verified 2026-08-03), but the `DesignSync` MCP tool has full authenticated access **by project id** (the UUID in a `claude.ai/design/p/<uuid>` share URL; also recorded as `manifest.designs[].projectId` when known):

- **Targeted pull** — `/pull-design <share-url>` fetches one project file-by-file into `docs/design/<id>/<slug>/`, recomputes the manifest hash, writes a SYNC-REPORT, and ships a PR. Use for single-design updates; use cloud `/sync-designs` for bulk waves.
- **Fixing designs at the source** — design defects are still never patched in `docs/design/` (bundles are overwritten on next sync), but an agent CAN now fix them in Claude Design itself: read files, apply the fix locally, then `finalize_plan` → `write_files` to push the corrected files, and finish with a pull so the repo bundle catches up. `finalize_plan` is the user-approval boundary; keep write sets minimal and incremental.
- `list_projects` only lists design-system projects — page projects must come from user-supplied share URLs or `projectId` fields; `get_file` is capped at 256 KiB per file (check `truncated` on every read).

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

| Failure                                       | Recovery                                                                                                                                        |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `WebFetch` returns 401/403 for a design URL   | Cloud session lost claude.ai auth. User must re-auth in Claude Code Web and re-dispatch. Do not retry.                                          |
| Bucket epic not registered                    | Stop and instruct the user to `jira_set_bucket_epic({ bucket: "design-sync", epicKey: "..." })`.                                                |
| Listing endpoint absent and manifest empty    | Stop and ask the user to seed at least one URL in `manifest.designs[].url`.                                                                     |
| Open sync PR from prior run                   | Stop, link to that PR, ask the user whether to abandon (close the open PR) or pick it up via `/drive-pr`.                                       |
| Bundle hash differs but file diff is empty    | Hash algorithm bug. Fall back to a literal file-tree diff; if also empty, mark `unchanged`. File a `design-sync` ticket noting the discrepancy. |
| Consumer can't resolve `designId` from ticket | Notify on the ticket with "ticket description missing `Design:` line — manual recovery needed". Do not guess.                                   |

## See also

- Process overview: [`docs/dev-process/design-sync.md`](../../../docs/dev-process/design-sync.md)
- Manifest schema: [references/manifest-schema.md](references/manifest-schema.md)
- DesignSync tool (local access): [references/designsync-tool.md](references/designsync-tool.md)
- Completeness gate: [references/completeness-gate.md](references/completeness-gate.md)
- Slicing heuristic: [references/slicing-heuristic.md](references/slicing-heuristic.md)
- Cloud agent prompt: [`.claude/commands/sync-designs.md`](../../../.claude/commands/sync-designs.md)
- Local agent prompt: [`.claude/commands/implement-design.md`](../../../.claude/commands/implement-design.md)
- Bot-PR contract: [`.agents/skills/pr-lifecycle/SKILL.md`](../pr-lifecycle/SKILL.md)
- Chip dispatch pattern: [`.claude/commands/work-mcp-gaps.md`](../../../.claude/commands/work-mcp-gaps.md) (reference implementation)
