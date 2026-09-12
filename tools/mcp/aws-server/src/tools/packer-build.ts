import { createJobRunner, type JobSnapshot } from '@legacy-sports/mcp-jobs';
import { isAbsolute, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getRepoRoot,
  runCommand,
  runCommandCaptureExit,
} from '../run-command.js';
import type { ToolResult } from '../types.js';

// Lightweight, synchronous companions to the async `packer build` action
// below (LS-4951): every PR touching terraform/runners/packer/**/*.hcl runs
// `packer fmt -check -diff` and `packer validate -syntax-only` today via raw
// shell. Output is capped so a large diff/error dump can't blow out the
// tool-result payload.
const MAX_CHECK_OUTPUT_CHARS = 5000;

function truncateOutput(text: string): string {
  return text.length > MAX_CHECK_OUTPUT_CHARS
    ? `${text.slice(0, MAX_CHECK_OUTPUT_CHARS)}\n...[truncated]`
    : text;
}

/** Split packer's blank-line-delimited error blocks into individual entries. */
function splitPackerErrors(raw: string): string[] {
  return raw
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
}

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
// Backstop: kill a background build that outlives the ceiling the old
// synchronous mode enforced (30 min build + 2 min `packer init` plugin
// downloads — init runs inside the same job, see startJob below).
const BUILD_BACKSTOP_MS = 30 * 60_000;
const INIT_TIMEOUT_MS = 120_000;

export function packerWaitHint(buildId: string): string {
  return (
    `Build is still running. Call packer_build_wait({ buildId: "${buildId}" }) to continue waiting ` +
    `(each call waits up to ${MAX_WAIT_SECONDS}s and returns a status snapshot — never an error ` +
    'while the build is in progress). Do NOT re-run packer_build.'
  );
}

/**
 * Background builds run on the shared job runner (`@legacy-sports/mcp-jobs`,
 * LS-8564): build metadata persists to disk so a restarted MCP server can
 * still report on in-flight AMI bakes, and the job timeout kills the whole
 * packer process tree instead of only the direct child. The transport-safe
 * call contract (45s initial wait, ≤55s per wait call, running snapshots with
 * re-arm hints — LS-8560) is unchanged.
 */
const runner = createJobRunner({
  idPrefix: 'packer',
  dirName: 'packer-builds',
  waitHint: packerWaitHint,
});

/** The runner's deterministic log location for a background build. */
function bgLogPathFor(buildId: string): string {
  return join(tmpdir(), 'packer-builds', `${buildId}.log`);
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

/** In-progress snapshot with a re-arm hint — never an error while running. */
function runningSnapshot(snapshot: JobSnapshot): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ok: true,
          buildId: snapshot.jobId,
          status: 'running',
          elapsedSec: snapshot.elapsedSec,
          logPath: bgLogPathFor(snapshot.jobId),
          logTail: snapshot.logTail || '(log not yet readable)',
          hint: snapshot.hint ?? packerWaitHint(snapshot.jobId),
        }),
      },
    ],
  };
}

function notFoundResult(buildId: string): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ok: false,
          error: `Build "${buildId}" not found.`,
        }),
      },
    ],
    isError: true,
  };
}

/** Format a terminal (or orphaned) snapshot as the packer_build result. */
async function finishedResult(snapshot: JobSnapshot): Promise<ToolResult> {
  const buildId = snapshot.jobId;
  const logPath = bgLogPathFor(buildId);

  // A job recovered from a previous server process whose result was never
  // recorded — surface the runner's orphan hint instead of a bogus pass/fail.
  if (snapshot.status === 'orphaned') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            buildId,
            status: 'orphaned',
            elapsedSec: snapshot.elapsedSec,
            logPath,
            logTail: snapshot.logTail || '(log not yet readable)',
            ...(snapshot.hint ? { hint: snapshot.hint } : {}),
          }),
        },
      ],
      isError: true,
    };
  }

  const fullLog = snapshot.log ?? '';
  const logTail = fullLog.slice(-3000);

  if (snapshot.status === 'failed') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            buildId,
            status: 'failed',
            error: snapshot.error,
            exitCode: snapshot.exitCode,
            logPath,
            logTail,
          }),
        },
      ],
      isError: true,
    };
  }

  const amiId = parseAmiId(fullLog);
  const durationSec = parseDurationSec(fullLog) ?? snapshot.elapsedSec;

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
            logPath,
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
          logPath,
        }),
      },
    ],
  };
}

