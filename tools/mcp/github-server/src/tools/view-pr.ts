import { minifiedJson } from '@legacy-sports/mcp-format';
import { getRepoOwnerName } from '../auth.js';
import { githubGraphQL } from '../github-api.js';
import type { ToolResult } from '../types.js';
import {
  dedupeLatestByName,
  normalizeChecks,
  type StatusCheckNode,
} from '../utils/github-checks.js';
import {
  deriveReviewDecision,
  fetchAllReviews,
} from '../utils/github-reviews.js';

type ViewPRField = 'body' | 'files' | 'reviews' | 'assignees' | 'milestone';

interface ViewPRParams {
  number: number;
  /** Opt-in fields to include beyond the compact default. Compact default: number, title, state,
   *  isDraft, headRefName, baseRefName, url, labels, additions, deletions, changedFiles,
   *  commits.totalCount, checksSummary. Pass e.g. ["body","files"] for richer output. */
  fields?: ViewPRField[];
}

interface PRFileNode {
  path: string;
  additions: number;
  deletions: number;
  changeType: string;
}

interface PRGraphQLResponse {
  repository: {
    pullRequest: null | {
      number: number;
      title: string;
      body: string;
      state: string;
      headRefName: string;
      baseRefName: string;
      author: { login: string } | null;
      createdAt: string;
      updatedAt: string;
      mergedAt: string | null;
      closedAt: string | null;
      url: string;
      labels: { nodes: Array<{ name: string }> };
      isDraft: boolean;
      reviewDecision: string | null;
      additions: number;
      deletions: number;
      changedFiles: number;
      files: {
        nodes: Array<PRFileNode>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
      commits: {
        totalCount: number;
        nodes: Array<{
          commit: {
            statusCheckRollup: {
              contexts: {
                nodes: Array<StatusCheckNode | null>;
                pageInfo: { hasNextPage: boolean; endCursor: string | null };
              };
            } | null;
          };
        }>;
      };
      reviews: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Array<{
          author: { login: string } | null;
          state: string;
          submittedAt: string;
        }>;
      };
      assignees: { nodes: Array<{ login: string }> };
      milestone: { title: string } | null;
    };
  };
}

const VIEW_PR_QUERY = `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      number
      title
      body
      state
      headRefName
      baseRefName
      author { login }
      createdAt
      updatedAt
      mergedAt
      closedAt
      url
      labels(first: 20) { nodes { name } }
      isDraft
      reviewDecision
      additions
      deletions
      changedFiles
      files(first: 100) {
        nodes {
          path
          additions
          deletions
          changeType
        }
        pageInfo { hasNextPage endCursor }
      }
      commits(last: 1) {
        totalCount
        nodes {
          commit {
            statusCheckRollup {
              contexts(first: 100) {
                nodes {
                  ... on CheckRun {
                    __typename
                    name
                    status
                    conclusion
                    startedAt
                    completedAt
                  }
                  ... on StatusContext {
                    __typename
                    context
                    state
                    createdAt
                  }
                }
                pageInfo { hasNextPage endCursor }
              }
            }
          }
        }
      }
      reviews(first: 50) {
        pageInfo { hasNextPage endCursor }
        nodes {
          author { login }
          state
          submittedAt
        }
      }
      assignees(first: 20) { nodes { login } }
      milestone { title }
    }
  }
}`;

/**
 * Follow-up query for a single PR's remaining `statusCheckRollup.contexts`
 * pages. `contexts(first: 100)` in `VIEW_PR_QUERY` truncates PRs with more
 * than 100 status checks/contexts (LS-9283) — this paginates the rest via
 * `after: $cursor` so `checksSummary` reflects the full set.
 */
