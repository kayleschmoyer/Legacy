import { createConnection } from 'node:net';
import { pick } from '@legacy-sports/mcp-format';
import { state } from '../state.js';
import { DEV_SERVER_FIELDS, jsonResult } from '../format.js';
import { probeLoopback } from './dev-server-start.js';
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
  // `listening` is probed live on both loopbacks (Windows Vite often binds
  // ::1 only) so callers can poll this tool for readiness after
  // browser_dev_start returns a starting-snapshot (LS-8561).
  const managed = await Promise.all(
    Array.from(state.devServers.values()).map(async (s) =>
      pick(
        { ...s, managed: true, listening: await probeLoopback(s.port) },
        DEV_SERVER_FIELDS,
      ),
    ),
  );

  const external = await scanForExternalServers();

  // Heterogeneous list (managed rows carry worktreePath/pid/startedAt, scanned
  // rows only port/managed) nested in a scalar-bearing object -> minified JSON,
  // not a table. `url` is dropped from every row: it is the derived
  // `http://localhost:${port}` and port is present. See format.ts.
  const servers = [...managed, ...external];

  return jsonResult({
    count: servers.length,
    servers,
    browserActive: state.browser !== null,
    pageUrl: state.page?.url() ?? null,
  });
}
