import { pickFields } from '@legacy-sports/mcp-format';
import { state } from '../state.js';
import { jsonResult } from '../format.js';
import { findPidsOnPort, killPidByOs } from '../port-lookup.js';
import type { ToolResult } from '../types.js';

export interface DevServerStopParams {
  port?: number;
  worktreePath?: string;
  all?: boolean;
}

/** Kill a process by PID. Uses taskkill on Windows to kill the entire tree. */
async function killProcess(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    const { execFile } = await import('node:child_process');
    return new Promise((resolve) => {
      execFile(
        'taskkill',
        ['/pid', String(pid), '/t', '/f'],
        { shell: true },
        () => {
          // Ignore errors (process may already be dead)
          resolve();
        },
      );
    });
  } else {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Already dead
      }
    }
  }
}

export async function devServerStop(
  params: DevServerStopParams,
): Promise<ToolResult> {
  const { port, worktreePath, all } = params;

  if (all) {
    const servers = Array.from(state.devServers.values());
    if (servers.length === 0) {
      return jsonResult({ ok: true, message: 'No dev servers running.' });
    }
    const stopped: number[] = [];
    for (const server of servers) {
      await killProcess(server.pid);
      state.devServers.delete(server.port);
      stopped.push(server.port);
    }
    return jsonResult({
      ok: true,
      stopped,
      message: `Stopped ${stopped.length} dev server(s).`,
    });
  }

  // Find the server to stop
  let target = port ? state.devServers.get(port) : undefined;
  if (!target && worktreePath) {
    target = Array.from(state.devServers.values()).find(
      (s) => s.worktreePath === worktreePath,
    );
  }

  if (!target) {
    // A port was given but nothing tracked matches it — fall back to an
    // OS-level lookup instead of failing outright. The process may be a
    // stale server left over from an earlier, unrelated invocation (e.g. a
    // crashed webServer still bound to its port) that this MCP session never
    // tracked in the first place (LS-9331).
    if (port) return killUntrackedPort(port);

    // `tracked` lets the agent pick a valid stop target — it needs the
    // identifiers (port/worktreePath/pid), not `startedAt`, so that is pruned.
    return jsonResult(
      {
        ok: false,
        error: `No tracked dev server found for worktree ${worktreePath}.`,
        tracked: pickFields(
          Array.from(state.devServers.values()).map((s) => ({ ...s })),
          ['port', 'worktreePath', 'pid'],
        ),
      },
      true,
    );
  }

  await killProcess(target.pid);
  state.devServers.delete(target.port);

  return jsonResult({
    ok: true,
    stopped: target.port,
    pid: target.pid,
    worktreePath: target.worktreePath,
  });
}

/**
 * Free a port this MCP session never tracked: look up whatever is LISTENing
 * on it at the OS level (cross-platform), kill it, and report before/after
 * PID state so the caller can confirm the port is free.
 */
async function killUntrackedPort(port: number): Promise<ToolResult> {
  const before = await findPidsOnPort(port);

  if (before.length === 0) {
    return jsonResult({
      ok: true,
      port,
      before: [],
      killed: [],
      after: [],
      message: `No process is listening on port ${port}.`,
    });
  }

  for (const pid of before) {
    await killPidByOs(pid);
  }

  const after = await findPidsOnPort(port);

  return jsonResult({
    ok: after.length === 0,
    port,
    before,
    killed: before,
    after,
    message:
      after.length === 0
        ? `Killed ${before.length} process(es) on port ${port}; port is now free.`
        : `Killed ${before.length} process(es) on port ${port}, but ${after.length} still listening (may have respawned).`,
  });
}
