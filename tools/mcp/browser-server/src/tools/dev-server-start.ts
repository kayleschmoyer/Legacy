import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { allocatePort } from '../port-manager.js';
import { state } from '../state.js';
import { jsonResult } from '../format.js';
import type { ToolResult } from '../types.js';

const READINESS_POLL_INTERVAL_MS = 500;
const READINESS_CONNECT_TIMEOUT_MS = 1000;
const OUTPUT_TAIL_BYTES = 4000;

// The readiness wait must stay comfortably under the ~60s cloud MCP transport
// limit (LS-8561): a tool call that blocks longer is killed by the transport
// before it can return. A server that is not ready within this budget is
// returned as a starting-snapshot instead — the caller polls
// browser_dev_status for readiness.
export const READINESS_WAIT_MAX_MS = 45_000;

/**
 * Clamp rather than reject so callers following the old guidance (e.g.
 * timeoutMs: 180000) still work — they just get the starting-snapshot
 * response sooner and poll browser_dev_status for readiness.
 */
export function clampReadinessWait(timeoutMs?: number): number {
  return Math.min(timeoutMs ?? READINESS_WAIT_MAX_MS, READINESS_WAIT_MAX_MS);
}

export interface DevServerStartParams {
  worktreePath: string;
  port?: number;
  timeoutMs?: number;
}

/**
 * Resolve the absolute path to the nx binary in a worktree's node_modules,
 * preferring the Windows `.cmd` shim when present. Returns `null` if neither
 * exists (e.g. node_modules isn't set up).
 *
 * Always returns an OS-native (join()-produced) path rather than a hardcoded
 * forward-slash string — with shell:true on Windows, cmd.exe treats "/" as a
 * switch delimiter when parsing an unqualified command token, so a relative
 * "node_modules/.bin/nx" gets split at the first slash and cmd tries to run a
 * program literally named "node_modules", failing with "'node_modules' is not
 * recognized...". Backslash-separated absolute paths don't trigger that split.
 */
export function resolveNxExecutable(worktreePath: string): string | null {
  const nxBin = join(worktreePath, 'node_modules', '.bin', 'nx');
  const nxBinCmd = `${nxBin}.cmd`;
  if (existsSync(nxBinCmd)) return nxBinCmd;
  if (existsSync(nxBin)) return nxBin;
  return null;
}

