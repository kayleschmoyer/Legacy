import { describe, expect, it } from '@jest/globals';

import { findPidsOnPort, killPidByOs } from './port-lookup.js';
import {
  closeServer,
  isProcessAlive,
  listenEphemeral,
  spawnListener,
  waitFor,
} from './test-utils/listener.js';

describe('findPidsOnPort', () => {
  it('returns no PIDs for a port nothing is listening on', async () => {
    const { server, port } = await listenEphemeral();
    await closeServer(server); // free the port again — nothing listening now
    await expect(findPidsOnPort(port)).resolves.toEqual([]);
  });

  it('finds the PID of a process listening on the given port', async () => {
    const { server, port } = await listenEphemeral();
    await closeServer(server);
    const child = spawnListener(port);
    try {
      const found = await waitFor(async () =>
        (await findPidsOnPort(port)).includes(child.pid as number),
      );
      expect(found).toBe(true);
    } finally {
      child.kill('SIGKILL');
    }
  }, 10_000);
});

describe('killPidByOs', () => {
  it('kills the given PID', async () => {
    const { server, port } = await listenEphemeral();
    await closeServer(server);
    const child = spawnListener(port);
    try {
      await waitFor(async () =>
        (await findPidsOnPort(port)).includes(child.pid as number),
      );

      await killPidByOs(child.pid as number);

      const died = await waitFor(() => !isProcessAlive(child.pid as number));
      expect(died).toBe(true);
    } finally {
      if (isProcessAlive(child.pid as number)) child.kill('SIGKILL');
    }
  }, 10_000);
});
