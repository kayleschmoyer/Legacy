# Agent Screenshots

> **When to apply:** PR involves UI changes (.tsx, .jsx, .css, style files, new routes/pages/components)

Use the `legacy-sports-browser` MCP server to capture screenshots of UI changes and embed them in PR bodies.

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
