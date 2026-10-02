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

/** Cap on the serialized size of all `changes` entries in one `detail: true` result. */
export const MAX_DETAIL_CHARS = 20_000;

/** Cap on a single before/after value in a `detail: true` result. */
export const MAX_DETAIL_VALUE_CHARS = 200;

export const SENSITIVE_PLACEHOLDER = '(sensitive)';
export const UNKNOWN_PLACEHOLDER = '(known after apply)';

export const RUNNER_LAMBDAS_REMEDY =
  'Runner Lambda zips are missing under terraform/runners/lambdas. Run `make runner-lambdas-sync` ' +
  '(make_run({ target: "runner-lambdas-sync" })), then re-run terraform_plan.';

export interface AttributeChange {
  attr: string;
  before?: unknown;
  after?: unknown;
}

export interface PlannedResource {
  address: string;
  action: 'create' | 'update' | 'delete' | 'replace';
  forcesReplacementOn?: string[];
  /** Only with `detail: true` — changed attributes, sensitive values redacted. */
  changes?: AttributeChange[];
  /** Only with `detail: true` — set when MAX_DETAIL_CHARS cut this resource's `changes` short. */
  changesTruncated?: true;
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
      before?: unknown;
      after?: unknown;
      after_unknown?: unknown;
      before_sensitive?: unknown;
      after_sensitive?: unknown;
    };
  }>;
}

type Container = Record<string, unknown> | unknown[];

function isContainer(value: unknown): value is Container {
  return typeof value === 'object' && value !== null;
}

/** Child of a before/after/sensitivity-mask node; masks are `true`/`false` at or above the leaves they describe. */
function childOf(node: unknown, key: string): unknown {
  if (!isContainer(node)) return undefined;
  return (node as Record<string, unknown>)[key];
}

function capValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  const isString = typeof value === 'string';
  if (!isString && !isContainer(value)) return value;
  const text = isString ? value : JSON.stringify(value);
  if (text.length <= MAX_DETAIL_VALUE_CHARS) return isString ? value : text;
  return `${text.slice(0, MAX_DETAIL_VALUE_CHARS)}…(+${text.length - MAX_DETAIL_VALUE_CHARS} chars)`;
}

interface ChangeNode {
  before: unknown;
  after: unknown;
  unknown: unknown;
  beforeSensitive: unknown;
  afterSensitive: unknown;
}

/**
 * Walk a resource_changes[].change before/after pair and collect the leaf
 * attributes that differ. `terraform show -json` carries sensitive values in
 * plaintext alongside before_sensitive/after_sensitive masks, so anything a
 * mask marks is replaced with a placeholder before it can reach the result.
 */
function collectChanges(
  node: ChangeNode,
  path: string,
  out: AttributeChange[],
): void {
  const { before, after, unknown, beforeSensitive, afterSensitive } = node;
  const attr = path || '(root)';

  if (beforeSensitive === true || afterSensitive === true) {
    if (
      unknown === true ||
      JSON.stringify(before ?? null) !== JSON.stringify(after ?? null)
    ) {
      out.push({
        attr,
        before: SENSITIVE_PLACEHOLDER,
        after: SENSITIVE_PLACEHOLDER,
      });
    }
    return;
  }

  if (unknown === true) {
    // The mask can be `true` above a subtree whose sensitive leaves are only
    // marked deeper down, so `before` is not safe to print unless no part of
    // its sensitivity mask is set.
    const beforeHasSensitive = JSON.stringify(
      beforeSensitive ?? false,
    ).includes('true');
    out.push({
      attr,
      before: beforeHasSensitive ? SENSITIVE_PLACEHOLDER : capValue(before),
      after: UNKNOWN_PLACEHOLDER,
    });
    return;
  }

  const beforeIsContainer = isContainer(before);
  const afterIsContainer = isContainer(after);
  const sameShape =
    (beforeIsContainer || before === null || before === undefined) &&
    (afterIsContainer || after === null || after === undefined) &&
    (!beforeIsContainer ||
      !afterIsContainer ||
      Array.isArray(before) === Array.isArray(after));

  if (
    (beforeIsContainer || afterIsContainer || isContainer(unknown)) &&
    sameShape
  ) {
    const keys = new Set<string>();
    for (const source of [before, after, unknown]) {
      if (isContainer(source)) Object.keys(source).forEach((k) => keys.add(k));
    }
    for (const key of keys) {
      collectChanges(
        {
          before: childOf(before, key),
          after: childOf(after, key),
          unknown: childOf(unknown, key),
          beforeSensitive: childOf(beforeSensitive, key),
          afterSensitive: childOf(afterSensitive, key),
        },
        path ? `${path}.${key}` : key,
        out,
      );
    }
    return;
  }

  if (JSON.stringify(before ?? null) === JSON.stringify(after ?? null)) return;

  // A scalar-vs-container mismatch lands here un-recursed, so a nested mask
  // may still mark part of the value — redact the whole thing in that case.
  const hasNestedSensitive =
    JSON.stringify(beforeSensitive ?? false).includes('true') ||
    JSON.stringify(afterSensitive ?? false).includes('true');
  out.push(
    hasNestedSensitive
      ? { attr, before: SENSITIVE_PLACEHOLDER, after: SENSITIVE_PLACEHOLDER }
      : { attr, before: capValue(before), after: capValue(after) },
  );
}

