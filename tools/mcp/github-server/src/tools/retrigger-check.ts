import { minifiedJson } from '@legacy-sports/mcp-format';
import { filterRunsByName, parseRunIds } from './get-check-runs.js';
import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import { getRemainingLambdaMs } from '../lambda-budget.js';
import { resolveHeadShaFromPrNumber } from '../pr-utils.js';
import { FAILED_CONCLUSIONS } from '../types.js';
import type { ToolResult } from '../types.js';

interface RetriggerCheckParams {
  number: number;
  checkName?: string;
  checkNames?: string[];
  allFailed?: boolean;
  waitForCompletion?: boolean;
  timeoutSeconds?: number;
}

// User-facing per-call ceiling for waitForCompletion, mirroring ci-server's
// ci_dispatch_workflow/ci_wait_run (LS-8429 pattern). This server runs on the
// same 30s-timeout Lambda (terraform/main/lambda-mcp-github.tf ->
// var.lambda_timeout) — a wait longer than that gets the whole invocation
// SIGKILLed before it can return a response, surfacing as a raw transport
// error instead of a clean not_yet_reschedulable snapshot. A caller that
// needs longer just calls github_retrigger_check again (LS-9988) rather than
// this call blocking past what the Lambda can safely wait.
const TRANSPORT_SAFE_WAIT_MS = 20_000;
// Reserved for response serialization + the Streamable HTTP write once
// polling stops; see dispatch-workflow.ts / wait-run.ts for the full
// rationale (LS-8429).
const RESPONSE_MARGIN_MS = 5000;
const RUN_POLL_INTERVAL_MS = 5000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll an Actions workflow run until it reports `completed` or `deadlineMs`
 * passes. Used to bridge the "not_yet_reschedulable" transient state
 * (GitHub 403s rerun-failed-jobs while a previous run of the same workflow
 * is still in flight) so a caller opting into `waitForCompletion` gets one
 * call that waits-then-retries instead of N manual round-trips (LS-9988).
 */
