import { getRepoOwnerName } from '../auth.js';
import { githubGraphQL, type GraphQLResult } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface ListPRsParams {
  state?: string;
  branch?: string;
  author?: string;
  label?: string;
  search?: string;
  limit?: number;
}

interface PRNode {
  number: number;
  title: string;
  state: string;
  headRefName: string;
  baseRefName: string;
  author: { login: string } | null;
  createdAt: string;
  updatedAt: string;
  url: string;
  labels: { nodes: Array<{ name: string }> };
  isDraft: boolean;
  mergedAt: string | null;
  reviewDecision: string | null;
}

interface PRSummary {
  number: number;
  title: string;
  state: string;
  headRefName: string;
  baseRefName: string;
  author: { login: string };
  createdAt: string;
  updatedAt: string;
  url: string;
  labels: Array<{ name: string }>;
  isDraft: boolean;
  mergedAt: string | null;
  reviewDecision: string | null;
}

// GraphQL state enum values
function mapState(state: string): string[] {
  switch (state) {
    case 'open':
      return ['OPEN'];
    case 'closed':
      return ['CLOSED'];
    case 'merged':
      return ['MERGED'];
    case 'all':
      return ['OPEN', 'CLOSED', 'MERGED'];
    default:
      return ['OPEN'];
  }
}

const PR_FIELDS = `
        number
        title
        state
        headRefName
        baseRefName
        author { login }
        createdAt
        updatedAt
        url
        labels(first: 20) { nodes { name } }
        isDraft
        mergedAt
        reviewDecision`;

const LIST_PRS_QUERY = `
query($owner: String!, $repo: String!, $states: [PullRequestState!], $headRefName: String, $labels: [String!], $first: Int!, $after: String) {
  repository(owner: $owner, name: $repo) {
    pullRequests(first: $first, after: $after, states: $states, headRefName: $headRefName, labels: $labels, orderBy: {field: UPDATED_AT, direction: DESC}) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {${PR_FIELDS}
      }
    }
  }
}`;

const SEARCH_PRS_QUERY = `
query($query: String!, $first: Int!, $after: String) {
  search(query: $query, type: ISSUE, first: $first, after: $after) {
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      ... on PullRequest {${PR_FIELDS}
      }
    }
  }
}`;

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface ListPRsGraphQLResponse {
  repository: {
    pullRequests: {
      pageInfo: PageInfo;
      nodes: PRNode[];
    };
  };
}

interface SearchPRsGraphQLResponse {
  search: {
    pageInfo: PageInfo;
    nodes: PRNode[];
  };
}

function nodeToSummary(node: PRNode): PRSummary {
  return {
    number: node.number,
    title: node.title,
    state: node.state,
    headRefName: node.headRefName,
    baseRefName: node.baseRefName,
    author: { login: node.author?.login ?? 'unknown' },
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    url: node.url,
    labels: node.labels.nodes,
    isDraft: node.isDraft,
    mergedAt: node.mergedAt,
    reviewDecision: node.reviewDecision,
  };
}

const PAGE_SIZE = 100;

export async function listPRs(params: ListPRsParams): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();
    const limit = params.limit ?? 500;

    const allPrs: PRSummary[] = [];
    let after: string | null = null;
    let hasMore = false;

    if (params.author || params.search) {
      // Use the search API
      const queryParts = [`repo:${repo.owner}/${repo.name}`, 'is:pr'];

      const state = params.state ?? 'open';
      if (state !== 'all') {
        queryParts.push(`is:${state}`);
      }

      if (params.author) {
        queryParts.push(`author:${params.author}`);
      }
      if (params.branch) {
        queryParts.push(`head:${params.branch}`);
      }
      if (params.label) {
        queryParts.push(`label:"${params.label.replace(/"/g, '\\"')}"`);
      }
      if (params.search) {
        queryParts.push(params.search);
      }

      const searchQuery = queryParts.join(' ');

      while (allPrs.length < limit) {
        const pageSize = Math.min(PAGE_SIZE, limit - allPrs.length);
        const result: GraphQLResult<SearchPRsGraphQLResponse> =
          await githubGraphQL<SearchPRsGraphQLResponse>(SEARCH_PRS_QUERY, {
            query: searchQuery,
            first: pageSize,
            after,
          });

        const page: SearchPRsGraphQLResponse['search'] = result.data.search;
        allPrs.push(
          ...page.nodes.filter((n) => n.number != null).map(nodeToSummary),
        );

        if (!page.pageInfo.hasNextPage) break;
        if (allPrs.length >= limit) {
          hasMore = true;
          break;
        }
        after = page.pageInfo.endCursor;
      }
    } else {
      // Use the repository pullRequests query (more efficient, supports headRefName filter)
      const states = mapState(params.state ?? 'open');

      const baseVars: Record<string, unknown> = {
        owner: repo.owner,
        repo: repo.name,
        states,
      };

      if (params.branch) baseVars['headRefName'] = params.branch;
      if (params.label) baseVars['labels'] = [params.label];

      while (allPrs.length < limit) {
        const pageSize = Math.min(PAGE_SIZE, limit - allPrs.length);
        const result: GraphQLResult<ListPRsGraphQLResponse> =
          await githubGraphQL<ListPRsGraphQLResponse>(LIST_PRS_QUERY, {
            ...baseVars,
            first: pageSize,
            after,
          });

        const page: ListPRsGraphQLResponse['repository']['pullRequests'] =
          result.data.repository.pullRequests;
        allPrs.push(...page.nodes.map(nodeToSummary));

        if (!page.pageInfo.hasNextPage) break;
        if (allPrs.length >= limit) {
          hasMore = true;
          break;
        }
        after = page.pageInfo.endCursor;
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { filters: params, total: allPrs.length, hasMore, prs: allPrs },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to list PRs: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
