import { minifiedJson } from '@legacy-sports/mcp-format';
import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import { githubGet, githubGetArrayBuffer } from '../github-api.js';
import { extractZipEntriesRaw } from '../logs.js';
import type { ToolResult } from '../types.js';

interface DownloadArtifactParams {
  runId: number;
  artifactName: string;
  outDir?: string;
}

interface GitHubArtifact {
  id: number;
  name: string;
  size_in_bytes: number;
  expired: boolean;
}

interface GitHubArtifactsResponse {
  total_count: number;
  artifacts: GitHubArtifact[];
}

/** Hard cap on total inline bytes returned across all entries when outDir is not provided. */
const MAX_INLINE_BYTES = 200_000;

/** GitHub's max page size — also this function's page-count safety cap, so a
 * pathological total_count can't spin the loop indefinitely. */
const ARTIFACTS_PER_PAGE = 100;

/**
 * Fetch every artifact on a run, following `total_count` across pages (LS-9740
 * review finding) — a single `per_page=100` call silently missed artifacts
 * beyond the first page on runs with 100+ uploaded artifacts.
 */
async function listAllRunArtifacts(runId: number): Promise<GitHubArtifact[]> {
  const artifacts: GitHubArtifact[] = [];
  for (let page = 1; ; page++) {
    const response = await githubGet<GitHubArtifactsResponse>(
      `/actions/runs/${runId}/artifacts`,
      { per_page: String(ARTIFACTS_PER_PAGE), page: String(page) },
    );
    artifacts.push(...response.artifacts);
    if (
      response.artifacts.length < ARTIFACTS_PER_PAGE ||
      artifacts.length >= response.total_count
    ) {
      break;
    }
  }
  return artifacts;
}

/** Bytes scanned from the start of an entry to decide whether it's text or binary. */
const TEXT_SNIFF_BYTES = 8192;

/** A NUL byte anywhere in the sniffed prefix is a reliable binary signal. */
function looksLikeText(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, TEXT_SNIFF_BYTES));
  return !sample.includes(0);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Download a named GitHub Actions artifact (uploaded via
 * `actions/upload-artifact`) from a workflow run — the MCP-first replacement
 * for `gh run download <runId> -n <name>` via Bash (LS-9740).
 *
 * Without `outDir`, file contents are returned inline in the tool response
 * (UTF-8 text where safe, base64 for binary), capped at MAX_INLINE_BYTES
 * total so a large multi-file artifact can't blow the response budget — this
 * is the only option available in hosted/Lambda sessions, which have no
 * filesystem shared with the calling agent. With `outDir`, every file is
 * extracted to that local directory instead and only their paths are
 * returned, for local/stdio sessions that want the full artifact on disk.
 */
export async function downloadArtifact(
  params: DownloadArtifactParams,
): Promise<ToolResult> {
  const { runId, artifactName, outDir } = params;

  let allArtifacts: GitHubArtifact[];
  try {
    allArtifacts = await listAllRunArtifacts(runId);
  } catch (err) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to list artifacts for run ${runId}: ${errorMessage(err)}`,
        },
      ],
    };
  }

  const exactMatch = allArtifacts.find((a) => a.name === artifactName);
  const artifact =
    exactMatch ??
    allArtifacts.find(
      (a) => a.name.toLowerCase() === artifactName.toLowerCase(),
    );

  if (!artifact) {
    const available = allArtifacts.map((a) => a.name);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text:
            `No artifact named "${artifactName}" on run ${runId}. ` +
            (available.length > 0
              ? `Available artifacts: ${available.join(', ')}`
              : 'This run has no uploaded artifacts.'),
        },
      ],
    };
  }

  if (artifact.expired) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text:
            `Artifact "${artifact.name}" (id ${artifact.id}) on run ${runId} has expired ` +
            'and is no longer downloadable — its retention period has passed.',
        },
      ],
    };
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await githubGetArrayBuffer(
      `/actions/artifacts/${artifact.id}/zip`,
    );
  } catch (err) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to download artifact "${artifact.name}" (id ${artifact.id}): ${errorMessage(err)}`,
        },
      ],
    };
  }

  const entries = extractZipEntriesRaw(buffer);
  if (entries.length === 0) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Artifact "${artifact.name}" (id ${artifact.id}) downloaded but its ZIP archive contained no readable entries.`,
        },
      ],
    };
  }

  if (outDir) {
    const resolvedOutDir = path.resolve(outDir);
    const writtenFiles: Array<{ name: string; path: string; bytes: number }> =
      [];
    const skippedUnsafe: string[] = [];

    for (const entry of entries) {
      // Zip-slip guard: reject any entry whose resolved path would escape outDir.
      const resolvedDest = path.resolve(resolvedOutDir, entry.name);
      if (
        resolvedDest !== resolvedOutDir &&
        !resolvedDest.startsWith(resolvedOutDir + path.sep)
      ) {
        skippedUnsafe.push(entry.name);
        continue;
      }
      await mkdir(path.dirname(resolvedDest), { recursive: true });
      await writeFile(resolvedDest, entry.data);
      writtenFiles.push({
        name: entry.name,
        path: resolvedDest,
        bytes: entry.data.length,
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            runId,
            artifactName: artifact.name,
            artifactId: artifact.id,
            outDir: resolvedOutDir,
            files: writtenFiles,
            ...(skippedUnsafe.length > 0
              ? {
                  skippedUnsafe,
                  hint: 'These entry names resolved outside outDir and were not extracted.',
                }
              : {}),
          }),
        },
      ],
    };
  }

  // No outDir — return content inline, capped so a large multi-file artifact
  // can't blow the response budget.
  let remainingBytes = MAX_INLINE_BYTES;
  const files: Array<{
    name: string;
    bytes: number;
    encoding: 'utf-8' | 'base64';
    content: string;
    truncated?: boolean;
  }> = [];
  const skipped: string[] = [];

  for (const entry of entries) {
    if (remainingBytes <= 0) {
      skipped.push(entry.name);
      continue;
    }
    const isText = looksLikeText(entry.data);
    const sliceLength = Math.min(entry.data.length, remainingBytes);
    const truncated = sliceLength < entry.data.length;
    const dataSlice = entry.data.subarray(0, sliceLength);
    files.push({
      name: entry.name,
      bytes: entry.data.length,
      encoding: isText ? 'utf-8' : 'base64',
      content: isText
        ? dataSlice.toString('utf-8')
        : dataSlice.toString('base64'),
      ...(truncated ? { truncated: true } : {}),
    });
    remainingBytes -= sliceLength;
  }

  return {
    content: [
      {
        type: 'text',
        text: minifiedJson({
          runId,
          artifactName: artifact.name,
          artifactId: artifact.id,
          sizeBytes: artifact.size_in_bytes,
          files,
          ...(skipped.length > 0
            ? {
                skipped,
                hint: `${skipped.length} additional file(s) omitted — pass outDir to write the full artifact to disk instead.`,
              }
            : {}),
        }),
      },
    ],
  };
}
