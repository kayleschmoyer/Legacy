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

const server = new McpServer({
  name: 'legacy-sports-browser',
  version: '1.0.0',
});

// Tool 1: browser_dev_start
server.tool(
  'browser_dev_start',
  'Start a Next.js dev server in a worktree directory. Allocates a port from 4300-4399 automatically unless specified. The server runs in the background and is tracked for the duration of this MCP session. Use browser_dev_stop or browser_cleanup to shut it down.',
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
  'List all currently tracked dev servers and browser state. Shows port, worktree path, PID, and whether a browser/page is active.',
  {},
  async () => devServerStatus(),
);

// Tool 4: browser_navigate
server.tool(
  'browser_navigate',
  'Open a URL in headless Chromium. Launches the browser on first call. Injects CSS to hide dynamic content (timestamps, spinners) and disable animations for consistent screenshots. If port is provided and url is a relative path, builds http://localhost:{port}{url}.',
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

// Tool 7: browser_cleanup
server.tool(
  'browser_cleanup',
  'Close the browser and stop all tracked dev servers. Call this before ending your workflow to free resources. Equivalent to browser_dev_stop({ all: true }) plus closing Playwright.',
  {},
  async () => cleanup(),
);

// Start server with stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
