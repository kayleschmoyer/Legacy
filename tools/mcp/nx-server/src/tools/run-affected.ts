import { minifiedJson } from '@legacy-sports/mcp-format';
import { DAEMON_FAILURE_HINT, isDaemonFailure } from '../daemon-failure.js';
import { nxJobSpec, SYNC_BUDGET_MS } from '../nx-job.js';
import {
  PLUGIN_WORKER_RETRY_EXHAUSTED_HINT,
  PLUGIN_WORKER_TIMEOUT_HINT,
} from '../plugin-worker-failure.js';
import { runJobWithPluginWorkerRetry } from '../plugin-worker-retry.js';
import { getRepoRoot } from '../run-command.js';
import { MAX_OUTPUT_CHARS, truncateOutput } from '../truncate-output.js';
import type { ToolResult } from '../types.js';

// 30-minute runaway backstop — affected build/test across many projects on a
// cold cache is legitimately slow; transport safety comes from the sync
// budget + bounded nx_job_wait calls, not from this timeout (LS-8353).
const AFFECTED_TIMEOUT_MS = 30 * 60 * 1000;

const ALLOWED_TARGETS = new Set([
  'build',
  'test',
  'lint',
  'typecheck',
  'codegen',
]);

interface RunAffectedParams {
  target: string;
  base?: string;
  fix?: boolean;
  worktreePath?: string;
}

export async function runAffected(
  params: RunAffectedParams,
): Promise<ToolResult> {
  const cwd = params.worktreePath || getRepoRoot();
  const base = params.base || 'origin/main';

  if (!ALLOWED_TARGETS.has(params.target)) {
    return {
      content: [
        {
          type: 'text',
          text: `Target "${params.target}" is not in the allowed list for affected runs. Allowed: ${[...ALLOWED_TARGETS].join(', ')}.`,
        },
      ],
      isError: true,
    };
  }

  try {
    const args = ['affected', '-t', params.target, `--base=${base}`];
    if (params.fix && params.target === 'lint') {
      args.push('--fix');
    }

    // Background job + bounded sync wait — see run-target.ts for rationale.
    const spec = nxJobSpec(args);
    const { snapshot, pluginWorkerRetried } = await runJobWithPluginWorkerRetry(
      {
        command: spec.command,
        args: spec.args,
        shell: spec.shell,
        cwd,
        label: `nx affected -t ${params.target}`,
        timeoutMs: AFFECTED_TIMEOUT_MS,
        idempotencyKey: `nx-affected:${cwd}:${args.join(' ')}`,
      },
      SYNC_BUDGET_MS,
    );

    if (snapshot.status === 'running' || snapshot.status === 'orphaned') {
      return {
        content: [
          {
            type: 'text',
            text: minifiedJson({
              target: params.target,
              base,
              status: snapshot.status,
              jobId: snapshot.jobId,
              elapsedSec: snapshot.elapsedSec,
              ...(pluginWorkerRetried ? { pluginWorkerRetried: true } : {}),
              logTail: truncateOutput(snapshot.logTail ?? '', MAX_OUTPUT_CHARS),
              hint: snapshot.hint,
            }),
          },
        ],
        ...(snapshot.status === 'orphaned' ? { isError: true } : {}),
      };
    }

    const rawOutput = snapshot.log ?? '';
    // Same daemon-graph-failure override as run-target.ts (LS-8819): a failed
    // daemon still exits 0, so status alone would report a false green.
    const daemonFailed =
      snapshot.status === 'done' && isDaemonFailure(rawOutput);
    const passed = snapshot.status === 'done' && !daemonFailed;
    // runJobWithPluginWorkerRetry already retried once with
    // NX_ISOLATE_PLUGINS=false if the first attempt failed with the isolated
    // plugin-worker IPC handshake timeout signature (LS-9282) — surface why.
    const pluginWorkerHint = pluginWorkerRetried
      ? passed
        ? PLUGIN_WORKER_TIMEOUT_HINT
        : PLUGIN_WORKER_RETRY_EXHAUSTED_HINT
      : undefined;
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            target: params.target,
            base,
            passed,
            ...(pluginWorkerRetried ? { pluginWorkerRetried: true } : {}),
            ...(daemonFailed
              ? { daemonError: true, hint: DAEMON_FAILURE_HINT }
              : {}),
            ...(snapshot.error ? { error: snapshot.error } : {}),
            ...(pluginWorkerHint && !daemonFailed
              ? { hint: pluginWorkerHint }
              : {}),
            output: truncateOutput(rawOutput, MAX_OUTPUT_CHARS),
          }),
        },
      ],
      ...(passed ? {} : { isError: true }),
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: truncateOutput(
            `Failed to run affected ${params.target}: ${error instanceof Error ? error.message : String(error)}`,
            MAX_OUTPUT_CHARS,
          ),
        },
      ],
      isError: true,
    };
  }
}
