import { describe, expect, it } from '@jest/globals';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:net';

import {
  READINESS_WAIT_MAX_MS,
  clampReadinessWait,
  probeLoopback,
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
