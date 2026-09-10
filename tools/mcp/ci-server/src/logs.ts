import { inflateRawSync } from 'node:zlib';

import { githubGet, githubGetArrayBuffer } from './github-api.js';

/** ZIP local file header signature (`PK\x03\x04`). */
const LOCAL_FILE_HEADER_SIG = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
/** ZIP central directory file header signature (`PK\x01\x02`) — marks the end of entries. */
const CENTRAL_DIR_SIG = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
/**
 * General-purpose bit flag 3: CRC-32/compressed/uncompressed sizes are zeroed
 * in the local file header and instead stored in a trailing data descriptor
 * written after the entry's data — used when a writer streams an entry
 * without knowing its final size up front (GitHub Actions' log archiver does
 * this for larger job logs). Trusting a zeroed `compressedSize` for such an
 * entry made the parser land on garbage bytes for the next "signature" check
 * and silently `break` out of the loop, dropping every entry from that point
 * on (and everything read so far reported as `truncated: false`) — LS-9229.
 */
const FLAG_DATA_DESCRIPTOR = 0x0008;

// Built from String.fromCharCode rather than a \x1b regex literal: a literal
// ESC control character trips no-control-regex even though it is the exact,
// intentional byte GitHub Actions emits for these escape sequences.
const ESC = String.fromCharCode(27);
/**
 * Matches ANSI CSI escape sequences (LS-9557) — colour/style codes (ending in
 * `m`, e.g. `\x1b[31m`) and cursor-movement sequences some progress renderers
 * emit (ending in other letters, e.g. `\x1b[2K`). Broader than an SGR-only
 * `[0-9;]*m` match so both classes are stripped.
 */
const ANSI_ESCAPE_SEQUENCE = new RegExp(`${ESC}\\[[0-9;]*[A-Za-z]`, 'g');

/**
 * Strip ANSI escape sequences from log text (LS-9557). GitHub Actions log
 * output is heavily colourised — jest/nx output routinely has escape codes
 * adding 40-80% to a line's character length — which both inflates the
 * maxChars budget with non-content bytes and breaks literal pattern matching
 * in ci_search_logs (codes sit between semantically adjacent characters, e.g.
 * splitting "● FootballLeagueId" into "●" + escapes + "FootballLeagueId").
 */
export function stripAnsiCodes(text: string): string {
  return text.replace(ANSI_ESCAPE_SEQUENCE, '');
}

/**
 * Hard cap on a user-supplied regex pattern (ci_search_logs' `pattern`,
 * ci_get_logs' `grep`). Log-search patterns are short by nature; a very long
 * pattern is both unnecessary and a ReDoS smell.
 */
const MAX_PATTERN_LENGTH = 1000;

/**
 * Heuristic guard against catastrophic-backtracking (ReDoS) patterns. Node has
 * no synchronous way to time-box a regex execution, so we reject the pattern
 * *shapes* that cause exponential backtracking before compiling: a parenthesised
 * group that itself contains an unbounded quantifier and is in turn quantified
 * (e.g. `(a+)+`, `(a*)*`, `(a+)*`, `(a+){2,}`). Returns a human-readable reason,
 * or `null` when the pattern is acceptable. Shared by ci_search_logs (only
 * when `isRegex` is set — its literal substring mode carries no backtracking
 * risk) and ci_get_logs' `grep` (always regex).
 */
export function unsafePatternReason(pattern: string): string | null {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return `pattern too long (${pattern.length} > ${MAX_PATTERN_LENGTH} characters)`;
  }
  // A group containing an unbounded quantifier (`+`, `*`, or `{`), immediately
  // followed by another unbounded quantifier — the classic ReDoS shape.
  const nestedQuantifier = /\([^()]*[+*{][^()]*\)[+*{]/;
  if (nestedQuantifier.test(pattern)) {
    return 'pattern contains nested quantifiers (possible ReDoS); simplify the pattern or set isRegex=false for a literal substring search';
  }
  return null;
}

export interface FetchRunLogsParams {
  runId?: number;
  jobId?: number;
  failedOnly?: boolean;
  attempt?: number;
  jobName?: string;
  /**
   * When true, `jobName` must exactly (case-insensitively) match a job name
   * — substring fallback is disabled. Use to force disambiguation without
   * needing to know the numeric jobId (LS-9578).
   */
  exact?: boolean;
  /** Optional abort signal — aborts in-flight log downloads when triggered. */
  signal?: AbortSignal;
}

/**
 * Maximum number of failed jobs for which logs are fetched in a single call.
 * Large matrix workflows (e.g. DB integration tests) can have dozens of failed
 * jobs; fetching all of them easily exceeds the Lambda 30 s timeout. When the
 * cap is hit, the response notes how many jobs were skipped so the caller can
 * narrow the query with jobName or jobId.
 */
const MAX_LOG_JOBS = 10;

/**
 * Cap on priority-matcher lines collected across a whole run's logs (LS-8391).
 * Bounds memory for a pathological log with an unusually large number of
 * matches; real jest failure summaries are far smaller than this.
 */
export const PRIORITY_LINES_CAP = 300;

interface GitHubJobStep {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
}

export interface GitHubJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  steps?: GitHubJobStep[];
}

