import { execFile } from 'node:child_process';
import { getRepoRoot, runGh } from '../gh.js';
import type { ToolResult } from '../types.js';

interface RequestReviewParams {
  number: number;
  reviewers?: string[];
  copilot?: boolean;
}

const COPILOT_BOT = 'copilot-pull-request-reviewer[bot]';
const GH_CMD = process.platform === 'win32' ? 'gh.exe' : 'gh';

/**
 * Request Copilot bot review via piped JSON input.
 * Neither `--reviewer copilot` nor `--field reviewers[]=...` work for bot accounts.
 */
function requestCopilotReview(prNumber: number): Promise<void> {
  const body = JSON.stringify({ reviewers: [COPILOT_BOT] });
  return new Promise<void>((resolve, reject) => {
    const child = execFile(
      GH_CMD,
      [
        'api',
        `repos/{owner}/{repo}/pulls/${prNumber}/requested_reviewers`,
        '--method',
        'POST',
        '--input',
        '-',
      ],
      {
        cwd: getRepoRoot(),
        timeout: 30_000,
        maxBuffer: 10 * 1024 * 1024,
        shell: false,
      },
      (err, stdout, stderr) => {
        if (err) {
          const message = stderr?.trim() || stdout?.trim() || err.message;
          reject(new Error(message));
        } else {
          resolve();
        }
      },
    );
    child.stdin?.write(body);
    child.stdin?.end();
  });
}

export async function requestReview(
  params: RequestReviewParams,
): Promise<ToolResult> {
  const results: Array<{ reviewer: string; success: boolean; error?: string }> =
    [];

  // Handle Copilot bot reviewer (requires piped JSON body)
  if (params.copilot !== false) {
    try {
      await requestCopilotReview(params.number);
      results.push({ reviewer: COPILOT_BOT, success: true });
    } catch (error) {
      results.push({
        reviewer: COPILOT_BOT,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Handle regular reviewers
  if (params.reviewers?.length) {
    for (const reviewer of params.reviewers) {
      try {
        await runGh([
          'pr',
          'edit',
          String(params.number),
          '--add-reviewer',
          reviewer,
        ]);
        results.push({ reviewer, success: true });
      } catch (error) {
        results.push({
          reviewer,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const allSucceeded = results.every((r) => r.success);
  return {
    isError: !allSucceeded ? true : undefined,
    content: [
      {
        type: 'text',
        text: JSON.stringify({ prNumber: params.number, results }, null, 2),
      },
    ],
  };
}
