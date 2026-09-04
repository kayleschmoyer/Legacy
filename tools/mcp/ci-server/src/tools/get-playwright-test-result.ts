import { minifiedJson } from '@legacy-sports/mcp-format';
import type { ToolResult } from '../types.js';
import {
  fetchPlaywrightReport,
  fullTitle,
  type PlaywrightTest,
  type PlaywrightTestFile,
  type PlaywrightTestResult,
  reportUrlFor,
} from '../playwright-report.js';
import { deploysTokenWasFallback, githubGet } from '../github-api.js';
import {
  listPlaywrightS3Artifacts,
  type PlaywrightArtifactType,
  resolveRunSha,
  type S3ArtifactsResult,
} from '../s3-artifacts.js';

/** Hard cap on any single string field in the response. Prevents a chatty
 * test (huge stdout / multi-MB snippet) from blowing past MCP limits. */
const MAX_FIELD_CHARS = 4000;

/** Numeric-only run IDs — the GH Pages deployment uses nightly-{id} or
 * manual-{id}, so a bare number never matches a deployed report name. */
const NUMERIC_ID_RE = /^\d+$/;

function truncate(input: string | undefined | null): string | null {
  if (input == null) return null;
  if (input.length <= MAX_FIELD_CHARS) return input;
  return (
    input.slice(0, MAX_FIELD_CHARS) +
    `\n...[truncated ${input.length - MAX_FIELD_CHARS} chars]`
  );
}

function chunkText(
  chunks: Array<{ text?: string; buffer?: string }> | undefined,
): string | null {
  if (!chunks || chunks.length === 0) return null;
  const joined = chunks
    .map(
      (c) =>
        c.text ??
        (c.buffer ? Buffer.from(c.buffer, 'base64').toString('utf-8') : ''),
    )
    .join('');
  return truncate(joined);
}

interface AttemptSummary {
  attempt: number;
  status: string;
  durationMs: number | null;
  startTime: string | null;
  error: string | null;
  snippet: string | null;
  errorLocation: string | null;
  stdout: string | null;
  stderr: string | null;
  attachments: Array<{
    name: string | null;
    contentType: string | null;
    path: string | null;
  }>;
}

interface Candidate {
  title: string;
  file: string;
  outcome: string;
  projectName: string | null;
}

const ARTIFACT_TYPE_NOTES: Record<PlaywrightArtifactType, string> = {
  blobs:
    'Presigned URLs expire in 1 hour. Each artifact is a Playwright blob zip containing test results. Use playwright merge-reports or inspect the zip to extract individual test error-context.md / trace.zip files.',
  coverage:
    'Presigned URLs expire in 1 hour. Each artifact is a raw per-spec coverage fragment.',
  output:
    'Presigned URLs expire in 1 hour. Each artifact is a raw Playwright output file.',
};

/** Shared response shape for both the explicit `source: "s3"` path and the
 * automatic credentials-gap fallback (LS-9592) — the two differ only in
 * whether `reason` explains why S3 was used instead of GH Pages. */
function buildS3TestResultResponse(params: {
  sha: string;
  runId: number | null;
  artifactType: PlaywrightArtifactType;
  s3Result: S3ArtifactsResult;
  testTitleFilter: string | null;
  fileNameFilter: string | null;
  reason?: string;
}): Record<string, unknown> {
  const {
    sha,
    runId,
    artifactType,
    s3Result,
    testTitleFilter,
    fileNameFilter,
    reason,
  } = params;
  const ghPagesName = runId != null ? `nightly-${runId}` : null;
  return {
    source: 's3' as const,
    ...(reason ? { reason } : {}),
    runId,
    sha,
    artifactType,
    ghPagesReportName: ghPagesName,
    ghPagesNote: ghPagesName
      ? `If the nightly GH Pages report was deployed, try ci_get_playwright_test_result with reportName="${ghPagesName}".`
      : undefined,
    s3Prefix: s3Result.s3Prefix,
    artifactCount: s3Result.artifacts.length,
    empty: s3Result.empty,
    emptyNote: s3Result.empty
      ? `No ${artifactType} artifacts found. S3 objects expire after 3 days — this run may be too old.`
      : undefined,
    testTitleFilter,
    fileNameFilter,
    note: ARTIFACT_TYPE_NOTES[artifactType],
    artifacts: s3Result.artifacts,
  };
}

