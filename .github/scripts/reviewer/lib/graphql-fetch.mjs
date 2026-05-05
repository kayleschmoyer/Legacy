/**
 * Batch GitHub PR reads into a single GraphQL request to reduce REST
 * rate-limit consumption (LS-4006).
 *
 * GitHub GraphQL calls go against a separate point-based rate limit —
 * not the 5 000 req/hr REST quota — so shifting all startup reads here
 * frees REST budget for write operations (labels, commit statuses, reviews).
 */

import { execFileSync } from 'node:child_process';

const MAX_BUFFER = 10 * 1024 * 1024;

/**
 * Normalize a GitHub GraphQL author node to a login string, appending `[bot]`
 * when the API omits it for Bot accounts. Returns null when author is absent.
 *
 * @param {{ login: string, __typename: string } | null | undefined} author
 * @returns {string | null}
 */
export function normalizeBotLogin(author) {
  if (!author) return null;
  if (author.__typename === 'Bot' && !author.login.endsWith('[bot]')) {
    return `${author.login}[bot]`;
  }
  return author.login;
}

// Fetches up to 100 items per collection. pageInfo.hasNextPage is included so
// we can detect and reject PRs that exceed the limit rather than silently
// computing cycles or author responses from incomplete data.
export const PR_DATA_QUERY = `
  query FetchPRData($owner: String!, $repo: String!, $prNumber: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $prNumber) {
        number
        title
        body
        isDraft
        isCrossRepository
        headRefName
        baseRefName
        author {
          login
          __typename
        }
        reviews(first: 100) {
          nodes {
            databaseId
            author { login __typename }
            state
            body
            submittedAt
            commit { oid }
          }
          pageInfo { hasNextPage }
        }
        comments(first: 100) {
          nodes {
            databaseId
            author { login }
            body
            createdAt
          }
          pageInfo { hasNextPage }
        }
        reviewThreads(first: 100) {
          nodes {
            comments(first: 100) {
              nodes {
                databaseId
                author { login __typename }
                body
                createdAt
              }
              pageInfo { hasNextPage }
            }
          }
          pageInfo { hasNextPage }
        }
        commits(first: 100) {
          nodes {
            commit { oid }
          }
          pageInfo { hasNextPage }
        }
        labels(first: 100) {
          nodes { name }
          pageInfo { hasNextPage }
        }
      }
    }
  }
`;

/**
 * Map a GitHub GraphQL PullRequest node to the shapes used by index.mjs.
 * Pure function — exported for unit testing.
 *
 * @param {object} pr   The `data.repository.pullRequest` GraphQL node
 * @param {string} diff  Unified diff string (fetched separately via gh pr diff)
 * @returns {{ prContext: object, reviews: object[], commits: string[],
 *             reviewComments: object[], issueComments: object[] }}
 */
export function mapPrGraphQLResponse(pr, diff) {
  const prContext = {
    number: pr.number,
    title: pr.title,
    body: pr.body,
    isDraft: pr.isDraft,
    isCrossRepository: pr.isCrossRepository,
    headRefName: pr.headRefName,
    baseRefName: pr.baseRefName,
    author: {
      login: pr.author?.login ?? '',
      is_bot: pr.author?.__typename === 'Bot',
    },
    labels: (pr.labels?.nodes ?? []).map((l) => l.name),
    diff,
  };

  const reviews = pr.reviews.nodes.map((r) => ({
    id: r.databaseId,
    userLogin: normalizeBotLogin(r.author),
    state: r.state,
    body: r.body ?? null,
    submittedAt: r.submittedAt,
    commitId: r.commit?.oid ?? null,
  }));

  const commits = pr.commits.nodes.map((n) => n.commit.oid);

  // reviewThreads groups inline comments into threads. Reconstruct the
  // inReplyToId (REST shape) from thread position: root is index 0, all
  // subsequent replies point to the root's databaseId (mirrors REST behaviour
  // where in_reply_to_id always points to the thread root, not the prior reply).
  const reviewComments = pr.reviewThreads.nodes.flatMap((thread) =>
    thread.comments.nodes.map((c, i) => ({
      id: c.databaseId,
      inReplyToId: i === 0 ? null : thread.comments.nodes[0].databaseId,
      userLogin: normalizeBotLogin(c.author),
      body: c.body ?? '',
      createdAt: c.createdAt ?? '',
    })),
  );

  const issueComments = pr.comments.nodes.map((c) => ({
    id: c.databaseId,
    userLogin: c.author?.login ?? null,
    body: c.body ?? '',
    createdAt: c.createdAt ?? '',
  }));

  return { prContext, reviews, commits, reviewComments, issueComments };
}