const CONTEXTS_PAGE_QUERY = `
query($owner: String!, $repo: String!, $number: Int!, $cursor: String!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      commits(last: 1) {
        nodes {
          commit {
            statusCheckRollup {
              contexts(first: 100, after: $cursor) {
                nodes {
                  ... on CheckRun {
                    __typename
                    name
                    status
                    conclusion
                    startedAt
                    completedAt
                  }
                  ... on StatusContext {
                    __typename
                    context
                    state
                    createdAt
                  }
                }
                pageInfo { hasNextPage endCursor }
              }
            }
          }
        }
      }
    }
  }
}`;

interface ContextsPageResponse {
  repository: {
    pullRequest: null | {
      commits: {
        nodes: Array<{
          commit: {
            statusCheckRollup: {
              contexts: {
                nodes: Array<StatusCheckNode | null>;
                pageInfo: { hasNextPage: boolean; endCursor: string | null };
              };
            } | null;
          };
        }>;
      };
    };
  };
}

/**
 * Fetch every remaining `statusCheckRollup.contexts` page beyond the first,
 * starting from the initial page's `pageInfo`.
 */
async function fetchRemainingContexts(
  owner: string,
  repo: string,
  number: number,
  pageInfo: { hasNextPage: boolean; endCursor: string | null },
): Promise<Array<StatusCheckNode | null>> {
  const nodes: Array<StatusCheckNode | null> = [];
  let hasNextPage = pageInfo.hasNextPage;
  let cursor = pageInfo.endCursor;

  while (hasNextPage && cursor) {
    const result = await githubGraphQL<ContextsPageResponse>(
      CONTEXTS_PAGE_QUERY,
      { owner, repo, number, cursor },
    );
    const contexts =
      result.data.repository.pullRequest?.commits.nodes[0]?.commit
        .statusCheckRollup?.contexts;
    if (!contexts) break;
    nodes.push(...contexts.nodes);
    hasNextPage = contexts.pageInfo.hasNextPage;
    cursor = contexts.pageInfo.endCursor;
  }

  return nodes;
}

/**
 * Follow-up query for a single PR's remaining `files` pages. `files(first: 100)`
 * in `VIEW_PR_QUERY` truncates PRs with more than 100 changed files — this
 * paginates the rest via `after: $cursor` so the `files` field (when
 * requested via `fields: ["files"]`) is fully enumerated.
 */
