import { getRepoOwnerName } from '../auth.js';
import { githubGraphQL, githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface ResolveThreadsParams {
  threadIds?: string[];
  commentDatabaseIds?: number[];
  prNumber?: number;
}

interface ResolveResponse {
  [alias: string]: {
    thread: { isResolved: boolean };
  };
}

interface ThreadMapResponse {
  repository: {
    pullRequest: {
      reviewThreads: {
        pageInfo: { hasNextPage: boolean };
        nodes: Array<{
          id: string;
          comments: {
            nodes: Array<{ databaseId: number | null }>;
          };
        }>;
      };
    };
  };
}

const THREAD_MAP_QUERY = `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        pageInfo { hasNextPage }
        nodes {
          id
          comments(first: 10) {
            nodes { databaseId }
          }
        }
      }
    }
  }
}`;

async function fetchThreadIdsForComments(
  prNumber: number,
  commentDatabaseIds: number[],
): Promise<{ resolved: string[]; notFound: number[] }> {
  const repo = await getRepoOwnerName();
  const result = await githubGraphQL<ThreadMapResponse>(THREAD_MAP_QUERY, {
    owner: repo.owner,
    repo: repo.name,
    number: prNumber,
  });

  const threads = result.data.repository.pullRequest.reviewThreads.nodes;

  const commentToThread = new Map<number, string>();
  for (const thread of threads) {
    for (const comment of thread.comments.nodes) {
      if (comment.databaseId !== null) {
        commentToThread.set(comment.databaseId, thread.id);
      }
    }
  }

  const resolved: string[] = [];
  const notFound: number[] = [];
  const seen = new Set<string>();

  for (const commentId of commentDatabaseIds) {
    const threadId = commentToThread.get(commentId);
    if (threadId) {
      if (!seen.has(threadId)) {
        resolved.push(threadId);
        seen.add(threadId);
      }
    } else {
      notFound.push(commentId);
    }
  }

  return { resolved, notFound };
}

function buildBatchResolveMutation(threadIds: string[]): {
  query: string;
  variables: Record<string, string>;
} {
  const variableDecls = threadIds.map((_, i) => `$id${i}: ID!`).join(', ');
  const mutations = threadIds.map(
    (_, i) => `
    t${i}: resolveReviewThread(input: { threadId: $id${i} }) {
      thread { isResolved }
    }`,
  );

  const query = `mutation(${variableDecls}) {
  ${mutations.join('\n')}
}`;

  const variables: Record<string, string> = {};
  threadIds.forEach((id, i) => {
    variables[`id${i}`] = id;
  });

  return { query, variables };
}

export async function resolveThreads(
  params: ResolveThreadsParams,
): Promise<ToolResult> {
  const hasThreadIds = params.threadIds && params.threadIds.length > 0;
  const hasCommentIds =
    params.commentDatabaseIds && params.commentDatabaseIds.length > 0;

  if (!hasThreadIds && !hasCommentIds) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'No thread IDs or comment database IDs provided.',
        },
      ],
    };
  }

  let allThreadIds: string[] = [...(params.threadIds ?? [])];
  let notFoundCommentIds: number[] = [];

  if (hasCommentIds) {
    if (!params.prNumber) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'prNumber is required when providing commentDatabaseIds (needed to look up thread IDs from the PR).',
          },
        ],
      };
    }

    try {
      const { resolved, notFound } = await fetchThreadIdsForComments(
        params.prNumber,
        params.commentDatabaseIds!,
      );
      allThreadIds = [...new Set([...allThreadIds, ...resolved])];
      notFoundCommentIds = notFound;
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Failed to look up thread IDs for comment database IDs: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }

    if (allThreadIds.length === 0) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `None of the provided comment database IDs could be mapped to review thread IDs. Comment IDs not found: ${notFoundCommentIds.join(', ')}. These IDs may belong to a different PR, may have been deleted, or the threads may be paginated beyond the first 100.`,
          },
        ],
      };
    }
  }

  const uniqueIds = [...new Set(allThreadIds)];

  // Batch in groups of 50 to stay within GraphQL limits
  const BATCH_SIZE = 50;
  const results: Array<{
    threadId: string;
    isResolved: boolean;
    error?: string;
  }> = [];

  for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
    const batch = uniqueIds.slice(i, i + BATCH_SIZE);
    try {
      const { query, variables } = buildBatchResolveMutation(batch);
      const response = await githubGraphQL<ResolveResponse>(query, variables);

      for (let j = 0; j < batch.length; j++) {
        const alias = `t${j}`;
        const data = response.data[alias];
        if (!data) {
          results.push({
            threadId: batch[j],
            isResolved: false,
            error: `No response data for thread (alias ${alias}) — may be an invalid thread ID`,
          });
        } else {
          results.push({
            threadId: batch[j],
            isResolved: data.thread?.isResolved ?? false,
          });
        }
      }
    } catch (error) {
      for (const id of batch) {
        results.push({
          threadId: id,
          isResolved: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const resolved = results.filter((r) => r.isResolved && !r.error).length;
  const failed = results.filter((r) => r.error).length;

  // If a PR number was provided and threads were resolved, trigger the
  // Copilot Auto-Approve recheck workflow so bot-review status gets updated.
  // This closes the gap where threads are resolved without a code push.
  let recheckTriggered = false;
  let recheckNote: string | undefined;
  let recheckError: string | undefined;
  if (params.prNumber && resolved > 0 && failed === 0) {
    try {
      const repo = await getRepoOwnerName();
      await githubRest({
        method: 'POST',
        path: `/repos/${repo.owner}/${repo.name}/actions/workflows/copilot-auto-approve.yml/dispatches`,
        body: {
          ref: 'main',
          inputs: { pr_number: String(params.prNumber) },
        },
      });
      recheckTriggered = true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const status =
        typeof error === 'object' && error !== null && 'status' in error
          ? (error as { status?: number }).status
          : undefined;
      const is403 = status === 403 || msg.includes('(403)');
      // 403 is expected when the token lacks Actions workflow dispatch
      // permission (common with app tokens). Only surface as a hard error
      // for non-permission failures.
      if (is403) {
        recheckNote =
          'Recheck skipped: token lacks Actions workflow dispatch permission ' +
          '(expected when the token lacks this permission, common with app tokens). ' +
          'The auto-approve workflow will run on next push or manual trigger.';
      } else {
        recheckError = `Recheck failed: ${msg}`;
      }
    }
  }

  return {
    isError: failed > 0 ? true : undefined,
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            total: results.length,
            resolved,
            failed,
            results,
            ...(notFoundCommentIds.length > 0 ? { notFoundCommentIds } : {}),
            recheckTriggered,
            ...(recheckNote ? { recheckNote } : {}),
            ...(recheckError ? { recheckError } : {}),
          },
          null,
          2,
        ),
      },
    ],
  };
}
