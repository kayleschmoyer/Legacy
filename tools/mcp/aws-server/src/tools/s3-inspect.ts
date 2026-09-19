import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { getRepoRoot, runCommand } from '../run-command.js';
import type { ToolResult } from '../types.js';
import { errorResult } from '../aws-error.js';

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** S3's own per-request ceiling for list-objects-v2. */
export const MAX_KEYS = 1000;
/** Default page size for a non-summary list. */
export const DEFAULT_MAX_KEYS = 1000;
/**
 * Page ceiling for summary mode. 250 pages x 1000 keys = 250k keys, comfortably
 * above the 108k-key retrosheet corpus that motivated this tool (LS-10236) while
 * still bounding a runaway scan of an unexpectedly huge prefix.
 */
export const MAX_SUMMARY_PAGES = 250;
/** Objects larger than this are refused by action 'get' — this is a peek tool, not a downloader. */
export const GET_SIZE_CAP_BYTES = 2 * 1024 * 1024;
/** Default number of decoded bytes action 'get' returns. */
export const DEFAULT_GET_MAX_BYTES = 64 * 1024;
/** Hard ceiling for the caller-supplied `maxBytes`. */
export const MAX_GET_MAX_BYTES = 256 * 1024;
/**
 * Decompression ceiling for a gzipped object. Without it a small .gz can expand
 * without bound in memory (zip bomb); zlib throws once output passes this.
 */
export const MAX_GUNZIP_BYTES = 8 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

/** S3 bucket naming rules (DNS-compatible subset): 3-63 chars, lowercase alnum plus `.` and `-`. */
const BUCKET_RE = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
/** Continuation tokens are opaque base64 — allow the base64 and base64url alphabets. */
const CONTINUATION_TOKEN_RE = /^[A-Za-z0-9+/=_-]+$/;
/** S3's own key length limit. */
const MAX_KEY_LENGTH = 1024;

/** Scanned rather than regex-matched: a control-char character class trips `no-control-regex`. */
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function validateBucket(bucket: string): string | null {
  if (!BUCKET_RE.test(bucket) || bucket.includes('..')) {
    return `Invalid bucket "${bucket}": must be 3-63 characters of lowercase alphanumerics, dots, or hyphens, starting and ending with an alphanumeric.`;
  }
  return null;
}

/**
 * Validate a key or prefix. A leading `-` is rejected because the AWS CLI's
 * argument parser treats a `-`-prefixed token as a new option even in the value
 * position, so such a key cannot be passed through at all — failing here with an
 * explanation beats a confusing "expected one argument" from the CLI.
 */
