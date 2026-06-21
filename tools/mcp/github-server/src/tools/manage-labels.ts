import { minifiedJson } from '@legacy-sports/mcp-format';
import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface GitHubLabel {
  name: string;
}

interface ManageLabelsParams {
  prs: number[];
  add?: string[];
  remove?: string[];
  /** Glob pattern — labels matching this are removed (e.g. 'ci-failure-*'). Composes with remove[]. */
  clearPattern?: string;
}

/** Convert a simple glob pattern (* = any chars, ? = one char) to a RegExp. */
export function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

async function fetchPrLabels(basePath: string): Promise<string[]> {
  const allNames: string[] = [];
  let page = 1;
  while (true) {
    const pageLabels = await githubRest<GitHubLabel[]>({
      method: 'GET',
      path: basePath,
      query: { per_page: '100', page: String(page) },
    });
    for (const l of pageLabels) allNames.push(l.name);
    if (pageLabels.length < 100) break;
    page++;
  }
  return allNames;
}

/** Add or remove labels on one or more PRs. Accepts a single PR number or an array. */
export async function manageLabels(
  params: ManageLabelsParams,
): Promise<ToolResult> {
  const uniquePrs = [...new Set(params.prs)];

  if (!params.add?.length && !params.remove?.length && !params.clearPattern) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'No labels to add or remove. Provide at least one of "add", "remove", or "clearPattern".',
        },
      ],
    };
  }

  const clearRegex = params.clearPattern
    ? globToRegex(params.clearPattern)
    : null;

  const perPrResults: Array<{
    prNumber: number;
    success: boolean;
    clearedLabels: string[];
    error?: string;
  }> = [];

  try {
    const repo = await getRepoOwnerName();

    // Process PRs in parallel batches of 10
    const BATCH_SIZE = 10;
    for (let i = 0; i < uniquePrs.length; i += BATCH_SIZE) {
      const batch = uniquePrs.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (prNumber) => {
          const basePath = `/repos/${repo.owner}/${repo.name}/issues/${prNumber}/labels`;
          try {
            // Build effective remove list: explicit removes + pattern-matched labels
            const effectiveRemove: string[] = [...(params.remove ?? [])];
            const clearedLabels: string[] = [];

            if (clearRegex) {
              const currentLabels = await fetchPrLabels(basePath);
              for (const name of currentLabels) {
                if (clearRegex.test(name) && !effectiveRemove.includes(name)) {
                  effectiveRemove.push(name);
                  clearedLabels.push(name);
                }
              }
            }

            if (params.add?.length) {
              await githubRest({
                method: 'POST',
                path: basePath,
                body: { labels: params.add },
              });
            }
            for (const label of effectiveRemove) {
              try {
                await githubRest({
                  method: 'DELETE',
                  path: `${basePath}/${encodeURIComponent(label)}`,
                });
              } catch (removeErr) {
                // 404 = label not on PR, 422 = already removed — safe to ignore
                const msg = removeErr instanceof Error ? removeErr.message : '';
                if (!msg.includes('(404)') && !msg.includes('(422)')) {
                  throw removeErr;
                }
              }
            }
            return { prNumber, success: true, clearedLabels };
          } catch (error) {
            return {
              prNumber,
              success: false,
              clearedLabels: [],
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }),
      );
      perPrResults.push(...batchResults);
    }
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to get repo info: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }

  const succeeded = perPrResults.filter((r) => r.success).length;
  const failed = perPrResults.filter((r) => !r.success).length;

  // For single-PR calls, emit a flatter response shape
  if (uniquePrs.length === 1) {
    const r = perPrResults[0];
    return {
      isError: failed > 0,
      content: [
        {
          type: 'text',
          text: minifiedJson({
            prNumber: uniquePrs[0],
            success: failed === 0,
            requestedLabelsAdded: params.add ?? [],
            requestedLabelsRemoved: params.remove ?? [],
            ...(r.clearedLabels.length
              ? { clearedLabels: r.clearedLabels }
              : {}),
            ...(r.error ? { error: r.error } : {}),
          }),
        },
      ],
    };
  }

  return {
    isError: failed > 0,
    content: [
      {
        type: 'text',
        text: minifiedJson({
          total: uniquePrs.length,
          succeeded,
          failed,
          requestedLabelsAdded: params.add ?? [],
          requestedLabelsRemoved: params.remove ?? [],
          results: perPrResults.map(({ clearedLabels, ...r }) => ({
            ...r,
            ...(clearedLabels.length ? { clearedLabels } : {}),
          })),
        }),
      },
    ],
  };
}