interface GitHubJobsResponse {
  total_count: number;
  jobs: GitHubJob[];
}

/**
 * Friendly message for jobs that failed before any step executed (e.g. runner
 * provisioning failure, hosted-runner billing/spending limit, or a GitHub
 * Actions incident). GitHub's log-blob endpoint 404s for these jobs since no
 * log archive was ever produced; without this, callers see a raw Azure Blob
 * Storage XML 404 body that reads like an MCP bug (LS-7910).
 */
export const JOB_NEVER_STARTED_MESSAGE =
  'Job failed before any step executed -- no logs exist. This usually means runner provisioning failed (self-hosted runner offline, hosted-runner billing/spending limit, or a GitHub Actions incident).';

/** True for the "GitHub API 404: ..." error thrown by githubGetArrayBuffer/githubGet on a 404 response. */
function isBlobNotFound404(err: unknown): boolean {
  return err instanceof Error && /^GitHub API 404:/.test(err.message);
}

/**
 * Fetch a single job's detail (including its `steps` array) directly by id.
 * Used on the 404 log-fetch path to distinguish "job never started" from a
 * genuine missing-log error, and (LS-9556) on a bare-jobId errorSummary call
 * to get step-conclusion data for scoping — a run-scoped call already has
 * this from the jobs-list response and skips this lookup entirely.
 */
async function fetchJobDetail(
  jobId: number,
  signal?: AbortSignal,
): Promise<GitHubJob> {
  return githubGet<GitHubJob>(`/actions/jobs/${jobId}`, undefined, {
    signal,
  });
}

/**
 * Whether a job whose log fetch just 404'd has an empty (or missing) `steps`
 * array — i.e. it never started. Swallows job-detail lookup failures (treated
 * as "has steps" / unknown) so callers fall back to the original 404 error.
 */
async function jobNeverStarted(
  jobId: number,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const job = await fetchJobDetail(jobId, signal);
    return !job.steps || job.steps.length === 0;
  } catch {
    return false;
  }
}

/** Maximum number of concurrent log fetches to avoid OOM and rate limiting. */
const LOG_FETCH_CONCURRENCY = 5;

/** Maximum uncompressed size per ZIP entry (50 MB) to prevent resource exhaustion. */
const MAX_UNCOMPRESSED_ENTRY_BYTES = 50 * 1024 * 1024;

/**
 * Hard ceiling on a single job's downloaded log archive (LS-9708). Checked
 * against the raw response buffer immediately after download, before any
 * ZIP parsing or decompression is attempted.
 *
 * This is the actual root-cause fix for the 502s reported in LS-9708:
 * previously there was no such ceiling anywhere on the log-reading path, so
 * a job whose log archive was large enough to make full decompression +
 * string concatenation slow (or memory-heavy) would run that expensive work
 * unconditionally — regardless of how tightly the caller bounded maxLines/
 * maxChars/errorSummary — and could blow past this Lambda's 30s hard
 * timeout (see lambda-budget.ts) before ever returning, which surfaces to
 * the caller as a raw, unparseable Cloudflare "origin_bad_gateway" 502
 * rather than a clean, catchable error. 20 MB comfortably covers real-world
 * job logs (the LS-9708 repro job was ~409 KB; this tool must also succeed
 * on logs of at least 1 MB per that ticket's AC1) while keeping worst-case
 * decompression work bounded well inside the Lambda's timeout.
 */
export const MAX_LOG_BLOB_BYTES = 20 * 1024 * 1024;

/**
 * Thrown by {@link streamJobLog} when a job's downloaded log archive exceeds
 * {@link MAX_LOG_BLOB_BYTES} — LS-9708 AC6: when a size ceiling must remain,
 * fail with an explicit, actionable message naming the ceiling and pointing
 * at the working fallback, never a bare gateway 502.
 */
export class LogTooLargeError extends Error {
  constructor(jobId: number, byteLength: number) {
    const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
    super(
      `Job ${jobId}'s log archive is ${mb(byteLength)} MB, over the ${mb(MAX_LOG_BLOB_BYTES)} MB ` +
        'ceiling this tool can process without risking a Lambda timeout (which surfaces as a bare ' +
        'gateway 502 instead of a clean error). Use ' +
        `mcp__github__get_job_logs({ owner, repo, job_id: ${jobId}, return_content: true, tail_lines: N }) ` +
        'instead — it handles arbitrarily large logs, and the harness auto-persists oversized results ' +
        'to a file you can grep/slice locally.',
    );
    this.name = 'LogTooLargeError';
  }
}

/**
 * Find the end of a streamed entry's data: the offset of the next local file
 * header or the start of the central directory, whichever comes first, or
 * the end of the buffer if neither appears (last entry, archive truncated).
 */
