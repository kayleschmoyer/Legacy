# browser-server

> **Server ID:** `legacy-sports-browser`

MCP server giving agents the ability to start dev servers, navigate pages, capture screenshots, and upload them to GitHub for PR embedding.

## Tools

| Tool                        | Purpose                                                 |
| --------------------------- | ------------------------------------------------------- |
| `browser_dev_start`         | Start Next.js dev server in a worktree (port 4300-4399) |
| `browser_dev_stop`          | Stop a tracked dev server by port, path, or all         |
| `browser_dev_status`        | List running dev servers and browser state              |
| `browser_navigate`          | Open a page in headless Chromium                        |
| `browser_screenshot`        | Capture page/element screenshot as PNG                  |
| `browser_screenshot_upload` | Upload PNG to GitHub draft release for PR embed         |
| `browser_cleanup`           | Close browser + kill all dev servers                    |

## Port Management

Ports are allocated from 4300-4399 to avoid conflicts with:

- 3000 (Next.js default)
- 4200 (Nx default)
- 4280 (GraphiQL)

## Screenshot Workflow

```
browser_dev_start({ worktreePath })        → starts server on 4300+
browser_navigate({ url: "/page", port })   → opens page in headless Chromium
browser_screenshot({ name: "before" })     → saves .screenshots/before.png
# ... make code changes, hot reload ...
browser_navigate({ url: "/page", port })   → reload page
browser_screenshot({ name: "after" })      → saves .screenshots/after.png
browser_screenshot_upload({ screenshotPath }) → upload to GitHub, get markdown URL
browser_cleanup()                          → close browser, kill servers
```

## GitHub Image Upload

Uses a draft GitHub release tagged `agent-screenshots` to host images:

- No repo bloat (images are release assets, not committed files)
- Stable URLs suitable for PR body embedding
- `--clobber` flag overwrites existing assets with the same name

## Dependencies

- `playwright` (already installed as workspace devDependency)
- `gh` CLI (for screenshot upload to GitHub releases)
