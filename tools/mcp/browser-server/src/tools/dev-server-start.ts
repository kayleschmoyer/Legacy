import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { allocatePort } from '../port-manager.js';
import { state } from '../state.js';
import type { ToolResult } from '../types.js';

export const DEV_SERVER_TIMEOUT_MESSAGE = 'Dev server did not become ready';

const READINESS_POLL_INTERVAL_MS = 500;
const READINESS_CONNECT_TIMEOUT_MS = 1000;
const OUTPUT_TAIL_BYTES = 4000;

export interface DevServerStartParams {
  worktreePath: string;
  port?: number;
  timeoutMs?: number;
}

/** Try to TCP-connect to a single host:port. Resolves true on success, false on any failure. */
function tryConnect(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    let settled = false;
    const settle = (result: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(READINESS_CONNECT_TIMEOUT_MS, () => settle(false));
    socket.once('connect', () => settle(true));
    socket.once('error', () => settle(false));
  });
}

/**
 * Wait for the dev server to start accepting connections.
 *
 * On Windows, Vite (with `server.host: 'localhost'`) often binds to `::1`
 * (IPv6) only — probing `127.0.0.1` will time out even though the server is
 * fully up. We probe both IPv4 and IPv6 loopback in parallel and succeed as
 * soon as either accepts a connection.
 */
function waitForReady(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = async () => {
      if (Date.now() - start > timeoutMs) {
        reject(
          new Error(
            `${DEV_SERVER_TIMEOUT_MESSAGE} on port ${port} within ${Math.round(timeoutMs / 1000)}s`,
          ),
        );
        return;
      }
      const [v4, v6] = await Promise.all([
        tryConnect(port, '127.0.0.1'),
        tryConnect(port, '::1'),
      ]);
      if (v4 || v6) {
        resolve();
        return;
      }
      setTimeout(check, READINESS_POLL_INTERVAL_MS);
    };
    void check();
  });
}

/** Ring buffer that retains the last N bytes of process output. */
class OutputTail {
  private buf = '';
  constructor(private readonly maxBytes: number) {}
  append(chunk: string): void {
    this.buf += chunk;
    if (this.buf.length > this.maxBytes) {
      this.buf = this.buf.slice(this.buf.length - this.maxBytes);
    }
  }
  toString(): string {
    return this.buf;
  }
}

function attachOutputCapture(child: ChildProcess, tail: OutputTail): void {
  child.stdout?.on('data', (data: Buffer) => tail.append(data.toString()));
  child.stderr?.on('data', (data: Buffer) => tail.append(data.toString()));
}

/** Wait for either readiness or early child-process exit, whichever fires first. */
function waitForReadyOrExit(
  child: ChildProcess,
  port: number,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    child.once('exit', (code, signal) => {
      settle(() =>
        reject(
          new Error(
            `Dev server process exited before becoming ready (code=${code}, signal=${signal})`,
          ),
        ),
      );
    });
    waitForReady(port, timeoutMs).then(
      () => settle(() => resolve()),
      (err) => settle(() => reject(err)),
    );
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
              'Run `node scripts/modules-pool/link.mjs` or `make install` inside the worktree to restore node_modules, then retry.',
          }),
        },
      ],
      isError: true,
    };
  }

  const outputTail = new OutputTail(OUTPUT_TAIL_BYTES);

  try {
    // Start Vite/React dev server via nx serve web --port=<port>.
    // We invoke node_modules/.bin/nx directly (shell:true resolves .cmd on Windows)
    // rather than `make dev-web` because the Makefile target does not forward PORT
    // and nx's @nx/vite:dev-server executor ignores the PORT env var — the port
    // must be passed as a --port CLI flag.
    //
    // stdout AND stderr are piped so we can (a) include the tail in error
    // diagnostics and (b) keep the OS pipe buffer from filling and stalling
    // the child. The output is consumed by `attachOutputCapture` below.
    const isWindows = process.platform === 'win32';
    const child = spawn(
      'node_modules/.bin/nx',
      ['serve', 'web', `--port=${port}`],
      {
        cwd: worktreePath,
        stdio: ['ignore', 'pipe', 'pipe'],
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

    attachOutputCapture(child, outputTail);

    // Track the server immediately
    state.devServers.set(port, {
      port,
      worktreePath,
      pid: child.pid,
      startedAt: new Date().toISOString(),
    });

    // Detach the child so it outlives this tool call
    child.unref();

    // Wait for the server to be ready (or for the child to exit early)
    await waitForReadyOrExit(child, port, timeoutMs);

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
    const tail = outputTail.toString();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `Failed to start dev server: ${message}`,
            processOutputTail: tail || '(no output captured)',
            remedy: isTimeout
              ? `The server did not start in time. Inspect processOutputTail above for the last ${OUTPUT_TAIL_BYTES} bytes of nx/Vite output. Common causes: (a) Vite bound only to ::1 or 127.0.0.1 — the probe checks both, so see if the "Local:" line ever printed; (b) node_modules symlink broken (run \`node scripts/modules-pool/link.mjs\` or \`make install\`); (c) stale process holding the port (run \`make kill-stale\`). Retry with a larger timeoutMs (e.g. 180000) if the machine is slow.`
              : 'Check that the worktree has node_modules installed (`node scripts/modules-pool/link.mjs` or `make install`) and that the port is not in use.',
          }),
        },
      ],
      isError: true,
    };
  }
}