/**
 * Parse the JSON produced by `terraform show -json <planfile>` into the
 * structured shape terraform_plan/terraform_apply_status return, instead of
 * making callers grep raw `terraform plan` text for resource replacements.
 * With `detail`, each resource also carries its changed attributes
 * (before/after), redacted and capped at MAX_DETAIL_CHARS overall.
 */
export function parseTerraformPlanJson(
  json: string,
  options: { detail?: boolean } = {},
): {
  summary: PlanSummary;
  resources: PlannedResource[];
  detailTruncated?: true;
} {
  let detailBudget = MAX_DETAIL_CHARS;
  let detailTruncated = false;
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
    if (options.detail) {
      const all: AttributeChange[] = [];
      collectChanges(
        {
          before: rc.change.before,
          after: rc.change.after,
          unknown: rc.change.after_unknown,
          beforeSensitive: rc.change.before_sensitive,
          afterSensitive: rc.change.after_sensitive,
        },
        '',
        all,
      );
      const kept: AttributeChange[] = [];
      for (const change of all) {
        const size = JSON.stringify(change).length;
        if (size > detailBudget) break;
        detailBudget -= size;
        kept.push(change);
      }
      resource.changes = kept;
      if (kept.length < all.length) {
        resource.changesTruncated = true;
        detailTruncated = true;
        detailBudget = 0;
      }
    }
    resources.push(resource);
  }

  return detailTruncated
    ? { summary, resources, detailTruncated: true }
    : { summary, resources };
}

/** True when a failed plan's log says the working directory was never `terraform init`ed. */
export function needsBackendInit(log: string): boolean {
  return /Backend initialization required/i.test(log);
}

/**
 * terraform/runners reads its Lambda zips with filebase64sha256(); when they
 * have not been synced every Lambda resource fails with its own copy of the
 * same error. Returns the one-line remedy for that case, otherwise undefined.
 */
export function runnerLambdaZipRemedy(
  log: string,
  dir: string,
): string | undefined {
  if (!/terraform[\\/]+runners/.test(dir)) return undefined;
  if (!/filebase64sha256/.test(log)) return undefined;
  if (!/lambdas[\\/]+[\w.-]+\.zip/.test(log)) return undefined;
  return RUNNER_LAMBDAS_REMEDY;
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
  detail?: boolean;
  /** Set on the retry job after an automatic `terraform init`. */
  autoInit?: boolean;
}

function metaOf(snapshot: JobSnapshot): TerraformPlanJobMeta {
  const meta = (snapshot.meta ?? {}) as Partial<TerraformPlanJobMeta>;
  return {
    dir: typeof meta.dir === 'string' ? meta.dir : snapshot.cwd,
    planJsonPath:
      typeof meta.planJsonPath === 'string' ? meta.planJsonPath : '',
    lock: meta.lock === true,
    targets: meta.targets,
    detail: meta.detail === true,
    autoInit: meta.autoInit === true,
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
    const remedy = runnerLambdaZipRemedy(snapshot.log ?? '', meta.dir);
    if (remedy) {
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
              remedy,
            }),
          },
        ],
        isError: true,
      };
    }
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
    const { summary, resources, detailTruncated } = parseTerraformPlanJson(
      planJson,
      { detail: meta.detail },
    );
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
            ...(meta.autoInit ? { autoInit: true } : {}),
            summary,
            resources,
            ...(detailTruncated
              ? {
                  detailTruncated: true,
                  hint: 'Attribute detail was capped; pass `targets` to narrow the plan.',
                }
              : {}),
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
  detail?: boolean;
}

/**
 * Run `terraform plan` structurally: default `-lock=false` so a plan never
 * contends for the shared state lock the Lock Watchdog polices, and return
 * `{ summary, resources }` parsed from `terraform show -json` instead of raw
 * text an agent would otherwise grep. Plans that don't finish inside the sync
 * budget (terraform/main commonly takes 2-6 minutes) return a pollable jobId
 * — poll with terraform_apply_status.
 *
 * A plan that fails because the directory was never initialized (every fresh
 * worktree) is retried once behind `terraform init -input=false`.
 */
export async function terraformPlan(
  params: TerraformPlanParams,
  repoRoot: string,
  runJob: typeof runner.runJobWithBudget = runner.runJobWithBudget,
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
  const initArgs = [
    'terraform',
    '-chdir=' + resolvedDir,
    'init',
    '-input=false',
    '-no-color',
  ];
  const planScript =
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
    detail: params.detail === true,
  };

  const snapshot = await runJob(
    {
      command: resolveBashExecutable(),
      args: ['-c', planScript],
      cwd: resolvedDir,
      label: `terraform plan ${params.dir}`,
      timeoutMs,
      meta: { ...meta },
    },
    SYNC_BUDGET_MS,
  );

  if (snapshot.status !== 'failed' || !needsBackendInit(snapshot.log ?? '')) {
    return buildPlanResult(snapshot);
  }

  // Retried at most once: the retry's own result is returned as-is, so an
  // init that does not clear the error surfaces instead of looping.
  const retry = await runJob(
    {
      command: resolveBashExecutable(),
      args: ['-c', initArgs.map(shQuote).join(' ') + ' && ' + planScript],
      cwd: resolvedDir,
      label: `terraform init + plan ${params.dir}`,
      timeoutMs,
      meta: { ...meta, autoInit: true },
    },
    SYNC_BUDGET_MS,
  );

  return buildPlanResult(retry);
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
