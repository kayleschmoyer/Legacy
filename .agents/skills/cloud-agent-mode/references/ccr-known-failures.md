# CCR Known Failure Modes

Detailed incident writeups for Claude Code Remote (CCR). See [claude-code-remote.md](claude-code-remote.md) for the platform overview, AWS/Packer gap, chip-dispatch substitute, and trigger lifecycle.

## Known failure mode: `create_session` without `source_url` produces a dead session, reported as success (LS-9597)

**Symptom**: the call returns a session ID and `SESSION_STATUS_PENDING` — indistinguishable from success — and the session then does nothing at all. It never runs a turn, never pushes a branch, never reports back.

**Detection** (`get_session` / `list_sessions` on the spawned ID):

| Field                         | Dead session                                                                                  | Healthy session                  |
| ----------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------- |
| `session_context.sources`     | key absent                                                                                    | `[{git_repository: {url: ...}}]` |
| `updated_at - created_at`     | ~3 seconds                                                                                    | tens of seconds or more          |
| `usage` / `post_turn_summary` | absent                                                                                        | populated                        |
| `last_init_error`             | sometimes `{error_kind: "init_script", message: "Setup script failed", recoverable: "false"}` | absent                           |

Note the `last_init_error` is only _sometimes_ retained — 2 of the 29 known-bad sessions carried it, the other 27 showed nothing but the 3-second lifetime. **Absence of an error is not evidence the session is alive**; check `sources` and the lifetime instead.

**Mechanism**: the cloud environment's setup-script field invokes this repo's script by absolute path — `source "$HOME/legacy-sports/.claude/cloud-setup.sh"`. With no `source_url` no repo is cloned, so that path never exists and `source` fails immediately. The script is _sourced_, not executed, and sets `set -euo pipefail`, so the failure kills the setup shell rather than returning nonzero; the repo-root guard near the top of the script (`.git` + `package.json` present, else `exit 1`) would do the same for a partial checkout. Both guards are correct — the defect is that a missing parameter becomes an invisible death rather than a visible error.

**Fix**: pass `source_url` on every spawn. To make the failure legible when someone forgets, the environment's setup-script field can be guarded (environment config UI, not a repo file — see LS-9597):

```bash
if [ -f "$HOME/legacy-sports/.claude/cloud-setup.sh" ]; then
  source "$HOME/legacy-sports/.claude/cloud-setup.sh"
else
  echo "WARNING: no repo checkout at $HOME/legacy-sports — skipping cloud-setup.sh."
  echo "This session was very likely created without source_url and cannot do repo work."
fi
```

## Known failure mode: hosted `legacy-sports-github`/`legacy-sports-jira` OAuth expires mid-session on long-running watch-to-merge loops (LS-8924)