function findStreamedEntryEnd(data: Buffer, from: number): number {
  const nextLocal = data.indexOf(LOCAL_FILE_HEADER_SIG, from);
  const nextCentral = data.indexOf(CENTRAL_DIR_SIG, from);
  const candidates = [nextLocal, nextCentral].filter((i) => i !== -1);
  return candidates.length > 0 ? Math.min(...candidates) : data.length;
}

/**
 * One entry extracted from a ZIP archive, keeping its raw decompressed bytes
 * instead of forcing a UTF-8 decode — used by callers that need to preserve
 * binary content (e.g. writing an Actions artifact's files back to disk
 * unchanged) rather than read it as log text.
 */
export interface RawZipEntry {
  name: string;
  data: Buffer;
}

/**
 * One entry parsed from a ZIP archive's local file headers, with
 * decompression deferred to `decompress()` instead of performed eagerly.
 * Lets a streaming consumer (see {@link streamZipEntryLines}) decide
 * per-entry whether to pay the decompression cost at all — e.g. skipping
 * every entry outside an errorSummary's failing-step scope without ever
 * inflating their bytes (LS-9708).
 */
interface LazyZipEntry {
  name: string;
  decompress: () => Buffer;
}

/**
 * Parse a ZIP archive's local file headers one entry at a time, yielding
 * each entry's name immediately and deferring decompression to the
 * returned `decompress()` thunk. Uses Node built-in zlib (inflateRawSync)
 * to decompress individual ZIP entries. Skips entries whose declared
 * uncompressed size exceeds MAX_UNCOMPRESSED_ENTRY_BYTES. GitHub Actions
 * names each job-log entry `<step-number>_<step-name>.txt`, which
 * step-scoping (LS-9556, LS-9708) relies on to slice a job's log down to
 * only the step that failed; Actions artifact ZIPs (a different producer)
 * use the uploaded file's own relative path as the entry name instead.
 */
function* iterateRawZipEntriesLazy(
  buffer: ArrayBuffer,
): Generator<LazyZipEntry> {
  const data = Buffer.from(buffer);

  // Parse ZIP local file headers (signature 0x04034b50)
  let offset = 0;
  while (offset + 30 <= data.length) {
    // Check for local file header signature
    if (data.readUInt32LE(offset) !== 0x04034b50) break;

    const generalPurposeBitFlag = data.readUInt16LE(offset + 6);
    const compressionMethod = data.readUInt16LE(offset + 8);
    const headerCompressedSize = data.readUInt32LE(offset + 18);
    const uncompressedSize = data.readUInt32LE(offset + 22);
    const fileNameLength = data.readUInt16LE(offset + 26);
    const extraFieldLength = data.readUInt16LE(offset + 28);

    const nameStart = offset + 30;
    const nameEnd = nameStart + fileNameLength;
    if (nameEnd > data.length) {
      // Malformed header: fileNameLength claims more bytes than remain in
      // the buffer. Nothing past this point in the archive can be trusted,
      // so stop parsing instead of reading with an out-of-range offset
      // (legacy-sports-review-bot, LS-9229).
      break;
    }
    const name = data.subarray(nameStart, nameEnd).toString('utf-8');
    const dataOffset = nameEnd + extraFieldLength;
    if (dataOffset > data.length) break;

    // Streamed entries (bit 3) have zeroed sizes in the local header — the
    // header field can't be trusted, so locate the boundary by scanning
    // forward for the next entry instead.
    const streamed = (generalPurposeBitFlag & FLAG_DATA_DESCRIPTOR) !== 0;
    const entryEnd = streamed
      ? findStreamedEntryEnd(data, dataOffset)
      : dataOffset + headerCompressedSize;
    const compressedSize = streamed
      ? entryEnd - dataOffset
      : headerCompressedSize;

    if (compressedSize > 0 && entryEnd <= data.length) {
      if (!streamed && uncompressedSize > MAX_UNCOMPRESSED_ENTRY_BYTES) {
        process.stderr.write(
          `[ci-server] skipping ZIP entry: uncompressed size ${uncompressedSize} exceeds ${MAX_UNCOMPRESSED_ENTRY_BYTES} byte limit\n`,
        );
      } else {
        const compressedData = data.subarray(dataOffset, entryEnd);
        if (compressionMethod === 8) {
          // Deflated — use inflateRaw. Raw deflate streams are
          // self-terminating, so a streamed entry's trailing data
          // descriptor bytes (included in `compressedData` since its real
          // length is unknown) are harmlessly ignored past the stream end.
          yield {
            name,
            decompress: () =>
              inflateRawSync(compressedData, {
                maxOutputLength: MAX_UNCOMPRESSED_ENTRY_BYTES,
              }),
          };
        } else if (compressionMethod === 0) {
          // Stored (no compression) — `compressedData`'s bounds come from
          // `entryEnd`, which for a streamed entry is located by scanning
          // forward for the next entry signature (findStreamedEntryEnd),
          // not from the (zeroed, untrustworthy) header size fields. That
          // makes the bytes just as trustworthy for a streamed stored
          // entry as for a non-streamed one — an earlier `&& !streamed`
          // guard here silently dropped every streamed+stored entry
          // (neither this branch nor the deflate branch above claimed it),
          // losing that step's log output entirely with no warning
          // (LS-9748): a search against a job whose failing step happened
          // to be archived this way would report 0 matches — full
          // coverage, matches genuinely absent — when the content was
          // simply never extracted.
          yield { name, decompress: () => Buffer.from(compressedData) };
        }
      }
    }

    offset = entryEnd;
  }
}

