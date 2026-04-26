import { sign } from 'jsonwebtoken';
import { LOGGER } from '@legacy-sports/logging';

const GITHUB_API = 'https://api.github.com';

/** Maximum number of pages to fetch per paginated GraphQL call (100 nodes/page → 1 000 threads max). */
const MAX_PAGES = 10;

/** Default request timeout for GitHub API calls (15 s — well inside the 30 s Lambda timeout). */
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
 * Find the in_progress check run by name and head SHA created by this app,
 * returning its ID or null. Prefers in_progress status over completed so we
 * update the run we actually want to close out, not a stale completed one.
 * Only returns null when the check run genuinely doesn't exist (404 / empty
 * list) — any other non-2xx response is surfaced as an error so transient
 * failures don't silently fall back to POST and recreate the duplicate.
 *
 * Note: only check runs owned by the same GitHub App as `installationToken`
 * are updatable. The Lambda (Review Bot App) can update its own runs; the
 * copilot-review-handler workflow (GITHUB_TOKEN / github-actions app) cannot
 * update Lambda-owned runs and must create a new one instead.
 */
async function findInProgressCheckRunId(
  installationToken: string,
  owner: string,
  repo: string,
  name: string,
  headSha: string,
): Promise<number | null> {
  const resp = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/commits/${headSha}/check-runs?check_name=${encodeURIComponent(name)}&per_page=10`,
    {
      headers: {
        Authorization: `Bearer ${installationToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );

  // 404 means the commit isn't indexed yet — treat as "not found"
  if (resp.status === 404) return null;

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Failed to look up check runs (${resp.status}): ${body}`);
  }

  const data = (await resp.json()) as {
    total_count: number;
    check_runs: Array<{ id: number; status: string }>;
  };

  // Prefer the in_progress run — that's the one we want to close out
  const inProgress = data.check_runs.find((r) => r.status === 'in_progress');
  return inProgress?.id ?? null;
}

/**
 * Upsert a completed check run: update the existing one if present, create otherwise.
 * Prevents duplicate check runs accumulating when Lambda sets in_progress on push
 * and the handler later resolves it to success/failure.
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
  const existingId = await findInProgressCheckRunId(
    installationToken,
    owner,
    repo,
    params.name,
    params.headSha,
  );

  const url = existingId
    ? `${GITHUB_API}/repos/${owner}/${repo}/check-runs/${existingId}`
    : `${GITHUB_API}/repos/${owner}/${repo}/check-runs`;

  const resp = await fetch(url, {
    method: existingId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${installationToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      name: params.name,
      ...(existingId ? {} : { head_sha: params.headSha }),
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
    throw new Error(
      `Failed to ${existingId ? 'update' : 'create'} check run (${resp.status}): ${body}`,
    );
  }

  LOGGER.info('Upserted check run', {
    owner,
    repo,
    name: params.name,
    conclusion: params.conclusion,
    updated: existingId != null,
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
  let pages = 0;

  while (hasNextPage && pages < MAX_PAGES) {
    pages++;
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

  if (hasNextPage) {
    // >1 000 review threads is effectively unreachable in practice. Throwing
    // here would bubble to the Lambda handler, return a 500, and leave
    // bot-review stuck in_progress. Log a warning and return what we have
    // instead — the worst-case false-success for an absurdly large PR is
    // preferable to leaving it permanently blocked.
    LOGGER.warn(
      'getPrReviewThreads hit MAX_PAGES limit — returning partial thread list',
      { owner, repo, prNumber, maxPages: MAX_PAGES },
    );
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
    commitId: string;
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
    body: string | null;
    user: { login: string };
    submitted_at: string;
    commit_id: string;
  }>;

  return data.map((r) => ({
    state: r.state,
    body: r.body ?? null,
    userLogin: r.user.login,
    submittedAt: r.submitted_at,
    commitId: r.commit_id,
  }));
}

/**
 * Create an in-progress check run on a repository.
 */
export async function createInProgressCheckRun(
  installationToken: string,
  owner: string,
  repo: string,
  params: { name: string; headSha: string; title: string; summary: string },
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
      status: 'in_progress',
      output: { title: params.title, summary: params.summary },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(
      `Failed to create in-progress check run (${resp.status}): ${body}`,
    );
  }

  LOGGER.info('Created in-progress check run', {
    owner,
    repo,
    name: params.name,
  });
}

/**
 * Logins GitHub may return for Copilot in the `requested_reviewers` response.
 * The REST API normalizes the bot name to "Copilot" in the response even
 * though we send "copilot-pull-request-reviewer[bot]" in the request.
 */
const COPILOT_RESPONSE_LOGINS = new Set([
  'Copilot',
  'copilot-pull-request-reviewer',
  'copilot-pull-request-reviewer[bot]',
]);

/**
 * Result of a `requestCopilotReview` call. The `kind` discriminates the
 * `added: false` cases so callers (and operators reading logs) don't conflate
 * GitHub's documented installation-token silent-drop with HTTP 422 ("already
 * reviewing") or an unexpected response shape:
 *
 *   - `'silent-drop'`     201 OK, response parsed, Copilot absent from
 *                         `requested_reviewers`. The documented failure mode
 *                         for installation tokens.
 *   - `'http-422'`        Non-fatal validation error from GitHub. Often means
 *                         Copilot is already a reviewer.
 *   - `'unparseable-response'`
 *                         201 OK but the body could not be parsed as JSON.
 *                         Could indicate API-shape drift or a transient
 *                         truncation, so we don't assume the silent-drop cause.
 */
export type CopilotReviewRequestResult =
  | { added: true }
  | {
      added: false;
      kind: 'silent-drop' | 'http-422' | 'unparseable-response';
      reason: string;
    };

/**
 * Request Copilot as a reviewer on a PR. Idempotent — safe to call when
 * Copilot is already in requested_reviewers.
 *
 * Verifies the response includes Copilot in `requested_reviewers`. GitHub's
 * REST API silently drops Copilot when called with a GitHub App installation
 * token — it returns HTTP 201 success but the reviewer never appears in the
 * response. Callers should branch on `added` rather than assume success.
 */
export async function requestCopilotReview(
  installationToken: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<CopilotReviewRequestResult> {
  const resp = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}/requested_reviewers`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${installationToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        reviewers: ['copilot-pull-request-reviewer[bot]'],
      }),
    },
  );

  if (!resp.ok) {
    const body = await resp.text();
    // 422 means Copilot can't be requested (e.g. it's already reviewing) — not fatal
    if (resp.status === 422) {
      LOGGER.warn(
        'Copilot reviewer request returned 422 (may already be reviewing)',
        {
          owner,
          repo,
          prNumber,
          body,
        },
      );
      return { added: false, kind: 'http-422', reason: `HTTP 422: ${body}` };
    }
    throw new Error(
      `Failed to request Copilot review (${resp.status}): ${body}`,
    );
  }

  // GitHub's REST API silently drops Copilot when called with an installation
  // token: 201 OK but Copilot is missing from `requested_reviewers`. Parse the
  // response to detect this — but a body that fails to parse is a different
  // failure mode (API-shape drift, truncation) and should be reported as such
  // rather than misattributed to the installation-token bug.
  let parsedAddedLogins: string[] | null = null;
  let parseError: unknown = null;
  try {
    const data = (await resp.json()) as {
      requested_reviewers?: Array<{ login: string }>;
    };
    parsedAddedLogins = (data.requested_reviewers ?? []).map((r) => r.login);
  } catch (err) {
    parseError = err;
  }

  if (parsedAddedLogins === null) {
    LOGGER.warn('Failed to parse requested_reviewers response body', {
      owner,
      repo,
      prNumber,
      error:
        parseError instanceof Error ? parseError.message : String(parseError),
    });
    return {
      added: false,
      kind: 'unparseable-response',
      reason: 'GitHub returned 201 but the response body could not be parsed',
    };
  }

  const added = parsedAddedLogins.some((login) =>
    COPILOT_RESPONSE_LOGINS.has(login),
  );

  if (!added) {
    LOGGER.warn(
      'Copilot was silently dropped from requested_reviewers — installation tokens cannot trigger Copilot via the REST API',
      { owner, repo, prNumber },
    );
    return {
      added: false,
      kind: 'silent-drop',
      reason:
        'GitHub returned 201 but Copilot was not added — installation tokens silently drop the Copilot reviewer',
    };
  }

  LOGGER.info('Requested Copilot review', { owner, repo, prNumber });
  return { added: true };
}