interface GitHubPullRequest {
  head: { sha: string };
}

/**
 * Resolve the commit SHA to use for the automatic S3 fallback (LS-9592),
 * from whichever identifier the caller originally supplied. Mirrors
 * `resolveShaForS3Fallback` in get-playwright-report.ts, adapted to this
 * tool's params (no `prNumber`, but `reportName` is often "pr-N").
 * Returns null when no SHA can be resolved, so the caller falls through to
 * its existing error handling unchanged.
 */
async function resolveShaForAutoS3Fallback(
  runIdParam: number | string | undefined,
  effectiveReportName: string,
): Promise<{ sha: string; runId: number | null } | null> {
  try {
    if (runIdParam != null) {
      const runId = Number(runIdParam);
      if (!isNaN(runId)) return { sha: await resolveRunSha(runId), runId };
    }
    const prMatch = effectiveReportName.match(/^pr-(\d+)$/);
    if (prMatch) {
      const pr = await githubGet<GitHubPullRequest>(`/pulls/${prMatch[1]}`);
      return { sha: pr.head.sha, runId: null };
    }
    const runMatch = effectiveReportName.match(/^(?:nightly|manual)-(\d+)$/);
    if (runMatch) {
      const runId = Number(runMatch[1]);
      return { sha: await resolveRunSha(runId), runId };
    }
    if (NUMERIC_ID_RE.test(effectiveReportName)) {
      const runId = Number(effectiveReportName);
      return { sha: await resolveRunSha(runId), runId };
    }
  } catch {
    // Resolution failed — caller falls through to the generic GH-Pages error.
  }
  return null;
}

interface TestResultResponse {
  matched: boolean;
  reportName: string;
  url: string;
  candidates?: Candidate[];
  test?: {
    title: string;
    file: string;
    outcome: string;
    projectName: string | null;
    location: string | null;
    retries: number;
    attempts: AttemptSummary[];
  };
  message?: string;
}

function summariseAttempt(
  result: PlaywrightTestResult,
  index: number,
): AttemptSummary {
  const firstError = result.errors?.find(
    (e) => e.message || e.value || e.snippet,
  );
  const loc = firstError?.location;
  const errorLocation =
    loc && loc.file
      ? `${loc.file}${loc.line != null ? `:${loc.line}` : ''}${loc.column != null ? `:${loc.column}` : ''}`
      : null;
  return {
    attempt: result.retry ?? index,
    status: result.status,
    durationMs: result.duration ?? null,
    startTime: result.startTime ?? null,
    error: truncate(firstError?.message ?? firstError?.value ?? null),
    snippet: truncate(firstError?.snippet ?? null),
    errorLocation,
    stdout: chunkText(result.stdout),
    stderr: chunkText(result.stderr),
    attachments: (result.attachments ?? []).map((a) => ({
      name: a.name ?? null,
      contentType: a.contentType ?? null,
      path: a.path ?? null,
    })),
  };
}