/**
 * Extract every entry (name + raw decompressed bytes) from a ZIP archive
 * buffer, eagerly. Built on {@link iterateRawZipEntriesLazy}; kept for
 * callers (e.g. download-artifact.ts) that genuinely need every entry's
 * bytes materialized at once, unlike the streaming job-log path (LS-9708)
 * which decompresses only the entries it actually needs.
 */
export function extractZipEntriesRaw(buffer: ArrayBuffer): RawZipEntry[] {
  const entries: RawZipEntry[] = [];
  for (const lazy of iterateRawZipEntriesLazy(buffer)) {
    try {
      entries.push({ name: lazy.name, data: lazy.decompress() });
    } catch {
      // Skip entries that fail to decompress
    }
  }
  return entries;
}

/** Parse the leading `<n>_` step-number prefix from a ZIP entry name (e.g.
 * "3_Lint.txt" -> 3). Returns null when the name doesn't follow this
 * convention (defensive — callers fall back to no step-scoping). */
function stepNumberFromEntryName(name: string): number | null {
  const match = /^(\d+)_/.exec(name);
  return match ? Number(match[1]) : null;
}

/**
 * Reduce a job's `steps` (LS-9556) to the set of step numbers GitHub marked
 * `conclusion: "failure"`. Returns undefined when step data is unavailable
 * or no step is marked "failure" — callers treat that as "no scoping",
 * i.e. process the whole job log, same as a cancelled job with no distinct
 * failing step.
 */
function failingStepNumbers(
  steps: GitHubJobStep[] | undefined,
): Set<number> | undefined {
  if (!steps || steps.length === 0) return undefined;
  const failingNumbers = new Set(
    steps.filter((s) => s.conclusion === 'failure').map((s) => s.number),
  );
  return failingNumbers.size > 0 ? failingNumbers : undefined;
}

/**
 * Stream a ZIP archive's job-log lines to `onLine`, one line at a time,
 * without ever holding the fully-decompressed log as a single string
 * (LS-9708 — the actual root-cause fix: previously every entry was
 * decompressed and concatenated into one giant string *before* any
 * maxLines/maxChars/errorSummary bound was ever applied, so that expensive
 * step ran unconditionally regardless of how tightly the caller bounded the
 * output).
 *
 * When `stepNumbers` is given and non-empty, this first does a cheap,
 * decompression-free scan of entry *names* (LS-9556 step-scoping, ported to
 * the streaming path) to check whether any entry's step-number prefix is in
 * the set. If so, only those entries are decompressed at all — every other
 * step's bytes (runner bootstrap, checkout, unrelated tool output) are
 * never inflated. If no entry matches (e.g. a cancelled job with no step
 * marked failure), falls back to processing every entry, matching the
 * legacy `scopeEntriesToFailingSteps` fallback behavior exactly.
 *
 * Scoped mode joins matched entries' text with an explicit `\n` between
 * them (mirroring the legacy join('\n') across matched entries); unscoped
 * mode concatenates entries with no separator, mirroring the legacy
 * `entries.map(e => e.text).join('')` — the two together reproduce the
 * exact same line sequence the old eager join-then-split code produced, so
 * every line-numbering / totalLines expectation stays valid.
 */
function streamZipEntryLines(
  buffer: ArrayBuffer,
  onLine: (line: string) => void,
  stepNumbers?: Set<number>,
): void {
  let activeScope: Set<number> | undefined;
  if (stepNumbers && stepNumbers.size > 0) {
    for (const lazy of iterateRawZipEntriesLazy(buffer)) {
      const n = stepNumberFromEntryName(lazy.name);
      if (n !== null && stepNumbers.has(n)) {
        activeScope = stepNumbers;
        break;
      }
    }
  }

  let pending = '';
  let processedAny = false;
  for (const lazy of iterateRawZipEntriesLazy(buffer)) {
    if (activeScope) {
      const n = stepNumberFromEntryName(lazy.name);
      if (n === null || !activeScope.has(n)) continue;
    }
    let text: string;
    try {
      text = lazy.decompress().toString('utf-8');
    } catch {
      continue;
    }
    const chunk = activeScope && processedAny ? '\n' + text : text;
    processedAny = true;
    const combined = pending + chunk;
    const parts = combined.split(/\r?\n/);
    pending = parts.pop() ?? '';
    for (const line of parts) onLine(line);
  }
  onLine(pending);
}