function getOwnerRepo(exec = execFileSync) {
  const ghRepo = process.env.GITHUB_REPOSITORY ?? '';
  if (ghRepo.includes('/')) {
    const slash = ghRepo.indexOf('/');
    return [ghRepo.slice(0, slash), ghRepo.slice(slash + 1)];
  }
  // Fallback for local runs where GITHUB_REPOSITORY is unset
  const json = exec('gh', ['repo', 'view', '--json', 'owner,name'], {
    encoding: 'utf8',
  });
  const d = JSON.parse(json);
  return [d.owner.login, d.name];
}

/**
 * Batch-fetch all PR data needed by the reviewer in ≤1 GraphQL request
 * (plus one REST call for the unified diff, which GraphQL doesn't expose).
 *
 * Replaces the following per-cycle REST reads:
 *   - getPullRequestContext  →  gh pr view + gh pr diff  (2 REST calls)
 *   - getPrReviews           →  pulls/{n}/reviews        (1 REST call)
 *   - getPrCommits           →  pulls/{n}/commits        (1 REST call)
 *   - getPrReviewComments    →  pulls/{n}/comments       (1 REST call)
 *   - getPrIssueComments     →  issues/{n}/comments      (1 REST call)
 *
 * @param {number} prNumber
 * @returns {{ prContext: object, reviews: object[], commits: string[],
 *             reviewComments: object[], issueComments: object[] }}
 */
export function fetchPrData(prNumber, exec = execFileSync) {
  const [owner, repo] = getOwnerRepo(exec);
  const requestBody = JSON.stringify({
    query: PR_DATA_QUERY,
    variables: { owner, repo, prNumber },
  });

  const raw = exec('gh', ['api', 'graphql', '--input', '-'], {
    encoding: 'utf8',
    input: requestBody,
    maxBuffer: MAX_BUFFER,
  });

  const data = JSON.parse(raw);
  if (data.errors?.length) {
    throw new Error(
      `[graphql-fetch] GraphQL errors: ${data.errors.map((e) => e.message).join('; ')}`,
    );
  }

  const pr = data.data?.repository?.pullRequest;
  if (!pr) {
    throw new Error(
      `[graphql-fetch] PR #${prNumber} not found or inaccessible (repository: ${data.data?.repository ? 'ok' : 'null'})`,
    );
  }

  // Detect collection truncation before mapping so callers never compute
  // cycle counts or author responses from a silently incomplete dataset.
  const truncated = [];
  if (pr.reviews.pageInfo.hasNextPage) truncated.push('reviews');
  if (pr.comments.pageInfo.hasNextPage) truncated.push('issue comments');
  if (pr.reviewThreads.pageInfo.hasNextPage) truncated.push('review threads');
  if (pr.commits.pageInfo.hasNextPage) truncated.push('commits');
  if (pr.labels?.pageInfo?.hasNextPage) truncated.push('labels');
  if (pr.reviewThreads.nodes.some((t) => t.comments.pageInfo.hasNextPage))
    truncated.push('comments within a review thread');
  if (truncated.length > 0) {
    throw new Error(
      `[graphql-fetch] PR #${prNumber} exceeds 100-item GraphQL limit for: ${truncated.join(', ')}. ` +
        `Reviewer requires complete data to compute review cycles accurately.`,
    );
  }

  const diff = exec('gh', ['pr', 'diff', String(prNumber)], {
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
  });

  return mapPrGraphQLResponse(pr, diff);
}
