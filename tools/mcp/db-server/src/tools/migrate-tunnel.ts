import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as net from 'node:net';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { getRepoRoot, runPnpm } from '../run-command.js';
import { parseUpOutput } from './migrate.js';
import type { ToolResult } from '../types.js';

/**
 * Walk up from startDir looking for a .env file (max 6 levels).
 * Handles both the main-repo case and worktrees nested under .claude/worktrees/.
 */
function findDotEnv(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

interface MigrateTunnelParams {
  worktreePath?: string;
}

/** High base port to avoid conflicts with local Postgres (which typically uses 5432). */
const TUNNEL_PORT_BASE = 15432;
/** How long to wait for the SSM tunnel port to open before aborting. */
const TUNNEL_READY_TIMEOUT_MS = 30_000;
/** Migration command timeout — tunnelled migrations can be slower. */
const MIGRATION_TIMEOUT_MS = 300_000;

/**
 * Find the first available TCP port starting at startPort.
 * Only retries for EADDRINUSE — other errors (EACCES, EADDRNOTAVAIL) are
 * non-retryable and are surfaced immediately.
 */
async function findFreePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(startPort, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        findFreePort(startPort + 1).then(resolve, reject);
        return;
      }
      reject(err);
    });
  });
}

/**
 * Poll until a TCP connection to 127.0.0.1:<port> succeeds or the timeout
 * elapses. Sockets are properly cleaned up on both connect and error paths.
 */
async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await new Promise<void>((res, rej) => {
        const socket = net.createConnection(port, '127.0.0.1');

        const cleanup = () => {
          socket.removeListener('connect', handleConnect);
          socket.removeListener('error', handleError);
          if (!socket.destroyed) socket.destroy();
        };

        const handleConnect = () => {
          cleanup();
          res();
        };

        const handleError = (error: Error) => {
          cleanup();
          rej(error);
        };

        socket.on('connect', handleConnect);
        socket.on('error', handleError);
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(
    `Timed out waiting for tunnel port ${port} to open after ${timeoutMs}ms`,
  );
}

/**
 * Discover the running NAT/bastion instance ID via the EC2 Name tag.
 * Matches instances named `*-nat-instance` and fails clearly if none exist.
 */
async function getNatInstanceId(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'aws',
      [
        'ec2',
        'describe-instances',
        '--filters',
        'Name=tag:Name,Values=*-nat-instance',
        'Name=instance-state-name,Values=running',
        '--query',
        'Reservations[].Instances[].InstanceId | [0]',
        '--output',
        'text',
      ],
      { timeout: 15_000 },
      (err, stdout, stderr) => {
        if (err) {
          reject(
            new Error(
              stderr?.trim() ||
                stdout?.trim() ||
                'Failed to discover a running NAT instance via EC2 describe-instances',
            ),
          );
          return;
        }

        const id = stdout.trim();
        if (id && id !== 'None') {
          resolve(id);
          return;
        }

        reject(
          new Error(
            'No running NAT instance found matching Name tag "*-nat-instance"',
          ),
        );
      },
    );
  });
}

/**
 * Run pending database migrations via an SSM port-forward tunnel.
 *
 * Use this tool instead of `db_migrate` when the RDS dev database is not
 * directly reachable (i.e. DATABASE_URL / DB_HOST points to a VPC-private
 * RDS endpoint). It:
 *   1. Discovers the NAT instance via EC2 describe-instances (Name=*-nat-instance).
 *   2. Opens `localhost:<port>` → `<DB_HOST_DIRECT|DB_HOST>:5432` via SSM port-forwarding.
 *   3. Runs `pnpm run db:up` with DB_HOST and DB_SSL_SELF_SIGNED overrides.
 *   4. Tears down the tunnel when migrations finish (or on error).
 */