// ---- packer_build ----

export interface PackerBuildParams {
  action?: 'build' | 'fmt' | 'validate';
  hclPath: string;
  vars?: Record<string, string>;
  worktreePath?: string;
  runInBackground?: boolean;
  maxWaitSeconds?: number;
  check?: boolean;
  diff?: boolean;
  syntaxOnly?: boolean;
}

// Validate inputs at the interpolation boundary: hclPath and vars reach the
// `packer init` / `packer build` argv, and the job is spawned with
// shell: true, so shell metacharacters would be interpreted. hclPath is
// restricted to path characters (backslash + drive colon allowed for Windows);
// var names to identifier characters; var values reject the same metacharacter
// class aws_ssm_run_command blocks. Spaces are covered by both checks —
// shell:true joins args with spaces, so a space would split the argument and
// allow smuggling extra flags into packer.
const HCL_PATH_RE = /^[A-Za-z0-9._/\\:-]+\.pkr\.hcl$/;
const VAR_NAME_RE = /^[A-Za-z0-9_-]+$/;
const VAR_VALUE_METACHAR_RE = /[\s"'`$;&|<>(){}\\]/;

function invalidInput(error: string): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ ok: false, error }) }],
    isError: true,
  };
}

export async function packerBuild(
  params: PackerBuildParams,
): Promise<ToolResult> {
  const action = params.action ?? 'build';
  if (action === 'fmt') return packerFmt(params);
  if (action === 'validate') return packerValidate(params);
  return packerBuildRun(params);
}

async function packerBuildRun(params: PackerBuildParams): Promise<ToolResult> {
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
        `Var ${JSON.stringify(k)} contains disallowed characters: ${JSON.stringify(v)}. Values must not contain whitespace, quotes, backticks, backslashes, or shell operators.`,
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

  // `packer init` (up to ~2 min of plugin downloads) must not block the tool
  // call, so it runs inside the job as a shell composite with the build. All
  // interpolated inputs were validated above, so joining through the shell is
  // safe. `packer init` resolves the config by absolute path, so running it
  // from `cwd` (instead of the config's directory) is equivalent.
  const { jobId: buildId } = runner.startJob({
    command: 'packer',
    args: ['init', resolvedHcl, '&&', 'packer', ...buildArgs],
    cwd,
    shell: true,
    label: `packer build ${hclPath}`,
    timeoutMs: INIT_TIMEOUT_MS + BUILD_BACKSTOP_MS,
    meta: { hclPath: resolvedHcl },
  });

  if (runInBackground) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: true,
            buildId,
            logPath: bgLogPathFor(buildId),
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
  const snapshot = await runner.waitForJob(buildId, budgetSec * 1000);
  // The job was just started, so the registry lookup cannot miss.
  if (!snapshot) return notFoundResult(buildId);
  if (snapshot.status === 'running') return runningSnapshot(snapshot);
  return finishedResult(snapshot);
}

/** Shared path resolution + validation for the fmt/validate actions. */
function resolveHcl(
  params: PackerBuildParams,
): { cwd: string; resolvedHcl: string } | ToolResult {
  if (!HCL_PATH_RE.test(params.hclPath)) {
    return invalidInput(
      `Invalid hclPath ${JSON.stringify(params.hclPath)}: must be a plain path to a .pkr.hcl file with no spaces, quotes, or shell metacharacters.`,
    );
  }
  const cwd = params.worktreePath
    ? resolve(params.worktreePath)
    : getRepoRoot();
  const resolvedHcl = isAbsolute(params.hclPath)
    ? params.hclPath
    : join(cwd, params.hclPath);
  return { cwd, resolvedHcl };
}