/**
 * Download a job's log archive and stream its lines to `onLine` without
 * ever holding the full decoded log text as one string (LS-9708). Enforces
 * {@link MAX_LOG_BLOB_BYTES} on the raw downloaded buffer *before* any ZIP
 * parsing or decompression is attempted — the actual fix for the reported
 * 502s, which throws a clear {@link LogTooLargeError} instead of risking a
 * Lambda-timeout gateway error. `stepNumbers`, when given, scopes
 * processing to the matching ZIP entries (see {@link streamZipEntryLines});
 * omit it for calls (plain ci_get_logs / ci_search_logs, no errorSummary)
 * that must see the whole log.
 */
async function streamJobLog(
  jobId: number,
  signal: AbortSignal | undefined,
  onLine: (line: string) => void,
  stepNumbers?: Set<number>,
): Promise<void> {
  const buffer = await githubGetArrayBuffer(`/actions/jobs/${jobId}/logs`, {
    signal,
  });
  if (buffer.byteLength > MAX_LOG_BLOB_BYTES) {
    throw new LogTooLargeError(jobId, buffer.byteLength);
  }
  // The response may be a ZIP archive or plain text depending on the server.
  // Check for ZIP magic bytes (PK\x03\x04).
  const header = new Uint8Array(buffer.slice(0, 4));
  const isZip =
    header[0] === 0x50 &&
    header[1] === 0x4b &&
    header[2] === 0x03 &&
    header[3] === 0x04;
  if (isZip) {
    streamZipEntryLines(buffer, onLine, stepNumbers);
    return;
  }
  // Not a ZIP — treat as plain text, no step-scoping possible (matches the
  // legacy synthetic single-entry behavior, whose name never carries a
  // step-number prefix so scoping always no-oped for this case anyway).
  const text = Buffer.from(buffer).toString('utf-8');
  for (const line of text.split(/\r?\n/)) onLine(line);
}

/**
 * Fetch log text for a single job by streaming its lines and rejoining them
 * with `\n` (LS-9708) — same observable output as the legacy eager
 * concatenate-then-return, but routed through {@link streamJobLog} so this
 * path also gets the size ceiling and the streaming decompression.
 */
async function fetchJobLogs(
  jobId: number,
  signal?: AbortSignal,
): Promise<string> {
  const lines: string[] = [];
  await streamJobLog(jobId, signal, (line) => lines.push(line));
  return lines.join('\n');
}

/**
 * Fetch all jobs for a workflow run, handling pagination.
 * The GitHub API returns at most 100 jobs per page; this loops until all are fetched.
 */
async function fetchAllJobs(
  runId: number,
  attemptSuffix: string,
  signal?: AbortSignal,
): Promise<GitHubJob[]> {
  const allJobs: GitHubJob[] = [];
  let page = 1;

  for (;;) {
    const jobsData = await githubGet<GitHubJobsResponse>(
      `/actions/runs/${runId}${attemptSuffix}/jobs`,
      { per_page: '100', page: String(page) },
      { signal },
    );

    allJobs.push(...jobsData.jobs);

    // If we got fewer than 100 or have all jobs, stop paginating
    if (jobsData.jobs.length < 100 || allJobs.length >= jobsData.total_count) {
      break;
    }
    page++;
  }

  return allJobs;
}

/**
 * Process jobs in batches to limit concurrency and avoid OOM / rate limiting.
 */
async function fetchJobLogsBatched(
  jobs: GitHubJob[],
  concurrency: number,
  signal?: AbortSignal,
): Promise<string[]> {
  const results: string[] = [];

  for (let i = 0; i < jobs.length; i += concurrency) {
    const batch = jobs.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (job) => {
        try {
          const text = await fetchJobLogs(job.id, signal);
          return `${job.name}\n${text}`;
        } catch (err) {
          if (
            isBlobNotFound404(err) &&
            (!job.steps || job.steps.length === 0)
          ) {
            return `${job.name}\n${JOB_NEVER_STARTED_MESSAGE}`;
          }
          if (err instanceof LogTooLargeError) {
            return `${job.name}\n${err.message}`;
          }
          const reason = isAbortError(err) ? 'timed out' : 'failed';
          return `${job.name}\n(Log fetch ${reason} for this job)`;
        }
      }),
    );
    results.push(...batchResults);
  }

  return results;
}

/** Returns true for AbortError / TimeoutError (DOMException name variants). */
function isAbortError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.name === 'AbortError' || err.name === 'TimeoutError';
  }
  return false;
}

/**
 * Thrown by {@link resolveJobsByName} when `jobName` matches more than one
 * job (LS-9578) — job names in this repo overlap heavily by design (e.g.
 * "test" is a substring of several distinct job names), so silently picking
 * one and returning its result as if it were authoritative produced a real
 * wrong diagnosis (LS-9529 / PR #7235: a runner-provisioning-failure summary
 * for a completely unrelated job). Callers must disambiguate with jobId, the
 * exact job name, or `exact: true`.
 */