function validateKeyLike(value: string, label: string): string | null {
  if (value.length > MAX_KEY_LENGTH) {
    return `Invalid ${label}: longer than S3's ${MAX_KEY_LENGTH}-character key limit.`;
  }
  if (hasControlChar(value)) {
    return `Invalid ${label}: control characters are not allowed.`;
  }
  if (value.startsWith('-')) {
    return `Invalid ${label}: a leading "-" is not supported — the AWS CLI parses it as an option rather than a value.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Injectable dependencies (keeps the tool unit-testable without AWS or disk)
// ---------------------------------------------------------------------------

export type CommandRunner = (
  command: string,
  args: string[],
  cwd: string,
) => Promise<string>;

export interface S3InspectDeps {
  runner: CommandRunner;
  makeTempDir: () => string;
  readDownload: (path: string) => Buffer;
  cleanup: (dir: string) => void;
}

const defaultDeps: S3InspectDeps = {
  runner: (cmd, args, cwd) => runCommand(cmd, args, cwd),
  makeTempDir: () => mkdtempSync(join(tmpdir(), 'aws-s3-inspect-')),
  readDownload: (path) => readFileSync(path),
  cleanup: (dir) => rmSync(dir, { recursive: true, force: true }),
};

// ---------------------------------------------------------------------------
// AWS response shapes
// ---------------------------------------------------------------------------

interface ListObjectsResponse {
  Contents?: Array<{
    Key?: string;
    LastModified?: string;
    Size?: number;
    StorageClass?: string;
  }>;
  IsTruncated?: boolean;
  NextContinuationToken?: string;
  KeyCount?: number;
}

interface HeadObjectResponse {
  ContentLength?: number;
  LastModified?: string;
  ContentType?: string;
  ContentEncoding?: string;
  ETag?: string;
  StorageClass?: string;
  Metadata?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export type S3InspectAction = 'list' | 'head' | 'get';

export interface S3InspectParams {
  action: S3InspectAction;
  bucket: string;
  prefix?: string;
  key?: string;
  maxKeys?: number;
  continuationToken?: string;
  summary?: boolean;
  maxBytes?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResult(body: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(body) }] };
}

/**
 * The AWS CLI reports a missing object from head-object as
 * `An error occurred (404) when calling the HeadObject operation: Not Found`.
 * A missing key is an answer, not a failure, so callers turn this into
 * `exists: false` rather than an error (LS-10236 AC2).
 */
function isNotFound(message: string): boolean {
  return /\(404\)/.test(message) || /\bNoSuchKey\b/.test(message);
}

/** Parse an AWS CLI JSON response, tolerating the empty string as an empty object. */
function parseAwsJson<T>(output: string): T {
  return (output ? JSON.parse(output) : {}) as T;
}

async function headObject(
  bucket: string,
  key: string,
  deps: S3InspectDeps,
  repoRoot: string,
): Promise<
  | { found: true; data: HeadObjectResponse }
  | { found: false }
  | { error: string }
> {
  try {
    const output = await deps.runner(
      'aws',
      [
        's3api',
        'head-object',
        '--bucket',
        bucket,
        '--key',
        key,
        '--output',
        'json',
      ],
      repoRoot,
    );
    return { found: true, data: parseAwsJson<HeadObjectResponse>(output) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isNotFound(message)) return { found: false };
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// action: list
// ---------------------------------------------------------------------------

function listArgs(
  bucket: string,
  prefix: string | undefined,
  maxKeys: number,
  continuationToken: string | undefined,
): string[] {
  const args = [
    's3api',
    'list-objects-v2',
    '--bucket',
    bucket,
    '--max-keys',
    String(maxKeys),
    '--output',
    'json',
    // Single API call per invocation: the CLI's client-side auto-pagination
    // would otherwise swallow NextContinuationToken, which callers need to
    // resume a large listing across tool calls.
    '--no-paginate',
  ];
  if (prefix !== undefined) args.push('--prefix', prefix);
  if (continuationToken !== undefined) {
    args.push('--continuation-token', continuationToken);
  }
  return args;
}

async function listObjects(
  params: S3InspectParams,
  deps: S3InspectDeps,
  repoRoot: string,
): Promise<ToolResult> {
  const { bucket, prefix, continuationToken } = params;
  const maxKeys = Math.min(
    Math.max(params.maxKeys ?? DEFAULT_MAX_KEYS, 1),
    MAX_KEYS,
  );

  if (params.summary) {
    return summarizeObjects(params, deps, repoRoot, maxKeys);
  }

  try {
    const output = await deps.runner(
      'aws',
      listArgs(bucket, prefix, maxKeys, continuationToken),
      repoRoot,
    );
    const data = parseAwsJson<ListObjectsResponse>(output);
    const objects = (data.Contents ?? []).map((o) => ({
      key: o.Key,
      lastModified: o.LastModified ?? null,
      size: o.Size ?? null,
      storageClass: o.StorageClass ?? null,
    }));
    return jsonResult({
      ok: true,
      action: 'list',
      bucket,
      prefix: prefix ?? null,
      count: objects.length,
      truncated: data.IsTruncated === true,
      nextContinuationToken: data.NextContinuationToken ?? null,
      objects,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(`s3 list ${bucket}/${prefix ?? ''}`, message);
  }
}

/**
 * Summary mode: walk every page of the prefix but keep only aggregates, so a
 * 100k+ key prefix can be characterised (count, size, date range) without the
 * key listing that would blow the response budget.
 */
async function summarizeObjects(
  params: S3InspectParams,
  deps: S3InspectDeps,
  repoRoot: string,
  maxKeys: number,
): Promise<ToolResult> {
  const { bucket, prefix } = params;
  let token = params.continuationToken;
  let count = 0;
  let totalSize = 0;
  let minLastModified: string | null = null;
  let maxLastModified: string | null = null;
  let pagesScanned = 0;

  try {
    do {
      const output = await deps.runner(
        'aws',
        listArgs(bucket, prefix, maxKeys, token),
        repoRoot,
      );
      const data = parseAwsJson<ListObjectsResponse>(output);
      pagesScanned += 1;

      for (const o of data.Contents ?? []) {
        count += 1;
        totalSize += o.Size ?? 0;
        const lm = o.LastModified;
        if (lm !== undefined) {
          if (minLastModified === null || lm < minLastModified) {
            minLastModified = lm;
          }
          if (maxLastModified === null || lm > maxLastModified) {
            maxLastModified = lm;
          }
        }
      }

      token =
        data.IsTruncated === true ? data.NextContinuationToken : undefined;
    } while (token !== undefined && pagesScanned < MAX_SUMMARY_PAGES);

    return jsonResult({
      ok: true,
      action: 'list',
      mode: 'summary',
      bucket,
      prefix: prefix ?? null,
      count,
      totalSize,
      minLastModified,
      maxLastModified,
      pagesScanned,
      // `complete: false` means the page ceiling stopped the scan early — resume
      // from nextContinuationToken to keep counting.
      complete: token === undefined,
      nextContinuationToken: token ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(`s3 list summary ${bucket}/${prefix ?? ''}`, message);
  }
}

// ---------------------------------------------------------------------------
// action: head
// ---------------------------------------------------------------------------

async function headAction(
  bucket: string,
  key: string,
  deps: S3InspectDeps,
  repoRoot: string,
): Promise<ToolResult> {
  const head = await headObject(bucket, key, deps, repoRoot);

  if ('error' in head) {
    return errorResult(`s3 head ${bucket}/${key}`, head.error);
  }
  if (!head.found) {
    // A missing object is a successful answer, not a tool failure (AC2).
    return jsonResult({ ok: true, action: 'head', bucket, key, exists: false });
  }

  const d = head.data;
  return jsonResult({
    ok: true,
    action: 'head',
    bucket,
    key,
    exists: true,
    contentLength: d.ContentLength ?? null,
    lastModified: d.LastModified ?? null,
    contentType: d.ContentType ?? null,
    contentEncoding: d.ContentEncoding ?? null,
    etag: d.ETag ?? null,
    storageClass: d.StorageClass ?? null,
    metadata: d.Metadata ?? {},
  });
}

// ---------------------------------------------------------------------------
// action: get
// ---------------------------------------------------------------------------

/** Heuristic: a NUL byte means the payload is not text we should inline as UTF-8. */
function looksBinary(buf: Buffer): boolean {
  return buf.includes(0);
}

/**
 * Drop a trailing partial UTF-8 sequence left by a byte-offset truncation, so the
 * returned text ends on a whole character instead of a U+FFFD replacement.
 * A UTF-8 sequence is at most 4 bytes, so at most 3 trailing bytes are ever cut.
 */
function trimPartialUtf8(buf: Buffer): Buffer {
  for (let back = 1; back <= 3 && back <= buf.byteLength; back += 1) {
    const byte = buf[buf.byteLength - back];
    // 10xxxxxx is a continuation byte — keep walking back to the lead byte.
    if ((byte & 0b1100_0000) === 0b1000_0000) continue;
    // Lead byte reached: work out how many bytes its sequence needs.
    let needed = 1;
    if ((byte & 0b1111_1000) === 0b1111_0000) needed = 4;
    else if ((byte & 0b1111_0000) === 0b1110_0000) needed = 3;
    else if ((byte & 0b1110_0000) === 0b1100_0000) needed = 2;
    // Complete sequence (or a plain ASCII byte) — nothing to trim.
    return needed <= back ? buf : buf.subarray(0, buf.byteLength - back);
  }
  return buf;
}

async function getAction(
  bucket: string,
  key: string,
  maxBytesParam: number | undefined,
  deps: S3InspectDeps,
  repoRoot: string,
): Promise<ToolResult> {
  const maxBytes = Math.min(
    Math.max(maxBytesParam ?? DEFAULT_GET_MAX_BYTES, 1),
    MAX_GET_MAX_BYTES,
  );

  // Size-gate on HeadObject before transferring anything, so an oversized object
  // is refused rather than downloaded and discarded (AC3).
  const head = await headObject(bucket, key, deps, repoRoot);
  if ('error' in head) {
    return errorResult(`s3 get ${bucket}/${key}`, head.error);
  }
  if (!head.found) {
    return jsonResult({ ok: true, action: 'get', bucket, key, exists: false });
  }

  const contentLength = head.data.ContentLength ?? 0;
  if (contentLength > GET_SIZE_CAP_BYTES) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            action: 'get',
            bucket,
            key,
            contentLength,
            error: `Object is ${contentLength} bytes, above the aws_s3_inspect get cap of ${GET_SIZE_CAP_BYTES} bytes. This action peeks at small objects only — download large objects out of band.`,
          }),
        },
      ],
      isError: true,
    };
  }

  const isGzip =
    key.endsWith('.gz') || head.data.ContentEncoding?.includes('gzip') === true;

  const dir = deps.makeTempDir();
  try {
    const outFile = join(dir, 'object.bin');
    await deps.runner(
      'aws',
      [
        's3api',
        'get-object',
        '--bucket',
        bucket,
        '--key',
        key,
        '--output',
        'json',
        outFile,
      ],
      repoRoot,
    );

    let buf = deps.readDownload(outFile);
    let gunzipped = false;
    if (isGzip) {
      try {
        buf = gunzipSync(buf, { maxOutputLength: MAX_GUNZIP_BYTES });
        gunzipped = true;
      } catch (gzErr) {
        const gzMessage =
          gzErr instanceof Error ? gzErr.message : String(gzErr);
        return errorResult(
          `s3 get ${bucket}/${key} (gunzip)`,
          `${gzMessage}. The object was treated as gzip because of its .gz suffix or ContentEncoding; this fails if it is not valid gzip, or if it decompresses above the ${MAX_GUNZIP_BYTES}-byte ceiling.`,
        );
      }
    }

    const truncated = buf.byteLength > maxBytes;
    const raw = truncated ? buf.subarray(0, maxBytes) : buf;
    const binary = looksBinary(raw);
    const slice = binary || !truncated ? raw : trimPartialUtf8(raw);

    return jsonResult({
      ok: true,
      action: 'get',
      bucket,
      key,
      exists: true,
      contentLength,
      contentType: head.data.ContentType ?? null,
      gunzipped,
      encoding: binary ? 'base64' : 'utf-8',
      bytesReturned: slice.byteLength,
      truncated,
      body: binary ? slice.toString('base64') : slice.toString('utf-8'),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(`s3 get ${bucket}/${key}`, message);
  } finally {
    deps.cleanup(dir);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Read-only S3 inspection: list keys under a prefix, head a single object, or
 * peek at a small one. Uses only s3:ListBucket and s3:GetObject — this tool
 * never writes to, copies, or deletes anything in a bucket (LS-10236 AC4).
 */
export async function s3Inspect(
  params: S3InspectParams,
  deps: Partial<S3InspectDeps> = {},
): Promise<ToolResult> {
  const resolved: S3InspectDeps = { ...defaultDeps, ...deps };
  const repoRoot = getRepoRoot();
  const { action, bucket, prefix, key, continuationToken } = params;

  const bucketError = validateBucket(bucket);
  if (bucketError) return errorResult('s3 inspect', bucketError);

  if (prefix !== undefined) {
    const prefixError = validateKeyLike(prefix, 'prefix');
    if (prefixError) return errorResult('s3 inspect', prefixError);
  }
  if (
    continuationToken !== undefined &&
    !CONTINUATION_TOKEN_RE.test(continuationToken)
  ) {
    return errorResult(
      's3 inspect',
      'Invalid continuationToken: expected the opaque base64 token returned by a previous list call.',
    );
  }

  if (action === 'list') {
    return listObjects(params, resolved, repoRoot);
  }

  if (key === undefined || key === '') {
    return errorResult('s3 inspect', `action "${action}" requires a key.`);
  }
  const keyError = validateKeyLike(key, 'key');
  if (keyError) return errorResult('s3 inspect', keyError);

  return action === 'head'
    ? headAction(bucket, key, resolved, repoRoot)
    : getAction(bucket, key, params.maxBytes, resolved, repoRoot);
}
