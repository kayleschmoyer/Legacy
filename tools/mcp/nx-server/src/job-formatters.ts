import type { JobSnapshot } from './jobs.js';

/**
 * Per-kind result formatters for terminal job snapshots.
 *
 * Job-backed tools whose result is more than the raw log (e.g. the playwright
 * report built by nx_run_e2e_specs) register a formatter under a `meta.kind`
 * key at module load. When a job completes within the initial call's sync
 * budget the tool formats inline; when completion is observed later via
 * nx_job_wait / nx_job_status, those generic tools look the formatter up here
 * so the caller gets the same structured result either way.
 *
 * Formatters are best-effort: any throw falls back to the generic
 * passed/output snapshot body.
 */
export interface FormattedJobResult {
  body: Record<string, unknown>;
  isError: boolean;
}

type TerminalFormatter = (
  snapshot: JobSnapshot,
) => Promise<FormattedJobResult | null>;

const formatters = new Map<string, TerminalFormatter>();

export function registerJobFormatter(
  kind: string,
  formatter: TerminalFormatter,
): void {
  formatters.set(kind, formatter);
}

/**
 * Format a terminal (done/failed) snapshot via its registered meta.kind
 * formatter. Returns null when no formatter applies or formatting fails —
 * callers fall back to the generic snapshot body.
 */
export async function formatTerminalSnapshot(
  snapshot: JobSnapshot,
): Promise<FormattedJobResult | null> {
  if (snapshot.status !== 'done' && snapshot.status !== 'failed') return null;
  const kind = snapshot.meta?.['kind'];
  if (typeof kind !== 'string') return null;
  const formatter = formatters.get(kind);
  if (!formatter) return null;
  try {
    return await formatter(snapshot);
  } catch {
    return null;
  }
}
