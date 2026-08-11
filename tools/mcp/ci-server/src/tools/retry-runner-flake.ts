import { retryFailed } from './retry-failed.js';
import { githubGet } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface RetryRunnerFlakeParams {
  prNumber: number;
}

interface GitHubLabel {
  name: string;
}

interface GitHubIssue {
  labels: GitHubLabel[];
}

interface GitHubComment {
  body: string;
}

/** Must match the LABEL constant in .github/workflows/ci-orchestrator.yml verbatim. */
const RUNNER_FLAKE_LABEL = 'CI: Runner Flake';

/** Must match the bot comment body built in .github/workflows/ci-orchestrator.yml. */
const FLAKE_COMMENT_SIGNATURE = 'CI cancelled due to a runner restart';

const RUN_ID_PATTERN = /\/actions\/runs\/(\d+)/;

function noSignalResult(prNumber: number, reason: string): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text:
          `No runner-shutdown flake signal detected for PR #${prNumber}: ${reason} ` +
          `Use ci_retry_failed({ runId }) to manually retry after confirming the failure cause.`,
      },
    ],
  };
}

/**
 * Detect-and-retry the recurring self-hosted-runner-shutdown flake in one call.
 * The repo's own ci-orchestrator.yml automation already classifies this exact
 * failure with certainty — applying the "CI: Runner Flake" label and posting a
 * bot comment with a link to the run — so this tool keys off that existing
 * signal directly instead of re-deriving the classification from raw logs.
 */
export async function retryRunnerFlake(
  params: RetryRunnerFlakeParams,
): Promise<ToolResult> {
  if (
    !Number.isFinite(params.prNumber) ||
    !Number.isInteger(params.prNumber) ||
    params.prNumber <= 0
  ) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `prNumber must be a positive integer; received ${params.prNumber}.`,
        },
      ],
    };
  }

  try {
    const issue = await githubGet<GitHubIssue>(`/issues/${params.prNumber}`);
    const hasFlakeLabel = issue.labels.some(
      (label) => label.name === RUNNER_FLAKE_LABEL,
    );

    const comments = await githubGet<GitHubComment[]>(
      `/issues/${params.prNumber}/comments`,
    );

    // GitHub returns comments in ascending creation order, and a PR can
    // accumulate more than one flake+retry cycle — take the most recent
    // matching comment, not the first. The comment is preferred as the
    // source of truth for the run ID: the tool already parses it, and
    // unlike the label it cannot be edited away by label housekeeping.
    let runId: number | undefined;
    for (let i = comments.length - 1; i >= 0; i -= 1) {
      const body = comments[i]?.body ?? '';
      if (!body.includes(FLAKE_COMMENT_SIGNATURE)) continue;
      const match = RUN_ID_PATTERN.exec(body);
      if (match?.[1]) {
        runId = Number(match[1]);
        break;
      }
    }

    // Label and bot comment are independent sufficient signals, not a
    // conjunction — either one alone is enough to proceed with the retry.
    if (runId === undefined && !hasFlakeLabel) {
      return noSignalResult(
        params.prNumber,
        `neither the "${RUNNER_FLAKE_LABEL}" label nor a runner-shutdown bot ` +
          'comment with a parseable run ID was found on the PR.',
      );
    }

    if (runId === undefined) {
      return noSignalResult(
        params.prNumber,
        `the "${RUNNER_FLAKE_LABEL}" label is present, but no bot comment with a ` +
          'parseable run ID was found.',
      );
    }

    return retryFailed({ runId });
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to check runner-flake signal for PR #${params.prNumber}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
