import { createConnection } from 'node:net';
import { state } from '../state.js';
import type { ToolResult } from '../types.js';

const SCAN_PORT_START = 4200;
const SCAN_PORT_END = 4399;
const SCAN_TIMEOUT_MS = 200;

/** Check if a port is accepting TCP connections. */
function isPortListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.setTimeout(SCAN_TIMEOUT_MS);
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/** Scan port range for processes not tracked by this MCP session. */
async function scanForExternalServers(): Promise<
  Array<{ port: number; managed: false }>
> {
  const checks: Promise<number | null>[] = [];
  for (let port = SCAN_PORT_START; port <= SCAN_PORT_END; port++) {
    if (state.devServers.has(port)) continue;
    checks.push(isPortListening(port).then((ok) => (ok ? port : null)));
  }
  const results = await Promise.all(checks);
  return results
    .filter((port): port is number => port !== null)
    .map((port) => ({ port, managed: false as const }));
}

export async function devServerStatus(): Promise<ToolResult> {
  const managed = Array.from(state.devServers.values()).map((s) => ({
    ...s,
    managed: true,
    url: `http://localhost:${s.port}`,
  }));

  const external = await scanForExternalServers();

  const servers = [
    ...managed,
    ...external.map((s) => ({ ...s, url: `http://localhost:${s.port}` })),
  ];

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          count: servers.length,
          servers,
          browserActive: state.browser !== null,
          pageUrl: state.page?.url() ?? null,
        }),
      },
    ],
  };
}