function isToolResult(
  value: { cwd: string; resolvedHcl: string } | ToolResult,
): value is ToolResult {
  return 'content' in value;
}

// ---- packer_build (action: "fmt") ----

/**
 * Synchronous `packer fmt` check — formatting drift only, no plugin
 * downloads or infra side effects, so it runs inline rather than on the job
 * runner. Defaults to `check: true, diff: true` (report-only, never rewrites
 * the file), matching the shell invocation this replaces.
 */
async function packerFmt(params: PackerBuildParams): Promise<ToolResult> {
  const resolved = resolveHcl(params);
  if (isToolResult(resolved)) return resolved;
  const { cwd, resolvedHcl } = resolved;
  const { check = true, diff = true } = params;

  const args = ['fmt'];
  if (check) args.push('-check');
  if (diff) args.push('-diff');
  args.push(resolvedHcl);

  try {
    const { stdout, stderr, code } = await runCommandCaptureExit(
      'packer',
      args,
      cwd,
    );
    const output = truncateOutput([stdout, stderr].filter(Boolean).join('\n'));
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ ok: code === 0, diff: output }),
        },
      ],
      isError: code !== 0,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        { type: 'text', text: JSON.stringify({ ok: false, error: message }) },
      ],
      isError: true,
    };
  }
}

// ---- packer_build (action: "validate") ----

/**
 * Synchronous `packer validate` check. Defaults to `syntaxOnly: true` so it
 * never needs cloud credentials or plugin downloads — matching the shell
 * invocation this replaces.
 */
async function packerValidate(params: PackerBuildParams): Promise<ToolResult> {
  const resolved = resolveHcl(params);
  if (isToolResult(resolved)) return resolved;
  const { cwd, resolvedHcl } = resolved;
  const { syntaxOnly = true } = params;

  const args = ['validate'];
  if (syntaxOnly) args.push('-syntax-only');
  args.push(resolvedHcl);

  try {
    const { stdout, stderr, code } = await runCommandCaptureExit(
      'packer',
      args,
      cwd,
    );
    const raw = truncateOutput([stderr, stdout].filter(Boolean).join('\n'));
    const errors = code === 0 ? [] : splitPackerErrors(raw);
    return {
      content: [
        { type: 'text', text: JSON.stringify({ ok: code === 0, errors }) },
      ],
      isError: code !== 0,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ ok: false, errors: [message] }),
        },
      ],
      isError: true,
    };
  }
}

// ---- packer_build_status ----

export interface PackerBuildStatusParams {
  buildId: string;
}

export async function packerBuildStatus(
  params: PackerBuildStatusParams,
): Promise<ToolResult> {
  const snapshot = runner.snapshotJob(params.buildId);
  if (!snapshot) return notFoundResult(params.buildId);
  if (snapshot.status === 'running') return runningSnapshot(snapshot);
  return finishedResult(snapshot);
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
 * (pollIntervalSec is accepted for compatibility; the shared runner polls
 * internally at a fixed 1s cadence.)
 */
export async function packerBuildWait(
  params: PackerBuildWaitParams,
): Promise<ToolResult> {
  const waitSec = Math.min(
    params.timeoutSec ?? MAX_WAIT_SECONDS,
    MAX_WAIT_SECONDS,
  );
  const snapshot = await runner.waitForJob(params.buildId, waitSec * 1000);
  if (!snapshot) return notFoundResult(params.buildId);
  if (snapshot.status === 'running') return runningSnapshot(snapshot);
  return finishedResult(snapshot);
}
