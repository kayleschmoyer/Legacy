import { minifiedJson } from '@legacy-sports/mcp-format';
import { getInstallationRateLimit } from '../github-api.js';
import { fetchRunLogs, stripAnsiCodes } from '../logs.js';
import type { ToolResult } from '../types.js';

/** Deadline for the optional log scan — leaves headroom under the Lambda 30 s timeout. */
const LOG_SCAN_TIMEOUT_MS = 15_000;

/** Max sample lines returned per evidence category. */
const MAX_SAMPLE_LINES = 5;

/** Max characters kept per sample line. */
const MAX_SAMPLE_LINE_LENGTH = 300;

/**
 * Below this fraction of `limit` remaining, the Agent Author App bucket is
 * treated as a plausible cause of a workflow rate-limit 403.
 */
const LOW_BUDGET_FRACTION = 0.05;

const RATE_LIMIT_403 = /API rate limit exceeded|secondary rate limit/i;
const APP_TOKEN_MINT_FAILURE =
  /Failed to create token for|Invalid keyData|asn1 encoding routines/i;

/** What the measured bucket is — and what it is not (LS-10491). */
const MEASURED = {
  token: 'github-app-installation',
  app: 'Agent Author',
  privateKeyEnv: 'AGENT_AUTHOR_APP_PRIVATE_KEY',
};

const NOT_MEASURED =
  'Workflow steps using github.token / secrets.GITHUB_TOKEN draw from the per-repo Actions GITHUB_TOKEN ' +
  'budget (1,000 requests/hour per repository), which is separate from this bucket and cannot be read ' +
  'from outside a running workflow. Steps minting from another App (Reviewer Bot, the runner App) use that ' +
  "App's own bucket. A step whose actions/create-github-app-token mint failed falls back to another token. " +
  'So a healthy number here does not mean CI is not rate limited.';

const NO_RUN_HINT =
  'To check what a failing workflow actually hit, call again with runId (or jobId) of the failing run: the ' +
  'tool scans its logs for "API rate limit exceeded" 403s and App-token mint failures. Equivalent manual ' +
  'check: ci_search_logs({ runId, pattern: "rate limit exceeded", failedOnly: false }).';

interface InstallationRateLimitParams {
  runId?: number;
  jobId?: number;
}

interface LogEvidence {
  runId: number | null;
  jobId: number | null;
  jobsSearched: number;
  jobsTotal: number;
  rateLimit403Lines: number;
  appTokenMintFailureLines: number;
  rateLimit403Samples: string[];
  appTokenMintFailureSamples: string[];
}

function truncate(line: string): string {
  const trimmed = line.trim();
  return trimmed.length > MAX_SAMPLE_LINE_LENGTH
    ? `${trimmed.slice(0, MAX_SAMPLE_LINE_LENGTH)}…`
    : trimmed;
}

async function scanLogs(
  params: InstallationRateLimitParams,
): Promise<LogEvidence> {
  // failedOnly: false — a status-posting step can 403 inside a job that
  // still concludes success (continue-on-error, swallowed errors).
  const rawLogs = await fetchRunLogs({
    runId: params.runId,
    jobId: params.jobId,
    failedOnly: false,
    signal: AbortSignal.timeout(LOG_SCAN_TIMEOUT_MS),
  });

  const evidence: LogEvidence = {
    runId: params.runId ?? null,
    jobId: params.jobId ?? null,
    jobsSearched: rawLogs.jobsSearched,
    jobsTotal: rawLogs.jobsTotal,
    rateLimit403Lines: 0,
    appTokenMintFailureLines: 0,
    rateLimit403Samples: [],
    appTokenMintFailureSamples: [],
  };

  for (const rawLine of rawLogs.text.split(/\r?\n/)) {
    const line = stripAnsiCodes(rawLine);
    if (RATE_LIMIT_403.test(line)) {
      evidence.rateLimit403Lines += 1;
      if (evidence.rateLimit403Samples.length < MAX_SAMPLE_LINES) {
        evidence.rateLimit403Samples.push(truncate(line));
      }
    }
    if (APP_TOKEN_MINT_FAILURE.test(line)) {
      evidence.appTokenMintFailureLines += 1;
      if (evidence.appTokenMintFailureSamples.length < MAX_SAMPLE_LINES) {
        evidence.appTokenMintFailureSamples.push(truncate(line));
      }
    }
  }

  return evidence;
}

type Verdict =
  | 'no-rate-limit-403-in-logs'
  | 'agent-author-bucket-low'
  | 'workflow-bucket-separate'
  | 'unknown';

