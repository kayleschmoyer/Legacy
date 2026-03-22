import { createServer } from 'node:net';
import { state } from './state.js';

const PORT_RANGE_START = 4300;
const PORT_RANGE_END = 4399;

/** Check if a port is available by attempting to listen on it. */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

/** Find the next available port in the 4300-4399 range. */
export async function allocatePort(): Promise<number> {
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (state.devServers.has(port)) continue;
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(
    `No available ports in range ${PORT_RANGE_START}-${PORT_RANGE_END}. ` +
      `${state.devServers.size} dev servers are currently tracked.`,
  );
}
