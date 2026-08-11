import { githubGraphQL } from '../github-api.js';

export interface ReviewNode {
  author: { login: string } | null;
  state: string;
  submittedAt: string;
}

interface ReviewsPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

const REVIEWS_PAGE_QUERY = `
query($owner: String!, $repo: String!, $number: Int!, $cursor: String!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviews(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes { author { login } state submittedAt }
      }
    }
  }
}`;

interface ReviewsPageResponse {
  repository: {
    pullRequest: null | {
      reviews: { pageInfo: ReviewsPageInfo; nodes: ReviewNode[] };
    };
  };
}

/**
 * Fetch every review page beyond a query's initial page. A `reviews(first: N)`
 * query only returns the *earliest* N reviews — on a PR with more than N
 * reviews, a reviewer's true latest state can fall outside that window
 * entirely, so `latestReviewsByAuthor`/`deriveReviewDecision` would silently
 * fall back to a stale earlier review instead of the actual latest one
 * (caught in review on LS-8708 — the same class of staleness this file
 * exists to fix, just caused by pagination instead of GitHub's own lag).
 */
export async function fetchAllReviews(
  owner: string,
  repo: string,
  number: number,
  firstPage: { nodes: ReviewNode[]; pageInfo: ReviewsPageInfo },
): Promise<ReviewNode[]> {
  const nodes = [...firstPage.nodes];
  let hasNextPage = firstPage.pageInfo.hasNextPage;
  let cursor = firstPage.pageInfo.endCursor;

  while (hasNextPage && cursor) {
    const result = await githubGraphQL<ReviewsPageResponse>(
      REVIEWS_PAGE_QUERY,
      { owner, repo, number, cursor },
    );
    const reviews = result.data.repository.pullRequest?.reviews;
    if (!reviews) break;
    nodes.push(...reviews.nodes);
    hasNextPage = reviews.pageInfo.hasNextPage;
    cursor = reviews.pageInfo.endCursor;
  }

  return nodes;
}

/**
 * Reduce a PR's review history to each reviewer's most recent review (by
 * `submittedAt`). GraphQL's `reviews` connection returns every review ever
 * submitted, so a reviewer who requested changes and later approved shows up
 * twice — without this dedup a stale `CHANGES_REQUESTED` review outlives the
 * reviewer's actual (approved) state indefinitely (LS-8364).
 */
export function latestReviewsByAuthor<T extends ReviewNode>(reviews: T[]): T[] {
  const seen = new Map<string, T>();
  for (const review of reviews) {
    const key = review.author?.login ?? 'unknown';
    const existing = seen.get(key);
    if (!existing || review.submittedAt > existing.submittedAt) {
      seen.set(key, review);
    }
  }
  return [...seen.values()];
}

/**
 * Derive an effective review decision from each reviewer's latest state
 * rather than trusting GitHub's `reviewDecision` GraphQL field, which can
 * stay stale (e.g. still `CHANGES_REQUESTED`) for minutes after a reviewer's
 * newest review supersedes their own earlier one (LS-8364, LS-8708). Falls
 * back to the raw `reviewDecision` field for states this can't derive from
 * review nodes alone (e.g. `REVIEW_REQUIRED`, no reviews yet).
 */
export function deriveReviewDecision(
  reviews: ReviewNode[],
  fallback: string | null,
): string | null {
  const latest = latestReviewsByAuthor(reviews);
  if (latest.some((r) => r.state === 'CHANGES_REQUESTED')) {
    return 'CHANGES_REQUESTED';
  }
  if (latest.some((r) => r.state === 'APPROVED')) {
    return 'APPROVED';
  }
  return fallback;
}