function classify(
  evidence: LogEvidence,
  rateLimit: { limit: number; remaining: number } | undefined,
): { verdict: Verdict; hint: string } {
  if (evidence.rateLimit403Lines === 0) {
    const scope =
      evidence.jobsSearched < evidence.jobsTotal
        ? ` Only ${evidence.jobsSearched} of ${evidence.jobsTotal} job(s) were searched (per-call job cap) — pass jobId to target the failing job.`
        : '';
    return {
      verdict: 'no-rate-limit-403-in-logs',
      hint: `No "API rate limit exceeded" lines in the scanned logs, so the failure is probably not rate limiting.${scope}`,
    };
  }

  const mintNote =
    evidence.appTokenMintFailureLines > 0
      ? ' The logs also show actions/create-github-app-token failing to mint (see appTokenMintFailureSamples): ' +
        'the step fell back to another token, which is the bucket that ran out. Fix how the workflow supplies the ' +
        'App private key (malformed secret, or a base64 secret passed undecoded — LS-10559). A re-run replays the ' +
        "run's original merge snapshot, so once the fix is on the base branch, merge it in and push instead."
      : '';

  if (!rateLimit) {
    return {
      verdict: 'unknown',
      hint:
        'The logs show rate-limit 403s, but the Agent Author bucket could not be read (see error). The 403s ' +
        `may come from the per-repo GITHUB_TOKEN budget or another App's bucket.${mintNote}`,
    };
  }

  if (rateLimit.remaining <= rateLimit.limit * LOW_BUDGET_FRACTION) {
    return {
      verdict: 'agent-author-bucket-low',
      hint:
        'The logs show rate-limit 403s and the Agent Author bucket is nearly exhausted. Wait until ' +
        `rateLimit.resetsAt, then re-run the failed job — not an immediate retry.${mintNote}`,
    };
  }

  return {
    verdict: 'workflow-bucket-separate',
    hint:
      'The logs show rate-limit 403s while the Agent Author bucket is healthy, so the failing steps used a ' +
      'different bucket — most likely the per-repo GITHUB_TOKEN (github.token) budget, which resets on a ' +
      'rolling hourly window and cannot be read from here. Look for x-ratelimit-reset / retry-after in the ' +
      'sampled lines (ci_search_logs with contextAfter for more) for the real reset time; otherwise wait out ' +
      `the hour before re-running. Do not read this tool's healthy remaining as "CI is not rate limited".${mintNote}`,
  };
}

export async function installationRateLimit(
  params: InstallationRateLimitParams,
): Promise<ToolResult> {
  let rateLimit:
    | Awaited<ReturnType<typeof getInstallationRateLimit>>
    | undefined;
  let rateLimitError: string | undefined;
  try {
    rateLimit = await getInstallationRateLimit();
  } catch (err) {
    rateLimitError = err instanceof Error ? err.message : String(err);
  }

  const measured = rateLimit
    ? { ...MEASURED, appId: rateLimit.appId }
    : MEASURED;
  const base = rateLimit
    ? {
        configured: true,
        measured,
        rateLimit: {
          limit: rateLimit.limit,
          remaining: rateLimit.remaining,
          resetsAt: rateLimit.resetsAt,
        },
        notMeasured: NOT_MEASURED,
      }
    : {
        configured: false,
        measured,
        error: rateLimitError,
        notMeasured: NOT_MEASURED,
        configHint:
          'Set AGENT_AUTHOR_APP_PRIVATE_KEY in cloud env settings to enable this check. Do not fall back to ' +
          "`gh api rate_limit` — it reports the CLI's own user/PAT token bucket, not any bucket CI uses.",
      };

  if (!params.runId && !params.jobId) {
    return {
      content: [
        { type: 'text', text: minifiedJson({ ...base, hint: NO_RUN_HINT }) },
      ],
    };
  }

  let evidence: LogEvidence;
  try {
    evidence = await scanLogs(params);
  } catch (err) {
    const target = params.jobId ? `job ${params.jobId}` : `run ${params.runId}`;
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            ...base,
            logScanError: `Failed to scan logs for ${target}: ${err instanceof Error ? err.message : String(err)}`,
            hint: NO_RUN_HINT,
          }),
        },
      ],
    };
  }

  const { verdict, hint } = classify(evidence, rateLimit);
  return {
    content: [
      {
        type: 'text',
        text: minifiedJson({ ...base, workflowLogs: evidence, verdict, hint }),
      },
    ],
  };
}
