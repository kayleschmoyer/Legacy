# 404s from ci_get_playwright_report — the Credentials Gap (LS-8546)

> Loaded from [read-playwright-report SKILL](../SKILL.md).

## 404s from `ci_get_playwright_report` may be a credentials gap (LS-8546, fixed in code by LS-8322 and LS-8547; recurred 4x as LS-8788)

`bkrupa/legacy-sports-deploys` is **private**. The CI MCP server reads it with
a token minted from `PREVIEW_APP_PRIVATE_KEY`/`PREVIEW_APP_ID`. LS-8322 wires
those vars into the hosted Lambda's cold-start (a new `mcp-preview-app-token`
Secrets Manager secret, fetched by `ensureCredentials()` in
`tools/mcp/ci-server/src/lambda.ts`) — but that fix only takes effect once
someone with AWS access runs `terraform apply`, seeds the new secret, and
redeploys the `mcp-ci` Lambda (agents in cloud sessions generally can't do
this themselves; see the LS-8322 PR body for the exact follow-up steps).
**Crucially, that Secrets-Manager bootstrap lives only in `lambda.ts`'s
`ensureCredentials()`, which runs only behind the API-Gateway/Lambda
`handler()` entrypoint.** Both local sessions and Claude Code Remote (CCR)
sessions actually launch the CI server as the `legacy-sports-ci-local` stdio
process (`.mcp.json` → `tools/mcp/ci-server/src/index.ts`), which never calls
`ensureCredentials()` — so `PREVIEW_APP_PRIVATE_KEY`/`PREVIEW_APP_ID` are
structurally never set for that path regardless of any Lambda-side fix.

LS-8547 adds a second, lower-effort fallback in `getDeploysToken()`: when
`PREVIEW_APP_PRIVATE_KEY`/`PREVIEW_APP_ID` are unset, it tries minting a token
from the **agent-author** GitHub App's own installation on
`bkrupa/legacy-sports-deploys` — the same key every hosted Lambda and cloud
agent session already has, no terraform/secret changes needed. **This still
requires a one-time human action**: someone with GitHub App admin access must
install the agent-author App (App ID `3158619`) on `bkrupa/legacy-sports-deploys`
with `Contents: Read`. Until that install happens, the discovery call 404s
and the code silently falls through to the broad-token fallback below —
functionally unchanged from before LS-8547.

Until either rollout happens, every hosted/cloud/CCR session still uses the
fallback token, and whether reports fetch depends on what that fallback is:

| Session class                                                            | Fallback token                                                 | Result                    |
| ------------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------- |
| Local (stdio `legacy-sports-ci-local`, `gh` CLI available)               | `gh` CLI user token — can read the deploys repo                | ✅ works                  |
| Claude Code Remote / cloud (stdio `legacy-sports-ci-local`, no `gh` CLI) | agent-author App token — scoped to `bkrupa/legacy-sports` only | ❌ 404 on **every** fetch |

So in CCR/cloud sessions specifically, a `ci_get_playwright_report` /
`ci_get_playwright_test_result` 404 usually means **the token cannot see the
repo, not that the report is missing** — and it is **not a regression**: it
recurs on every CCR session until one of the two human actions above
actually lands, independent of how many times the code-side tickets that
enabled those fallbacks (LS-8322, LS-8547) get marked Done. **Verify which
tier is actually blocking with `ci_deploys_repo_auth_status` (LS-8788)**
instead of re-deriving it from a report 404 each time — it exercises both
credential tiers directly and reports `resolvedSource` (`"preview-app"` /
`"agent-author"` / `"fallback"`) plus the specific failure reason for each
unconfigured/failing tier, without needing a real report to exist. The tool
error says "credentials gap" when this is the case — trust it and do not
burn time re-checking whether the deploy happened. Both tools (LS-9236, LS-9592) now detect this automatically
and fall through to the S3 blob artifacts for you — a manual `source: "s3"`
retry is rarely needed. If the automatic fallback also comes up empty (S3
objects expire after 3 days) or the run/PR SHA can't be resolved, it falls
through unchanged to the credentials-gap error. If you still need to reach
for it manually:

- Confirm the deploy once via the "Deploy Playwright Report" job in CI logs if in doubt.
- For nightly/integration runs, use `ci_get_playwright_test_result(source: "s3")` with the numeric run ID (S3 access does not use the deploys-repo token).
- Or fetch the report from a local session, where the `gh` CLI fallback works.
- **Do not fall back to a direct `WebFetch`/`curl` of the `bkrupa.github.io` report URL in cloud/remote sessions** — that host is blocked at the session's own network-egress layer (CCR platform policy, not this credentials gap) and 403s on every attempt regardless of token. See [cloud-agent-mode Quirk 7](../../cloud-agent-mode/references/known-quirks.md#quirk-7-bkrupagithubio-connect-blocked-by-the-ccr-egress-proxy-cloudremote-sessions) (LS-8556) before spending time on it.
