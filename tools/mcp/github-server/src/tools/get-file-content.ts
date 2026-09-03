import { minifiedJson } from '@legacy-sports/mcp-format';
import { validateOutputPath } from '@legacy-sports/mcp-path-safety';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import { getRepoOwnerName, getRepoRoot, isLambda } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface GetFileContentParams {
  path: string;
  ref?: string;
  /**
   * Optional absolute path to write the file's raw bytes to instead of
   * returning them in the tool result. When set, the response carries only
   * metadata ({ path, ref, sha, bytesWritten, outputPath }) — never content.
   * Must resolve within the repo root (non-Lambda sessions with a local
   * checkout) or the OS temp/scratch dir — see `validateOutputPath`.
   */
  outputPath?: string;
}

interface GitHubFileResponse {
  path: string;
  sha: string;
  size: number;
  content: string;
  encoding: string;
}

type GitHubDirectoryEntry = { path: string; type: string };

export async function getFileContent(
  params: GetFileContentParams,
): Promise<ToolResult> {
  try {
    let resolvedOutputPath: string | undefined;
    if (params.outputPath !== undefined) {
      const allowedRoots = isLambda() ? [tmpdir()] : [getRepoRoot(), tmpdir()];
      const pathResult = validateOutputPath(params.outputPath, allowedRoots);
      if (!pathResult.ok) {
        return {
          isError: true,
          content: [{ type: 'text', text: pathResult.error }],
        };
      }
      resolvedOutputPath = pathResult.resolved;
    }

    const repo = await getRepoOwnerName();
    const ref = params.ref ?? 'main';

    const data = await githubRest<GitHubFileResponse | GitHubDirectoryEntry[]>({
      method: 'GET',
      path: `/repos/${repo.owner}/${repo.name}/contents/${params.path}`,
      query: { ref },
    });

    if (Array.isArray(data)) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Path '${params.path}' is a directory. Use Glob to list files or specify an exact file path.`,
          },
        ],
      };
    }

    if (data.encoding !== 'base64') {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Unsupported encoding "${data.encoding}" for ${params.path}`,
          },
        ],
      };
    }

    const contentBuffer = Buffer.from(
      data.content.replace(/\n/g, ''),
      'base64',
    );

    if (resolvedOutputPath !== undefined) {
      try {
        mkdirSync(dirname(resolvedOutputPath), { recursive: true });
        writeFileSync(resolvedOutputPath, contentBuffer);
      } catch (writeError) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to write file to ${resolvedOutputPath}: ${writeError instanceof Error ? writeError.message : String(writeError)}`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: minifiedJson({
              path: data.path,
              ref,
              sha: data.sha,
              outputPath: resolvedOutputPath,
              bytesWritten: contentBuffer.length,
            }),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            path: data.path,
            ref,
            sha: data.sha,
            content: contentBuffer.toString('utf-8'),
          }),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to get file content for ${params.path} at ref "${params.ref ?? 'main'}": ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
