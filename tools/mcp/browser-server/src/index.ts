import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { devServerStart } from './tools/dev-server-start.js';
import { devServerStop } from './tools/dev-server-stop.js';
import { devServerStatus } from './tools/dev-server-status.js';
import { navigate } from './tools/navigate.js';
import { screenshot } from './tools/screenshot.js';
import { screenshotUpload } from './tools/screenshot-upload.js';
import { cleanup } from './tools/cleanup.js';
import { devLogin } from './tools/dev-login.js';

const server = new McpServer({
  name: 'legacy-sports-browser',
  version: '1.0.0',
});

// Tool 1: browser_dev_start
server.tool(
  'browser_dev_start',
  'Start an nx dev server in a worktree directory — defaults to the web app (nx serve web) but accepts any nx "project:target" via the target param (e.g. "shared-components:storybook"). Allocates a port from 4300-4399 automatically unless specified. The server runs in the background and is tracked for the duration of this MCP session. Waits up to 45s for readiness, then returns without blocking: on a slow startup the result has ready: false — poll browser_dev_status until the port shows listening: true. Use browser_dev_stop or browser_cleanup to shut it down.',
  {
    worktreePath: z
      .string()
      .describe(
        'Absolute path to the worktree directory where the dev server should start.',
      ),
    port: z
      .number()
      .int()
      .min(4300)
      .max(4399)
      .optional()
      .describe(
        'Port to use (4300-4399). If omitted, the next available port in range is allocated automatically.',
      ),
    timeoutMs: z
      .number()
      .int()
      .min(1000)
      .optional()
      .describe(
        'Readiness wait budget (ms). Default and maximum: 45000 (45s) — larger values are clamped so the call always returns before the ~60s MCP transport limit. When the budget elapses the call still succeeds with ready: false; poll browser_dev_status for readiness.',
      ),
    target: z
      .string()
      .optional()
      .describe(
        'nx "project:target" to run instead of the default "web:serve", e.g. "shared-components:storybook". Runs via `nx run <target> --port=<port>`, so the target\'s executor must accept a --port flag; readiness is still probed by TCP-connecting to that port, so no further configuration is needed.',
      ),
  },
  async (params) => devServerStart(params),
);

// Tool 2: browser_dev_stop
server.tool(
  'browser_dev_stop',
  'Stop a tracked dev server. Specify by port, worktreePath, or set all=true to stop every tracked server. Uses taskkill on Windows to kill the entire process tree.',
  {
    port: z
      .number()
      .int()
      .optional()
      .describe('Port of the dev server to stop.'),
    worktreePath: z
      .string()
      .optional()
      .describe('Worktree path of the dev server to stop.'),
    all: z
      .boolean()
      .optional()
      .describe('If true, stop all tracked dev servers.'),
  },
  async (params) => devServerStop(params),
);

// Tool 3: browser_dev_status
server.tool(
  'browser_dev_status',
  'List dev servers and browser state. Includes MCP-managed servers (managed: true, with a live listening readiness probe) and pre-existing servers detected by scanning ports 4200-4399 (managed: false). Always call this before browser_dev_start to check if a server is already running, and poll it after a browser_dev_start that returned ready: false.',
  {},
  async () => devServerStatus(),
);

// Tool 4: browser_navigate
server.tool(
  'browser_navigate',
  'Open a URL in headless Chromium. Launches the browser on first call. Injects CSS to hide dynamic content (timestamps, spinners), disable animations/transitions, and hide scrollbars for consistent screenshots. CSS transforms are preserved, so rotated/translated elements screenshot as they really render. If port is provided and url is a relative path, builds http://localhost:{port}{url}.',
  {
    url: z
      .string()
      .describe(
        'URL to navigate to. Can be absolute (http://...) or relative (/dashboard) if port is provided.',
      ),
    port: z
      .number()
      .int()
      .optional()
      .describe(
        'Dev server port — used to build full URL from relative paths.',
      ),
    viewport: z
      .object({
        width: z.number().int().describe('Viewport width in pixels.'),
        height: z.number().int().describe('Viewport height in pixels.'),
      })
      .optional()
      .describe(
        'Browser viewport size. Defaults to 1280x720. Changing this creates a new browser context.',
      ),
  },
  async (params) => navigate(params),
);

// Tool 5: browser_screenshot
server.tool(
  'browser_screenshot',
  'Capture a screenshot of the current page or a specific element. Saves a PNG to {worktreePath}/.screenshots/{name}.png and returns the image inline. Call browser_navigate first.',
  {
    name: z
      .string()
      .describe(
        'Screenshot name (used as filename without extension). E.g. "feature-before", "dashboard-after".',
      ),
    fullPage: z
      .boolean()
      .optional()
      .describe(
        'If true, capture the full scrollable page. Default is viewport only.',
      ),
    selector: z
      .string()
      .optional()
      .describe(
        'CSS selector to screenshot a specific element instead of the full page/viewport.',
      ),
    worktreePath: z
      .string()
      .optional()
      .describe(
        'Worktree path for .screenshots directory. If omitted, uses the first tracked dev server worktree.',
      ),
  },
  async (params) => screenshot(params),
);

// Tool 6: browser_screenshot_upload
server.tool(
  'browser_screenshot_upload',
  'Upload a screenshot PNG to GitHub via a draft release (tag: agent-screenshots). Returns a stable URL and markdown image syntax for embedding in PR bodies. Creates the draft release on first use.',
  {
    screenshotPath: z
      .string()
      .describe(
        'Absolute path to the PNG file to upload (e.g. from browser_screenshot output).',
      ),
  },
  async (params) => screenshotUpload(params),
);

// Tool 7: browser_dev_login
server.tool(
  'browser_dev_login',
  "Authenticate the current browser session against a local dev server using the cached e2e JWT (~/.legacy-sports/e2e-token.json, minted by `make e2e-auth`) — sets the ls_jwt HttpOnly cookie plus ls_user_profile/ls_token_expiry/ls_csrf_token localStorage, mirroring apps/web-e2e's buildIntegrationStorageState. The token is read and applied server-side; it is never included in the tool result. Pass url or port to navigate first (required if no page has been loaded yet via browser_navigate); otherwise applies to the currently loaded page and reloads it. Errors with a remedy if no cached token is valid — the human must run `make e2e-auth` interactively.",
  {
    identity: z
      .literal('e2e-cached')
      .optional()
      .describe(
        'Which cached identity to use. Only "e2e-cached" (the make e2e-auth token) is supported today.',
      ),
    url: z
      .string()
      .optional()
      .describe(
        'URL to navigate to before authenticating. Can be absolute (http://...) or relative (/dashboard) if port is provided.',
      ),
    port: z
      .number()
      .int()
      .optional()
      .describe(
        'Dev server port — used to build full URL from relative paths, or alone to navigate to http://localhost:{port}/.',
      ),
  },
  async (params) => devLogin(params),
);

// Tool 8: browser_cleanup
server.tool(
  'browser_cleanup',
  'Close the browser and stop all tracked dev servers. Call this before ending your workflow to free resources. Equivalent to browser_dev_stop({ all: true }) plus closing Playwright.',
  {},
  async () => cleanup(),
);

// Start server with stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
