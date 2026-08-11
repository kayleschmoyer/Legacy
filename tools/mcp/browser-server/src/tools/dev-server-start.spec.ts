import { describe, expect, it } from '@jest/globals';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import {
  buildNxArgs,
  clampReadinessWait,
  DEFAULT_TARGET,
  isValidTarget,
  probeLoopback,
  READINESS_WAIT_MAX_MS,
  resolveNxExecutable,
  waitForReadyOrExit,
} from './dev-server-start.js';

/** Listen on an OS-assigned loopback port; resolves the server and its port. */
function listenEphemeral(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('No port assigned'));
        return;
      }
      resolve({ server, port: address.port });
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

/** Spawn a node child that stays alive until killed. */
function spawnLongLived() {
  return spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
  });
}

describe('clampReadinessWait', () => {
  it('defaults to the maximum budget', () => {
    expect(clampReadinessWait(undefined)).toBe(READINESS_WAIT_MAX_MS);
  });

  it('clamps oversized budgets (e.g. the old 180000 guidance) to the maximum', () => {
    expect(clampReadinessWait(180_000)).toBe(READINESS_WAIT_MAX_MS);
  });

  it('keeps budgets under the maximum unchanged', () => {
    expect(clampReadinessWait(10_000)).toBe(10_000);
  });

  it('never exceeds the ~60s MCP transport limit', () => {
    expect(READINESS_WAIT_MAX_MS).toBeLessThan(60_000);
  });
});

describe('isValidTarget', () => {
  it('accepts a well-formed project:target token', () => {
    expect(isValidTarget('web:serve')).toBe(true);
    expect(isValidTarget('shared-components:storybook')).toBe(true);
    expect(isValidTarget('my_project:my-target')).toBe(true);
  });

  it('rejects tokens without a project:target shape', () => {
    expect(isValidTarget('web')).toBe(false);
    expect(isValidTarget('web:serve:extra')).toBe(false);
    expect(isValidTarget('')).toBe(false);
  });

  it('rejects shell metacharacters (defense before a shell:true spawn)', () => {
    expect(isValidTarget('web:serve; rm -rf /')).toBe(false);
    expect(isValidTarget('web:serve && echo pwned')).toBe(false);
    expect(isValidTarget('web:serve`whoami`')).toBe(false);
    expect(isValidTarget('web:serve $(whoami)')).toBe(false);
  });
});

describe('buildNxArgs', () => {
  it('preserves the exact historical invocation for the default target', () => {
    expect(buildNxArgs(DEFAULT_TARGET, 4300)).toEqual([
      'serve',
      'web',
      '--port=4300',
    ]);
  });

  it('builds a generic `nx run <target> --port=<port>` for other targets', () => {
    expect(buildNxArgs('shared-components:storybook', 4301)).toEqual([
      'run',
      'shared-components:storybook',
      '--port=4301',
    ]);
  });
});

describe('resolveNxExecutable', () => {
  function makeWorktreeWithBin(files: string[]): string {
    const worktreePath = mkdtempSync(join(tmpdir(), 'dev-server-start-'));
    const binDir = join(worktreePath, 'node_modules', '.bin');
    mkdirSync(binDir, { recursive: true });
    for (const file of files) {
      writeFileSync(join(binDir, file), '');
    }
    return worktreePath;
  }

  it('returns null when node_modules/.bin has no nx binary', () => {
    const worktreePath = makeWorktreeWithBin([]);
    try {
      expect(resolveNxExecutable(worktreePath)).toBeNull();
    } finally {
      rmSync(worktreePath, { recursive: true, force: true });
    }
  });

  it('returns the .cmd shim when both nx and nx.cmd exist', () => {
    const worktreePath = makeWorktreeWithBin(['nx', 'nx.cmd']);
    try {
      const executable = resolveNxExecutable(worktreePath);
      expect(executable).toBe(
        join(worktreePath, 'node_modules', '.bin', 'nx.cmd'),
      );
    } finally {
      rmSync(worktreePath, { recursive: true, force: true });
    }
  });

  it('falls back to the extensionless binary when no .cmd shim exists', () => {
    const worktreePath = makeWorktreeWithBin(['nx']);
    try {
      const executable = resolveNxExecutable(worktreePath);
      expect(executable).toBe(join(worktreePath, 'node_modules', '.bin', 'nx'));
    } finally {
      rmSync(worktreePath, { recursive: true, force: true });
    }
  });

  it('never returns a forward-slash-only relative path (the cmd.exe "/" split bug)', () => {
    const worktreePath = makeWorktreeWithBin(['nx', 'nx.cmd']);
    try {
      const executable = resolveNxExecutable(worktreePath);
      if (executable === null)
        throw new Error('expected a non-null executable path');
      // Must be absolute and use the OS-native separator, so cmd.exe never
      // sees a lone "/"-delimited relative token to mis-tokenize.
      expect(executable.startsWith(worktreePath)).toBe(true);
      expect(executable).toContain(sep);
    } finally {
      rmSync(worktreePath, { recursive: true, force: true });
    }
  });
});

describe('probeLoopback', () => {
  it('resolves true for a listening port', async () => {
    const { server, port } = await listenEphemeral();
    try {
      await expect(probeLoopback(port)).resolves.toBe(true);
    } finally {
      await closeServer(server);
    }
  });

  it('resolves false for a closed port', async () => {
    // Grab a free port, then close it so nothing is listening.
    const { server, port } = await listenEphemeral();
    await closeServer(server);
    await expect(probeLoopback(port)).resolves.toBe(false);
  });
});

describe('waitForReadyOrExit', () => {
  it("resolves 'ready' when the port is already accepting connections", async () => {
    const { server, port } = await listenEphemeral();
    const child = spawnLongLived();
    try {
      await expect(waitForReadyOrExit(child, port, 5_000)).resolves.toBe(
        'ready',
      );
    } finally {
      child.kill();
      await closeServer(server);
    }
  });

  it("resolves 'starting' (not an error) when the budget elapses before readiness", async () => {
    const { server, port } = await listenEphemeral();
    await closeServer(server); // nothing listening on this port now
    const child = spawnLongLived();
    try {
      await expect(waitForReadyOrExit(child, port, 1_200)).resolves.toBe(
        'starting',
      );
    } finally {
      child.kill();
    }
  }, 10_000);

  it('rejects when the child exits before becoming ready', async () => {
    const { server, port } = await listenEphemeral();
    await closeServer(server); // nothing listening on this port now
    const child = spawn(process.execPath, ['-e', 'process.exit(3)'], {
      stdio: 'ignore',
    });
    await expect(waitForReadyOrExit(child, port, 10_000)).rejects.toThrow(
      /exited before becoming ready/,
    );
  }, 10_000);
});
