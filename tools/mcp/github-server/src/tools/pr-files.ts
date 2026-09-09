import { minifiedJson } from '@legacy-sports/mcp-format';
import { getRepoOwnerName } from '../auth.js';
import { githubGraphQL } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface PRFilesParams {
  prNumbers: number[];
  format?: 'names' | 'full';
}

interface FileNode {
  path: string;
  additions: number;
  deletions: number;
  changeType: string;
}

interface FilesConnection {
  nodes: FileNode[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

interface BatchGraphQLResponse {
  repository: {
    [alias: string]: { number: number; files: FilesConnection } | null;
  } | null;
}

// GraphQL query batching (many `pr_<n>: pullRequest(number: <n>)` aliases in
// one request) keeps this to ~1 REST-equivalent call per BATCH_SIZE PRs
// instead of one call per PR — the whole point per LS-9825 (the gap this
// tool closes forced an 80-call sequential `gh api .../files` loop). Kept
// smaller than pr-batch-status's BATCH_SIZE (30): each aliased field here
// pulls up to 100 file nodes, so a wide batch is heavier per request.
const BATCH_SIZE = 20;
const FILES_PAGE_SIZE = 100;

function buildBatchFilesQuery(numbers: number[]): string {
  const fragments = numbers.map(
    (num) => `
    pr_${num}: pullRequest(number: ${num}) {
      number
      files(first: ${FILES_PAGE_SIZE}) {
        nodes { path additions deletions changeType }
        pageInfo { hasNextPage endCursor }
      }
    }`,
  );

  return `
query($owner: String!, $repo: String!) {
  repository(owner: $owner, name: $repo) {
    ${fragments.join('\n')}
  }
}`;
}

const FILES_PAGE_QUERY = `
query($owner: String!, $repo: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      files(first: ${FILES_PAGE_SIZE}, after: $after) {
        nodes { path additions deletions changeType }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;

interface FilesPageResponse {
  repository: {
    pullRequest: { files: FilesConnection } | null;
  } | null;
}

/**
 * `files(first: 100)` truncates PRs with more than 100 changed files.
 * Drain remaining pages per-PR so a large PR's file list is never silently
 * cut off (same pattern as pr-batch-status's `fetchRemainingContexts`).
 */
async function fetchRemainingFiles(
  owner: string,
  repo: string,
  number: number,
  after: string | null,
): Promise<FileNode[]> {
  const extra: FileNode[] = [];
  let cursor = after;
  // Safety cap: 10 additional pages (up to 1000 more files) to bound worst-case latency.
  for (let page = 0; page < 10 && cursor; page++) {
    const result = await githubGraphQL<FilesPageResponse>(FILES_PAGE_QUERY, {
      owner,
      repo,
      number,
      after: cursor,
    });
    const files = result.data.repository?.pullRequest?.files ?? {
      nodes: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    };
    extra.push(...files.nodes);
    cursor = files.pageInfo.hasNextPage ? files.pageInfo.endCursor : null;
  }
  return extra;
}

export async function prFiles(params: PRFilesParams): Promise<ToolResult> {
  const uniquePrNumbers = [...new Set(params.prNumbers)];
  const format = params.format ?? 'names';

  try {
    const repo = await getRepoOwnerName();
    const filesByPr = new Map<number, FileNode[]>();

    for (let i = 0; i < uniquePrNumbers.length; i += BATCH_SIZE) {
      const batch = uniquePrNumbers.slice(i, i + BATCH_SIZE);
      const query = buildBatchFilesQuery(batch);
      const result = await githubGraphQL<BatchGraphQLResponse>(query, {
        owner: repo.owner,
        repo: repo.name,
      });

      for (const num of batch) {
        const pr = result.data.repository?.[`pr_${num}`];
        if (!pr) continue;

        let nodes = pr.files.nodes;
        if (pr.files.pageInfo.hasNextPage) {
          nodes = nodes.concat(
            await fetchRemainingFiles(
              repo.owner,
              repo.name,
              num,
              pr.files.pageInfo.endCursor,
            ),
          );
        }
        filesByPr.set(num, nodes);
      }
    }

    const files: Record<number, string[] | FileNode[]> = {};
    for (const num of uniquePrNumbers) {
      const nodes = filesByPr.get(num);
      if (!nodes) continue;
      files[num] = format === 'full' ? nodes : nodes.map((f) => f.path);
    }

    return {
      content: [{ type: 'text', text: minifiedJson(files) }],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to fetch PR files: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
