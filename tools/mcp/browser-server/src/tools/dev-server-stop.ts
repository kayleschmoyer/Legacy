import { state } from '../state.js';
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
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: true,
              message: 'No dev servers running.',
            }),
          },
        ],
      };
    }
    const stopped: number[] = [];
    for (const server of servers) {
      await killProcess(server.pid);
      state.devServers.delete(server.port);
      stopped.push(server.port);
    }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: true,
            stopped,
            message: `Stopped ${stopped.length} dev server(s).`,
          }),
        },
      ],
    };
  }

  // Find the server to stop
  let target = port ? state.devServers.get(port) : undefined;
  if (!target && worktreePath) {
    target = Array.from(state.devServers.values()).find(
      (s) => s.worktreePath === worktreePath,
    );
  }

  if (!target) {
    const hint = port
      ? `port ${port}`
      : worktreePath
        ? `worktree ${worktreePath}`
        : 'no criteria';
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `No tracked dev server found for ${hint}.`,
            tracked: Array.from(state.devServers.values()),
          }),
        },
      ],
      isError: true,
    };
  }

  await killProcess(target.pid);
  state.devServers.delete(target.port);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ok: true,
          stopped: target.port,
          pid: target.pid,
          worktreePath: target.worktreePath,
        }),
      },
    ],
  };
}
