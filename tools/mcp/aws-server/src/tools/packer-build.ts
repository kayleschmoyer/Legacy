import { spawn } from 'node:child_process';
import { createWriteStream, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname, isAbsolute, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { getRepoRoot, runCommand } from '../run-command.js';
import type { ToolResult } from '../types.js';

// Parses: "==> amazon-ebs.runner: AMI: ami-0abc1234def56789a"
const AMI_PATTERN = /AMI: (ami-[0-9a-f]+)/;

// Parses: "Build 'amazon-ebs.runner' finished after 10 minutes 15 seconds."
const DURATION_PATTERN =
  /finished after\s+(?:(\d+)\s+minutes?)?\s*(?:(\d+)\s+seconds?)?/;

// Hard per-call ceiling: cloud sessions kill any MCP call at ~60s (transport
// timeout). Longer waits are re-armed by the caller re-invoking
// packer_build_wait (mirrors ci_wait_run in tools/mcp/ci-server).
const MAX_WAIT_SECONDS = 55;
// Default initial wait for packer_build before returning a running snapshot.
const DEFAULT_SYNC_WAIT_SECONDS = 45;
const RECORD_POLL_MS = 1000;
// Backstop: kill a background build that outlives the ceiling the old
// synchronous mode enforced.
const BUILD_BACKSTOP_MS = 30 * 60_000;
const INIT_TIMEOUT_MS = 120_000;

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

export function packerWaitHint(buildId: string): string {
  return (
    `Build is still running. Call packer_build_wait({ buildId: "${buildId}" }) to continue waiting ` +
    `(each call waits up to ${MAX_WAIT_SECONDS}s and returns a status snapshot — never an error ` +
    'while the build is in progress). Do NOT re-run packer_build.'
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Spawns `packer init` + `packer build` as a detached background job, teeing
 * output to a log file and tracking completion in the registry. Nothing on the
 * tool-call path may block past the sync budget, so even `packer init` (up to
 * 120s of plugin downloads) runs inside the job.
 */
function startBackgroundBuild(
  cwd: string,
  resolvedHcl: string,
  buildArgs: string[],
): { buildId: string; record: BuildRecord } {
  const buildId = newBuildId();
  const logPath = join(ensureLogDir(), `${buildId}.log`);
  const logStream = createWriteStream(logPath);
  const record: BuildRecord = {
    pid: 0,
    logPath,
    startTime: Date.now(),
    exitCode: null,
    done: false,
    error: null,
  };
  buildRegistry.set(buildId, record);

  void (async () => {
    try {
      const initOut = await runCommand(
        'packer',
        ['init', resolvedHcl],
        dirname(resolvedHcl),
        {},
        INIT_TIMEOUT_MS,
      );
      if (initOut) logStream.write(`${initOut}\n`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      record.exitCode = -1;
      record.done = true;
      record.error = `packer init failed: ${msg}`;
      logStream.end(`packer init failed: ${msg}\n`);
      return;
    }

    const child = spawn('packer', buildArgs, {
      cwd,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    record.pid = child.pid ?? 0;
    child.stdout?.pipe(logStream);
    child.stderr?.pipe(logStream);

    let killedByBackstop = false;
    const backstop = setTimeout(() => {
      killedByBackstop = true;
      child.kill();
    }, BUILD_BACKSTOP_MS);
    // The backstop must not keep the server process (or a test runner) alive.
    backstop.unref();

    child.on('close', (code) => {
      clearTimeout(backstop);
      record.exitCode = code;
      record.done = true;
      record.error = killedByBackstop
        ? `Packer build timed out after ${Math.round(BUILD_BACKSTOP_MS / 60_000)} minutes and was killed`
        : code !== 0
          ? `Packer exited with code ${code}`
          : null;
      logStream.end();
    });
  })();

  return { buildId, record };
}

async function waitForRecord(
  record: BuildRecord,
  budgetMs: number,
): Promise<boolean> {
  const deadline = Date.now() + budgetMs;
  while (!record.done && Date.now() < deadline) {
    await sleep(Math.min(RECORD_POLL_MS, Math.max(deadline - Date.now(), 1)));
  }
  return record.done;
}

/** In-progress snapshot with a re-arm hint — never an error while running. */
function runningSnapshot(buildId: string, record: BuildRecord): ToolResult {
  let logTail = '';
  try {
    logTail = readFileSync(record.logPath, 'utf-8').slice(-2000);
  } catch {
    logTail = '(log not yet readable)';
  }
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
          hint: packerWaitHint(buildId),
        }),
      },
    ],
  };
}

// ---- packer_build ----

export interface PackerBuildParams {
  hclPath: string;
  vars?: Record<string, string>;
  worktreePath?: string;
  runInBackground?: boolean;
  maxWaitSeconds?: number;
}

// Validate inputs at the interpolation boundary: hclPath and vars reach the
// `packer init` / `packer build` argv, and both runCommand and spawn execute
// with shell: true, so shell metacharacters would be interpreted. hclPath is
// restricted to path characters (backslash + drive colon allowed for Windows);
// var names to identifier characters; var values reject the same metacharacter
// class aws_ssm_run_command blocks.
const HCL_PATH_RE = /^[A-Za-z0-9._/\\:-]+\.pkr\.hcl$/;
const VAR_NAME_RE = /^[A-Za-z0-9_-]+$/;
const VAR_VALUE_METACHAR_RE = /[\n\r"'`$;&|<>(){}\\]/;

function invalidInput(error: string): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ ok: false, error }) }],
    isError: true,
  };
}

