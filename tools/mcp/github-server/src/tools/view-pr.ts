import { getRepoOwnerName } from '../auth.js';
import { githubGraphQL } from '../github-api.js';
import type { ToolResult, CICheck } from '../types.js';

interface ViewPRParams {
  number: number;
}

interface CheckRunNode {
  __typename: 'CheckRun';
  name: string;
  status: string;
  conclusion: string | null;
}

interface StatusContextNode {
  __typename: 'StatusContext';
  context: string;
  state: string;
}

type StatusCheckNode = CheckRunNode | StatusContextNode;

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
        pageInfo: { hasNextPage: boolean };
      };
      commits: {
        totalCount: number;
        nodes: Array<{
          commit: {
            statusCheckRollup: {
              contexts: {
                nodes: Array<StatusCheckNode | null>;
              };
            } | null;
          };
        }>;
      };
      reviews: {
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
        pageInfo { hasNextPage }
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
                  }
                  ... on StatusContext {
                    __typename
                    context
                    state
                  }
                }
              }
            }
          }
        }
      }
      reviews(first: 50) {
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

function normalizeChecks(nodes: (StatusCheckNode | null)[]): CICheck[] {
  return nodes
    .filter((node): node is StatusCheckNode => node != null)
    .map((node) => {
      if (node.__typename === 'CheckRun') {
        return {
          name: node.name,
          status: node.status,
          conclusion: node.conclusion,
        };
      }
      // StatusContext
      return {
        name: node.context,
        status: node.state,
        conclusion:
          node.state === 'SUCCESS'
            ? 'SUCCESS'
            : node.state === 'PENDING'
              ? null
              : node.state,
      };
    });
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
    const checkNodes =
      commitNode?.commit.statusCheckRollup?.contexts.nodes ?? [];

    const output = {
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      headRefName: pr.headRefName,
      baseRefName: pr.baseRefName,
      author: { login: pr.author?.login ?? 'unknown' },
      createdAt: pr.createdAt,
      updatedAt: pr.updatedAt,
      mergedAt: pr.mergedAt,
      closedAt: pr.closedAt,
      url: pr.url,
      labels: pr.labels.nodes,
      isDraft: pr.isDraft,
      reviewDecision: pr.reviewDecision,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changedFiles,
      files: pr.files.nodes.map((f) => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        status: mapChangeType(f.changeType),
      })),
      ...(pr.files.pageInfo.hasNextPage
        ? {
            filesNote:
              'Truncated to first 100 files; PR has more changed files.',
          }
        : {}),
      commits: { totalCount: pr.commits.totalCount },
      statusCheckRollup: normalizeChecks(checkNodes),
      reviews: pr.reviews.nodes.map((r) => ({
        author: { login: r.author?.login ?? 'unknown' },
        state: r.state,
        submittedAt: r.submittedAt,
      })),
      assignees: pr.assignees.nodes.map((a) => ({ login: a.login })),
      milestone: pr.milestone,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
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