const FILES_PAGE_QUERY = `
query($owner: String!, $repo: String!, $number: Int!, $cursor: String!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      files(first: 100, after: $cursor) {
        nodes {
          path
          additions
          deletions
          changeType
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;

interface FilesPageResponse {
  repository: {
    pullRequest: null | {
      files: {
        nodes: Array<PRFileNode>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    };
  };
}

/**
 * Fetch every remaining `files` page beyond the first, starting from the
 * initial page's `pageInfo`.
 */
async function fetchRemainingFiles(
  owner: string,
  repo: string,
  number: number,
  pageInfo: { hasNextPage: boolean; endCursor: string | null },
): Promise<Array<PRFileNode>> {
  const nodes: Array<PRFileNode> = [];
  let hasNextPage = pageInfo.hasNextPage;
  let cursor = pageInfo.endCursor;

  while (hasNextPage && cursor) {
    const result = await githubGraphQL<FilesPageResponse>(FILES_PAGE_QUERY, {
      owner,
      repo,
      number,
      cursor,
    });
    const files = result.data.repository.pullRequest?.files;
    if (!files) break;
    nodes.push(...files.nodes);
    hasNextPage = files.pageInfo.hasNextPage;
    cursor = files.pageInfo.endCursor;
  }

  return nodes;
}

/** Map GraphQL PullRequestFile.changeType to REST-compatible status strings. */
const CHANGE_TYPE_MAP: Record<string, string> = {
  ADDED: 'added',
  CHANGED: 'changed',
  COPIED: 'copied',
  DELETED: 'removed',
  MODIFIED: 'modified',
  RENAMED: 'renamed',
};

function mapChangeType(changeType: string): string {
  return CHANGE_TYPE_MAP[changeType] ?? changeType.toLowerCase();
}

export async function viewPR(params: ViewPRParams): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();
    const result = await githubGraphQL<PRGraphQLResponse>(VIEW_PR_QUERY, {
      owner: repo.owner,
      repo: repo.name,
      number: params.number,
    });

    const pr = result.data.repository.pullRequest;
    if (!pr) {
      return {
        isError: true,
        content: [{ type: 'text', text: `PR #${params.number} not found.` }],
      };
    }
    const commitNode = pr.commits.nodes[0];
    const contexts = commitNode?.commit.statusCheckRollup?.contexts;
    let checkNodes = (contexts?.nodes ?? []).filter(
      (node): node is StatusCheckNode => node !== null,
    );
    if (contexts?.pageInfo?.hasNextPage) {
      const remaining = await fetchRemainingContexts(
        repo.owner,
        repo.name,
        params.number,
        contexts.pageInfo,
      );
      checkNodes = [
        ...checkNodes,
        ...remaining.filter((node): node is StatusCheckNode => node !== null),
      ];
    }

    // A `reviews(first: 50)` first page can still truncate on a
    // heavily-reviewed PR — fetch the rest so a reviewer's true latest state
    // is never missed by deriveReviewDecision below.
    let reviewNodes = pr.reviews.nodes;
    if (pr.reviews.pageInfo.hasNextPage) {
      reviewNodes = await fetchAllReviews(
        repo.owner,
        repo.name,
        params.number,
        pr.reviews,
      );
    }

    const include = new Set<ViewPRField>(params.fields ?? []);

    const checksRaw = dedupeLatestByName(normalizeChecks(checkNodes));
    const failed = checksRaw.filter(
      (c) =>
        c.conclusion &&
        c.conclusion !== 'SUCCESS' &&
        c.conclusion !== 'SKIPPED' &&
        c.conclusion !== 'NEUTRAL',
    );
    const pending = checksRaw.filter((c) => !c.conclusion);
    const passed = checksRaw.filter(
      (c) =>
        c.conclusion === 'SUCCESS' ||
        c.conclusion === 'SKIPPED' ||
        c.conclusion === 'NEUTRAL',
    );

    const output: Record<string, unknown> = {
      number: pr.number,
      title: pr.title,
      state: pr.state,
      isDraft: pr.isDraft,
      headRefName: pr.headRefName,
      baseRefName: pr.baseRefName,
      url: pr.url,
      labels: pr.labels.nodes,
      // Derived from each reviewer's latest review, not the raw GraphQL field
      // (can stay stale after a CHANGES_REQUESTED review is superseded by an
      // APPROVED one from the same author — LS-8364, LS-8708).
      reviewDecision: deriveReviewDecision(reviewNodes, pr.reviewDecision),
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changedFiles,
      commits: { totalCount: pr.commits.totalCount },
      checksSummary: {
        total: checksRaw.length,
        passed: passed.length,
        pending: pending.length,
        failed: failed.length,
        failedNames: failed.map((c) => c.name),
      },
    };

    if (include.has('body')) {
      output['body'] = pr.body;
    }

    if (include.has('files')) {
      let fileNodes = pr.files.nodes;
      if (pr.files.pageInfo.hasNextPage) {
        const remaining = await fetchRemainingFiles(
          repo.owner,
          repo.name,
          params.number,
          pr.files.pageInfo,
        );
        fileNodes = [...fileNodes, ...remaining];
      }
      output['files'] = fileNodes.map((f) => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        status: mapChangeType(f.changeType),
      }));
    }

    if (include.has('reviews')) {
      output['reviews'] = reviewNodes.map((r) => ({
        author: { login: r.author?.login ?? 'unknown' },
        state: r.state,
        submittedAt: r.submittedAt,
      }));
    }

    if (include.has('assignees')) {
      output['assignees'] = pr.assignees.nodes.map((a) => ({ login: a.login }));
    }

    if (include.has('milestone')) {
      output['milestone'] = pr.milestone;
    }

    return {
      content: [{ type: 'text', text: minifiedJson(output) }],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to view PR #${params.number}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
