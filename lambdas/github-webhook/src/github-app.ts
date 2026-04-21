import { sign } from 'jsonwebtoken';
import { LOGGER } from '@legacy-sports/logging';

const GITHUB_API = 'https://api.github.com';

/** Default request timeout for GitHub API calls (15s — well inside the 30s Lambda timeout) */
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Generate a GitHub App JWT signed with the app's RSA private key.
 * Valid for 9 minutes (GitHub caps at 10; we use 9 to allow clock drift).
 */
function generateAppJwt(appId: number, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      iat: now - 60, // issued 60s in the past to tolerate clock skew
      exp: now + 9 * 60,
      iss: String(appId),
    },
    privateKey,
    { algorithm: 'RS256' },
  );
}

/**
 * Look up the installation ID for a GitHub App on a specific repository,
 * then exchange the App JWT for a short-lived installation access token.
 *
 * Use this when you know the app + repo but not the installation ID.
 * The token inherits the app's permissions for that installation.
 */
export async function getRepoInstallationToken(
  appId: number,
  privateKey: string,
  owner: string,
  repo: string,
): Promise<string> {
  const jwt = generateAppJwt(appId, privateKey);

  const instResp = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/installation`,
    {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );

  if (!instResp.ok) {
    const body = await instResp.text();
    throw new Error(
      `Failed to get installation for ${owner}/${repo} (${instResp.status}): ${body}`,
    );
  }

  const { id: installationId } = (await instResp.json()) as { id: number };
  return getInstallationToken(appId, privateKey, installationId);
}

/**
 * Exchange a GitHub App JWT for an installation access token.
 * The token is scoped to the given installation and inherits the app's permissions.
 */
export async function getInstallationToken(
  appId: number,
  privateKey: string,
  installationId: number,
): Promise<string> {
  const jwt = generateAppJwt(appId, privateKey);

  const resp = await fetch(
    `${GITHUB_API}/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(
      `Failed to get installation token (${resp.status}): ${body}`,
    );
  }

  const data = (await resp.json()) as { token: string };
  LOGGER.info('Obtained installation access token', { installationId });
  return data.token;
}

/**
 * Create a check run on a repository using the provided installation token.
 */
export async function createCheckRun(
  installationToken: string,
  owner: string,
  repo: string,
  params: {
    name: string;
    headSha: string;
    conclusion: 'success' | 'failure' | 'neutral';
    title: string;
    summary: string;
  },
): Promise<void> {
  const resp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/check-runs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${installationToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      name: params.name,
      head_sha: params.headSha,
      status: 'completed',
      conclusion: params.conclusion,
      output: {
        title: params.title,
        summary: params.summary,
      },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Failed to create check run (${resp.status}): ${body}`);
  }

  LOGGER.info('Created check run', {
    owner,
    repo,
    name: params.name,
    conclusion: params.conclusion,
  });
}

/**
 * Query all review threads on a PR via GraphQL.
 * Returns threads with their resolved/outdated state and the author login of
 * each thread's first comment, so the caller can filter to Copilot threads.
 */
export async function getPrReviewThreads(
  installationToken: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<
  Array<{
    isResolved: boolean;
    isOutdated: boolean;
    authorLogin: string | null;
  }>
> {
  const query = `
    query($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          reviewThreads(first: 100, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            nodes {
              isResolved
              isOutdated
              comments(first: 1) {
                nodes { author { login } }
              }
            }
          }
        }
      }
    }
  `;

  const threads: Array<{
    isResolved: boolean;
    isOutdated: boolean;
    authorLogin: string | null;
  }> = [];

  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const resp = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${installationToken}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        query,
        variables: { owner, repo, number: prNumber, cursor },
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`GraphQL request failed (${resp.status}): ${body}`);
    }

    const json = (await resp.json()) as {
      data?: {
        repository: {
          pullRequest: {
            reviewThreads: {
              pageInfo: { hasNextPage: boolean; endCursor: string | null };
              nodes: Array<{
                isResolved: boolean;
                isOutdated: boolean;
                comments: {
                  nodes: Array<{ author: { login: string } | null }>;
                };
              }>;
            };
          };
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (json.errors?.length) {
      throw new Error(
        `GraphQL errors: ${json.errors.map((e) => e.message).join(', ')}`,
      );
    }

    const reviewThreads = json.data?.repository?.pullRequest?.reviewThreads;
    if (!reviewThreads) {
      throw new Error(
        'GraphQL response missing data.repository.pullRequest.reviewThreads — check app permissions',
      );
    }

    for (const node of reviewThreads.nodes) {
      const firstComment = node.comments.nodes[0];
      threads.push({
        isResolved: node.isResolved,
        isOutdated: node.isOutdated,
        authorLogin: firstComment?.author?.login ?? null,
      });
    }

    hasNextPage = reviewThreads.pageInfo.hasNextPage;
    cursor = reviewThreads.pageInfo.endCursor;
  }

  return threads;
}

/**
 * Fetch all submitted reviews on a PR via the REST API.
 * Returns the fields needed to determine whether Copilot has cleared its threads.
 */
export async function getPrReviews(
  installationToken: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<
  Array<{
    state: string;
    body: string | null;
    userLogin: string;
    submittedAt: string;
  }>
> {
  const resp = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
    {
      headers: {
        Authorization: `Bearer ${installationToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Failed to get PR reviews (${resp.status}): ${body}`);
  }

  const data = (await resp.json()) as Array<{
    state: string;
    body: string;
    user: { login: string };
    submitted_at: string;
  }>;

  return data.map((r) => ({
    state: r.state,
    body: r.body ?? null,
    userLogin: r.user.login,
    submittedAt: r.submitted_at,
  }));
}
