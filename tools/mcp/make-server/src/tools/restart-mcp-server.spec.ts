import { afterEach, describe, expect, it } from '@jest/globals';
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { restartMcpServer } from './restart-mcp-server.js';

/** Pull the parsed JSON payload out of a ToolResult's text content. */
function payload(result: {
  content: Array<{ text: string }>;
}): Record<string, unknown> {
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('restartMcpServer', () => {
  let repoRoot: string;
  let child: ChildProcess | undefined;

  afterEach(() => {
    if (child && child.pid && isAlive(child.pid)) {
      process.kill(child.pid, 'SIGKILL');
    }
    child = undefined;
    if (repoRoot) rmSync(repoRoot, { recursive: true, force: true });
  });

  function setupRepo(entryRelPath: string): void {
    repoRoot = mkdtempSync(join(tmpdir(), 'restart-mcp-server-'));
    writeFileSync(
      join(repoRoot, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          'fake-server': {
            command: 'node',
            args: ['bootstrap.mjs', 'node', '--import', 'tsx', entryRelPath],
          },
          'no-ts-entry': {
            command: 'node',
            args: ['some-precompiled.js'],
          },
        },
      }),
    );
  }

  it('errors for an unknown server name, listing known servers', async () => {
    setupRepo('server-entry.ts');
    const result = await restartMcpServer(
      { server: 'not-a-real-server' },
      { repoRoot },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown MCP server');
    expect(result.content[0].text).toContain('fake-server');
  });

  it('errors for a server with no .ts entrypoint', async () => {
    setupRepo('server-entry.ts');
    const result = await restartMcpServer(
      { server: 'no-ts-entry' },
      { repoRoot },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('no .ts entrypoint');
  });

  it('reports no running process when the entrypoint is not live', async () => {
    setupRepo('nobody-is-running-this-entry.ts');
    const result = await restartMcpServer(
      { server: 'fake-server' },
      { repoRoot },
    );
    expect(result.isError).toBe(true);
    expect(payload(result).success).toBe(false);
    expect(payload(result).message).toContain('No running process found');
  });

  it('finds and kills a running process matching the entrypoint, and reports it', async () => {
    // A unique fake entry path baked into this process's own argv so the
    // real OS process lookup (ps/Get-CimInstance) finds it, exercising the
    // same code path a real tsx-server process would hit.
    const entryRelPath = `fake-entrypoint-${process.pid}-${Date.now()}.ts`;
    setupRepo(entryRelPath);

    // Spawn a long-lived process whose command line contains the fake
    // entrypoint as a *relative* arg — mirroring how mcp-bootstrap.mjs
    // actually launches real servers (cwd = repo root, entrypoint arg
    // exactly as written in .mcp.json, never resolved to an absolute path).
    child = spawn(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)', '--', entryRelPath],
      { stdio: 'ignore' },
    );
    const childPid = child.pid;
    expect(childPid).toBeDefined();
    // Give the OS a moment to register the process in the process table.
    await new Promise((resolve) => setTimeout(resolve, 200));

    const result = await restartMcpServer(
      { server: 'fake-server' },
      { repoRoot },
    );

    expect(result.isError).toBeUndefined();
    const body = payload(result);
    expect(body.success).toBe(true);
    expect(body.killedPids).toContain(childPid);
    expect(body.selfRestart).toBe(false);

    // Give SIGTERM a moment to land.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(isAlive(childPid as number)).toBe(false);
  });

  it('does not match a similarly-named entrypoint as a substring (word-boundary check)', async () => {
    const entryRelPath = `fake-entrypoint-${process.pid}-${Date.now()}.ts`;
    setupRepo(entryRelPath);

    // This process's command line contains a *longer* path that has
    // entryRelPath as a plain substring (prefixed by "old-"), which must NOT
    // count as a match — only a whole path-token match should.
    child = spawn(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)', '--', `old-${entryRelPath}`],
      { stdio: 'ignore' },
    );
    await new Promise((resolve) => setTimeout(resolve, 200));

    const result = await restartMcpServer(
      { server: 'fake-server' },
      { repoRoot },
    );

    expect(result.isError).toBe(true);
    expect(payload(result).message).toContain('No running process found');
  });

  it('handles restarting itself: defers the kill and reports selfRestart', async () => {
    const entryRelPath = `fake-entrypoint-${process.pid}-${Date.now()}.ts`;
    setupRepo(entryRelPath);

    child = spawn(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)', '--', entryRelPath],
      { stdio: 'ignore' },
    );
    const childPid = child.pid as number;
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Treat the spawned child as "this server's own pid" and stub out the
    // real kill/scheduler so this test never risks killing a real process —
    // it only asserts restartMcpServer's self-restart wiring.
    const killed: number[] = [];
    let scheduledFn: (() => void) | undefined;
    let scheduledDelay: number | undefined;

    const result = await restartMcpServer(
      { server: 'fake-server' },
      {
        repoRoot,
        selfPid: childPid,
        kill: (pid) => {
          killed.push(pid);
          return Promise.resolve();
        },
        scheduleSelfKill: (fn, delayMs) => {
          scheduledFn = fn;
          scheduledDelay = delayMs;
        },
      },
    );

    expect(result.isError).toBeUndefined();
    const body = payload(result);
    expect(body.success).toBe(true);
    expect(body.selfRestart).toBe(true);
    expect(body.killedPids).toEqual([childPid]);

    // The kill must be deferred, not immediate.
    expect(killed).toEqual([]);
    expect(scheduledFn).toBeDefined();
    expect(scheduledDelay).toBeGreaterThan(0);

    // Invoking the deferred callback (as the real scheduler eventually
    // would) kills exactly the self pid, via the injected kill fn.
    scheduledFn?.();
    expect(killed).toEqual([childPid]);
    expect(isAlive(childPid)).toBe(true); // never actually touched by this test
  });
});
