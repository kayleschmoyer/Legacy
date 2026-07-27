# browser-server

> **Server ID:** `legacy-sports-browser`

MCP server giving agents the ability to start dev servers, navigate pages, capture screenshots, and upload them to GitHub for PR embedding.

## Tools

| Tool                        | Purpose                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `browser_dev_start`         | Start an nx dev server in a worktree (port 4300-4399); defaults to `web:serve`, accepts any `project:target` via `target` |
| `browser_dev_stop`          | Stop a tracked dev server by port, path, or all                                                                           |
| `browser_dev_status`        | List running dev servers and browser state                                                                                |
| `browser_navigate`          | Open a page in headless Chromium                                                                                          |
| `browser_screenshot`        | Capture page/element screenshot as PNG                                                                                    |
| `browser_screenshot_upload` | Upload PNG to GitHub draft release for PR embed                                                                           |
| `browser_cleanup`           | Close browser + kill all dev servers                                                                                      |

## Non-Blocking Start

`browser_dev_start` waits at most **45s** for the dev server to accept
connections — bounded so the tool call always returns before the ~60s cloud MCP
transport limit (LS-8561). On a slow startup it still succeeds with
`ready: false` and a hint; poll `browser_dev_status`, whose managed rows carry a
live `listening` probe (both IPv4 and IPv6 loopback), until the server is up.
An early child-process exit is still reported as an error with the captured
output tail.

## Non-Web Targets

`browser_dev_start` defaults to `nx serve web`, but accepts a `target` param
(any nx `"project:target"`, e.g. `"shared-components:storybook"`) to start a
different dev server — `nx run <target> --port=<port>` is spawned instead.
The target's executor must accept a `--port` flag; readiness is still probed
via the same TCP-connect check on `port`, so no other configuration is
required. `browser_dev_status` reports each tracked server's `target`.

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
