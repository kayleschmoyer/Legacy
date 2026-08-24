import { rerun } from './rerun.js';
import { rerunBatch } from './rerun-batch.js';
import { retryFailed } from './retry-failed.js';
import type { ToolResult } from '../types.js';

interface CiRerunParams {
  runId?: number;
  runIds?: number[];
  scope?: 'failed' | 'job' | 'all';
  jobId?: number;
  withDiagnostics?: boolean;
  withFreshLogs?: boolean;
  debug?: boolean;
}

function paramError(text: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

/**
 * Consolidated entry point absorbing ci_rerun_failed_jobs (identical to the
 * scope="failed" default), ci_rerun_batch (runIds), and ci_retry_failed
 * (withDiagnostics) — LS-9714. Dispatches to the unchanged single-purpose
 * implementations rather than re-deriving their logic.
 */
export async function ciRerun(params: CiRerunParams): Promise<ToolResult> {
  const {
    runId,
    runIds,
    scope = 'failed',
    jobId,
    withDiagnostics = false,
    withFreshLogs,
    debug,
  } = params;

  if ((runId === undefined) === (runIds === undefined)) {
    return paramError('Exactly one of runId or runIds is required.');
  }

  if (runIds !== undefined) {
    if (scope === 'job' || jobId !== undefined) {
      return paramError(
        'scope="job"/jobId is single-run only; not supported with runIds.',
      );
    }
    if (withDiagnostics) {
      return paramError(
        'withDiagnostics is single-run only; not supported with runIds.',
      );
    }
    return rerunBatch({ runIds, failedOnly: scope !== 'all', debug });
  }

  if (scope === 'job' && jobId === undefined) {
    return paramError('jobId is required when scope="job".');
  }
  if (jobId !== undefined && scope !== 'job') {
    return paramError('jobId requires scope="job".');
  }

  if (withDiagnostics) {
    if (scope !== 'failed') {
      return paramError(
        'withDiagnostics only supports scope="failed" (the default).',
      );
    }
    return retryFailed({ runId: runId as number, withFreshLogs });
  }

  return rerun({
    runId: runId as number,
    failedOnly: scope !== 'all',
    jobId: scope === 'job' ? jobId : undefined,
    debug,
  });
}