export class AmbiguousJobNameError extends Error {
  candidates: Array<{ id: number; name: string }>;

  constructor(jobName: string, candidates: GitHubJob[]) {
    super(
      `jobName "${jobName}" matches ${candidates.length} jobs: ${candidates
        .map((j) => `"${j.name}" (id ${j.id})`)
        .join(
          ', ',
        )}. Pass jobId, the exact job name, or exact: true with a name that matches exactly one job to disambiguate.`,
    );
    this.name = 'AmbiguousJobNameError';
    this.candidates = candidates.map((j) => ({ id: j.id, name: j.name }));
  }
}

/**
 * Resolve `jobName` against a run's full job list (LS-9578). A
 * case-insensitive exact full-name match is always preferred; substring
 * matching is only used as a fallback when no exact match exists. When more
 * than one job matches at either stage, throws {@link AmbiguousJobNameError}
 * listing every candidate instead of silently returning one of them.
 *
 * Must be called against the run's *full* job list, before any
 * `failedOnly` filtering — resolving against an already-filtered list hides
 * candidates that would otherwise make the match ambiguous (the exact bug
 * this fixes: the intended job had succeeded and was filtered out first,
 * leaving a single unrelated failed job as an unflagged "match").
 */
export function resolveJobsByName(
  jobs: GitHubJob[],
  jobName: string,
  exact = false,
): GitHubJob[] {
  const nameLower = jobName.toLowerCase();

  const exactMatches = jobs.filter((j) => j.name.toLowerCase() === nameLower);
  if (exactMatches.length === 1) return exactMatches;
  if (exactMatches.length > 1) {
    throw new AmbiguousJobNameError(jobName, exactMatches);
  }
  if (exact) return [];

  const substringMatches = jobs.filter((j) =>
    j.name.toLowerCase().includes(nameLower),
  );
  if (substringMatches.length > 1) {
    throw new AmbiguousJobNameError(jobName, substringMatches);
  }
  return substringMatches;
}

/** Result of {@link fetchRunLogs} — log text plus how much of the run it actually covered. */
export interface FetchRunLogsResult {
  text: string;
  /** Number of jobs whose logs were actually fetched and included in `text`. */
  jobsSearched: number;
  /** Total number of jobs in the run's scope (post jobName filter, pre failedOnly/MAX_LOG_JOBS filtering). */
  jobsTotal: number;
  /**
   * True when `failedOnly` (the default) filtered every job out of scope —
   * i.e. jobs existed but none were non-successful — as opposed to a run
   * with genuinely zero jobs. Callers should not treat a zero-match search
   * result as "pattern absent" when this is true.
   */
  skippedByFailedOnly: boolean;
  /**
   * Every job in scope that was NOT searched, with a human-readable reason
   * (LS-9748) — named explicitly rather than only counted, so a caller (or
   * the agent reading `ci_search_logs`' output) can see exactly which jobs a
   * `truncated: true` / partial-coverage result left uncovered instead of
   * just a count. Empty/absent when `jobsSearched === jobsTotal`.
   */
  skippedJobs?: Array<{ name: string; reason: string }>;
  /**
   * The single job `jobName` resolved to, echoed back so a caller can see
   * exactly which job answered the query (LS-9578) — present only when
   * `jobName` was given and resolved to exactly one job.
   */
  resolvedJobName?: string;
  resolvedJobId?: number;
}

/**
 * Fetch logs for a workflow run or a specific job.
 *
 * When `jobId` is provided, fetches logs for that single job.
 * When `failedOnly` is true (default), fetches logs only for non-successful jobs
 * (failure, cancelled, timed_out, startup_failure, etc.).
 * Otherwise, fetches logs for all jobs in the run.
 *
 * Each job's logs are prefixed with its name for identification,
 * matching the format previously produced by `gh run view --log`.
 */
