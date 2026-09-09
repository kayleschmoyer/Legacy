import { minifiedJson } from '@legacy-sports/mcp-format';
import { parseRunIds } from './get-check-runs.js';
import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import { resolveHeadShaFromPrNumber } from '../pr-utils.js';
import { FAILED_CONCLUSIONS } from '../types.js';
import type { ToolResult } from '../types.js';

interface RetriggerCheckParams {
  number: number;
  checkName?: string;
  allFailed?: boolean;
}

interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  app?: { slug: string };
  details_url: string | null;
  html_url: string | null;
}

// GitHub's rerun-failed-jobs/rerun endpoints 403 with this shape while a
// previous run of the same workflow is still in flight — a transient state,
// not a hard failure (mirrors ci-server's isAlreadyRunningError).
function isActionsAlreadyRunningError(message: string): boolean {
  return (
    /failed \(403\)/.test(message) &&
    /already running|already in progress/i.test(message)
  );
}

interface CheckRunsResponse {
  total_count: number;
  check_runs: CheckRun[];
}

export async function retriggerCheck(
  params: RetriggerCheckParams,
): Promise<ToolResult> {
  const repo = await getRepoOwnerName();

  // 1. Get head commit SHA
  const sha = await resolveHeadShaFromPrNumber(params.number);
  if (!sha) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `PR #${params.number} not found or has no commits.`,
        },
      ],
    };
  }

  // 2. List check runs for the commit (paginated)
  const baseQuery: Record<string, string> = { per_page: '100' };
  if (params.checkName) {
    baseQuery.check_name = params.checkName;
  }

  let allCheckRuns: CheckRun[] = [];
  let totalCount = 0;
  let page = 1;

  while (true) {
    const pageData = await githubRest<CheckRunsResponse>({
      method: 'GET',
      path: `/repos/${repo.owner}/${repo.name}/commits/${sha}/check-runs`,
      query: { ...baseQuery, page: String(page) },
    });
    totalCount = pageData.total_count;
    allCheckRuns = allCheckRuns.concat(pageData.check_runs);
    if (allCheckRuns.length >= totalCount || pageData.check_runs.length === 0) {
      break;
    }
    page++;
  }

  if (totalCount === 0) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: params.checkName
            ? `No check run named "${params.checkName}" found on PR #${params.number} (commit ${sha.slice(0, 7)}).`
            : `No check runs found on PR #${params.number} (commit ${sha.slice(0, 7)}).`,
        },
      ],
    };
  }

  // 3. Filter checks based on params:
  //    - checkName without allFailed: retrigger all matching (regardless of status)
  //    - allFailed (with or without checkName): retrigger only failed checks
  //    - neither: retrigger only failed checks (default behavior)
  let toRetrigger = allCheckRuns;
  if (params.checkName && !params.allFailed) {
    // Specific check requested — retrigger all matching runs (any status)
  } else {
    // Default or allFailed: filter to failed checks only
    toRetrigger = toRetrigger.filter(
      (c) =>
        c.conclusion !== null &&
        FAILED_CONCLUSIONS.has(c.conclusion.toUpperCase()),
    );
  }

  if (toRetrigger.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            success: true,
            message: 'No failed check runs to retrigger.',
            totalChecks: totalCount,
            sha: sha.slice(0, 7),
          }),
        },
      ],
    };
  }

  // 4. Re-request each check run
  const results: Array<{
    name: string;
    id: number;
    retriggered: boolean;
    error?: string;
    status?: string;
  }> = [];

  for (const run of toRetrigger) {
    try {
      await githubRest<undefined>({
        method: 'POST',
        path: `/repos/${repo.owner}/${repo.name}/check-runs/${run.id}/rerequest`,
      });
      results.push({ name: run.name, id: run.id, retriggered: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // GitHub's rerequest API returns 403 "Invalid check_run_id" for check runs
      // owned by the github-actions app (e.g. workflow_dispatch checks). These
      // cannot be re-requested via the Checks API — fall back to the Actions API's
      // own rerun-failed-jobs endpoint on the check run's owning workflow run,
      // which reschedules it with no new commit required (LS-9881).
      if (
        /invalid check_run_id/i.test(message) &&
        run.app?.slug === 'github-actions'
      ) {
        const ids = parseRunIds(run);
        if (!ids) {
          results.push({
            name: run.name,
            id: run.id,
            retriggered: false,
            error:
              'This check run belongs to GitHub Actions and cannot be re-requested via the Checks API, ' +
              "and its workflow run could not be resolved from the check run's details/html URL to attempt " +
              'an Actions-API rerun. Investigate manually via the Actions tab.',
          });
          continue;
        }
        try {
          await githubRest<undefined>({
            method: 'POST',
            path: `/repos/${repo.owner}/${repo.name}/actions/runs/${ids.workflowRunId}/rerun-failed-jobs`,
          });
          results.push({ name: run.name, id: run.id, retriggered: true });
        } catch (actionsError) {
          const actionsMessage =
            actionsError instanceof Error
              ? actionsError.message
              : String(actionsError);
          if (isActionsAlreadyRunningError(actionsMessage)) {
            results.push({
              name: run.name,
              id: run.id,
              retriggered: false,
              status: 'not_yet_reschedulable',
              error:
                `Workflow run ${ids.workflowRunId} is still running — GitHub rejects a rerun-failed-jobs ` +
                'request while a previous run of the same workflow is in flight. This is not a hard ' +
                'failure: wait for the run to finish, then retry github_retrigger_check.',
            });
          } else {
            results.push({
              name: run.name,
              id: run.id,
              retriggered: false,
              error:
                `This check run belongs to GitHub Actions. The Checks API rerequest was rejected, and the ` +
                `Actions API rerun-failed-jobs call for workflow run ${ids.workflowRunId} also failed: ` +
                `${actionsMessage} Do NOT use ci_dispatch_workflow(workflow, ref: '<pr-branch>') as a ` +
                `substitute unless you have confirmed the workflow's AWS OIDC role trusts that ref -- ` +
                `required-check workflows that assume the legacy-sports-dev-github-actions-plan role (e.g. ` +
                `check-migrations-applied.yml, terraform-plan.yml) only trust pull_request events or ` +
                `ref:refs/heads/main (terraform/main/github-actions-oidc.tf), so a workflow_dispatch run on ` +
                `any other branch is structurally guaranteed to fail "sts:AssumeRoleWithWebIdentity" -- ` +
                `retrying it will not help (LS-9029). Investigate manually.`,
            });
          }
        }
      } else {
        results.push({
          name: run.name,
          id: run.id,
          retriggered: false,
          error: message,
        });
      }
    }
  }

  const retriggered = results.filter((r) => r.retriggered).length;
  const failed = results.filter((r) => !r.retriggered).length;
  // "not_yet_reschedulable" (the owning Actions workflow run is still in
  // flight) is a transient, retryable state rather than a hard failure —
  // don't let it flip the overall call to isError (LS-9881 AC2).
  const hardFailed = results.filter(
    (r) => !r.retriggered && r.status !== 'not_yet_reschedulable',
  ).length;

  return {
    isError: hardFailed > 0 ? true : undefined,
    content: [
      {
        type: 'text',
        text: minifiedJson({
          success: hardFailed === 0,
          pr: params.number,
          sha: sha.slice(0, 7),
          retriggered,
          failed,
          results,
        }),
      },
    ],
  };
}
