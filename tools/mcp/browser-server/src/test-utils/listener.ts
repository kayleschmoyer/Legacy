import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:net';

/** Listen on an OS-assigned loopback port; resolves the server and its port. */
export function listenEphemeral(): Promise<{ server: Server; port: number }> {
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

export function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

/** Spawn a detached node child that binds `port` and stays alive until killed. */
export function spawnListener(port: number) {
  return spawn(
    process.execPath,
    [
      '-e',
      `require('net').createServer().listen(${port}, '127.0.0.1'); setInterval(() => {}, 1000);`,
    ],
    { stdio: 'ignore' },
  );
}

export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
