import { githubGet } from '../github-api.js';
import type { ToolResult } from '../types.js';
import { minifiedJson } from '@legacy-sports/mcp-format';

interface ViewRunParams {
  runId: number;
  attempt?: number;
  includeJobs?: boolean;
  format?: 'markdown' | 'json';
}

interface GitHubWorkflowRun {
  id: number;
  run_number: number;
  run_attempt: number;
  conclusion: string | null;
  created_at: string;
  display_title: string;
  event: string;
  head_branch: string;
  head_sha: string;
  name: string;
  started_at?: string | null;
  status: string;
  updated_at: string;
  html_url: string;
  workflow_id: number;
}

interface GitHubJob {
  id: number;
  run_id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  steps?: Array<{
    name: string;
    status: string;
    conclusion: string | null;
    number: number;
  }>;
}

interface GitHubJobsResponse {
  total_count: number;
  jobs: GitHubJob[];
}

function mapRun(run: GitHubWorkflowRun) {
  return {
    attempt: run.run_attempt,
    conclusion: run.conclusion,
    createdAt: run.created_at,
    databaseId: run.id,
    displayTitle: run.display_title,
    event: run.event,
    headBranch: run.head_branch,
    headSha: run.head_sha,
    name: run.name,
    number: run.run_number,
    startedAt: run.started_at ?? null,
    status: run.status,
    updatedAt: run.updated_at,
    url: run.html_url,
    workflowDatabaseId: run.workflow_id,
    workflowName: run.name,
  };
}

function mapJob(job: GitHubJob) {
  return {
    databaseId: job.id,
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    steps: job.steps?.map((s) => ({
      name: s.name,
      status: s.status,
      conclusion: s.conclusion,
      number: s.number,
    })),
  };
}

function formatDuration(
  startedAt: string | null,
  endedAt: string | null,
): string {
  if (!startedAt || !endedAt) return '—';
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

function jobStatusCell(job: GitHubJob): string {
  if (job.status !== 'completed') {
    return `⏳ ${job.status}`;
  }
  switch (job.conclusion) {
    case 'success':
      return '✅';
    case 'failure':
      return '❌';
    case 'cancelled':
      return '🚫 cancelled';
    case 'skipped':
      return '⏭️ skipped';
    case 'timed_out':
      return '⏱️ timed out';
    case 'action_required':
      return '⚠️ action required';
    default:
      return job.conclusion ?? '—';
  }
}

function runHeaderStatus(run: GitHubWorkflowRun): string {
  if (run.status !== 'completed') {
    return `⏳ ${run.status}`;
  }
  switch (run.conclusion) {
    case 'success':
      return '✅ success';
    case 'failure':
      return '❌ failed';
    case 'cancelled':
      return '🚫 cancelled';
    case 'skipped':
      return '⏭️ skipped';
    case 'timed_out':
      return '⏱️ timed out';
    default:
      return run.conclusion ?? '—';
  }
}

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

function escapeMd(value: string): string {
  // Escape markdown-significant characters and table pipes/newlines so that
  // attacker-controlled strings (branch names, job/step names) can't inject
  // links, break the job table, or smuggle hidden content into agent output.
  return value
    .replace(/\\/g, '\\\\')
    .replace(/([`*_[\]()|<>])/g, '\\$1')
    .replace(/\r?\n/g, ' ');
}

function renderMarkdown(
  run: GitHubWorkflowRun,
  jobs: GitHubJob[] | null,
): string {
  const lines: string[] = [];
  const duration = formatDuration(run.started_at ?? null, run.updated_at);
  lines.push(
    `## Run #${run.run_number} — ${runHeaderStatus(run)} (${duration})`,
  );
  lines.push('');
  lines.push(
    `**Workflow:** ${escapeMd(run.name)} · **Branch:** ${escapeMd(run.head_branch)} · **Commit:** ${escapeMd(shortSha(run.head_sha))}`,
  );

  if (jobs) {
    lines.push('');
    lines.push('### Jobs');
    lines.push('| Job | Status | Duration |');
    lines.push('|---|---|---|');
    for (const job of jobs) {
      lines.push(
        `| ${escapeMd(job.name)} | ${jobStatusCell(job)} | ${formatDuration(job.started_at, job.completed_at)} |`,
      );
    }

    const failed = jobs.filter(
      (j) => j.conclusion === 'failure' || j.conclusion === 'timed_out',
    );
    if (failed.length > 0) {
      lines.push('');
      lines.push('### Failed Jobs');
      for (const job of failed) {
        const failedStep = job.steps?.find((s) => s.conclusion === 'failure');
        const reason = failedStep
          ? `failed at step "${escapeMd(failedStep.name)}"`
          : (job.conclusion ?? 'failure');
        lines.push(
          `- **${escapeMd(job.name)}** — ${reason} — \`ci_get_logs runId:${run.id} jobId:${job.id}\``,
        );
      }
    }
  }

  return lines.join('\n');
}

export async function viewRun(params: ViewRunParams): Promise<ToolResult> {
  try {
    const attemptSuffix = params.attempt ? `/attempts/${params.attempt}` : '';
    const run = await githubGet<GitHubWorkflowRun>(
      `/actions/runs/${params.runId}${attemptSuffix}`,
    );

    const includeJobs = params.includeJobs !== false;
    let jobs: GitHubJob[] | null = null;
    if (includeJobs) {
      jobs = [];
      let page = 1;
      const perPage = 100;
      // GitHub caps Actions API pagination at 1000 jobs (page 1..10).
      while (page <= 10) {
        const jobsData = await githubGet<GitHubJobsResponse>(
          `/actions/runs/${params.runId}${attemptSuffix}/jobs`,
          { per_page: String(perPage), page: String(page) },
        );
        jobs.push(...jobsData.jobs);
        if (jobsData.jobs.length < perPage) break;
        page += 1;
      }
    }

    const format = params.format ?? 'markdown';
    if (format === 'json') {
      const result: Record<string, unknown> = mapRun(run);
      if (jobs) result.jobs = jobs.map(mapJob);
      return {
        content: [{ type: 'text', text: minifiedJson(result) }],
      };
    }

    return {
      content: [{ type: 'text', text: renderMarkdown(run, jobs) }],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to view workflow run ${params.runId}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
