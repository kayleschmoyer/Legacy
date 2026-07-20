import { inflateRawSync } from 'node:zlib';
import {
  buildHeaders,
  deploysTokenWasFallback,
  getDeploysToken,
} from './github-api.js';

export const DEPLOYS_REPO = 'bkrupa/legacy-sports-deploys';
export const DEPLOYS_BRANCH = 'gh-pages';

/** Maximum allowed uncompressed size for a ZIP entry (50 MB). */
const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

/** Fetch raw file content from a GitHub repo (returns decoded string).
 *
 * Uses the Contents API to get file metadata; if the file exceeds the 1 MB
 * inline-content limit GitHub will return an empty `content` field but will
 * still populate `download_url`. In that case we follow the raw download URL
 * directly, which has no size cap.
 */
export async function fetchFileContent(
  repo: string,
  path: string,
  ref: string,
): Promise<string> {
  const token = await getDeploysToken();
  const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`;
  const res = await fetch(url, {
    headers: buildHeaders(token),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text();
    const fallbackHint =
      res.status === 404 && repo === DEPLOYS_REPO && deploysTokenWasFallback()
        ? ' (PREVIEW_APP_PRIVATE_KEY/PREVIEW_APP_ID are not configured in this ' +
          'session, so the request used the broad fallback token, which typically ' +
          `lacks read access to the private ${DEPLOYS_REPO} repo — this 404 is a ` +
          'credentials gap, not necessarily a missing/undeployed report.)'
        : '';
    throw new Error(
      `GitHub API ${res.status} fetching ${path}: ${body.slice(0, 300)}${fallbackHint}`,
    );
  }
  const json = (await res.json()) as {
    content?: string;
    encoding?: string;
    download_url?: string;
  };

  if (!json.content || json.content.trim() === '') {
    if (!json.download_url) {
      throw new Error(
        `GitHub Contents API returned no content and no download_url for ${path}`,
      );
    }
    const rawRes = await fetch(json.download_url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'legacy-sports-ci-server',
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!rawRes.ok) {
      const body = await rawRes.text();
      throw new Error(
        `Raw download ${rawRes.status} for ${path}: ${body.slice(0, 300)}`,
      );
    }
    return rawRes.text();
  }

  if (json.encoding !== 'base64') {
    throw new Error(`Unexpected encoding: ${json.encoding}`);
  }
  return Buffer.from(json.content.replace(/\s/g, ''), 'base64').toString(
    'utf-8',
  );
}

export interface ZipEntry {
  name: string;
  data: Buffer;
}

/**
 * Extract named entries from a ZIP buffer.
 * Uses Node built-in zlib (inflateRawSync) for deflate-compressed entries.
 *
 * Returns an error string instead of entries when the archive uses data
 * descriptors (general-purpose bit flag 0x0008 set), which means compressed
 * and uncompressed sizes are not present in the local file header and
 * sequential parsing cannot reliably locate entry boundaries.
 */
export function extractZipEntries(
  buffer: Buffer,
  targetNames: Set<string>,
): ZipEntry[] | { error: string } {
  const entries: ZipEntry[] = [];
  let offset = 0;

  while (offset + 30 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) break;

    const generalPurposeBitFlag = buffer.readUInt16LE(offset + 6);
    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraFieldLength = buffer.readUInt16LE(offset + 28);

    if (generalPurposeBitFlag & 0x0008) {
      return {
        error:
          'ZIP archive uses data descriptors (general-purpose bit 3 set). ' +
          'Compressed/uncompressed sizes are absent from local file headers; ' +
          'sequential parsing is not supported for this format.',
      };
    }

    const fileNameBuf = buffer.subarray(
      offset + 30,
      offset + 30 + fileNameLength,
    );
    const fileName = fileNameBuf.toString('utf-8');
    const dataOffset = offset + 30 + fileNameLength + extraFieldLength;

    if (
      targetNames.has(fileName) &&
      compressedSize > 0 &&
      dataOffset + compressedSize <= buffer.length
    ) {
      if (uncompressedSize > MAX_UNCOMPRESSED_BYTES) {
        return {
          error:
            `ZIP entry "${fileName}" declares an uncompressed size of ` +
            `${uncompressedSize} bytes, which exceeds the ${MAX_UNCOMPRESSED_BYTES}-byte limit.`,
        };
      }

      const compressedData = buffer.subarray(
        dataOffset,
        dataOffset + compressedSize,
      );
      let decompressed: Buffer;
      if (compressionMethod === 0) {
        decompressed = compressedData;
      } else if (compressionMethod === 8) {
        decompressed = inflateRawSync(compressedData, {
          maxOutputLength: uncompressedSize * 2 + 65536,
        });
      } else {
        offset = dataOffset + compressedSize;
        continue;
      }
      entries.push({ name: fileName, data: decompressed });
    }

    offset = dataOffset + compressedSize;
  }

  return entries;
}

// Typed subset of the Playwright report.json format
export interface PlaywrightStats {
  total: number;
  expected: number;
  unexpected: number;
  flaky: number;
  skipped: number;
  ok: boolean;
}

export interface PlaywrightAttachment {
  name?: string;
  contentType?: string;
  path?: string;
  body?: string;
}

export interface PlaywrightTestResult {
  status: string;
  duration?: number;
  retry?: number;
  startTime?: string;
  errors?: Array<{
    message?: string;
    value?: string;
    snippet?: string;
    location?: { file?: string; line?: number; column?: number };
  }>;
  attachments?: PlaywrightAttachment[];
  stdout?: Array<{ text?: string; buffer?: string }>;
  stderr?: Array<{ text?: string; buffer?: string }>;
}

export interface PlaywrightTestAnnotation {
  type: string;
  description?: string;
}

export interface PlaywrightTest {
  testId?: string;
  title: string;
  outcome: string;
  path?: string[];
  location?: { file?: string; line?: number; column?: number };
  projectName?: string;
  annotations?: PlaywrightTestAnnotation[];
  results?: PlaywrightTestResult[];
}

export interface PlaywrightTestFile {
  fileId?: string;
  fileName: string;
  tests: PlaywrightTest[];
  stats?: PlaywrightStats;
}

export interface PlaywrightReport {
  stats: PlaywrightStats;
  files: PlaywrightTestFile[];
}

export interface FetchReportError {
  error: string;
}

export function reportUrlFor(reportName: string): string {
  return `https://bkrupa.github.io/legacy-sports-deploys/playwright-report/${reportName}/`;
}

