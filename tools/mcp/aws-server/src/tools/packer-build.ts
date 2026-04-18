import { spawn } from 'node:child_process';
import { createWriteStream, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname, isAbsolute, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { getRepoRoot, runCommand } from '../run-command.js';
import { errorResult } from '../aws-error.js';
import type { ToolResult } from '../types.js';

// Parses: "==> amazon-ebs.runner: AMI: ami-0abc1234def56789a"
const AMI_PATTERN = /AMI: (ami-[0-9a-f]+)/;

// Parses: "Build 'amazon-ebs.runner' finished after 10 minutes 15 seconds."
const DURATION_PATTERN =
  /finished after\s+(?:(\d+)\s+minutes?)?\s*(?:(\d+)\s+seconds?)?/;

interface BuildRecord {
  pid: number;
  logPath: string;
  startTime: number;
  exitCode: number | null;
  done: boolean;
  error: string | null;
}

// In-memory registry — lives for the lifetime of the MCP server process.
const buildRegistry = new Map<string, BuildRecord>();

function newBuildId(): string {
  return `packer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function parseAmiId(log: string): string | null {
  return AMI_PATTERN.exec(log)?.[1] ?? null;
}

function parseDurationSec(log: string): number | null {
  const m = DURATION_PATTERN.exec(log);
  if (!m) return null;
  const minutes = parseInt(m[1] ?? '0', 10);
  const seconds = parseInt(m[2] ?? '0', 10);
  return minutes * 60 + seconds;
}

interface ImageMeta {
  snapshotId: string | null;
  name: string | null;
  tags: Record<string, string>;
}

async function fetchImageMeta(cwd: string, amiId: string): Promise<ImageMeta> {
  try {
    const out = await runCommand(
      'aws',
      ['ec2', 'describe-images', '--image-ids', amiId, '--output', 'json'],
      cwd,
    );
    const data = JSON.parse(out) as {
      Images: Array<{
        Name?: string;
        BlockDeviceMappings?: Array<{ Ebs?: { SnapshotId?: string } }>;
        Tags?: Array<{ Key: string; Value: string }>;
      }>;
    };
    const img = data.Images[0];
    if (!img) return { snapshotId: null, name: null, tags: {} };
    const snapshotId = img.BlockDeviceMappings?.[0]?.Ebs?.SnapshotId ?? null;
    const tags: Record<string, string> = {};
    for (const t of img.Tags ?? []) tags[t.Key] = t.Value;
    return { snapshotId, name: img.Name ?? null, tags };
  } catch {
    return { snapshotId: null, name: null, tags: {} };
  }
}

function ensureLogDir(): string {
  const dir = join(tmpdir(), 'packer-builds');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Spawns a process, tees stdout+stderr to `logStream`, and resolves with the
 * combined output string. Rejects on non-zero exit or timeout.
 */
function spawnCapture(
  cmd: string,
  args: string[],
  cwd: string,
  logStream: ReturnType<typeof createWriteStream>,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const chunks: string[] = [];
    let settled = false;

    const onData = (buf: Buffer) => {
      chunks.push(buf.toString());
      logStream.write(buf);
    };

    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);

    const timer = setTimeout(() => {
      settled = true;
      child.kill();
      logStream.end();
      reject(
        new Error(
          `Packer timed out after ${Math.round(timeoutMs / 60_000)} minutes`,
        ),
      );
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      logStream.end();
      const log = chunks.join('');
      if (code === 0) {
        resolve(log);
      } else {
        reject(
          new Error(`Packer exited with code ${code}:\n${log.slice(-3000)}`),
        );
      }
    });
  });
}

// ---- packer_build ----

export interface PackerBuildParams {
  hclPath: string;
  vars?: Record<string, string>;
  worktreePath?: string;
  runInBackground?: boolean;
}

export async function packerBuild(
  params: PackerBuildParams,
): Promise<ToolResult> {
  const { hclPath, vars = {}, runInBackground = false } = params;
  const cwd = params.worktreePath
    ? resolve(params.worktreePath)
    : getRepoRoot();
  const resolvedHcl = isAbsolute(hclPath) ? hclPath : join(cwd, hclPath);

  // Ensure required Packer plugins are installed before building.
  try {
    await runCommand(
      'packer',
      ['init', resolvedHcl],
      dirname(resolvedHcl),
      {},
      120_000,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult('packer init', msg);
  }

  const buildArgs = ['build'];
  for (const [k, v] of Object.entries(vars)) {
    buildArgs.push('-var', `${k}=${v}`);
  }
  buildArgs.push(resolvedHcl);

  if (runInBackground) {
    const buildId = newBuildId();
    const bgLogPath = join(ensureLogDir(), `${buildId}.log`);
    const logStream = createWriteStream(bgLogPath);

    const child = spawn('packer', buildArgs, {
      cwd,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const record: BuildRecord = {
      pid: child.pid ?? 0,
      logPath: bgLogPath,
      startTime: Date.now(),
      exitCode: null,
      done: false,
      error: null,
    };
    buildRegistry.set(buildId, record);

    child.stdout?.pipe(logStream);
    child.stderr?.pipe(logStream);
    child.on('close', (code) => {
      record.exitCode = code;
      record.done = true;
      record.error = code !== 0 ? `Packer exited with code ${code}` : null;
      logStream.end();
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: true,
            buildId,
            logPath: bgLogPath,
            message:
              'Packer build started in background. Use packer_build_status to poll progress or packer_build_wait to block until complete.',
          }),
        },
      ],
    };
  }

  // Synchronous mode: run packer and wait up to 30 minutes.
  const syncLogPath = join(ensureLogDir(), `${newBuildId()}.log`);
  const logStream = createWriteStream(syncLogPath);
  const startTime = Date.now();

  let fullLog: string;
  try {
    fullLog = await spawnCapture(
      'packer',
      buildArgs,
      cwd,
      logStream,
      30 * 60_000,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: msg,
            fullLogPath: syncLogPath,
          }),
        },
      ],
      isError: true,
    };
  }

  const durationSec =
    parseDurationSec(fullLog) ?? Math.round((Date.now() - startTime) / 1000);
  const amiId = parseAmiId(fullLog);

  if (!amiId) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error:
              'Build succeeded but no AMI ID was found in Packer output. Check the log.',
            fullLogPath: syncLogPath,
          }),
        },
      ],
      isError: true,
    };
  }

  const meta = await fetchImageMeta(cwd, amiId);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ok: true,
          amiId,
          name: meta.name,
          durationSec,
          snapshotId: meta.snapshotId,
          tags: meta.tags,
          fullLogPath: syncLogPath,
        }),
      },
    ],
  };
}

// ---- packer_build_status ----

export interface PackerBuildStatusParams {
  buildId: string;
}

export async function packerBuildStatus(
  params: PackerBuildStatusParams,
): Promise<ToolResult> {
  const { buildId } = params;
  const record = buildRegistry.get(buildId);

  if (!record) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `Build "${buildId}" not found. Records are kept only for the lifetime of this MCP server process.`,
          }),
        },
      ],
      isError: true,
    };
  }

  let logTail = '';
  try {
    logTail = readFileSync(record.logPath, 'utf-8').slice(-3000);
  } catch {
    logTail = '(log not yet readable)';
  }

  if (!record.done) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: true,
            buildId,
            status: 'running',
            elapsedSec: Math.round((Date.now() - record.startTime) / 1000),
            logPath: record.logPath,
            logTail,
          }),
        },
      ],
    };
  }

  if (record.error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            buildId,
            status: 'failed',
            error: record.error,
            exitCode: record.exitCode,
            logPath: record.logPath,
            logTail,
          }),
        },
      ],
      isError: true,
    };
  }

  let fullLog = '';
  try {
    fullLog = readFileSync(record.logPath, 'utf-8');
  } catch {
    // ignore
  }

  const amiId = parseAmiId(fullLog);
  const durationSec =
    parseDurationSec(fullLog) ??
    Math.round((Date.now() - record.startTime) / 1000);

  if (!amiId) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            buildId,
            status: 'failed',
            error: 'Build completed but no AMI ID was found in Packer output.',
            logPath: record.logPath,
            logTail,
          }),
        },
      ],
      isError: true,
    };
  }

  const meta = await fetchImageMeta(getRepoRoot(), amiId);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ok: true,
          buildId,
          status: 'done',
          amiId,
          name: meta.name,
          durationSec,
          snapshotId: meta.snapshotId,
          tags: meta.tags,
          logPath: record.logPath,
        }),
      },
    ],
  };
}

// ---- packer_build_wait ----

export interface PackerBuildWaitParams {
  buildId: string;
  pollIntervalSec?: number;
  timeoutSec?: number;
}

export async function packerBuildWait(
  params: PackerBuildWaitParams,
): Promise<ToolResult> {
  const { buildId, pollIntervalSec = 30, timeoutSec = 1800 } = params;
  const record = buildRegistry.get(buildId);

  if (!record) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `Build "${buildId}" not found. Records are kept only for the lifetime of this MCP server process.`,
          }),
        },
      ],
      isError: true,
    };
  }

  const maxMs = timeoutSec * 1000;
  const pollMs = Math.max(5_000, pollIntervalSec * 1000);
  const waitStart = Date.now();

  while (!record.done) {
    if (Date.now() - waitStart > maxMs) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              buildId,
              error: `Wait timed out after ${timeoutSec}s. Build is still running.`,
              logPath: record.logPath,
            }),
          },
        ],
        isError: true,
      };
    }
    await new Promise<void>((r) => setTimeout(r, pollMs));
  }

  return packerBuildStatus({ buildId });
}
