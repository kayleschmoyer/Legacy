import { afterEach, describe, expect, it } from '@jest/globals';

import { devServerStop } from './dev-server-stop.js';
import { findPidsOnPort } from '../port-lookup.js';
import { state } from '../state.js';
import {
  closeServer,
  isProcessAlive,
  listenEphemeral,
  spawnListener,
  waitFor,
} from '../test-utils/listener.js';

function parseJson(result: Awaited<ReturnType<typeof devServerStop>>): unknown {
  const block = result.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('Expected a text content block');
  }
  return JSON.parse(block.text);
}

describe('devServerStop', () => {
  afterEach(() => {
    state.devServers.clear();
  });

  it('reports failure with the tracked list when no port or worktreePath matches', async () => {
    const result = await devServerStop({ worktreePath: '/nowhere' });
    const payload = parseJson(result) as Record<string, unknown>;
    expect(result.isError).toBe(true);
    expect(payload.ok).toBe(false);
    expect(payload.tracked).toEqual([]);
  });

  it('stops a tracked server by port', async () => {
    const { server, port } = await listenEphemeral();
    await closeServer(server);
    const child = spawnListener(port);
    try {
      await waitFor(async () =>
        (await findPidsOnPort(port)).includes(child.pid as number),
      );
      state.devServers.set(port, {
        port,
        worktreePath: '/wt',
        pid: child.pid as number,
        startedAt: new Date().toISOString(),
        target: 'web:serve',
      });

      const result = await devServerStop({ port });
      const payload = parseJson(result) as Record<string, unknown>;

      expect(payload.ok).toBe(true);
      expect(payload.stopped).toBe(port);
      expect(state.devServers.has(port)).toBe(false);

      const died = await waitFor(() => !isProcessAlive(child.pid as number));
      expect(died).toBe(true);
    } finally {
      if (isProcessAlive(child.pid as number)) child.kill('SIGKILL');
    }
  }, 10_000);

  it('falls back to an OS-level lookup+kill for an untracked port', async () => {
    const { server, port } = await listenEphemeral();
    await closeServer(server);
    const child = spawnListener(port);
    try {
      await waitFor(async () =>
        (await findPidsOnPort(port)).includes(child.pid as number),
      );

      // Not tracked in state.devServers — must fall back to the OS lookup.
      const result = await devServerStop({ port });
      const payload = parseJson(result) as Record<string, unknown>;

      expect(payload.ok).toBe(true);
      expect(payload.before).toContain(child.pid);
      expect(payload.after).toEqual([]);

      const died = await waitFor(() => !isProcessAlive(child.pid as number));
      expect(died).toBe(true);
    } finally {
      if (isProcessAlive(child.pid as number)) child.kill('SIGKILL');
    }
  }, 10_000);

  it('reports ok with empty before/after when the untracked port has no listener', async () => {
    const { server, port } = await listenEphemeral();
    await closeServer(server);

    const result = await devServerStop({ port });
    const payload = parseJson(result) as Record<string, unknown>;

    expect(payload).toMatchObject({
      ok: true,
      port,
      before: [],
      killed: [],
      after: [],
    });
  });
});
