import { getRepoOwnerName } from '../auth.js';
import { githubGraphQL } from '../github-api.js';
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

const LIST_PRS_QUERY = `
query($owner: String!, $repo: String!, $states: [PullRequestState!], $headRefName: String, $labels: [String!], $first: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequests(first: $first, states: $states, headRefName: $headRefName, labels: $labels, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
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
        reviewDecision
      }
    }
  }
}`;

const SEARCH_PRS_QUERY = `
query($query: String!, $first: Int!) {
  search(query: $query, type: ISSUE, first: $first) {
    nodes {
      ... on PullRequest {
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
        reviewDecision
      }
    }
  }
}`;

interface ListPRsGraphQLResponse {
  repository: {
    pullRequests: {
      nodes: PRNode[];
    };
  };
}

interface SearchPRsGraphQLResponse {
  search: {
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

export async function listPRs(params: ListPRsParams): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();
    const limit = params.limit ?? 20;

    let prs: PRSummary[];

    // If author or search is specified, use the search API
    if (params.author || params.search) {
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

      const result = await githubGraphQL<SearchPRsGraphQLResponse>(
        SEARCH_PRS_QUERY,
        { query: queryParts.join(' '), first: limit },
      );

      prs = result.data.search.nodes
        .filter((n) => n.number != null)
        .map(nodeToSummary);
    } else {
      // Use the repository pullRequests query (more efficient, supports headRefName filter)
      const states = mapState(params.state ?? 'open');

      const vars: Record<string, unknown> = {
        owner: repo.owner,
        repo: repo.name,
        first: limit,
        states,
      };

      if (params.branch) vars['headRefName'] = params.branch;
      if (params.label) vars['labels'] = [params.label];

      const result = await githubGraphQL<ListPRsGraphQLResponse>(
        LIST_PRS_QUERY,
        vars,
      );

      prs = result.data.repository.pullRequests.nodes.map(nodeToSummary);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { filters: params, count: prs.length, prs },
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