export async function packerBuild(
  params: PackerBuildParams,
): Promise<ToolResult> {
  const { hclPath, vars = {}, runInBackground = false } = params;

  if (!HCL_PATH_RE.test(hclPath)) {
    return invalidInput(
      `Invalid hclPath ${JSON.stringify(hclPath)}: must be a plain path to a .pkr.hcl file with no spaces, quotes, or shell metacharacters.`,
    );
  }
  for (const [k, v] of Object.entries(vars)) {
    if (!VAR_NAME_RE.test(k)) {
      return invalidInput(
        `Invalid var name ${JSON.stringify(k)}: must match [A-Za-z0-9_-]+.`,
      );
    }
    if (VAR_VALUE_METACHAR_RE.test(v)) {
      return invalidInput(
        `Var ${JSON.stringify(k)} contains disallowed characters: ${JSON.stringify(v)}. Values must not contain quotes, backticks, backslashes, newlines, or shell operators.`,
      );
    }
  }

  const cwd = params.worktreePath
    ? resolve(params.worktreePath)
    : getRepoRoot();
  const resolvedHcl = isAbsolute(hclPath) ? hclPath : join(cwd, hclPath);

  const buildArgs = ['build'];
  for (const [k, v] of Object.entries(vars)) {
    buildArgs.push('-var', `${k}=${v}`);
  }
  buildArgs.push(resolvedHcl);

  const { buildId, record } = startBackgroundBuild(cwd, resolvedHcl, buildArgs);

  if (runInBackground) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: true,
            buildId,
            logPath: record.logPath,
            message:
              'Packer build started in background. Use packer_build_status to poll progress or packer_build_wait for a bounded wait.',
          }),
        },
      ],
    };
  }

  const budgetSec = Math.min(
    params.maxWaitSeconds ?? DEFAULT_SYNC_WAIT_SECONDS,
    MAX_WAIT_SECONDS,
  );
  const done = await waitForRecord(record, budgetSec * 1000);
  if (!done) return runningSnapshot(buildId, record);
  return packerBuildStatus({ buildId });
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

/**
 * Bounded wait for a background Packer build. Transport-safe replacement for
 * a single long-poll: each call blocks at most MAX_WAIT_SECONDS and returns a
 * { status: "running" } snapshot (not an error) if the build has not finished,
 * so the caller re-arms with another call instead of losing an in-flight
 * long-poll to the MCP transport timeout. Mirrors ci_wait_run.
 */
export async function packerBuildWait(
  params: PackerBuildWaitParams,
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

  const waitSec = Math.min(
    params.timeoutSec ?? MAX_WAIT_SECONDS,
    MAX_WAIT_SECONDS,
  );
  const pollMs = Math.max(1_000, (params.pollIntervalSec ?? 5) * 1000);
  const deadline = Date.now() + waitSec * 1000;

  while (!record.done && Date.now() < deadline) {
    await sleep(Math.min(pollMs, Math.max(deadline - Date.now(), 1)));
  }

  if (!record.done) return runningSnapshot(buildId, record);
  return packerBuildStatus({ buildId });
}
