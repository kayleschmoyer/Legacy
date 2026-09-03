import { markdownTable, truncate } from '@legacy-sports/mcp-format';
import safeRegex from 'safe-regex';
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
  paths?: string[];
}

interface PRFileNode {
  path: string;
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
  files?: { totalCount: number; nodes: PRFileNode[] };
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
  files?: { totalCount: number; nodes: PRFileNode[] };
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

// `files` is a per-PR connection fetched inline in the same paginated query —
// not a per-PR fan-out call — but it does add cost to every request, so it is
// only included in the field selection when a `paths` filter was requested
// (LS-9634). Capped at 100 files/PR: enough for the shared/generated-artifact
// collision case this exists for (a handful of regenerated files per PR), not
// a general-purpose diff tool.
const FILES_FIELD = `
        files(first: 100) { totalCount nodes { path } }`;

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

function listPrsQuery(withFiles: boolean): string {
  return `
query($owner: String!, $repo: String!, $states: [PullRequestState!], $headRefName: String, $labels: [String!], $first: Int!, $after: String) {
  repository(owner: $owner, name: $repo) {
    pullRequests(first: $first, after: $after, states: $states, headRefName: $headRefName, labels: $labels, orderBy: {field: UPDATED_AT, direction: DESC}) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {${PR_FIELDS}${withFiles ? FILES_FIELD : ''}
      }
    }
  }
}`;
}

function searchPrsQuery(withFiles: boolean): string {
  return `
query($query: String!, $first: Int!, $after: String) {
  search(query: $query, type: ISSUE, first: $first, after: $after) {
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      ... on PullRequest {${PR_FIELDS}${withFiles ? FILES_FIELD : ''}
      }
    }
  }
}`;
}

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
    files: node.files,
  };
}

// Guards against ReDoS from a pathological `paths` pattern: file paths come
// from PR contents an external contributor controls, so a pattern with
// catastrophic-backtracking risk (e.g. "(a+)+") tested against an
// adversarial file name could hang the MCP server process.
const MAX_PATTERN_LENGTH = 200;

/**
 * `paths` entries are regex source strings (not shell globs) tested against
 * each PR's changed file paths — the same `test("a|b")` pattern the LS-9634
 * gap report used with `gh pr list --json files`. An invalid or unsafe
 * pattern throws so the caller sees a clear error rather than a silently-empty
 * result or a hung server.
 */
function compilePathPatterns(paths: string[]): RegExp[] {
  return paths.map((p) => {
    if (p.length > MAX_PATTERN_LENGTH) {
      throw new Error(
        `Path pattern too long (${p.length} > ${MAX_PATTERN_LENGTH} chars): "${p.slice(0, 40)}..."`,
      );
    }
    let re: RegExp;
    try {
      re = new RegExp(p);
    } catch (error) {
      throw new Error(
        `Invalid path pattern "${p}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!safeRegex(re)) {
      throw new Error(
        `Path pattern "${p}" risks catastrophic backtracking (ReDoS) — simplify it (e.g. avoid nested quantifiers like "(a+)+").`,
      );
    }
    return re;
  });
}

function matchingFilePaths(pr: PRSummary, patterns: RegExp[]): string[] {
  const files = pr.files?.nodes ?? [];
  return files
    .filter((f) => patterns.some((re) => re.test(f.path)))
    .map((f) => f.path);
}

const PAGE_SIZE = 100;

// Flat, uniform list → Markdown table (LS-8021). Columns are pruned to the
// fields agents consume from a PR list; `filters` (an echo of the request) and
// `createdAt` (superseded by `updatedAt` for recency) are dropped. Nested
// values are flattened to single cells: `author` to its login, `labels` to a
// comma-joined name list.
const LIST_PRS_COLUMNS = [
  'number',
  'title',
  'state',
  'branch',
  'base',
  'author',
  'isDraft',
  'reviewDecision',
  'mergedAt',
  'labels',
  'updatedAt',
  'url',
] as const;

const LIST_PRS_COLUMNS_WITH_PATHS = [
  ...LIST_PRS_COLUMNS,
  'matchedPaths',
] as const;

function toRow(
  pr: PRSummary,
  matchPatterns?: RegExp[],
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    number: pr.number,
    title: truncate(pr.title, 80),
    state: pr.state,
    branch: pr.headRefName,
    base: pr.baseRefName,
    author: pr.author.login,
    isDraft: pr.isDraft,
    reviewDecision: pr.reviewDecision ?? '',
    mergedAt: pr.mergedAt ?? '',
    labels: pr.labels.map((l) => l.name).join(','),
    updatedAt: pr.updatedAt,
    url: pr.url,
  };
  if (matchPatterns) {
    base['matchedPaths'] = matchingFilePaths(pr, matchPatterns).join(',');
  }
  return base;
}

export async function listPRs(params: ListPRsParams): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();
    const limit = params.limit ?? 500;
    const withFiles = Boolean(params.paths?.length);
    const pathPatterns = params.paths ? compilePathPatterns(params.paths) : [];

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
          await githubGraphQL<SearchPRsGraphQLResponse>(
            searchPrsQuery(withFiles),
            {
              query: searchQuery,
              first: pageSize,
              after,
            },
          );

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
          await githubGraphQL<ListPRsGraphQLResponse>(listPrsQuery(withFiles), {
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

    const matchedPrs = withFiles
      ? allPrs.filter((pr) => matchingFilePaths(pr, pathPatterns).length > 0)
      : allPrs;

    const text =
      matchedPrs.length === 0
        ? 'No PRs found matching filters.'
        : `${markdownTable(
            matchedPrs.map((pr) =>
              toRow(pr, withFiles ? pathPatterns : undefined),
            ),
            {
              columns: withFiles
                ? LIST_PRS_COLUMNS_WITH_PATHS
                : LIST_PRS_COLUMNS,
            },
          )}\n\n_total: ${matchedPrs.length}${hasMore ? ` (limit ${limit} reached on the unfiltered scan — more may exist; narrow with author/label/branch or raise limit)` : ''}_`;

    return {
      content: [{ type: 'text', text }],
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