/**
 * Fetch the git tree SHA for a commit. Two commits with the same tree SHA
 * have byte-identical file contents, so any patch produced against a common
 * base is also identical. Used by the race-check carry-forward to detect
 * empty commits (and other rebases that preserve content) — there is nothing
 * for Copilot to re-review when the tree hasn't changed.
 *
 * Returns null when the commit no longer exists (e.g. force-pushed away).
 */
export async function getCommitTreeSha(
  installationToken: string,
  owner: string,
  repo: string,
  commitSha: string,
): Promise<string | null> {
  const resp = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/commits/${commitSha}`,
    {
      headers: {
        Authorization: `Bearer ${installationToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );

  if (resp.status === 404 || resp.status === 422) return null;

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Failed to get commit (${resp.status}): ${body}`);
  }

  const data = (await resp.json()) as { commit: { tree: { sha: string } } };
  return data.commit.tree.sha;
}

/**
 * List pull requests associated with a commit SHA.
 * Used by the workflow_run handler to resolve headSha → PR number without
 * needing the PR number baked into the event payload.
 */
export async function listPullRequestsForCommit(
  installationToken: string,
  owner: string,
  repo: string,
  commitSha: string,
): Promise<
  Array<{
    number: number;
    state: string;
    headSha: string;
    headRepoFullName: string | null;
    updatedAt: string;
  }>
> {
  const resp = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/commits/${commitSha}/pulls`,
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
    throw new Error(`Failed to list PRs for commit (${resp.status}): ${body}`);
  }

  const data = (await resp.json()) as Array<{
    number: number;
    state: string;
    head: { sha: string; repo: { full_name: string } | null };
    updated_at: string;
  }>;

  return data.map((pr) => ({
    number: pr.number,
    state: pr.state,
    headSha: pr.head.sha,
    headRepoFullName: pr.head.repo?.full_name ?? null,
    updatedAt: pr.updated_at,
  }));
}