/** Try to TCP-connect to a single host:port. Resolves true on success, false on any failure. */
export function tryConnect(port: number, host: string): Promise<boolean> {
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
 * Probe whether the dev server is accepting connections on either loopback.
 *
 * On Windows, Vite (with `server.host: 'localhost'`) often binds to `::1`
 * (IPv6) only — probing `127.0.0.1` will time out even though the server is
 * fully up. We probe both IPv4 and IPv6 loopback in parallel and succeed as
 * soon as either accepts a connection.
 */
export async function probeLoopback(port: number): Promise<boolean> {
  const [v4, v6] = await Promise.all([
    tryConnect(port, '127.0.0.1'),
    tryConnect(port, '::1'),
  ]);
  return v4 || v6;
}

/**
 * Wait for the dev server to start accepting connections. Resolves `true` when
 * a loopback probe succeeds, `false` when the budget elapses first — never
 * rejects, because "not ready yet" is a normal outcome (LS-8561).
 */
function waitForReady(port: number, budgetMs: number): Promise<boolean> {
  const start = Date.now();
  return new Promise((resolve) => {
    const check = async () => {
      if (Date.now() - start > budgetMs) {
        resolve(false);
        return;
      }
      if (await probeLoopback(port)) {
        resolve(true);
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

/**
 * Wait for readiness, budget exhaustion, or early child-process exit —
 * whichever fires first. Resolves `'ready'` or `'starting'`; rejects only when
 * the child dies before becoming ready.
 */
export function waitForReadyOrExit(
  child: ChildProcess,
  port: number,
  budgetMs: number,
): Promise<'ready' | 'starting'> {
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
    waitForReady(port, budgetMs).then((ready) =>
      settle(() => resolve(ready ? 'ready' : 'starting')),
    );
  });
}

export async function devServerStart(
  params: DevServerStartParams,
): Promise<ToolResult> {
  const { worktreePath } = params;
  const readinessWaitMs = clampReadinessWait(params.timeoutMs);

  // Validate worktree path exists
  if (!existsSync(worktreePath)) {
    return jsonResult(
      { ok: false, error: `Path does not exist: ${worktreePath}` },
      true,
    );
  }

  // Check for package.json (basic sanity check)
  if (!existsSync(join(worktreePath, 'package.json'))) {
    return jsonResult(
      { ok: false, error: `No package.json found at: ${worktreePath}` },
      true,
    );
  }

  const port = params.port ?? (await allocatePort());

  // Check if port is already tracked
  if (state.devServers.has(port)) {
    const existing = state.devServers.get(port)!;
    return jsonResult(
      {
        ok: false,
        error: `Port ${port} already in use by dev server for ${existing.worktreePath} (pid ${existing.pid})`,
        remedy: `Stop the existing server with browser_dev_stop({ port: ${port} }) first.`,
      },
      true,
    );
  }

  // Pre-check: verify the nx binary exists in the worktree's node_modules.
  // Worktrees use a symlink/junction to the main repo's node_modules; if it's
  // missing, `pnpm exec nx` will fail with an unhelpful error.
  const nxExecutable = resolveNxExecutable(worktreePath);
  if (!nxExecutable) {
    return jsonResult(
      {
        ok: false,
        error: `nx binary not found at ${join(worktreePath, 'node_modules', '.bin', 'nx')}. The worktree's node_modules may not be set up.`,
        remedy:
          'Run `node scripts/modules-pool/link.mjs` or `make install` inside the worktree to restore node_modules, then retry.',
      },
      true,
    );
  }

  const outputTail = new OutputTail(OUTPUT_TAIL_BYTES);

  try {
    // Start Vite/React dev server via nx serve web --port=<port>.
    // We invoke the nx binary directly (rather than `make dev-web`) because the
    // Makefile target does not forward PORT and nx's @nx/vite:dev-server executor
    // ignores the PORT env var — the port must be passed as a --port CLI flag.
    const isWindows = process.platform === 'win32';

    // stdout AND stderr are piped so we can (a) include the tail in error
    // diagnostics and (b) keep the OS pipe buffer from filling and stalling
    // the child. The output is consumed by `attachOutputCapture` below.
    const child = spawn(nxExecutable, ['serve', 'web', `--port=${port}`], {
      cwd: worktreePath,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: !isWindows,
      shell: true,
      env: {
        ...process.env,
      },
    });

    if (!child.pid) {
      return jsonResult(
        { ok: false, error: 'Failed to spawn dev server process' },
        true,
      );
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

    // Wait briefly for readiness (or early child exit). The wait is bounded by
    // READINESS_WAIT_MAX_MS so this tool call always returns before the cloud
    // MCP transport limit — a slow-but-healthy startup is NOT an error.
    const outcome = await waitForReadyOrExit(child, port, readinessWaitMs);

    // Single-object actionable result of a "start" action — `url` is the
    // primary affordance here (not a repeated list row), so it is kept.
    return jsonResult({
      ok: true,
      ready: outcome === 'ready',
      port,
      pid: child.pid,
      worktreePath,
      url: `http://localhost:${port}`,
      ...(outcome === 'starting'
        ? {
            hint: `Dev server (pid ${child.pid}) is still starting; this call returned early instead of blocking. Poll browser_dev_status until port ${port} shows listening: true, then proceed. If it never becomes ready, check for a broken node_modules symlink (\`node scripts/modules-pool/link.mjs\`) or a stale process on the port (\`make kill-stale\`), and stop it with browser_dev_stop({ port: ${port} }).`,
          }
        : {}),
    });
  } catch (err) {
    // The child exited before becoming ready (or spawn failed) — clean up
    // tracked state. Budget exhaustion no longer lands here (LS-8561).
    state.devServers.delete(port);
    const message = err instanceof Error ? err.message : String(err);
    const tail = outputTail.toString();
    return jsonResult(
      {
        ok: false,
        error: `Failed to start dev server: ${message}`,
        processOutputTail: tail || '(no output captured)',
        remedy:
          'Inspect processOutputTail above for the nx/Vite failure. Check that the worktree has node_modules installed (`node scripts/modules-pool/link.mjs` or `make install`) and that the port is not in use (`make kill-stale`).',
      },
      true,
    );
  }
}