export async function fetchRunLogs(
  params: FetchRunLogsParams,
): Promise<FetchRunLogsResult> {
  // Single job requested — fetch directly. A directly-targeted jobId is
  // never filtered by failedOnly, so scope is always exactly that one job.
  if (params.jobId) {
    const text = await fetchJobLogs(params.jobId, params.signal);
    return {
      text,
      jobsSearched: 1,
      jobsTotal: 1,
      skippedByFailedOnly: false,
    };
  }

  if (!params.runId) {
    throw new Error('runId is required when jobId is not provided');
  }

  const attemptSuffix = params.attempt ? `/attempts/${params.attempt}` : '';
  let allJobs = await fetchAllJobs(params.runId, attemptSuffix, params.signal);

  let resolvedJobName: string | undefined;
  let resolvedJobId: number | undefined;
  if (params.jobName) {
    allJobs = resolveJobsByName(allJobs, params.jobName, params.exact);
    if (allJobs.length === 1) {
      resolvedJobName = allJobs[0].name;
      resolvedJobId = allJobs[0].id;
    }
  }

  const failedOnly = params.failedOnly !== false;
  const jobsTotal = allJobs.length;
  const excludedByFailedOnly = failedOnly
    ? allJobs.filter((j) => j.conclusion === 'success')
    : [];
  let jobs = failedOnly
    ? allJobs.filter((j) => j.conclusion !== 'success')
    : allJobs;

  const skippedByFailedOnly = failedOnly && jobsTotal > 0 && jobs.length === 0;
  const failedOnlySkippedJobs = excludedByFailedOnly.map((j) => ({
    name: j.name,
    reason: 'excluded by failedOnly=true (job conclusion: success)',
  }));

  if (jobs.length === 0) {
    return {
      text: failedOnly
        ? 'No failed jobs found in this workflow run.'
        : 'No jobs found in this workflow run.',
      jobsSearched: 0,
      jobsTotal,
      skippedByFailedOnly,
      skippedJobs:
        failedOnlySkippedJobs.length > 0 ? failedOnlySkippedJobs : undefined,
      resolvedJobName,
      resolvedJobId,
    };
  }

  const overCapJobs =
    jobs.length > MAX_LOG_JOBS ? jobs.slice(MAX_LOG_JOBS) : [];
  const skipped = overCapJobs.length;
  if (skipped > 0) jobs = jobs.slice(0, MAX_LOG_JOBS);

  // Fetch logs with concurrency limiting to avoid OOM and rate limiting
  const logEntries = await fetchJobLogsBatched(
    jobs,
    LOG_FETCH_CONCURRENCY,
    params.signal,
  );

  if (skipped > 0) {
    logEntries.push(
      `(${skipped} additional job(s) omitted — use jobName or jobId to fetch specific job logs)`,
    );
  }

  const skippedJobs = [
    ...failedOnlySkippedJobs,
    ...overCapJobs.map((j) => ({
      name: j.name,
      reason: `excluded by the per-call job cap (MAX_LOG_JOBS=${MAX_LOG_JOBS}) — use jobName or jobId to fetch it directly`,
    })),
  ];

  return {
    text: logEntries.join('\n\n'),
    jobsSearched: jobs.length,
    jobsTotal,
    skippedByFailedOnly: false,
    skippedJobs: skippedJobs.length > 0 ? skippedJobs : undefined,
    resolvedJobName,
    resolvedJobId,
  };
}

/**
 * Append one line to a fixed-size ring buffer, dropping the oldest line when full.
 * Trims in batches to keep amortized cost O(1) per line — calling `shift()` per
 * push would be O(n) per call and quadratic across a multi-million-line stream.
 */
function pushLine(buffer: string[], line: string, maxLines: number): void {
  buffer.push(line);
  if (buffer.length > maxLines * 2) {
    buffer.splice(0, buffer.length - maxLines);
  }
}

/** Final trim after streaming completes — leaves exactly the last `maxLines`. */
function trimRingBuffer(buffer: string[], maxLines: number): void {
  if (buffer.length > maxLines) {
    buffer.splice(0, buffer.length - maxLines);
  }
}

/**
 * Fetch logs and collect the last `maxLines` lines (ring buffer).
 * Processes logs per-job incrementally to avoid buffering the entire run in memory.
 *
 * When `priorityMatcher` is provided, every line of the full log is also
 * tested against it (independent of the `maxLines` ring-buffer window) and
 * matches are returned in `priorityLines`, capped at `PRIORITY_LINES_CAP`.
 * This lets callers surface high-signal lines (e.g. jest failure markers,
 * LS-8391) that would otherwise be dropped when they fall outside the
 * ring-buffered tail of a large log.
 */