**Symptom**: partway through a long `/work-ticket` watch-to-merge loop — spanning CI retries, review cycles, and possibly multiple [container restarts](container-timeout-resilience.md#known-failure-mode-container-restarts-silently-kill-in-flight-background-bash-jobs-no-resume-ls-8937) over real-world days — every `mcp__legacy-sports-github__*` and `mcp__legacy-sports-jira__*` call starts failing:

```
The following MCP servers require authentication before their tools can be used:
legacy-sports-github
legacy-sports-jira

This session is non-interactive, so Claude cannot run the OAuth flow here.
```

**Root cause**: the same OAuth token expiry as [Mid-Session 401 / Token Expiry (LS-4874)](../../mcp-first/references/diagnostics.md#mid-session-401--token-expiry-ls-4874). That section's general recovery — stop, surface the re-consent prompt, wait for the user to `/mcp` — assumes a human is attending the session. A CCR watch-to-merge loop is deliberately unattended for the exact multi-hour-to-multi-day spans that make expiry likely, so waiting on a human response is not actionable: there is no one to answer within any useful window.

**CCR-specific recovery — do not stop and wait; fall back to the generic connectors and keep driving to merge:**

1. Note the auth failure once (PR comment or continuation-plan checkpoint), then switch to the generic equivalents for the rest of the PR lifecycle. If the PR itself has not been created yet, `mcp__github__create_pull_request` is fine for the `jira-link` marker too — despite recurring reports to the contrary it does not strip the hand-authored comment (LS-8694, [full writeup](../../pr-lifecycle/references/create-pr.md#jira-link-check-repairs-the-marker-for-you-ls-9279)); still put the ticket key in the title as well, per the [CCR fallback](../../pr-lifecycle/references/create-pr.md#ccr-fallback--hand-authoring-the-marker-no-jirakey-convenience):
   - `github_mark_pr_ready` → `mcp__github__update_pull_request({ draft: false })` **then** `mcp__github__issue_write({ method: "update", issue_number: N, labels: [...] })` adding `bot:ready-for-review` to the PR's **current** label set — read it first via `mcp__github__pull_request_read`, since `issue_write` replaces the whole label list (same caveat as the [Default CC web trigger-label fallback](default-cc-web-degraded.md#what-is-genuinely-unexecutable-in-degraded-mode-and-the-fallback-per-case)).
   - Re-triggering the Reviewer Bot after a fix-push (normally `github_manage_labels` re-add) → remove `bot:ready-for-review` then re-add it via two `issue_write` calls; re-adding an already-present label alone is a no-op and won't refire the `labeled` webhook.
   - `FIX:`/`JUSTIFY:` replies → `mcp__github__add_reply_to_pull_request_comment`; resolving threads → `mcp__github__resolve_review_thread` (needs GraphQL thread node IDs — same gap as [degraded CC web](default-cc-web-degraded.md#what-is-genuinely-unexecutable-in-degraded-mode-and-the-fallback-per-case) if no read path surfaces them in your session).
   - `jira_transition` → `mcp__Atlassian__transitionJiraIssue({ cloudId: "fb294606-6c8f-4b52-9a41-11fe45b77528", transition: { id } })` using the [static transition ID table](github-jira-binding.md#discovering-transition-ids). The plugin path has no monotonic guard, so check the current status via `searchJiraIssuesUsingJql` before transitioning.
   - Filing/commenting on follow-up tickets → `mcp__Atlassian__createJiraIssue` / `mcp__Atlassian__addCommentToJiraIssue`.
2. Merging still works without the hosted connector: `mcp__github__merge_pull_request` (built-in) or ask the user if it isn't loaded.
3. **Do not retry the hosted-connector calls once this symptom appears** — there is no mid-session auto-refresh (see [Auth Model](../../mcp-first/references/auth-and-routing.md#auth-model)), so every retry just burns a tool call. Switch to the fallback on the first failure, not after several.

**Not fixable in this repo as a token-lifetime change** — OAuth TTL for hosted connectors is claude.ai connector-layer/platform configuration, outside `bkrupa/legacy-sports`'s reach (same class as [Quirk 6](known-quirks.md#quirk-6-stop-hook-git-checksh-false-positives-unverified-on-genuinely-ssh-signed-commits-ls-8589)). This section is the documentation-only mitigation (ticket option b: a documented, tested fallback path). If longer-lived/auto-refreshing tokens (option a) or a lighter keep-alive/refresh primitive (option c) ever ship platform-side, prefer that and update this section to point to it.

## Known failure mode: stale Nx project-graph cache blocks every `nx` invocation (LS-8936)

**Symptom**: any direct `nx` invocation — `node_modules/.bin/nx run <project>:<target>`, `pnpm exec nx run-many`, etc. (CCR has no `nx_run`/`nx_run_pc_chunk` MCP tools per the platform note above, so direct CLI is the only path) — fails before the target ever runs, with `NX   Failed to process project graph.` followed by a `Cannot find module '<something>'` from one of Nx's project-graph plugins (`@nx/jest`, `@nx/eslint`, `nx/js/dependencies-and-lockfile`). Three distinct signatures have been observed across separate CCR sessions, all with the same root cause:

- `Cannot find module 'react-native/jest-preset'` — `@nx/jest/plugin` resolving `apps/app/jest.config.ts`.
- `pnpm lockfile detected, but ".../node_modules/.modules.yaml" is missing` — `nx/js/dependencies-and-lockfile`.
- `Cannot find module '@typescript-eslint/type-utils'` — `@nx/eslint/plugin` resolving `eslint.config.mjs`.

Because Nx's project-graph plugins eagerly resolve config/module state for **every** project in the workspace before any target runs, a single stale entry anywhere breaks `nx run <any-project>:<target>` repo-wide, not just the project the missing module belongs to. This is easy to misdiagnose as a real dependency problem — the referenced module (`react-native`, `.modules.yaml`, `@typescript-eslint/type-utils`) may in fact be present and correctly installed on disk; the failure is a **stale `.nx/workspace-data` graph cache**, not (necessarily) a broken install. Confirmed directly: after hitting the `@typescript-eslint/type-utils` signature with the package fully present in `node_modules`, `pnpm install --frozen-lockfile` alone did **not** fix it, but `rm -rf .nx/cache .nx/workspace-data` did — the very next `nx run` succeeded against the same, unchanged `node_modules`.

**Root cause (unconfirmed but consistent with all observed evidence)**: the CCR container image bakes a pre-warmed `.nx/workspace-data` graph cache against the `node_modules` state at image-build time. If the container's `node_modules` is finalized or adjusted after that (e.g. a provisioning-time `pnpm install` step, or any other post-snapshot change), the cache references a `node_modules` layout that no longer matches disk — and whichever plugin happens to touch the drifted package first is the one that throws. This explains why the specific missing module differs session to session: it's whatever changed between image build and container boot, not a single fixed broken dependency. This is a distinct failure signature from the present-but-corrupted `node_modules` mode documented above under [phantom typecheck/lint errors on unrelated files (LS-8384)](platform-detection.md#known-failure-mode-phantom-typechecklint-errors-on-unrelated-files-ls-8384) for local persistent containers — that one is fixed by `modules-pool/link.mjs` rebuilding the install; this one is fixed by rebuilding Nx's cache, not the install.

**Recover**: `rm -rf .nx/cache .nx/workspace-data` (both are gitignored, safe to delete, rebuilt automatically on the next `nx` invocation), then retry the `nx` command. Do this **first**, before spending a diagnostic pass on the specific missing module named in the error — the module is very likely a red herring. Only fall back to `make install` (preferred — see below) or raw-binary invocation (`tsc --noEmit`, `jest`, `eslint`, `prettier --check` directly, bypassing `nx` — the sanctioned CCR fallback given no `nx_run_pc_chunk` tool exists here) if the graph is still unbuildable after the cache clear.

**If the cache-clear alone doesn't resolve it, prefer `make install` over a bare `pnpm install --frozen-lockfile` (LS-9577).** A plain `pnpm install --frozen-lockfile` in a network-sandboxed CCR container commonly fails outright on puppeteer's postinstall Chrome download (`Failed to set up chrome vXXX.X.XXXX.XX! ... Set "PUPPETEER_SKIP_DOWNLOAD" env variable to skip download`), aborting the install before `node_modules/.modules.yaml` gets written — which reproduces the exact `.modules.yaml is missing` signature this section documents, now as a genuine half-install rather than a stale cache. `make install`'s non-Windows branch now sets `PUPPETEER_SKIP_DOWNLOAD=1 PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1` before calling `pnpm install --frozen-lockfile`, so the Chrome download no longer aborts the install; Chromium is pre-installed at `/opt/pw-browsers` in these containers, so skipping the download costs nothing. If invoking `pnpm install` directly for any reason, set those two env vars yourself.

**Self-heal shipped for the MCP path (LS-8936)**: on platforms where `mcp__legacy-sports-nx__nx_run`/`nx_run_pc_chunk` **are** available (Copilot, Connector CC web — not CCR), `runNx()` in `tools/mcp/nx-server/src/run-command.ts` now detects the `Failed to process project graph` signature, clears `.nx/cache`/`.nx/workspace-data` once, and retries automatically — no manual intervention needed there. CCR has no equivalent MCP tool to patch, so the manual recovery above is the durable guidance for this platform.

**Second-tier self-heal for a genuinely incomplete install, not just a stale cache (LS-9863)**: the `.modules.yaml is missing` signature above is ambiguous — it fires both for a stale graph cache (fixed by the cache-clear self-heal) and for a `node_modules` that was never finalized by a successful `pnpm install` (cache-clearing then retries and fails identically, since the cache was never the problem). `runNx()` now checks for this second, more specific signature _before_ the generic cache-clear branch and, on match, runs `pnpm install --frozen-lockfile` (with the same `PUPPETEER_SKIP_DOWNLOAD`/`PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` env vars as `make install`, per LS-9577) once, then retries — distinct from, and layered on top of, the LS-8936 cache-clear self-heal above.