async function waitForRunToSettle(
  repo: { owner: string; name: string },
  runId: number,
  deadlineMs: number,
): Promise<boolean> {
  while (Date.now() < deadlineMs) {
    await sleep(
      Math.min(RUN_POLL_INTERVAL_MS, Math.max(deadlineMs - Date.now(), 0)),
    );
    if (Date.now() >= deadlineMs) break;
    try {
      const run = await githubRest<{ status: string }>({
        method: 'GET',
        path: `/repos/${repo.owner}/${repo.name}/actions/runs/${runId}`,
      });
      if (run.status === 'completed') return true;
    } catch {
      // Transient polling error — keep trying until the deadline.
    }
  }
  return false;
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

  // Shared deadline for the optional waitForCompletion bridge below — sized
  // off both the caller's requested budget and this Lambda's actual
  // remaining time (LS-9988, same clamp as ci-server's dispatch-workflow.ts).
  // Computed once up front and reused across every check in the retrigger
  // loop rather than per-check, since they all share the same 30s Lambda
  // budget. A no-op when waitForCompletion isn't set.
  const requestedWaitMs = Math.min(
    (params.timeoutSeconds ?? TRANSPORT_SAFE_WAIT_MS / 1000) * 1000,
    TRANSPORT_SAFE_WAIT_MS,
  );
  const lambdaSafeWaitMs = Math.max(
    getRemainingLambdaMs() - RESPONSE_MARGIN_MS,
    0,
  );
  const waitDeadlineMs =
    Date.now() + Math.min(requestedWaitMs, lambdaSafeWaitMs);

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

  // 2. List check runs for the commit (paginated). Always fetch unfiltered —
  //    GitHub's own `check_name` query param is an exact match against the
  //    full display name and mishandles names containing "&" (matching
  //    neither the full name nor a substring, LS-9884) — so `checkName` is
  //    applied locally below via the same case-insensitive substring matcher
  //    get-check-runs.ts uses (LS-8771).
  const baseQuery: Record<string, string> = { per_page: '100' };

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
          text: `No check runs found on PR #${params.number} (commit ${sha.slice(0, 7)}).`,
        },
      ],
    };
  }

  // GitHub's check-runs-for-a-ref listing includes every attempt of a check
  // that has ever run against this exact SHA, newest first — a check that
  // was rerequested keeps its earlier (e.g. failed, later stood-down-as-flaky)
  // check_run objects in the list alongside the new one. Dedupe to the latest
  // attempt per check name so "currently failing" reflects only the check's
  // present state on the head SHA, not a superseded attempt (LS-10059).
  const latestByName = new Map<string, CheckRun>();
  for (const run of allCheckRuns) {
    if (!latestByName.has(run.name)) {
      latestByName.set(run.name, run);
    }
  }
  allCheckRuns = [...latestByName.values()];

  // Merge the singular `checkName` (backward-compat) with the new `checkNames`
  // array into one list of names to match — callers can target a precise,
  // named subset of checks instead of relying on the broad `allFailed` sweep.
  const namesToMatch = [
    ...(params.checkName ? [params.checkName] : []),
    ...(params.checkNames ?? []),
  ];

  if (namesToMatch.length > 0) {
    const matchedById = new Map<number, CheckRun>();
    for (const name of namesToMatch) {
      for (const run of filterRunsByName(allCheckRuns, name)) {
        matchedById.set(run.id, run);
      }
    }
    const matched = [...matchedById.values()];
    if (matched.length === 0) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `No check run named ${namesToMatch.map((n) => `"${n}"`).join(', ')} found on PR #${params.number} (commit ${sha.slice(0, 7)}). Available check names: ${allCheckRuns.map((r) => r.name).join(', ')}`,
          },
        ],
      };
    }
    allCheckRuns = matched;
  }

  // 3. Filter checks based on params:
  //    - checkName/checkNames without allFailed: retrigger all matching (regardless of status)
  //    - allFailed (with or without checkName/checkNames): retrigger only checks
  //      currently failing on the head SHA (i.e. the latest attempt per name)
  //    - neither: retrigger only currently-failing checks (default behavior)
  let toRetrigger = allCheckRuns;
  if (namesToMatch.length > 0 && !params.allFailed) {
    // Specific check(s) requested — retrigger all matching runs (any status)
  } else {
    // Default or allFailed: filter to checks currently failing (latest attempt
    // per name) only.
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
            // Bridge the transient "still running" state internally instead
            // of forcing the caller to manually poll-and-retry (LS-9988):
            // wait (bounded by waitDeadlineMs, transport/Lambda-safe) for the
            // owning workflow run to settle, then retry the rerun-failed-jobs
            // call once. If it settles and the retry succeeds, this reports
            // as a normal success with no behavior change for callers that
            // don't opt in.
            const settled =
              params.waitForCompletion &&
              (await waitForRunToSettle(
                repo,
                ids.workflowRunId,
                waitDeadlineMs,
              ));
            if (settled) {
              try {
                await githubRest<undefined>({
                  method: 'POST',
                  path: `/repos/${repo.owner}/${repo.name}/actions/runs/${ids.workflowRunId}/rerun-failed-jobs`,
                });
                results.push({ name: run.name, id: run.id, retriggered: true });
                continue;
              } catch (retryError) {
                const retryMessage =
                  retryError instanceof Error
                    ? retryError.message
                    : String(retryError);
                results.push({
                  name: run.name,
                  id: run.id,
                  retriggered: false,
                  error:
                    `Workflow run ${ids.workflowRunId} finished, but the retry of rerun-failed-jobs ` +
                    `still failed: ${retryMessage}`,
                });
                continue;
              }
            }
            results.push({
              name: run.name,
              id: run.id,
              retriggered: false,
              status: 'not_yet_reschedulable',
              error:
                `Workflow run ${ids.workflowRunId} is still running — GitHub rejects a rerun-failed-jobs ` +
                'request while a previous run of the same workflow is in flight. This is not a hard ' +
                'failure: ' +
                (params.waitForCompletion
                  ? `waited up to ${Math.round(TRANSPORT_SAFE_WAIT_MS / 1000)}s for it to finish and it ` +
                    'is still in flight. Call github_retrigger_check again with waitForCompletion: true ' +
                    'to keep waiting — do not switch to a different retrigger strategy.'
                  : 'wait for the run to finish, then retry github_retrigger_check.'),
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
