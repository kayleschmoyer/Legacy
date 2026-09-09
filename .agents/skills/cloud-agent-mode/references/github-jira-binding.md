# GitHub Identity and Jira Binding

## GitHub identity and auth

Two GitHub Apps split duties: **Agent Author** (App ID `3158619`) writes code, pushes, opens PRs; **Agent Reviewer** (App ID `3142924`) approves and merges (verified in `.github/actions/resolve-runner-label/action.yml`). The same app never both authors and approves.

| Platform         | GitHub auth                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Copilot          | Agent Author app token minted by `copilot-setup-steps.yml`, exported as `GH_TOKEN`/`GITHUB_TOKEN` — bot-attributed authorship                |
| CC web (both)    | Built-in `mcp__github__*` via Claude's native GitHub connector — no token config, bot identity. Never route PR authorship through a user PAT |
| Hosted connector | `legacy-sports-github` Lambda holds its own credentials server-side (Secrets Manager); the client sends only the OAuth/Cognito bearer        |

### Mark-ready and the review trigger label

`bot:ready-for-review` is the review trigger label. Verified against `.github/workflows/review.yml`: the Reviewer fires on `opened`/`ready_for_review`, and re-fires on `synchronize` **only when `bot:ready-for-review` (or the bot-owned `merge-when-ready`) is present**. Consequences:

- `github_mark_pr_ready` (hosted server) flips draft **and** applies the label — one call, done.
- Built-in `mcp__github__update_pull_request({ draft: false })` flips the draft flag **only**. Follow it with `github_manage_labels({ prs: [N], add: ["bot:ready-for-review"] })` wherever that tool exists. Without the label, Cycle 1 fires but fix-pushes never re-trigger review — Cycle-1 mandates stall permanently.
- Degraded mode cannot apply the label — see the [degraded fallback table](default-cc-web-degraded.md#what-is-genuinely-unexecutable-in-degraded-mode-and-the-fallback-per-case).

## Jira binding

Hosted `legacy-sports-jira` (`jira_*` tools) where attached; Atlassian plugin (`mcp__claude_ai_Atlassian__*`) on CC web. Site: `bkrupa.atlassian.net` (default in `tools/mcp/jira-server/src/netrc.ts`), cloud ID `fb294606-6c8f-4b52-9a41-11fe45b77528` — pass `cloudId` on every plugin call. On CC web the plugin is the **expected primary path**, not a fallback: it routes through Anthropic's plugin infrastructure and is unaffected by the session proxy that blocks the stdio server's egress ([Quirk 1](known-quirks.md#quirk-1-legacy-sports-jira-stdio-server-fetch-failed-claude-code-on-the-web-only)).

Plugin equivalents: `searchJiraIssuesUsingJql` (view/search — never `getJiraIssue`, LS-3715 wrong-data bug; fetch comments via the `comment` field), `createJiraIssue` (avoid `additional_fields` — Quirk 2; prefer `jira_create_ticket({ parent: "LS-####" })` when hosted, else create then set parent via `editJiraIssue({ fields: { parent: { key } } })`), `editJiraIssue`, `transitionJiraIssue`. No plugin equivalent exists for `jira_link_issues`.

### Discovering transition IDs

`transitionJiraIssue` needs a numeric ID passed **as an object**: `transition: { id: "21" }` — a string never works and never resolves with retries. Look IDs up via `jira_view({ key, include: ["transitions"] })` (hosted server) — not the plugin's `getTransitionsForJiraIssue`, which returns full issue data instead of transitions. Stable LS-project table:

| Status        | ID   |
| ------------- | ---- |
| `To Do`       | `11` |
| `In Progress` | `21` |
| `In Review`   | `2`  |
| `Done`        | `31` |
| `Won't Do`    | `3`  |

If these stop working, re-discover via `jira_view` and update this table.

### Jira pagination (LS-2079)

`searchJiraIssuesUsingJql` defaults to `maxResults: 10`; `jira_list_children` defaults to 25 — both silently truncate large epics (LS-2079: an agent worked 10 of 50 children and prematurely transitioned the epic). Rules: always `maxResults: 100` / `limit: 100`; plugin paginates by `startAt` offset against a grand-total `total`; `jira_list_children` paginates by cursor — its `total` is the **page** size, so loop on `nextPageToken` until absent; log the per-status child counts and confirm the sum.
