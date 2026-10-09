# Browser MCP Tool Catalog

> GENERATED FILE — DO NOT EDIT.
>
> Source: `tools/mcp/browser-server/src/{index,lambda}.ts`. Regenerate with 
> `make mcp-api-reference`; CI fails on drift (LS-9701 Tier 2, review pattern #48).
>
> For the interactive, filterable version of this same data across every
> server: [`docs/mcp/api-reference.html`](../../../../../docs/mcp/api-reference.html).

Drive the local dev site: start/stop the dev server, log in, navigate, and capture screenshots.

Local stdio process only — not exposed as a hosted connector.

---

### `browser_cleanup`

Close the browser and stop all tracked dev servers. Call this before ending your workflow to free resources. Equivalent to browser_dev_stop({ all: true }) plus closing Playwright.

_No parameters._

### `browser_dev_login`

Authenticate the current browser session against a local dev server using the cached e2e JWT (~/.legacy-sports/e2e-token.json, minted by `make e2e-auth`) — sets the ls_jwt HttpOnly cookie plus ls_user_profile/ls_token_expiry/ls_csrf_token localStorage, mirroring apps/web-e2e's buildIntegrationStorageState. The token is read and applied server-side; it is never included in the tool result. Pass url or port to navigate first (required if no page has been loaded yet via browser_navigate); otherwise applies to the currently loaded page and reloads it. Errors with a remedy if no cached token is valid — the human must run `make e2e-auth` interactively.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `identity` | "Which cached identity to use. Only \"e2e-cached\" (the make e2e-auth token) is supported today." |  | — | Which cached identity to use. Only "e2e-cached" (the make e2e-auth token) is supported today. |
| `url` | string |  | — | URL to navigate to before authenticating. Can be absolute (http://...) or relative (/dashboard) if port is provided. |
| `port` | number |  | integer | Dev server port — used to build full URL from relative paths, or alone to navigate to http://localhost:{port}/. |

### `browser_dev_start`

Start an nx dev server in a worktree directory — defaults to the web app (nx serve web) but accepts any nx "project:target" via the target param (e.g. "shared-components:storybook"). Allocates a port from 4300-4399 automatically unless specified. The server runs in the background and is tracked for the duration of this MCP session. Waits up to 45s for readiness, then returns without blocking: on a slow startup the result has ready: false — poll browser_dev_status until the port shows listening: true. Use browser_dev_stop or browser_cleanup to shut it down.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `worktreePath` | string | **required** | — | Absolute path to the worktree directory where the dev server should start. |
| `port` | number |  | integer, min 4300, max 4399 | Port to use (4300-4399). If omitted, the next available port in range is allocated automatically. |
| `timeoutMs` | number |  | integer, min 1000 | Readiness wait budget (ms). Default and maximum: 45000 (45s) — larger values are clamped so the call always returns before the ~60s MCP transport limit. When the budget elapses the call still succeeds with ready: false; poll browser_dev_status for readiness. |
| `target` | string |  | — | nx "project:target" to run instead of the default "web:serve", e.g. "shared-components:storybook". Runs via `nx run <target> --port=<port>`, so the target's executor must accept a --port flag; readiness is still probed by TCP-connecting to that port, so no further configuration is needed. |

### `browser_dev_status`

List dev servers and browser state. Includes MCP-managed servers (managed: true, with a live listening readiness probe) and pre-existing servers detected by scanning ports 4200-4399 (managed: false). Always call this before browser_dev_start to check if a server is already running, and poll it after a browser_dev_start that returned ready: false.

_No parameters._

### `browser_dev_stop`

Stop a tracked dev server by port, worktreePath, or all=true for every one. An untracked port falls back to an OS-level kill to free a stale process.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `port` | number |  | integer, min 1, max 65535 | Port to stop. |
| `worktreePath` | string |  | — | Worktree path of the dev server to stop. |
| `all` | boolean |  | — | If true, stop all tracked dev servers. |

### `browser_navigate`

Open a URL in headless Chromium. Launches the browser on first call. Injects CSS to hide dynamic content (timestamps, spinners), disable animations/transitions, and hide scrollbars for consistent screenshots. CSS transforms are preserved, so rotated/translated elements screenshot as they really render. If port is provided and url is a relative path, builds http://localhost:{port}{url}.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `url` | string | **required** | — | URL to navigate to. Can be absolute (http://...) or relative (/dashboard) if port is provided. |
| `port` | number |  | integer | Dev server port — used to build full URL from relative paths. |
| `viewport` | object |  | — | Browser viewport size. Defaults to 1280x720. Changing this creates a new browser context. |

### `browser_screenshot`

Capture a screenshot of the current page or a specific element. Saves a PNG to {worktreePath}/.screenshots/{name}.png and returns the image inline. Call browser_navigate first.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `name` | string | **required** | — | Screenshot name (used as filename without extension). E.g. "feature-before", "dashboard-after". |
| `fullPage` | boolean |  | — | If true, capture the full scrollable page. Default is viewport only. |
| `selector` | string |  | — | CSS selector to screenshot a specific element instead of the full page/viewport. |
| `worktreePath` | string |  | — | Worktree path for .screenshots directory. If omitted, uses the first tracked dev server worktree. |

### `browser_screenshot_upload`

Upload a screenshot PNG to GitHub via a draft release (tag: agent-screenshots). Returns a stable URL and markdown image syntax for embedding in PR bodies. Creates the draft release on first use.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `screenshotPath` | string | **required** | — | Absolute path to the PNG file to upload (e.g. from browser_screenshot output). |

