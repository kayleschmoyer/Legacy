import { minifiedJson } from '@legacy-sports/mcp-format';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as setTimeoutNode } from 'node:timers';
import { promisify } from 'node:util';
import type { ToolResult } from '../types.js';

const execFileAsync = promisify(execFile);

/** Grace period between SIGTERM and a SIGKILL follow-up on POSIX (ms). */
const KILL_GRACE_MS = 300;

/** Delay before killing this server's own process, so the MCP response has
 * time to flush over stdio before the process exits (see restartMcpServer). */
const SELF_KILL_DELAY_MS = 250;

interface McpServerConfig {
  command: string;
  args?: string[];
}

interface McpJsonShape {
  mcpServers?: Record<string, McpServerConfig>;
}

/**
 * Resolve the stdio entrypoint script for a named server from .mcp.json —
 * the last argument ending in `.ts`, mirroring the entrypoint-detection logic
 * mcp-bootstrap.mjs already uses to locate each server's tsconfig.
 */
function resolveEntrypoint(
  repoRoot: string,
  server: string,
):
  | { entryPath: string; entryRel: string; knownServers: string[] }
  | { error: string } {
  const mcpJsonPath = join(repoRoot, '.mcp.json');
  if (!existsSync(mcpJsonPath)) {
    return { error: `.mcp.json not found at ${mcpJsonPath}.` };
  }

  let parsed: McpJsonShape;
  try {
    parsed = JSON.parse(readFileSync(mcpJsonPath, 'utf8')) as McpJsonShape;
  } catch (err) {
    return {
      error: `Failed to parse .mcp.json: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const servers = parsed.mcpServers ?? {};
  const knownServers = Object.keys(servers);
  const config = servers[server];
  if (!config) {
    return {
      error: `Unknown MCP server "${server}". Known servers: ${knownServers.join(', ') || '(none found)'}.`,
    };
  }

  const entryRel = [...(config.args ?? [])]
    .reverse()
    .find((a) => a.endsWith('.ts'));
  if (!entryRel) {
    return {
      error: `Server "${server}" has no .ts entrypoint in .mcp.json (not a tsx-based stdio server — cannot restart it this way).`,
    };
  }

  return { entryPath: join(repoRoot, entryRel), entryRel, knownServers };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True when `entryRel` appears in `line` as a whole path token, not merely as
 * a substring — e.g. entryRel "aws-server/src/index.ts" must not match a line
 * containing "old-aws-server/src/index.ts". A boundary is the start/end of
 * the line or a character that can't be part of a path segment (whitespace or
 * a quote).
 */
function containsEntryToken(line: string, entryRel: string): boolean {
  const pattern = new RegExp(`(^|[\\s"'])${escapeRegExp(entryRel)}($|[\\s"'])`);
  return pattern.test(line);
}

/**
 * POSIX: `ps axo pid,args` filtered for lines containing the entrypoint.
 *
 * Matches on the *relative* entrypoint (e.g. "tools/mcp/worktree-server/src/index.ts")
 * rather than the absolute path: mcp-bootstrap.mjs launches the real server
 * with `cwd` set to the repo root and the entrypoint arg exactly as written
 * in .mcp.json (relative), so the process's actual command line never
 * contains the absolute path — only its relative suffix. An absolute
 * invocation still ends with that same relative suffix, so this matches both.
 */
async function findPidsPosix(entryRel: string): Promise<number[]> {
  const { stdout } = await execFileAsync('ps', ['axo', 'pid,args']);
  const pids: number[] = [];
  for (const line of stdout.split('\n')) {
    if (!containsEntryToken(line, entryRel)) continue;
    const match = /^\s*(\d+)/.exec(line);
    if (match) pids.push(Number(match[1]));
  }
  return pids;
}

/**
 * Windows: Get-CimInstance Win32_Process filtered by CommandLine.
 *
 * entryRel is passed via an environment variable rather than interpolated
 * into the PowerShell command string — it comes from this repo's own
 * .mcp.json, not user input, but reading it back through $env: keeps it pure
 * data even to PowerShell's parser, with no quoting/escaping surface at all.
 *
 * PowerShell only pre-filters by substring; each "<pid>\t<commandLine>" line
 * is then held to the same whole-token check as POSIX, so a similarly-named
 * entrypoint (e.g. "old-aws-server/src/index.ts") is never matched and killed.
 */
async function findPidsWindows(entryRel: string): Promise<number[]> {
  const { stdout } = await execFileAsync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      'Get-CimInstance Win32_Process | ' +
        'Where-Object { $_.CommandLine -and $_.CommandLine -match [regex]::Escape($env:MCP_RESTART_ENTRY) } | ' +
        'ForEach-Object { "$($_.ProcessId)`t$($_.CommandLine)" }',
    ],
    { env: { ...process.env, MCP_RESTART_ENTRY: entryRel } },
  );
  const pids: number[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const pid = Number(line.slice(0, tab).trim());
    if (!Number.isFinite(pid) || pid <= 0) continue;
    if (containsEntryToken(line.slice(tab + 1), entryRel)) pids.push(pid);
  }
  return pids;
}

async function findPidsForEntry(entryRel: string): Promise<number[]> {
  return process.platform === 'win32'
    ? findPidsWindows(entryRel)
    : findPidsPosix(entryRel);
}

/** Kill a PID immediately: SIGTERM then SIGKILL after a grace period on POSIX, taskkill /t /f on Windows. */
async function killPidNow(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    await execFileAsync('taskkill', ['/pid', String(pid), '/t', '/f'], {
      shell: true,
    }).catch(() => {
      // Already dead.
    });
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return; // Already dead.
  }
  await new Promise((resolve) => setTimeout(resolve, KILL_GRACE_MS));
  try {
    process.kill(pid, 0); // Throws if the process is gone.
    process.kill(pid, 'SIGKILL');
  } catch {
    // Already exited.
  }
}

export interface RestartMcpServerParams {
  server: string;
}

export interface RestartMcpServerDeps {
  repoRoot: string;
  /** Overridable for tests: which pid counts as "this process" (default: process.pid). */
  selfPid?: number;
  /** Overridable for tests: the kill implementation (default: killPidNow). */
  kill?: (pid: number) => Promise<void>;
  /** Overridable for tests: the deferred-self-kill scheduler (default: setTimeoutNode). */
  scheduleSelfKill?: (fn: () => void, delayMs: number) => void;
}

/**
 * Replaces the raw `ps aux | grep <server> && kill <pid>` workaround (LS-9972):
 * stdio MCP servers are long-running tsx processes spawned once at session
 * start, so an edit to a server's source has zero effect on live tool calls
 * until the process is killed and the harness respawns it. This tool finds
 * the running process for a named server (from .mcp.json's own entrypoint
 * config, so it never goes stale) and kills it.
 *
 * The harness (Claude Code's stdio MCP client) already auto-reconnects a
 * stdio server whose process exits — that's the undocumented behavior the
 * old ps/kill workaround relied on — so no separate "reconnect" step is
 * exposed here. The very next tool call against that server transparently
 * respawns the process from current source and runs on it.
 *
 * Special case: restarting the make server (this process) kills its own
 * PID. The kill is deferred by SELF_KILL_DELAY_MS so the MCP response below
 * has time to flush over stdio before the process exits.
 */
export async function restartMcpServer(
  params: RestartMcpServerParams,
  deps: RestartMcpServerDeps,
): Promise<ToolResult> {
  const { server } = params;
  const {
    repoRoot,
    selfPid = process.pid,
    kill = killPidNow,
    scheduleSelfKill = (fn, delayMs) => {
      setTimeoutNode(fn, delayMs);
    },
  } = deps;

  const resolved = resolveEntrypoint(repoRoot, server);
  if ('error' in resolved) {
    return {
      content: [{ type: 'text', text: resolved.error }],
      isError: true,
    };
  }
  const { entryPath, entryRel, knownServers } = resolved;

  let pids: number[];
  try {
    pids = await findPidsForEntry(entryRel);
  } catch (err) {
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            success: false,
            server,
            error: `Failed to look up running processes: ${err instanceof Error ? err.message : String(err)}`,
          }),
        },
      ],
      isError: true,
    };
  }

  if (pids.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            success: false,
            server,
            knownServers,
            message: `No running process found for "${server}" (entrypoint ${entryPath}). It may not be connected in this session, or the session's harness manages it under a name this lookup can't see.`,
          }),
        },
      ],
      isError: true,
    };
  }

  const otherPids = pids.filter((p) => p !== selfPid);
  const killsSelf = pids.includes(selfPid);

  for (const pid of otherPids) {
    await kill(pid);
  }

  if (killsSelf) {
    // Defer killing our own process so this response can flush first. No
    // need to unref the timer: the stdio transport already keeps the event
    // loop alive independent of this timer.
    scheduleSelfKill(() => {
      void kill(selfPid);
    }, SELF_KILL_DELAY_MS);
  }

  return {
    content: [
      {
        type: 'text',
        text: minifiedJson({
          success: true,
          server,
          entryPath,
          killedPids: pids,
          selfRestart: killsSelf,
          message: killsSelf
            ? `Killed ${pids.length} process(es) for "${server}", including this make server's own process — it will exit shortly after this response. ` +
              'The harness auto-reconnects stdio MCP servers on the next tool call against this server; no manual reconnect step is needed.'
            : `Killed ${pids.length} process(es) for "${server}". ` +
              'The harness auto-reconnects stdio MCP servers on the next tool call against this server, running current source — no manual reconnect step is needed.',
        }),
      },
    ],
  };
}
