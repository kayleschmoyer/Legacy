import { minifiedJson } from '@legacy-sports/mcp-format';
import {
  createJobRunner,
  type JobSnapshot,
  MAX_WAIT_MS,
} from '@legacy-sports/mcp-jobs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { resolveDir, validateAddress } from './terraform-state.js';
import { resolveBashExecutable } from '../resolve-bash.js';
import type { ToolResult } from '../types.js';

/**
 * make-server's binding of the shared background-job runner
 * (`@legacy-sports/mcp-jobs`), namespaced separately from make_run's runner
 * (make-run-bg.ts) so terraform plan jobs don't collide with make target
 * jobs in the on-disk job registry.
 */
const runner = createJobRunner({
  idPrefix: 'tfplan',
  dirName: 'tfplan-mcp-jobs',
  waitHint: (jobId) =>
    `Job still running. Re-invoke terraform_apply_status({ jobId: "${jobId}" }) to continue polling ` +
    `(each call with maxWaitMs waits up to ${MAX_WAIT_MS / 1000}s and returns a status snapshot — never an ` +
    'error while the job is in progress). Do NOT re-run terraform_plan.',
});

/**
 * Single-call sync budget — stays safely under the ~60s MCP transport
 * timeout in cloud sessions. Plans against small dirs (terraform/runners)
 * usually finish inside this budget; plans against terraform/main (2-6min)
 * return a jobId to poll via terraform_apply_status instead.
 */
export const SYNC_BUDGET_MS = 45_000;

/** Process-level timeout backstop for the plan+show job — terraform/main plans commonly take 2-6 minutes. */
const DEFAULT_PLAN_TIMEOUT_MS = 900_000; // 15 minutes

export interface PlannedResource {
  address: string;
  action: 'create' | 'update' | 'delete' | 'replace';
  forcesReplacementOn?: string[];
}

export interface PlanSummary {
  add: number;
  change: number;
  destroy: number;
}

interface TerraformShowJson {
  resource_changes?: Array<{
    address: string;
    change: {
      actions: string[];
      replace_paths?: unknown[];
    };
  }>;
}

/**
 * Parse the JSON produced by `terraform show -json <planfile>` into the
 * structured shape terraform_plan/terraform_apply_status return, instead of
 * making callers grep raw `terraform plan` text for resource replacements.
 */
export function parseTerraformPlanJson(json: string): {
  summary: PlanSummary;
  resources: PlannedResource[];
} {
  const parsed = JSON.parse(json) as TerraformShowJson;
  const resourceChanges = parsed.resource_changes ?? [];

  const summary: PlanSummary = { add: 0, change: 0, destroy: 0 };
  const resources: PlannedResource[] = [];

  for (const rc of resourceChanges) {
    const actions = rc.change.actions;
    const isCreate = actions.includes('create');
    const isDelete = actions.includes('delete');
    const isUpdate = actions.includes('update');
    const isNoOp = actions.length === 1 && actions[0] === 'no-op';
    const isReadOnly = actions.length === 1 && actions[0] === 'read';

    if (isNoOp || isReadOnly) continue;

    let action: PlannedResource['action'];
    if (isCreate && isDelete) {
      action = 'replace';
      summary.add += 1;
      summary.destroy += 1;
    } else if (isCreate) {
      action = 'create';
      summary.add += 1;
    } else if (isDelete) {
      action = 'delete';
      summary.destroy += 1;
    } else if (isUpdate) {
      action = 'update';
      summary.change += 1;
    } else {
      // Unrecognized action combination — skip rather than misreport rather
      // than guess at a bucket for a future terraform action kind.
      continue;
    }

    const resource: PlannedResource = { address: rc.address, action };
    if (rc.change.replace_paths && rc.change.replace_paths.length > 0) {
      resource.forcesReplacementOn = rc.change.replace_paths.map((p) =>
        Array.isArray(p) ? p.join('.') : String(p),
      );
    }
    resources.push(resource);
  }

  return { summary, resources };
}

/** Single-quote a value for safe embedding in the plan+show `sh -c` script. */
function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Per-job metadata persisted with the runner so restarts/polls can re-locate the plan JSON. */
interface TerraformPlanJobMeta {
  dir: string;
  planJsonPath: string;
  lock: boolean;
  targets?: string[];
}

function metaOf(snapshot: JobSnapshot): TerraformPlanJobMeta {
  const meta = (snapshot.meta ?? {}) as Partial<TerraformPlanJobMeta>;
  return {
    dir: typeof meta.dir === 'string' ? meta.dir : snapshot.cwd,
    planJsonPath:
      typeof meta.planJsonPath === 'string' ? meta.planJsonPath : '',
    lock: meta.lock === true,
    targets: meta.targets,
  };
}

/** Build the tool result for a job snapshot, reading + parsing the plan JSON on success. */
function buildPlanResult(snapshot: JobSnapshot): ToolResult {
  const meta = metaOf(snapshot);

  if (snapshot.status === 'running') {
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            status: 'running',
            jobId: snapshot.jobId,
            dir: meta.dir,
            elapsedSec: snapshot.elapsedSec,
            hint: snapshot.hint,
          }),
        },
      ],
    };
  }

  if (snapshot.status === 'orphaned') {
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            status: 'orphaned',
            success: false,
            jobId: snapshot.jobId,
            dir: meta.dir,
            elapsedSec: snapshot.elapsedSec,
            logTail: snapshot.logTail ?? '',
            hint: snapshot.hint,
          }),
        },
      ],
      isError: true,
    };
  }

  const failed = snapshot.status === 'failed';
  if (failed) {
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            status: 'failed',
            success: false,
            jobId: snapshot.jobId,
            dir: meta.dir,
            elapsedSec: snapshot.elapsedSec,
            error: snapshot.error,
            output: (snapshot.log ?? '').slice(-5000),
          }),
        },
      ],
      isError: true,
    };
  }

  // done
  try {
    const planJson = readFileSync(meta.planJsonPath, 'utf-8');
    const { summary, resources } = parseTerraformPlanJson(planJson);
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            status: 'done',
            success: true,
            jobId: snapshot.jobId,
            dir: meta.dir,
            elapsedSec: snapshot.elapsedSec,
            summary,
            resources,
          }),
        },
      ],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            status: 'failed',
            success: false,
            jobId: snapshot.jobId,
            dir: meta.dir,
            elapsedSec: snapshot.elapsedSec,
            error: `terraform plan succeeded but its JSON output could not be read/parsed: ${errorMsg}`,
            output: (snapshot.log ?? '').slice(-5000),
          }),
        },
      ],
      isError: true,
    };
  }
}