export async function getPlaywrightTestResult(params: {
  reportName?: string;
  runId?: number | string;
  testTitle?: string;
  fileName?: string;
  testFile?: string;
  source?: 'gh-pages' | 's3';
  artifactType?: PlaywrightArtifactType;
  maxChars?: number;
}): Promise<ToolResult> {
  const {
    reportName,
    runId: runIdParam,
    testTitle,
    fileName,
    testFile,
    source = 'gh-pages',
    artifactType = 'blobs',
  } = params;

  // reportName and runId are alternative ways to identify the report; fileName
  // and testFile are alternative names for the same spec-file filter (LS-8888:
  // the <integration-results> webhook payload only ever gives runId + spec
  // file path, never a resolved report name or exact test title).
  const effectiveReportName =
    reportName ?? (runIdParam != null ? String(runIdParam) : undefined);
  const effectiveFileName = fileName ?? testFile;

  // Presence of reportName/runId and testTitle/fileName/testFile is enforced
  // by the inputSchema superRefine in index.ts for the MCP tool call path.
  // This function is also called directly (unit tests, and any future caller
  // that bypasses the MCP layer), so the checks stay here too — dropping them
  // would leave effectiveReportName typed as `string | undefined` for the
  // rest of the function, which does not type-check against the `string`
  // fields TestResultResponse declares.
  if (!effectiveReportName) {
    return {
      isError: true,
      content: [
        { type: 'text', text: 'One of reportName or runId is required.' },
      ],
    };
  }
  if (!/^[\w.-]+$/.test(effectiveReportName)) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'reportName/runId must contain only alphanumeric characters, hyphens, underscores, and dots — no path separators or special characters allowed',
        },
      ],
    };
  }
  if (!testTitle && !effectiveFileName) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'One of testTitle or fileName/testFile is required to identify which test(s) to look up.',
        },
      ],
    };
  }

  // S3 mode: resolve HEAD SHA from the run ID, list blob artifacts, return
  // presigned URLs. Does not attempt GH Pages at all.
  if (source === 's3') {
    const runId = parseInt(effectiveReportName, 10);
    if (isNaN(runId) || !NUMERIC_ID_RE.test(effectiveReportName)) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'source=s3 requires reportName/runId to be a numeric GitHub run ID (e.g. "28115361551").',
          },
        ],
      };
    }

    let sha: string;
    try {
      sha = await resolveRunSha(runId);
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Failed to resolve run ${runId} to a commit SHA: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }

    let s3Result;
    try {
      s3Result = await listPlaywrightS3Artifacts(sha, artifactType);
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Failed to list S3 artifacts for SHA ${sha}: ${err instanceof Error ? err.message : String(err)}. Ensure the Lambda execution role has s3:ListBucket and s3:GetObject on the ci-artifacts bucket.`,
          },
        ],
      };
    }

    const response = buildS3TestResultResponse({
      sha,
      runId,
      artifactType,
      s3Result,
      testTitleFilter: testTitle ?? null,
      fileNameFilter: effectiveFileName ?? null,
    });

    return {
      content: [{ type: 'text', text: minifiedJson(response) }],
    };
  }

  // GH Pages mode (default): try the supplied name directly; if it is a
  // bare numeric run ID, also try the nightly-{id} and manual-{id} variants
  // that CI actually deploys under.
  const namesToTry: string[] = [effectiveReportName];
  if (NUMERIC_ID_RE.test(effectiveReportName)) {
    namesToTry.push(
      `nightly-${effectiveReportName}`,
      `manual-${effectiveReportName}`,
    );
  }

  let report;
  let resolvedName = effectiveReportName;
  for (const name of namesToTry) {
    const candidate = await fetchPlaywrightReport(name);
    if (!('error' in candidate)) {
      report = candidate;
      resolvedName = name;
      break;
    }
    // Keep trying; store last error in case all fail.
    report = candidate;
  }

  if (!report || 'error' in report) {
    // When the GH Pages fetch failed because this session lacks
    // PREVIEW_APP_PRIVATE_KEY/PREVIEW_APP_ID (a credentials gap, not a
    // missing report — LS-9592), automatically fall back to listing the raw
    // S3 blob artifacts instead of dead-ending, mirroring the fallback
    // ci_get_playwright_report already applies for the same root cause.
    if (deploysTokenWasFallback()) {
      const resolved = await resolveShaForAutoS3Fallback(
        runIdParam,
        effectiveReportName,
      );
      if (resolved) {
        try {
          const s3Result = await listPlaywrightS3Artifacts(
            resolved.sha,
            artifactType,
          );
          if (!s3Result.empty) {
            const response = buildS3TestResultResponse({
              sha: resolved.sha,
              runId: resolved.runId,
              artifactType,
              s3Result,
              testTitleFilter: testTitle ?? null,
              fileNameFilter: effectiveFileName ?? null,
              reason:
                'GH Pages report fetch failed with a credentials gap ' +
                '(PREVIEW_APP_PRIVATE_KEY/PREVIEW_APP_ID are not configured in ' +
                'this session) — falling back to raw S3 blob artifacts instead ' +
                'of erroring.',
            });
            return {
              content: [{ type: 'text', text: minifiedJson(response) }],
            };
          }
        } catch {
          // S3 listing failed too — fall through to the generic error below.
        }
      }
    }

    const triedNames = namesToTry.join(', ');
    const baseError =
      report && 'error' in report ? report.error : 'Unknown fetch error';
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text:
            `${baseError}\n\nTried report names: ${triedNames}.\n` +
            `If this is an integration nightly run, pass source="s3" with the numeric run ID to fetch from S3 instead.`,
        },
      ],
    };
  }

  const titleNeedle = testTitle?.toLowerCase();
  const fileNeedle = effectiveFileName?.toLowerCase();

  const matches: Array<{ file: PlaywrightTestFile; test: PlaywrightTest }> = [];
  for (const file of report.files ?? []) {
    if (fileNeedle && !file.fileName.toLowerCase().includes(fileNeedle)) {
      continue;
    }
    for (const test of file.tests ?? []) {
      if (!titleNeedle || fullTitle(test).toLowerCase().includes(titleNeedle)) {
        matches.push({ file, test });
      }
    }
  }

  const url = reportUrlFor(resolvedName);
  const describeTarget = titleNeedle
    ? `title "${testTitle}"`
    : `file "${effectiveFileName}"`;

  if (matches.length === 0) {
    const response: TestResultResponse = {
      matched: false,
      reportName: resolvedName,
      url,
      candidates: [],
      message: `No test matched ${describeTarget}${fileNeedle && titleNeedle ? ` in files matching "${effectiveFileName}"` : ''}.`,
    };
    return {
      content: [{ type: 'text', text: minifiedJson(response) }],
    };
  }

  // No testTitle to disambiguate with (runId+testFile lookup, LS-8888): if the
  // file-only match set narrows to exactly one non-passing test, resolve it
  // automatically — that's the test a caller pulling a spec path out of the
  // integration-results webhook is almost always after. Otherwise fall through
  // to the candidates list below same as an ambiguous title match would.
  let resolvedMatches = matches;
  if (!titleNeedle && matches.length > 1) {
    const nonPassing = matches.filter(
      ({ test }) => test.outcome !== 'expected',
    );
    if (nonPassing.length === 1) {
      resolvedMatches = nonPassing;
    }
  }

  if (resolvedMatches.length > 1) {
    const response: TestResultResponse = {
      matched: false,
      reportName: resolvedName,
      url,
      candidates: resolvedMatches.slice(0, 25).map(({ file, test }) => ({
        title: fullTitle(test),
        file: file.fileName,
        outcome: test.outcome,
        projectName: test.projectName ?? null,
      })),
      message:
        `Found ${resolvedMatches.length} tests matching ${describeTarget}. ` +
        (titleNeedle
          ? 'Pass fileName to disambiguate, or use a more specific testTitle.'
          : 'Pass testTitle to disambiguate.'),
    };
    return {
      content: [{ type: 'text', text: minifiedJson(response) }],
    };
  }

  const { file, test } = resolvedMatches[0];
  const loc = test.location;
  const location =
    loc && loc.file
      ? `${loc.file}${loc.line != null ? `:${loc.line}` : ''}${loc.column != null ? `:${loc.column}` : ''}`
      : null;

  const results = test.results ?? [];
  const response: TestResultResponse = {
    matched: true,
    reportName: resolvedName,
    url,
    test: {
      title: fullTitle(test),
      file: file.fileName,
      outcome: test.outcome,
      projectName: test.projectName ?? null,
      location,
      retries: Math.max(0, results.length - 1),
      attempts: results.map((r, i) => summariseAttempt(r, i)),
    },
  };

  return {
    content: [{ type: 'text', text: minifiedJson(response) }],
  };
}