export async function fetchRunLogsRing(
  params: FetchRunLogsParams,
  maxLines: number,
  priorityMatcher?: (line: string) => boolean,
): Promise<{
  lines: string[];
  totalLines: number;
  skippedJobs?: number;
  priorityLines?: string[];
  /**
   * The single job `params.jobName` resolved to (LS-9578) — present only
   * when `jobName` was given and resolved to exactly one job.
   */
  resolvedJobName?: string;
  resolvedJobId?: number;
}> {
  // Single job — stream lines directly into the ring buffer (LS-9708): no
  // intermediate full-string join, no full-array split. Bounding (the ring
  // buffer, the priority-line cap) is applied line-by-line as the log
  // streams in, not after the whole thing has been materialized.
  if (params.jobId) {
    let stepNumbers: Set<number> | undefined;
    if (priorityMatcher) {
      // errorSummary requested — scope to the failing step (LS-9556). A
      // bare jobId call has no step data yet, so look the job up once,
      // best-effort; step lookup failure falls back to the unscoped log
      // rather than failing the whole call over it.
      try {
        const job = await fetchJobDetail(params.jobId, params.signal);
        stepNumbers = failingStepNumbers(job.steps);
      } catch {
        // best-effort — leave stepNumbers undefined (unscoped)
      }
    }

    const ringBuffer: string[] = [];
    const priorityLines: string[] = [];
    let totalLines = 0;

    try {
      await streamJobLog(
        params.jobId,
        params.signal,
        (line) => {
          pushLine(ringBuffer, line, maxLines);
          totalLines += 1;
          if (
            priorityMatcher &&
            priorityLines.length < PRIORITY_LINES_CAP &&
            priorityMatcher(line)
          ) {
            priorityLines.push(line);
          }
        },
        stepNumbers,
      );
    } catch (err) {
      if (
        isBlobNotFound404(err) &&
        (await jobNeverStarted(params.jobId, params.signal))
      ) {
        return { lines: [JOB_NEVER_STARTED_MESSAGE], totalLines: 1 };
      }
      throw err;
    }

    trimRingBuffer(ringBuffer, maxLines);
    return {
      lines: ringBuffer,
      totalLines,
      priorityLines: priorityMatcher ? priorityLines : undefined,
    };
  }

  if (!params.runId) {
    throw new Error('runId is required when jobId is not provided');
  }

  const attemptSuffix = params.attempt ? `/attempts/${params.attempt}` : '';
  const allJobs = await fetchAllJobs(
    params.runId,
    attemptSuffix,
    params.signal,
  );

  // Resolve jobName against the FULL job list, before failedOnly filtering
  // (LS-9578). Resolving after failedOnly would hide candidates that make
  // the match ambiguous — this was the exact bug: the intended job had
  // succeeded and was filtered out first, leaving a single unrelated failed
  // job as an unflagged "match".
  let scopedJobs = allJobs;
  let resolvedJobName: string | undefined;
  let resolvedJobId: number | undefined;
  if (params.jobName) {
    scopedJobs = resolveJobsByName(allJobs, params.jobName, params.exact);
    if (scopedJobs.length === 1) {
      resolvedJobName = scopedJobs[0].name;
      resolvedJobId = scopedJobs[0].id;
    }
  }

  const failedOnly = params.failedOnly !== false;
  let jobs = failedOnly
    ? scopedJobs.filter((j) => j.conclusion !== 'success')
    : scopedJobs;

  if (jobs.length === 0) {
    const msg = failedOnly
      ? 'No failed jobs found in this workflow run.'
      : 'No jobs found in this workflow run.';
    return { lines: [msg], totalLines: 1, resolvedJobName, resolvedJobId };
  }

  const skippedJobs =
    jobs.length > MAX_LOG_JOBS ? jobs.length - MAX_LOG_JOBS : 0;
  if (skippedJobs > 0) jobs = jobs.slice(0, MAX_LOG_JOBS);

  // Process per-job incrementally: keep a rolling buffer of the last maxLines lines
  const ringBuffer: string[] = [];
  const priorityLines: string[] = [];
  let totalLines = 0;

  for (let i = 0; i < jobs.length; i += LOG_FETCH_CONCURRENCY) {
    const batch = jobs.slice(i, i + LOG_FETCH_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (job) => {
        // Stream this job's lines into its own array (LS-9708) — still
        // per-job bounded (never all jobs' logs held simultaneously, same
        // as before), but no per-job full-string join/split pass either.
        const jobLines: string[] = [];
        try {
          const stepNumbers = priorityMatcher
            ? failingStepNumbers(job.steps)
            : undefined;
          await streamJobLog(
            job.id,
            params.signal,
            (line) => jobLines.push(line),
            stepNumbers,
          );
          return { name: job.name, lines: jobLines };
        } catch (err) {
          if (
            isBlobNotFound404(err) &&
            (!job.steps || job.steps.length === 0)
          ) {
            return { name: job.name, lines: [JOB_NEVER_STARTED_MESSAGE] };
          }
          if (err instanceof LogTooLargeError) {
            return { name: job.name, lines: [err.message] };
          }
          const reason = isAbortError(err) ? 'timed out' : 'failed';
          return {
            name: job.name,
            lines: [`(Log fetch ${reason} for this job)`],
          };
        }
      }),
    );

    for (const { name, lines: jobLines } of batchResults) {
      // Iterate lines without spread: `[...arr]` and `push(...arr)` pass each
      // element as a function argument, which trips the engine's argument-count
      // limit (surfaces as "Maximum call stack size exceeded") for logs with
      // hundreds of thousands of lines.
      pushLine(ringBuffer, name, maxLines);
      totalLines += 1;
      if (
        priorityMatcher &&
        priorityLines.length < PRIORITY_LINES_CAP &&
        priorityMatcher(name)
      ) {
        priorityLines.push(name);
      }

      for (const line of jobLines) {
        totalLines += 1;
        pushLine(ringBuffer, line, maxLines);
        if (
          priorityMatcher &&
          priorityLines.length < PRIORITY_LINES_CAP &&
          priorityMatcher(line)
        ) {
          priorityLines.push(line);
        }
      }
    }
  }

  trimRingBuffer(ringBuffer, maxLines);
  return {
    lines: ringBuffer,
    totalLines,
    skippedJobs: skippedJobs || undefined,
    priorityLines: priorityMatcher ? priorityLines : undefined,
    resolvedJobName,
    resolvedJobId,
  };
}
