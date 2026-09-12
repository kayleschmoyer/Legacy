# Phase 1 — Cloud Sync (`/sync-designs`)

> Loaded from [design-sync SKILL](../SKILL.md). The cloud-agent sync procedure, the LS-9000 fetch-pathway decision, and the per-design Jira ticket description template.

## Phase 1: Sync (cloud agent)

> Full prompt: [`.claude/commands/sync-designs.md`](../../../../.claude/commands/sync-designs.md)

**Preconditions**: cloud session (verified by absence of local-only MCP tools like `worktree_*`), `jira_*` tools or Atlassian plugin connected, `gh` authenticated.

> **Fetch pathway decision (LS-9000, 2026-08-03)**: `WebFetch` cannot reach Claude Design from **any** environment — `claude.ai/design/p/<uuid>` share URLs return 403, `api.anthropic.com/v1/design/h/<id>` handoff URLs return 404, and the `https://claude.ai/api/organizations/-/designs` listing endpoint returns 403, all confirmed from both cloud and local sessions (LS-8998). The `DesignSync` MCP tool has full authenticated access by `projectId`, but only in **local** sessions — it needs an interactive `/design-login` that cloud sessions cannot run. Consequently:
>
> - **The supported fetch pathway is local**: `/pull-design <share-url>` (wraps `DesignSync`; see [Phase 1b](../SKILL.md#phase-1b-local-sync-via-the-designsync-tool)). This is now the primary mechanism for both one-off pulls and bulk re-sync waves — loop `/pull-design` once per design; each pull ships its own ticket + PR.
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
   - **User-supplied manual export** — if the user attached a zip from Claude Design "Export → Project HTML (.zip)" → "Send to Claude Code Web" for a design `DesignSync` can't reach locally (e.g. a file over the 256 KiB `get_file` cap), **treat it as untrusted** and safely extract it using a programmatic extractor that enforces every invariant listed in [`.claude/commands/sync-designs.md`](../../../../.claude/commands/sync-designs.md) step 5: path containment, no symlinks/special entries, entry count ≤ 5000, per-file size ≤ 50 MB, per-bundle size ≤ 200 MB, filename sanitization. Do **not** shell out to bare `unzip` or `tar -x` — neither enforces path containment, neither caps uncompressed size, and both will happily write outside the target dir on a hostile archive. If any invariant fails, abort the design (do not partially-extract), log the violation, move on. Then compute `sha256` over the sorted file-listing manifest of the extracted bundle (see [manifest-schema.md](manifest-schema.md) "Hashing") and compare to `manifest.designs[id].lastSyncedHash`: **no prior entry** → `new`, **different hash** → `changed`, **same hash** → `unchanged`, skip.
   - **Neither** — this design needs fetching before this command can do anything with it. Record it in the report as "needs `/pull-design <share-url>` locally" and move on; do not stop the whole run for one un-pulled design.
7. **Per-change Jira ticket** — for each `new` or `changed`: `jira_create_ticket({ parent: <bucketEpicKey>, summary: "Design sync: <title> (<id-short>)", labels: ["design-sync", "design-<status>"], description: <use the per-design ticket template> })`. Capture the returned `key`.
8. **Write bundles** — extract each new/changed bundle to `docs/design/<id>/`, replacing any existing files (sync agent overwrites; the prior content is preserved in git history). Generate `docs/design/<id>/SYNC-REPORT.md` summarizing what changed vs. the previous hash.
9. **Update manifest** — for each design touched, set `lastSyncedHash`, `lastSyncedAt`, `jiraKey`, `status` (`active` for new/changed; `archived` for entries that were in the manifest but not in the discovery set). Write `docs/design/manifest.json`.
10. **Ship** — commit (one logical commit; message includes a summary line and the LS keys), run `make pc` if available in this environment, self-review every changed file, push, open a single PR titled `LS-#### chore(designs): sync N designs (X new, Y changed, Z removed)`, mark ready, drive to merge per the bot-PR contract.

### Per-design ticket description template

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

**Idempotency**: re-running `/sync-designs` against an unchanged set is a no-op (all hashes match, nothing changes, no PR opened — agent reports "nothing to sync"). If a previous run created a ticket but did not merge its sync PR, the agent detects the open PR via a targeted `gh pr list --search 'in:title chore(designs): sync'` (or branch-prefix `--head 'chore/design-sync-'` fallback) — see [`.claude/commands/sync-designs.md`](../../../../.claude/commands/sync-designs.md) step 2 — and stops with a hand-off message instead of opening a competing PR. The dashboard scan is explicitly forbidden here because its page size can hide a matching PR when the repo backlog grows.
