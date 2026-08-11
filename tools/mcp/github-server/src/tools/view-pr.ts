import { minifiedJson } from '@legacy-sports/mcp-format';
import { getRepoOwnerName } from '../auth.js';
import { githubGraphQL } from '../github-api.js';
import type { ToolResult } from '../types.js';
import {
  dedupeLatestByName,
  normalizeChecks,
  type StatusCheckNode,
} from '../utils/github-checks.js';

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
      reviewDecision: pr.reviewDecision,
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
      output['files'] = pr.files.nodes.map((f) => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        status: mapChangeType(f.changeType),
      }));
      if (pr.files.pageInfo.hasNextPage) {
        output['filesNote'] =
          'Truncated to first 100 files; PR has more changed files.';
      }
    }

    if (include.has('reviews')) {
      output['reviews'] = pr.reviews.nodes.map((r) => ({
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
