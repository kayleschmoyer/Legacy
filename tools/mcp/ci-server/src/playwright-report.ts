import { inflateRawSync } from 'node:zlib';
import { buildHeaders, getToken } from './github-api.js';

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
  const token = await getToken();
  const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`;
  const res = await fetch(url, {
    headers: buildHeaders(token),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `GitHub API ${res.status} fetching ${path}: ${body.slice(0, 300)}`,
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
