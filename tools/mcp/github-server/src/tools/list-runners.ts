import { markdownTable, minifiedJson } from '@legacy-sports/mcp-format';
import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

// Flat, uniform list → Markdown table (LS-8021). `labels` is flattened to a
// comma-joined name list for a single cell.
const RUNNER_COLUMNS = [
  'id',
  'name',
  'os',
  'status',
  'busy',
  'labels',
] as const;

interface GitHubRunner {
  id: number;
  name: string;
  os: string;
  status: string;
  busy: boolean;
  labels: Array<{ name: string }>;
}

interface RunnersResponse {
  total_count: number;
  runners: GitHubRunner[];
}

export interface ListRunnersParams {
  status?: 'online' | 'offline';
  /** Filter by the runner's busy flag, composable with `status`. */
  busy?: boolean;
  /** Skip the per-runner rows and return only the summary counts. */
  summaryOnly?: boolean;
}

interface LabelCounts {
  total: number;
  online: number;
  offline: number;
  busy: number;
  idle: number;
}

export interface RunnerSummary {
  total: number;
  online: number;
  offline: number;
  busy: number;
  idle: number;
  byLabel: Record<string, LabelCounts>;
}

function emptyLabelCounts(): LabelCounts {
  return { total: 0, online: 0, offline: 0, busy: 0, idle: 0 };
}

/**
 * Summary always reflects the *entire* runner pool, independent of the
 * `status`/`busy` filters applied to the returned rows (LS-9548) — the
 * capacity-triage question ("does the pool have spare capacity right now?")
 * needs the full-pool counts, not just whatever subset the caller filtered
 * the row table down to.
 */
export function summarizeRunners(runners: GitHubRunner[]): RunnerSummary {
  const summary: RunnerSummary = {
    total: runners.length,
    online: 0,
    offline: 0,
    busy: 0,
    idle: 0,
    byLabel: {},
  };

  for (const r of runners) {
    const online = r.status === 'online';
    if (online) summary.online++;
    else summary.offline++;
    if (r.busy) summary.busy++;
    else summary.idle++;

    for (const label of r.labels) {
      const counts = (summary.byLabel[label.name] ??= emptyLabelCounts());
      counts.total++;
      if (online) counts.online++;
      else counts.offline++;
      if (r.busy) counts.busy++;
      else counts.idle++;
    }
  }

  return summary;
}

export async function listRunners(
  params: ListRunnersParams,
): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();

    // Always fetch the full, unfiltered pool — the summary must cover every
    // runner regardless of the `status`/`busy` row filters (LS-9548).
    const allRunners: GitHubRunner[] = [];
    let page = 1;

    while (true) {
      const data = await githubRest<RunnersResponse>({
        method: 'GET',
        path: `/repos/${repo.owner}/${repo.name}/actions/runners`,
        query: { per_page: '100', page: String(page) },
      });
      allRunners.push(...data.runners);
      if (allRunners.length >= data.total_count || data.runners.length === 0)
        break;
      page++;
    }

    const summary = summarizeRunners(allRunners);
    const summaryLine = `_summary: ${minifiedJson(summary)}_`;

    if (params.summaryOnly) {
      return { content: [{ type: 'text', text: summaryLine }] };
    }

    const filtered = allRunners.filter(
      (r) =>
        (params.status === undefined || r.status === params.status) &&
        (params.busy === undefined || r.busy === params.busy),
    );

    const runners = filtered.map((r) => ({
      id: r.id,
      name: r.name,
      os: r.os,
      status: r.status,
      busy: r.busy,
      labels: r.labels.map((l) => l.name).join(','),
    }));

    const text =
      runners.length === 0
        ? `No runners found.\n\n${summaryLine}`
        : `${markdownTable(runners, { columns: RUNNER_COLUMNS })}\n\n${summaryLine}`;

    return {
      content: [{ type: 'text', text }],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: minifiedJson({
            ok: false,
            error: `Failed to list runners: ${error instanceof Error ? error.message : String(error)}`,
          }),
        },
      ],
    };
  }
}
