import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { allocatePort } from '../port-manager.js';
import { state } from '../state.js';
import type { ToolResult } from '../types.js';

export const DEV_SERVER_TIMEOUT_MESSAGE = 'Dev server did not become ready';

export interface DevServerStartParams {
  worktreePath: string;
  port?: number;
  timeoutMs?: number;
}

/** Wait for the dev server to start accepting connections. */
function waitForReady(port: number, timeoutMs: number = 60_000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (Date.now() - start > timeoutMs) {
        reject(
          new Error(
            `${DEV_SERVER_TIMEOUT_MESSAGE} on port ${port} within ${timeoutMs / 1000}s`,
          ),
        );
        return;
      }
      import('node:net').then(({ createConnection }) => {
        const socket = createConnection({ port, host: '127.0.0.1' }, () => {
          socket.destroy();
          resolve();
        });
        socket.on('error', () => {
          setTimeout(check, 500);
        });
      });
    };
    check();
  });
}

export async function devServerStart(
  params: DevServerStartParams,
): Promise<ToolResult> {
  const { worktreePath } = params;
  const timeoutMs = params.timeoutMs ?? 60_000;

  // Validate worktree path exists
  if (!existsSync(worktreePath)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `Path does not exist: ${worktreePath}`,
          }),
        },
      ],
      isError: true,
    };
  }

  // Check for package.json (basic sanity check)
  if (!existsSync(join(worktreePath, 'package.json'))) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `No package.json found at: ${worktreePath}`,
          }),
        },
      ],
      isError: true,
    };
  }

  const port = params.port ?? (await allocatePort());

  // Check if port is already tracked
  if (state.devServers.has(port)) {
    const existing = state.devServers.get(port)!;
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `Port ${port} already in use by dev server for ${existing.worktreePath} (pid ${existing.pid})`,
            remedy: `Stop the existing server with browser_dev_stop({ port: ${port} }) first.`,
          }),
        },
      ],
      isError: true,
    };
  }

  // Pre-check: verify the nx binary exists in the worktree's node_modules.
  // Worktrees use a symlink/junction to the main repo's node_modules; if it's
  // missing, `pnpm exec nx` will fail with an unhelpful error.
  const nxBin = join(worktreePath, 'node_modules', '.bin', 'nx');
  const nxBinCmd = nxBin + '.cmd';
  if (!existsSync(nxBin) && !existsSync(nxBinCmd)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `nx binary not found at ${nxBin}. The worktree's node_modules may not be set up.`,
            remedy:
              'Run worktree_setup_node_modules() or `make install` inside the worktree to restore node_modules, then retry.',
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    // Start Vite/React dev server via nx serve web --port=<port>.
    // We invoke node_modules/.bin/nx directly (shell:true resolves .cmd on Windows)
    // rather than `make dev-web` because the Makefile target does not forward PORT
    // and nx's @nx/vite:dev-server executor ignores the PORT env var — the port
    // must be passed as a --port CLI flag.
    const isWindows = process.platform === 'win32';
    const child = spawn(
      'node_modules/.bin/nx',
      ['serve', 'web', `--port=${port}`],
      {
        cwd: worktreePath,
        stdio: ['ignore', 'ignore', 'pipe'],
        detached: !isWindows,
        shell: true,
        env: {
          ...process.env,
        },
      },
    );

    if (!child.pid) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: 'Failed to spawn dev server process',
            }),
          },
        ],
        isError: true,
      };
    }

    // Collect early stderr for error detection
    let earlyStderr = '';
    child.stderr?.on('data', (data: Buffer) => {
      earlyStderr += data.toString();
    });

    // Track the server immediately
    state.devServers.set(port, {
      port,
      worktreePath,
      pid: child.pid,
      startedAt: new Date().toISOString(),
    });

    // Detach the child so it outlives this tool call
    child.unref();

    // Wait for the server to be ready
    await waitForReady(port, timeoutMs);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: true,
            port,
            pid: child.pid,
            worktreePath,
            url: `http://localhost:${port}`,
          }),
        },
      ],
    };
  } catch (err) {
    // Clean up tracked state if startup failed
    state.devServers.delete(port);
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.startsWith(DEV_SERVER_TIMEOUT_MESSAGE);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `Failed to start dev server: ${message}`,
            remedy: isTimeout
              ? 'The server did not start in time. Check that node_modules/.bin/nx exists in the worktree (run worktree_setup_node_modules or `make install` if missing). Run `make kill-stale` to clear stale processes, then retry with a larger timeoutMs (e.g. 180000).'
              : 'Check that the worktree has node_modules installed (worktree_setup_node_modules or `make install`) and that the port is not in use.',
          }),
        },
      ],
      isError: true,
    };
  }
}