/**
 * Get essential PR metadata for race-check: state, current head SHA, draft
 * flag, and the logins currently listed as requested reviewers (bots + users).
 */
export async function getPrMeta(
  installationToken: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<{
  state: string;
  headSha: string;
  draft: boolean;
  requestedReviewerLogins: string[];
}> {
  const resp = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}`,
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
    throw new Error(`Failed to get PR meta (${resp.status}): ${body}`);
  }

  const data = (await resp.json()) as {
    state: string;
    draft: boolean;
    head: { sha: string };
    requested_reviewers?: Array<{ login: string }>;
  };

  return {
    state: data.state,
    headSha: data.head.sha,
    draft: data.draft,
    requestedReviewerLogins: (data.requested_reviewers ?? []).map(
      (r) => r.login,
    ),
  };
}

/**
 * List check runs on a specific commit SHA, filtered to a single check name.
 * Returns just the names present on that ref — used to check whether a given
 * required check (e.g. `bot-review`) has been written for the current headSha.
 */
export async function getCheckRunNamesForRef(
  installationToken: string,
  owner: string,
  repo: string,
  ref: string,
  checkName: string,
): Promise<string[]> {
  const url =
    `${GITHUB_API}/repos/${owner}/${repo}/commits/${ref}/check-runs` +
    `?check_name=${encodeURIComponent(checkName)}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${installationToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(
      `Failed to list check runs for ref (${resp.status}): ${body}`,
    );
  }

  const data = (await resp.json()) as {
    check_runs: Array<{ name: string }>;
  };
  return data.check_runs.map((r) => r.name);
}

/**
 * Add a label to a PR (or issue). Idempotent — GitHub ignores duplicate labels.
 */
export async function addLabel(
  installationToken: string,
  owner: string,
  repo: string,
  issueNumber: number,
  label: string,
): Promise<void> {
  const resp = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/issues/${issueNumber}/labels`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${installationToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({ labels: [label] }),
    },
  );

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Failed to add label (${resp.status}): ${body}`);
  }

  LOGGER.info('Added label', { owner, repo, issueNumber, label });
}
