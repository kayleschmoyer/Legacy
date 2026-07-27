# Agent Screenshots

> **When to apply:** PR involves UI changes (.tsx, .jsx, .css, style files, new routes/pages/components)

Use the `legacy-sports-browser` MCP server to capture screenshots of UI changes and embed them in PR bodies.

## Known gap: slow connect in Claude Code Remote / direct-branch sessions (LS-8539)

In a Claude Code Remote session that works directly on a branch checkout (not a `.claude/worktrees/<name>/` launcher worktree, not a sibling worktree), `legacy-sports-browser` can appear in the initial "still connecting" list and stay there for **several minutes** — much longer than sibling stdio servers. Root cause: it launches via the same `mcp-bootstrap.mjs` → `tsx` path as every other stdio server, and if `node_modules` exists but `tsx` hasn't finished being written by an in-progress install yet, the server races an incomplete install instead of getting auto-repaired. It is **not** architecturally worktree-only — it does connect, just unreliably slowly in this session type.

**Do not conclude it's unavailable from one early check.** Before falling back:

1. Continue with other early-session orientation work (ticket read, planning, non-UI code recon).
2. Retry `ToolSearch(query: "browser_dev_start")` periodically — give it a few minutes, not one shot.
3. Only fall back once it's genuinely still absent after real elapsed time, not immediately at session start.

### Same-repo fallback (when it truly never connects)

Chromium is pre-installed and the dev server can be driven directly, without the MCP server:

```bash
# 1. Start the dev server in the background
pnpm exec nx run web:dev &

# 2. Drive the pre-installed Chromium with a one-off Playwright script,
#    run from the REPO ROOT so module resolution finds playwright:
node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  await page.goto('http://localhost:<port>/affected-page');
  await page.screenshot({ path: '.screenshots/feature-before.png' });
  await browser.close();
})();
"
```

Upload screenshots manually (e.g. via `github_create_pull_request`/`create_or_update_file` to attach, or embed as a draft-release asset by hand) since `browser_screenshot_upload` is unavailable without the MCP server.

### Auth-required routes

Every app route requires login (`EnhancedAuthGuard`). If the session has no cached e2e auth token (`~/.legacy-sports/e2e-token.json` absent — only the human user can mint one via `make e2e-auth`, see AGENTS.md), neither the MCP tools nor the fallback script above can get past the sign-in redirect. In that case:

- Skip screenshots rather than capturing the sign-in redirect as if it were the feature.
- Disclose the limitation explicitly in the PR body's `## Screenshots` (or `## Verification`) section — e.g. "No before/after screenshots: this session has no cached e2e auth token, so authenticated routes are unreachable. See `make e2e-auth` in AGENTS.md."

## When to Take Screenshots

Any PR that touches `.tsx`, `.jsx`, `.css`, `.module.css`, Tamagui styles, or adds a new route/page/component should include screenshots in the `## Screenshots` section.

## Workflow: Bug Fix (Before / After)

```
1. browser_dev_start({ worktreePath: $wt })           -> note the port
2. browser_navigate({ url: "/affected-page", port })   -> see broken state
3. browser_screenshot({ name: "feature-before" })      -> capture before
4. Make code changes                                   -> hot reload picks them up
5. browser_navigate({ url: "/affected-page", port })   -> reload page
6. browser_screenshot({ name: "feature-after" })       -> capture after
7. browser_screenshot_upload both screenshots           -> get GitHub markdown URLs
8. Embed URLs in PR body ## Screenshots section
9. browser_cleanup()                                   -> REQUIRED before workflow ends
```

## Workflow: New Feature (After Only)

Skip steps 2-3 above. Only capture the final state.

## Workflow: Responsive Screenshots

Capture at multiple viewports for responsive UI changes:

```
browser_navigate({ url, port, viewport: { width: 375, height: 812 } })
browser_screenshot({ name: "feature-mobile" })

browser_navigate({ url, port, viewport: { width: 768, height: 1024 } })
browser_screenshot({ name: "feature-tablet" })

browser_navigate({ url, port, viewport: { width: 1280, height: 720 } })
browser_screenshot({ name: "feature-desktop" })
```

## PR Body Embedding

After uploading, embed the markdown URLs in the PR body:

```markdown
## Screenshots

### Before

![feature-before](https://github.com/.../agent-screenshots/feature-before.png)

### After

![feature-after](https://github.com/.../agent-screenshots/feature-after.png)
```

## Debugging with Screenshots + DB Queries

Correlate rendered UI with database state:

1. Use `db_query` to check data (e.g. league standings, roster)
2. Use `browser_navigate` to see how that data renders
3. Compare expected vs actual — take a screenshot as evidence

## Cleanup

**Always call `browser_cleanup()` before ending your workflow.** This closes the browser and kills all dev servers. Leaving servers running wastes resources and can block ports for future sessions.

## Troubleshooting

| Problem            | Solution                                                                    |
| ------------------ | --------------------------------------------------------------------------- |
| Navigation timeout | Check dev server is running: `browser_dev_status()`                         |
| Blank page         | Page may need auth — check if login redirect is happening                   |
| Port conflict      | Use `browser_dev_stop({ all: true })` then retry                            |
| Upload fails       | Check `gh auth status` — needs repo scope                                   |
| Selector not found | Use browser DevTools to verify the selector, or omit selector for full page |
