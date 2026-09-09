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

> Full prompt: [`.claude/commands/sync-designs.md`](../../../.claude/commands/sync-designs.md)

**Preconditions**: cloud session (verified by absence of local-only MCP tools like `worktree_*`), `jira_*` tools or Atlassian plugin connected, `gh` authenticated.

> **Fetch pathway decision (LS-9000, 2026-08-03)**: `WebFetch` cannot reach Claude Design from **any** environment — `claude.ai/design/p/<uuid>` share URLs return 403, `api.anthropic.com/v1/design/h/<id>` handoff URLs return 404, and the `https://claude.ai/api/organizations/-/designs` listing endpoint returns 403, all confirmed from both cloud and local sessions (LS-8998). The `DesignSync` MCP tool has full authenticated access by `projectId`, but only in **local** sessions — it needs an interactive `/design-login` that cloud sessions cannot run. Consequently:
>
> - **The supported fetch pathway is local**: `/pull-design <share-url>` (wraps `DesignSync`; see [Phase 1b](#phase-1b-local-sync-via-the-designsync-tool)). This is now the primary mechanism for both one-off pulls and bulk re-sync waves — loop `/pull-design` once per design; each pull ships its own ticket + PR.
> - **Cloud `/sync-designs` no longer fetches bundle bytes itself** — see the rewritten steps 5–6 below. It either processes a manually-exported zip the user supplies, or stops and tells the user to run `/pull-design` locally.
> - **Discovery has no live endpoint.** The working set is `manifest.designs[]` plus any share URLs the user supplies directly — there is no way to auto-discover new Claude Design projects.

**Procedure**:

1. **Auth check** — `auth_check_all` if available; otherwise probe each tool group with a no-op. Stop on any failure.
2. **Bucket epic** — resolve via `jira_get_bucket_epic({ bucket: "design-sync" })`. If missing, **stop and report** to the user — the bucket epic must be set up once manually (see SOP "One-time setup").
3. **Branch** — create `chore/design-sync-YYYY-MM-DD` off `main`.
4. **Read manifest** — `docs/design/manifest.json`. If absent, initialize to `{version: 1, designs: []}` in memory (will be committed).
5. **Working set** — no listing endpoint is reachable (see decision above). The working list is `manifest.designs[]` entries with `status: "active"` plus any share URLs the user supplies directly in the dispatch prompt. Merge and de-duplicate by `id`.
6. **Per-design intake** — `WebFetch` cannot fetch a design's bundle bytes (see decision above), so this step no longer attempts it. For each entry in the working list:
   - **Already pulled locally** — if `/pull-design` already synced this design (its manifest hash is current), there's nothing to do here; that local run shipped its own ticket + PR.
   - **User-supplied manual export** — if the user attached a zip from Claude Design "Export → Project HTML (.zip)" → "Send to Claude Code Web" for a design `DesignSync` can't reach locally (e.g. a file over the 256 KiB `get_file` cap), **treat it as untrusted** and safely extract it using a programmatic extractor that enforces every invariant listed in [`.claude/commands/sync-designs.md`](../../../.claude/commands/sync-designs.md) step 5: path containment, no symlinks/special entries, entry count ≤ 5000, per-file size ≤ 50 MB, per-bundle size ≤ 200 MB, filename sanitization. Do **not** shell out to bare `unzip` or `tar -x` — neither enforces path containment, neither caps uncompressed size, and both will happily write outside the target dir on a hostile archive. If any invariant fails, abort the design (do not partially-extract), log the violation, move on. Then compute `sha256` over the sorted file-listing manifest of the extracted bundle (see [manifest-schema.md](references/manifest-schema.md) "Hashing") and compare to `manifest.designs[id].lastSyncedHash`: **no prior entry** → `new`, **different hash** → `changed`, **same hash** → `unchanged`, skip.
   - **Neither** — this design needs fetching before this command can do anything with it. Record it in the report as "needs `/pull-design <share-url>` locally" and move on; do not stop the whole run for one un-pulled design.
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