export async function migrateTunnel(
  params: MigrateTunnelParams,
): Promise<ToolResult> {
  const repoRoot = params.worktreePath || getRepoRoot();
  const dbClientDir = resolve(repoRoot, 'lib', 'db-client');

  // Load .env so DB_HOST_DIRECT / DB_HOST are available when the MCP server
  // process wasn't started with these vars in its environment. Walk up from the
  // server root since worktrees are nested under .claude/worktrees/ and don't
  // have their own .env.
  const dotEnvPath = findDotEnv(getRepoRoot());
  if (dotEnvPath) loadDotenv({ path: dotEnvPath, override: false });

  // Prefer DB_HOST_DIRECT (RDS endpoint) over DB_HOST (may be localhost in dev)
  const dbHostEnv = process.env['DB_HOST_DIRECT'] || process.env['DB_HOST'];
  if (!dbHostEnv) {
    return {
      content: [
        {
          type: 'text',
          text: 'DB_HOST_DIRECT or DB_HOST environment variable must be set to the RDS endpoint.',
        },
      ],
      isError: true,
    };
  }
  // Strip port suffix if present (e.g. "mydb.abc.rds.amazonaws.com:5432" → "mydb.abc.rds.amazonaws.com")
  const dbHostname = dbHostEnv.includes(':')
    ? dbHostEnv.split(':')[0]
    : dbHostEnv;

  // Find a free local port to use for the tunnel
  const localPort = await findFreePort(TUNNEL_PORT_BASE);

  // Discover the NAT/bastion instance ID via EC2 tag
  let natInstanceId: string;
  try {
    natInstanceId = await getNatInstanceId();
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to discover NAT instance: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }

  // Environment overrides that redirect DB connections through the tunnel
  const tunnelEnv: Record<string, string> = {
    DB_HOST: `localhost:${localPort}`,
    DB_SSL_SELF_SIGNED: 'true',
    DB_CERT_PATH: '',
  };

  // Spawn the SSM port-forward tunnel as a background process.
  // shell: false avoids shell-injection risk and makes process termination reliable.
  const tunnelProcess = spawn(
    'aws',
    [
      'ssm',
      'start-session',
      '--target',
      natInstanceId,
      '--document-name',
      'AWS-StartPortForwardingSessionToRemoteHost',
      '--parameters',
      JSON.stringify({
        host: [dbHostname],
        portNumber: ['5432'],
        localPortNumber: [String(localPort)],
      }),
    ],
    { stdio: ['ignore', 'ignore', 'pipe'], shell: false },
  );

  const tunnelStderr: string[] = [];
  let tunnelReady = false;
  let tunnelStartupFailed = false;

  if (tunnelProcess.stderr) {
    tunnelProcess.stderr.setEncoding('utf8');
    tunnelProcess.stderr.on('data', (chunk: string | Buffer) => {
      tunnelStderr.push(
        typeof chunk === 'string' ? chunk : chunk.toString('utf8'),
      );
    });
  }

  const formatTunnelError = (message: string): Error => {
    const stderr = tunnelStderr.join('').trim();
    return new Error(stderr ? `${message}: ${stderr}` : message);
  };

  const tunnelStartupPromise = new Promise<void>((_, reject) => {
    const rejectStartup = (error: Error) => {
      if (tunnelReady || tunnelStartupFailed) return;
      tunnelStartupFailed = true;
      reject(error);
    };

    tunnelProcess.once('error', (error) => {
      rejectStartup(
        formatTunnelError(
          `Failed to start AWS SSM tunnel process${error.message ? ` (${error.message})` : ''}`,
        ),
      );
    });

    tunnelProcess.once('close', (code, signal) => {
      if (tunnelReady) return;
      const exitDetail = signal
        ? `signal ${signal}`
        : `exit code ${code ?? 'unknown'}`;
      rejectStartup(
        formatTunnelError(
          `AWS SSM tunnel process exited before becoming ready (${exitDetail})`,
        ),
      );
    });
  });

  try {
    // Wait for the tunnel port to become available, but fail fast if the
    // tunnel process cannot start or exits before it is ready.
    await Promise.race([
      waitForPort(localPort, TUNNEL_READY_TIMEOUT_MS),
      tunnelStartupPromise,
    ]);
    tunnelReady = true;

    // Check for pending migrations (skip if status check fails — still attempt migration)
    let hasPending = true;
    try {
      const statusOutput = await runPnpm(
        ['run', 'db:status'],
        dbClientDir,
        undefined,
        tunnelEnv,
      );
      const hasPendingFiles = /Pending:\s*\d{8}_\d{6}_/i.test(statusOutput);
      const noPending =
        !hasPendingFiles &&
        /no (?:new )?migrations|up.to.date|nothing to apply/i.test(
          statusOutput,
        );
      if (noPending) hasPending = false;
    } catch {
      // Status check failed — proceed with migration attempt
    }

    if (!hasPending) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                applied: 0,
                appliedNames: [],
                success: true,
                message: 'No pending migrations to apply.',
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    // Run migrations through the tunnel
    const output = await runPnpm(
      ['run', 'db:up'],
      dbClientDir,
      MIGRATION_TIMEOUT_MS,
      tunnelEnv,
    );
    const result = parseUpOutput(output);

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to run migrations via SSM tunnel: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  } finally {
    // Always tear down the tunnel process
    tunnelProcess.kill();
  }
}
