import { getRepoOwnerName } from '../auth.js';
import { githubGraphQL } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface GetReviewThreadsParams {
  number: number;
  unresolvedOnly?: boolean;
}

interface ThreadComment {
  databaseId: number | null;
  author: { login: string } | null;
  body: string;
  path: string | null;
  line: number | null;
  createdAt: string;
}

interface ReviewThread {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  comments: { pageInfo: { hasNextPage: boolean }; nodes: ThreadComment[] };
}

interface GraphQLResponse {
  repository: {
    pullRequest: {
      reviewThreads: {
        pageInfo: { hasNextPage: boolean };
        nodes: ReviewThread[];
      };
    };
  };
}

const REVIEW_THREADS_QUERY = `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        pageInfo { hasNextPage }
        nodes {
          id
          isResolved
          isOutdated
          comments(first: 50) {
            pageInfo { hasNextPage }
            nodes {
              databaseId
              author { login }
              body
              path
              line
              createdAt
            }
          }
        }
      }
    }
  }
}`;

export async function getReviewThreads(
  params: GetReviewThreadsParams,
): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();
    const result = await githubGraphQL<GraphQLResponse>(REVIEW_THREADS_QUERY, {
      owner: repo.owner,
      repo: repo.name,
      number: params.number,
    });

    const reviewThreads = result.data.repository.pullRequest.reviewThreads;
    let threads = reviewThreads.nodes;

    if (params.unresolvedOnly) {
      threads = threads.filter((t) => !t.isResolved);
    }

    const truncated =
      reviewThreads.pageInfo.hasNextPage ||
      threads.some((t) => t.comments.pageInfo.hasNextPage);

    const summary = {
      prNumber: params.number,
      total: reviewThreads.nodes.length,
      returned: threads.length,
      unresolvedOnly: params.unresolvedOnly ?? false,
      truncated,
      threads: threads.map((t) => ({
        id: t.id,
        isResolved: t.isResolved,
        isOutdated: t.isOutdated,
        createdAt: t.comments.nodes[0]?.createdAt ?? null,
        commentCount: t.comments.nodes.length,
        comments: t.comments.nodes.map((c) => ({
          databaseId: c.databaseId, // null if GitHub didn't return an ID; use non-null IDs with github_add_review_reply
          author: c.author?.login ?? 'unknown',
          body: c.body,
          path: c.path,
          line: c.line,
          createdAt: c.createdAt,
        })),
      })),
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to get review threads for PR #${params.number}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
