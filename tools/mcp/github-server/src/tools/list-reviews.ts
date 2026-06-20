import { markdownTable, minifiedJson } from '@legacy-sports/mcp-format';
import { getRepoOwnerName } from '../auth.js';
import { githubGraphQL, githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

// Single-PR reviews are a flat, uniform list → Markdown table (LS-8021).
const REVIEW_COLUMNS = [
  'reviewer',
  'state',
  'submittedAt',
  'bodyLength',
  'commentCount',
] as const;

interface ListReviewsParams {
  number?: number;
  prs?: number[];
  reviewer?: string;
  latestOnly?: boolean;
}

interface GitHubReview {
  id: number;
  user: { login: string } | null;
  state: string;
  submitted_at: string;
  body: string;
}

interface MappedReview {
  // Index signature lets reviews flow into @legacy-sports/mcp-format's
  // markdownTable (FlatRecord) while keeping the named fields typed.
  [key: string]: unknown;
  reviewer: string;
  state: string;
  submittedAt: string;
  bodyLength: number;
  commentCount: number;
}

async function fetchReviewCommentCount(
  basePath: string,
  reviewId: number,
): Promise<number> {
  const commentsPath = `${basePath}/${reviewId}/comments`;
  let count = 0;
  let page = 1;
  const perPage = 100;
  while (true) {
    const batch = await githubRest<unknown[]>({
      method: 'GET',
      path: commentsPath,
      query: { per_page: String(perPage), page: String(page) },
    });
    count += batch.length;
    if (batch.length < perPage) break;
    page++;
  }
  return count;
}

function applyFilters(
  reviews: MappedReview[],
  reviewer: string | undefined,
  latestOnly: boolean,
): MappedReview[] {
  let result = reviews;
  if (reviewer) {
    const reviewerLower = reviewer.toLowerCase();
    result = result.filter((r) => r.reviewer.toLowerCase() === reviewerLower);
  }
  if (latestOnly) {
    const seen = new Map<string, MappedReview>();
    for (const r of result) {
      const existing = seen.get(r.reviewer);
      if (!existing || r.submittedAt > existing.submittedAt) {
        seen.set(r.reviewer, r);
      }
    }
    result = Array.from(seen.values());
  }
  return result;
}

async function listReviewsSingle(
  params: Required<Pick<ListReviewsParams, 'number'>> &
    Pick<ListReviewsParams, 'reviewer' | 'latestOnly'>,
): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();
    const path = `/repos/${repo.owner}/${repo.name}/pulls/${params.number}/reviews`;

    const reviews: GitHubReview[] = [];
    let page = 1;
    const perPage = 100;
    while (true) {
      const batch = await githubRest<GitHubReview[]>({
        method: 'GET',
        path,
        query: { per_page: String(perPage), page: String(page) },
      });
      reviews.push(...batch);
      if (batch.length < perPage) break;
      page++;
    }

    const totalCounts = await Promise.all(
      reviews.map((r) => fetchReviewCommentCount(path, r.id)),
    );
    const allMapped: MappedReview[] = reviews.map((r, i) => ({
      reviewer: r.user?.login ?? 'unknown',
      state: r.state,
      submittedAt: r.submitted_at,
      bodyLength: r.body.length,
      commentCount: totalCounts[i],
    }));

    const latestOnly = params.latestOnly !== false;
    const filtered = applyFilters(allMapped, params.reviewer, latestOnly);

    const header = `_PR #${params.number}, total: ${reviews.length}, returned: ${filtered.length}, latestOnly: ${latestOnly}${params.reviewer ? `, reviewer: ${params.reviewer}` : ''}_`;
    const text =
      filtered.length === 0
        ? `No reviews found for PR #${params.number}.`
        : `${header}\n\n${markdownTable(filtered, { columns: REVIEW_COLUMNS })}`;

    return {
      content: [{ type: 'text', text }],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to list reviews for PR #${params.number}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

interface BatchReviewNode {
  author: { login: string } | null;
  state: string;
  submittedAt: string;
  body: string;
  comments: { totalCount: number };
}

type BatchResponse = Record<
  string,
  {
    number: number;
    reviews: { nodes: BatchReviewNode[]; totalCount: number };
  } | null
>;

// Per-PR review cap for batch mode. GitHub GraphQL caps `first` at 100.
// 100 is well above the realistic review count for any single PR in this
// repo (bot + 1-2 human reviewers, occasionally re-reviews) — the batch
// caller (sweep agents) wants the latest reviewer states, not full history.
// PRs that exceed the cap surface in `truncated` so callers can fall back
// to the single-PR REST path if they actually need the full list.
const BATCH_REVIEWS_PER_PR = 100;

function buildBatchQuery(prs: number[]): string {
  const aliases = prs
    .map(
      (n) => `
  pr${n}: pullRequest(number: ${n}) {
    number
    reviews(first: ${BATCH_REVIEWS_PER_PR}) {
      totalCount
      nodes {
        author { login }
        state
        submittedAt
        body
        comments { totalCount }
      }
    }
  }`,
    )
    .join('');
  return `query($owner: String!, $repo: String!) {
  repository(owner: $owner, name: $repo) {${aliases}
  }
}`;
}

async function listReviewsBatch(
  params: Required<Pick<ListReviewsParams, 'prs'>> &
    Pick<ListReviewsParams, 'reviewer' | 'latestOnly'>,
): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();
    const query = buildBatchQuery(params.prs);

    const result = await githubGraphQL<{
      repository: BatchResponse;
    }>(query, { owner: repo.owner, repo: repo.name });

    const repoData = result.data.repository;
    const latestOnly = params.latestOnly !== false;

    const reviews: Record<number, MappedReview[]> = {};
    const missing: number[] = [];
    const truncated: number[] = [];

    for (const prNumber of params.prs) {
      const node = repoData?.[`pr${prNumber}`];
      if (!node) {
        missing.push(prNumber);
        continue;
      }
      if (node.reviews.totalCount > BATCH_REVIEWS_PER_PR) {
        truncated.push(prNumber);
      }
      const mapped: MappedReview[] = node.reviews.nodes.map((r) => ({
        reviewer: r.author?.login ?? 'unknown',
        state: r.state,
        submittedAt: r.submittedAt,
        bodyLength: r.body.length,
        commentCount: r.comments.totalCount,
      }));
      reviews[prNumber] = applyFilters(mapped, params.reviewer, latestOnly);
    }

    // Batch results are a PR-keyed map of review arrays → minified JSON (the
    // nested, multi-key shape doesn't fit a single flat table).
    const summary = {
      reviews,
      missing,
      truncated,
      reviewerFilter: params.reviewer ?? null,
      latestOnly,
    };

    return {
      content: [{ type: 'text', text: minifiedJson(summary) }],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to list reviews for PRs [${params.prs.join(', ')}]: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function listReviews(
  params: ListReviewsParams,
): Promise<ToolResult> {
  if (params.prs !== undefined) {
    if (params.prs.length === 0) {
      return {
        isError: true,
        content: [
          { type: 'text', text: '`prs` must contain at least one PR number' },
        ],
      };
    }
    return listReviewsBatch({
      prs: params.prs,
      reviewer: params.reviewer,
      latestOnly: params.latestOnly,
    });
  }

  if (params.number === undefined) {
    return {
      isError: true,
      content: [
        { type: 'text', text: 'Must provide either `number` or `prs`' },
      ],
    };
  }

  return listReviewsSingle({
    number: params.number,
    reviewer: params.reviewer,
    latestOnly: params.latestOnly,
  });
}

export const __test = { buildBatchQuery };