export interface TerraformPlanParams {
  dir: string;
  lock?: boolean;
  targets?: string[];
  worktreePath?: string;
  timeoutMs?: number;
}

/**
 * Run `terraform plan` structurally: default `-lock=false` so a plan never
 * contends for the shared state lock the Lock Watchdog polices, and return
 * `{ summary, resources }` parsed from `terraform show -json` instead of raw
 * text an agent would otherwise grep. Plans that don't finish inside the sync
 * budget (terraform/main commonly takes 2-6 minutes) return a pollable jobId
 * — poll with terraform_apply_status.
 */
export async function terraformPlan(
  params: TerraformPlanParams,
  repoRoot: string,
): Promise<ToolResult> {
  let resolvedDir: string;
  try {
    resolvedDir = resolveDir(params.dir, repoRoot);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({ success: false, error: errorMsg }),
        },
      ],
      isError: true,
    };
  }

  if (params.targets) {
    for (const target of params.targets) {
      const addrErr = validateAddress(target);
      if (addrErr) {
        return {
          content: [
            {
              type: 'text',
              text: minifiedJson({
                success: false,
                error: `targets: ${addrErr}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }
  }

  const lock = params.lock ?? false;
  const planFilePath = join(
    tmpdir(),
    `tfplan-${randomBytes(16).toString('hex')}.tfplan`,
  );
  const planJsonPath = join(
    tmpdir(),
    `tfplan-${randomBytes(16).toString('hex')}.json`,
  );

  const planArgs = [
    'terraform',
    '-chdir=' + resolvedDir,
    'plan',
    '-no-color',
    '-input=false',
    ...(lock ? [] : ['-lock=false']),
    ...(params.targets ?? []).map((t) => '-target=' + t),
    '-out=' + planFilePath,
  ];
  const showArgs = [
    'terraform',
    '-chdir=' + resolvedDir,
    'show',
    '-json',
    planFilePath,
  ];

  // A single job can only spawn one process, but a structured plan needs two
  // terraform invocations (plan writes a binary plan file; show -json reads
  // it back as JSON) — chain them through a small shell script rather than
  // parsing the plan file ourselves. The JSON is redirected to its own file
  // (not left mixed into the job's combined stdout/stderr log) so completion
  // handling can read it back cleanly regardless of how much plan/refresh
  // chatter terraform wrote to stdout along the way.
  //
  // The binary .tfplan is deleted as soon as `show -json` has consumed it —
  // it's never read again after that, so nothing depends on it surviving.
  // `rc=$?; rm -f ...; exit $rc` preserves the plan/show exit code across the
  // cleanup step instead of letting `rm`'s own (always-0) exit clobber it.
  // The .json file is left in tmpdir rather than deleted here: unlike the
  // .tfplan, it's the payload terraform_plan/terraform_apply_status read on
  // completion, and a caller may poll a "done" job more than once — deleting
  // it on first read would break a second, legitimate poll. It's small
  // (structured JSON, not the full plan) and OS tmpdir cleanup reclaims it.
  const script =
    '{ ' +
    planArgs.map(shQuote).join(' ') +
    ' && ' +
    showArgs.map(shQuote).join(' ') +
    ' > ' +
    shQuote(planJsonPath) +
    '; }; rc=$?; rm -f ' +
    shQuote(planFilePath) +
    '; exit $rc';

  const timeoutMs = params.timeoutMs ?? DEFAULT_PLAN_TIMEOUT_MS;

  const meta: TerraformPlanJobMeta = {
    dir: resolvedDir,
    planJsonPath,
    lock,
    targets: params.targets,
  };

  const snapshot = await runner.runJobWithBudget(
    {
      command: resolveBashExecutable(),
      args: ['-c', script],
      cwd: resolvedDir,
      label: `terraform plan ${params.dir}`,
      timeoutMs,
      meta: { ...meta },
    },
    SYNC_BUDGET_MS,
  );

  return buildPlanResult(snapshot);
}

export interface TerraformApplyStatusParams {
  jobId: string;
  maxWaitMs?: number;
}

/**
 * Poll a terraform_plan job. Without `maxWaitMs`, returns an instant
 * snapshot (mirrors make_run_status). With `maxWaitMs`, blocks until the job
 * completes or the wait expires, capped at the shared MAX_WAIT_MS to stay
 * under the ~60s MCP transport timeout (mirrors make_run_wait).
 */
export async function terraformApplyStatus(
  params: TerraformApplyStatusParams,
): Promise<ToolResult> {
  const snapshot =
    params.maxWaitMs === undefined
      ? runner.snapshotJob(params.jobId)
      : await runner.waitForJob(params.jobId, params.maxWaitMs);

  if (!snapshot) {
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            ok: false,
            error: `Job "${params.jobId}" not found.`,
          }),
        },
      ],
      isError: true,
    };
  }

  return buildPlanResult(snapshot);
}