/**
 * Fetch a Playwright report by name and return the parsed `report.json`.
 * Returns `{ error }` on any failure so callers can surface a consistent
 * MCP error response.
 */
export async function fetchPlaywrightReport(
  reportName: string,
): Promise<PlaywrightReport | FetchReportError> {
  if (!/^[\w.-]+$/.test(reportName)) {
    return {
      error:
        'Invalid reportName: only alphanumeric characters, hyphens, underscores, and dots are allowed.',
    };
  }

  const path = `playwright-report/${reportName}/index.html`;
  let html: string;
  try {
    html = await fetchFileContent(DEPLOYS_REPO, path, DEPLOYS_BRANCH);
  } catch (err) {
    return {
      error: `Failed to fetch report "${reportName}": ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const b64Match = html.match(
    /id="playwrightReportBase64"[^>]*>data:application\/zip;base64,([A-Za-z0-9+/=\s]+)</,
  );
  if (!b64Match) {
    return {
      error:
        'Could not find embedded Playwright report data in index.html. ' +
        'The report may be an unsupported format or the page failed to deploy correctly.',
    };
  }

  const zipBuffer = Buffer.from(b64Match[1].replace(/\s/g, ''), 'base64');
  const extractResult = extractZipEntries(zipBuffer, new Set(['report.json']));

  if ('error' in extractResult) {
    return { error: `Failed to extract ZIP: ${extractResult.error}` };
  }

  if (extractResult.length === 0) {
    return {
      error:
        'report.json not found in embedded ZIP. The report archive may be corrupted.',
    };
  }

  try {
    return JSON.parse(
      extractResult[0].data.toString('utf-8'),
    ) as PlaywrightReport;
  } catch (err) {
    return {
      error: `Failed to parse report.json: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Full title: join path segments with " > " then append the leaf title. */
export function fullTitle(test: PlaywrightTest): string {
  return [...(test.path ?? []), test.title].join(' > ');
}

/**
 * Fetch the pre-rendered `summary.md` published alongside the HTML report.
 * Returns `null` when the file is absent (e.g. reports generated before this
 * feature shipped) so callers can fall back to rendering from report.json.
 */
export async function fetchPlaywrightSummary(
  reportName: string,
): Promise<string | null> {
  if (!/^[\w.-]+$/.test(reportName)) return null;
  try {
    return await fetchFileContent(
      DEPLOYS_REPO,
      `playwright-report/${reportName}/summary.md`,
      DEPLOYS_BRANCH,
    );
  } catch {
    return null;
  }
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;

/** Backslash-escape the Markdown metacharacters that could let untrusted test
 * error/snippet text inject structure (fake `##` headings, `**emphasis**`,
 * links, or a stray ``` fence) when the report is rendered. (LS-7838 review:
 * Markdown-injection hardening.) */
function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]()#>|]/g, '\\$&');
}

/** Strip ANSI codes, cap length so the Markdown stays token-cheap, then escape
 * Markdown metacharacters in the (untrusted) result. */
function clamp(text: string, max = 1500): string {
  const trimmed = text.replace(ANSI, '').trim();
  const capped =
    trimmed.length > max
      ? `${trimmed.slice(0, max)}\n… (${trimmed.length - max} more chars truncated)`
      : trimmed;
  return escapeMarkdown(capped);
}

/**
 * Render a parsed Playwright report as compact, agent-targeted Markdown.
 *
 * The layout is **asymmetric**: passing tests collapse to a single count while
 * failures, flaky tests, and skips get full detail (location, error, snippet,
 * skip reason). This is the same shape the web-e2e `agent-md-reporter` writes
 * to `summary.md`; keep the two in sync so a fetched file and a server-rendered
 * fallback read identically.
 */
export function renderReportAsMarkdown(report: PlaywrightReport): string {
  const s = report.stats;
  const ok = s.ok && s.total > 0;
  const lines: string[] = [];

  lines.push(`# E2E Report — ${ok ? '✅ PASSED' : '❌ FAILED'}`);
  lines.push('');
  lines.push(
    `**${s.unexpected} failed** · ${s.expected} passed · ${s.flaky} flaky · ` +
      `${s.skipped} skipped · **${s.total} total**`,
  );
  lines.push('');

  if (s.total === 0) {
    lines.push(
      '> ⚠️ **Zero tests ran.** This is NOT a passing result — the run was ' +
        'likely misconfigured (wrong testDir, grep matched nothing, or build ' +
        'failed before tests started).',
    );
    lines.push('');
  }

  const failures: Array<{
    title: string;
    file: string;
    line?: number;
    error: string | null;
    snippet: string | null;
  }> = [];
  const flaky: string[] = [];
  const skipped: Array<{ title: string; reason: string | null }> = [];

  for (const file of report.files ?? []) {
    for (const test of file.tests ?? []) {
      // Join with U+203A "›" to match the web-e2e agent-md-reporter (which
      // derives the same path from live Suite titles). `fullTitle` uses " > "
      // and is kept for the other CI tools that already depend on that shape.
      const title = [...(test.path ?? []), test.title].join(' › ');
      if (test.outcome === 'unexpected') {
        const firstError = test.results?.find(
          (r) => r.errors && r.errors.length > 0,
        )?.errors?.[0];
        failures.push({
          title,
          file: file.fileName,
          line: test.location?.line,
          error: firstError?.message ?? firstError?.value ?? null,
          snippet: firstError?.snippet ?? null,
        });
      } else if (test.outcome === 'flaky') {
        flaky.push(`${file.fileName} › ${title}`);
      } else if (test.outcome === 'skipped') {
        const ann = test.annotations?.find(
          (a) => a.type === 'skip' || a.type === 'fixme',
        );
        skipped.push({
          title: `${file.fileName} › ${title}`,
          reason: ann?.description
            ? `${ann.type}: ${ann.description}`
            : (ann?.type ?? null),
        });
      }
    }
  }

  if (failures.length > 0) {
    lines.push(`## ❌ Failures (${failures.length})`);
    lines.push('');
    for (const f of failures) {
      const loc = f.line ? `${f.file}:${f.line}` : f.file;
      lines.push(`### ${f.title}`);
      lines.push(`- **Location**: ${loc}`);
      if (f.error) {
        lines.push(`- **Error**: ${clamp(f.error).split('\n').join('\n  ')}`);
      }
      if (f.snippet) {
        lines.push(
          `- **Snippet**: ${clamp(f.snippet, 800).split('\n').join('\n  ')}`,
        );
      }
      lines.push('');
    }
  }

  if (flaky.length > 0) {
    lines.push(`## ⚠️ Flaky (${flaky.length})`);
    lines.push('');
    for (const t of flaky) lines.push(`- ${t}`);
    lines.push('');
  }

  if (skipped.length > 0) {
    lines.push(`## ⏭️ Skipped (${skipped.length})`);
    lines.push('');
    for (const t of skipped) {
      lines.push(`- ${t.title}${t.reason ? ` — ${t.reason}` : ''}`);
    }
    lines.push('');
  }

  lines.push(`## ✅ Passed: ${s.expected}`);
  lines.push('');

  return lines.join('\n');
}
