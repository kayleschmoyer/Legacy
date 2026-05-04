import { createSign, randomBytes } from 'node:crypto';
import { request } from 'node:https';
import { execFileSync } from 'node:child_process';

// Crockford Base32 alphabet used by the ULID spec.
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Generate a ULID (Universally Unique Lexicographically Sortable Identifier).
 * 48-bit millisecond timestamp + 80-bit cryptographically-random component,
 * encoded in Crockford Base32.
 *
 * These IDs are per-review-run identifiers — each run assigns fresh ULIDs to
 * findings. T22 (cycle protocol) matches author replies against the *most
 * recent* bot review's issue IDs, not across review cycles.
 *
 * @returns {string} 26-character ULID
 */
export function generateUlid() {
  const now = Date.now();
  const rand = randomBytes(10); // 80 random bits

  // 10 timestamp chars (48 bits → 10 × 5-bit groups, big-endian)
  let ts = now;
  const timePart = new Array(10);
  for (let i = 9; i >= 0; i--) {
    timePart[i] = B32[ts & 0x1f];
    ts = Math.floor(ts / 32);
  }

  // 16 random chars (80 bits → 16 × 5-bit groups, big-endian)
  let r = BigInt('0x' + rand.toString('hex'));
  const randPart = new Array(16);
  for (let i = 15; i >= 0; i--) {
    randPart[i] = B32[Number(r & 31n)];
    r >>= 5n;
  }

  return timePart.join('') + randPart.join('');
}

/**
 * Create a signed RS256 JWT for GitHub App authentication.
 *
 * @param {string|number} appId
 * @param {string} privateKeyPem  PEM-encoded RSA private key
 * @returns {string}
 */
function mintAppJwt(appId, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ iat: now - 60, exp: now + 540, iss: String(appId) }),
  ).toString('base64url');
  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(privateKeyPem, 'base64url');
  return `${header}.${payload}.${sig}`;
}

/**
 * Make a GitHub REST API request authenticated with a JWT.
 *
 * @param {string} path    API path, e.g. `/repos/owner/repo/installation`
 * @param {'GET'|'POST'} method
 * @param {string} jwt
 * @param {object|undefined} body
 * @returns {Promise<object>}
 */
function githubApiRequest(path, method, jwt, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'legacy-sports-reviewer/1.0',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
    };
    const req = request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const remaining = res.headers['x-ratelimit-remaining'];
        const used = res.headers['x-ratelimit-used'];
        const limit = res.headers['x-ratelimit-limit'];
        if (remaining !== undefined) {
          process.stderr.write(
            `[reviewer:rate-limit] ${method} ${path} remaining=${remaining}/${limit} used=${used}\n`,
          );
        }
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(text));
        } else {
          reject(new Error(`GitHub API ${path} → ${res.statusCode}: ${text}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Mint a short-lived GitHub App installation token for this repository.
 *
 * @param {string} jwt
 * @param {string} owner
 * @param {string} repo
 * @returns {Promise<string>} installation access token
 */
async function getInstallationToken(jwt, owner, repo) {
  const inst = await githubApiRequest(
    `/repos/${owner}/${repo}/installation`,
    'GET',
    jwt,
  );
  const tok = await githubApiRequest(
    `/app/installations/${inst.id}/access_tokens`,
    'POST',
    jwt,
  );
  return tok.token;
}

/**
 * Apply a label to a PR using the GitHub App installation token.
 * Unlike addLabel (which uses GITHUB_TOKEN), labels applied via a GitHub App
 * token trigger pull_request.labeled events to other workflows — bypassing
 * GitHub's anti-loop protection so W4 (label-pager) fires on escalation.
 *
 * @param {number} prNumber
 * @param {string} label
 */
export async function addLabelAsApp(prNumber, label) {
  const appId = process.env.REVIEWER_BOT_APP_ID;
  const privateKeyPem = process.env.REVIEWER_BOT_APP_PRIVATE_KEY;

  if (!appId || !privateKeyPem) {
    throw new Error(
      'REVIEWER_BOT_APP_ID and REVIEWER_BOT_APP_PRIVATE_KEY must be set',
    );
  }

  const repoEnv = process.env.GITHUB_REPOSITORY;
  if (!repoEnv || !repoEnv.includes('/')) {
    throw new Error('GITHUB_REPOSITORY env var is required');
  }
  const [owner, repo] = repoEnv.split('/');

  const jwt = mintAppJwt(appId, privateKeyPem);
  const installToken = await getInstallationToken(jwt, owner, repo);

  execFileSync(
    'gh',
    [
      'api',
      `repos/{owner}/{repo}/issues/${prNumber}/labels`,
      '-X',
      'POST',
      '--input',
      '-',
    ],
    {
      encoding: 'utf8',
      input: JSON.stringify({ labels: [label] }),
      env: { ...process.env, GH_TOKEN: installToken },
    },
  );
}

/**
 * Format the PR review body for a blocking or approving review.
 * Each blocking finding gets an embedded <!-- issue-id: ... --> marker so
 * T22 (cycle protocol) can correlate author replies to specific findings.
 *
 * @param {Array<import('./findings.mjs').Finding & { issueId: string }>} blockingWithIds
 * @param {'REQUEST_CHANGES'|'APPROVE'} event
 * @param {{ fallbackModel?: string }} [opts]
 * @returns {string}
 */
export function formatReviewBody(
  blockingWithIds,
  event,
  { fallbackModel } = {},
) {
  const banner = fallbackModel
    ? `> [!NOTE]\n> This review was generated using **${fallbackModel}** (fallback) because the primary model was temporarily unavailable. Quality may differ slightly.\n\n`
    : '';

  if (event === 'APPROVE') {
    return `${banner}LGTM — no blocking findings.`;
  }

  const parts = [`${banner}## Changes Required\n`];
  for (const f of blockingWithIds) {
    const loc = f.file
      ? f.line != null
        ? `\`${f.file}:${f.line}\``
        : `\`${f.file}\``
      : '_PR-level_';
    parts.push(
      `<!-- issue-id: ${f.issueId} -->\n**[${f.severity.toUpperCase()}]** ${f.title} — ${loc}\n\n${f.body}`,
    );
  }
  return parts.join('\n\n');
}

/**
 * Build inline review comments for findings that have a specific file + line
 * location. Accepts both blocking (critical/high) and non-blocking (medium/low)
 * findings; findings without file+line are silently omitted. Each comment embeds
 * an issue-id marker for T22 cycle-protocol tracking.
 *
 * @param {Array<import('./findings.mjs').Finding & { issueId: string }>} findingsWithIds
 * @returns {Array<{ path: string, line: number, side: 'RIGHT', body: string }>}
 */
export function buildInlineComments(findingsWithIds) {
  return findingsWithIds
    .filter((f) => f.file != null && f.line != null)
    .map((f) => ({
      path: f.file,
      line: f.line,
      side: 'RIGHT',
      body: `<!-- issue-id: ${f.issueId} -->\n**[${f.severity.toUpperCase()}]** ${f.title}\n\n${f.body}`,
    }));
}

/**
 * Post a real GitHub PR review as the Code Reviewer Bot.
 *
 * - critical/high findings → REQUEST_CHANGES (review body lists findings;
 *                            those with file+line also become inline threads)
 * - no blocking findings   → APPROVE
 * - medium/low findings    → inline comments on the same review submission
 *
 * Requires env vars:
 *   REVIEWER_BOT_APP_ID          — GitHub App numeric ID (public variable)
 *   REVIEWER_BOT_APP_PRIVATE_KEY — PEM-encoded RSA private key (secret)
 *   GITHUB_REPOSITORY            — "owner/repo" (set automatically by Actions)
 *
 * @param {number} prNumber
 * @param {{ blocking: import('./findings.mjs').Finding[],
 *            nonBlocking: import('./findings.mjs').Finding[],
 *            fallbackModel?: string }} gated
 */
export async function postRealReview(
  prNumber,
  { blocking, nonBlocking, fallbackModel },
) {
  const appId = process.env.REVIEWER_BOT_APP_ID;
  const privateKeyPem = process.env.REVIEWER_BOT_APP_PRIVATE_KEY;

  if (!appId || !privateKeyPem) {
    throw new Error(
      'REVIEWER_BOT_APP_ID and REVIEWER_BOT_APP_PRIVATE_KEY must be set for live review mode',
    );
  }

  const repoEnv = process.env.GITHUB_REPOSITORY;
  if (!repoEnv || !repoEnv.includes('/')) {
    throw new Error(
      'GITHUB_REPOSITORY env var is required for live review mode',
    );
  }
  const [owner, repo] = repoEnv.split('/');

  // Assign a per-run ULID to each finding; T22 matches against the most
  // recent bot review body to correlate author replies.
  const blockingWithIds = blocking.map((f) => ({
    ...f,
    issueId: generateUlid(),
  }));
  const nonBlockingWithIds = nonBlocking.map((f) => ({
    ...f,
    issueId: generateUlid(),
  }));

  const event = blockingWithIds.length > 0 ? 'REQUEST_CHANGES' : 'APPROVE';
  const body = formatReviewBody(blockingWithIds, event, { fallbackModel });
  const comments = buildInlineComments([
    ...blockingWithIds,
    ...nonBlockingWithIds,
  ]);

  const jwt = mintAppJwt(appId, privateKeyPem);
  const installToken = await getInstallationToken(jwt, owner, repo);

  const ghArgs = [
    'api',
    '--method',
    'POST',
    `repos/{owner}/{repo}/pulls/${prNumber}/reviews`,
    '--input',
    '-',
  ];
  const ghEnv = { ...process.env, GH_TOKEN: installToken };

  const payload = JSON.stringify({ body, event, comments });
  try {
    execFileSync('gh', ghArgs, {
      encoding: 'utf8',
      input: payload,
      env: ghEnv,
    });
  } catch (err) {
    const is422 =
      err.message?.includes('422') ||
      err.stdout?.includes('Unprocessable Entity') ||
      err.stderr?.includes('Unprocessable Entity');
    if (!is422 || comments.length === 0) throw err;
    // Inline comment positions are invalid for this diff (e.g. LLM cited a line
    // not present in the diff, or missing side). Retry with body-only so the
    // blocking findings are still posted.
    process.stderr.write(
      '[reviewer] Inline comment positions rejected (422); retrying without inline comments\n',
    );
    execFileSync('gh', ghArgs, {
      encoding: 'utf8',
      input: JSON.stringify({ body, event, comments: [] }),
      env: ghEnv,
    });
  }

  process.stdout.write(
    `[reviewer] Real review posted (${event}): ${blockingWithIds.length} blocking, ${nonBlockingWithIds.length} non-blocking, ${comments.length} total inline threads\n`,
  );
}

/**
 * Post a REQUEST_CHANGES review indicating a persistent LLM API failure.
 * Uses the same GitHub App authentication as postRealReview so the review
 * appears from the bot account.
 *
 * @param {number} prNumber
 */
export async function postInfraErrorReview(prNumber) {
  const appId = process.env.REVIEWER_BOT_APP_ID;
  const privateKeyPem = process.env.REVIEWER_BOT_APP_PRIVATE_KEY;

  if (!appId || !privateKeyPem) {
    throw new Error(
      'REVIEWER_BOT_APP_ID and REVIEWER_BOT_APP_PRIVATE_KEY must be set for live review mode',
    );
  }

  const repoEnv = process.env.GITHUB_REPOSITORY;
  if (!repoEnv || !repoEnv.includes('/')) {
    throw new Error(
      'GITHUB_REPOSITORY env var is required for live review mode',
    );
  }
  const [owner, repo] = repoEnv.split('/');

  const jwt = mintAppJwt(appId, privateKeyPem);
  const installToken = await getInstallationToken(jwt, owner, repo);

  const body =
    '## Review bot infrastructure error\n\n' +
    '<!-- bot-infra-failure: true -->\n' +
    'The automated review could not complete due to a persistent LLM API failure (3 retries exhausted).\n\n' +
    'Apply the `bot:ready-for-review` label to re-trigger, or request a human review.';

  const payload = JSON.stringify({
    body,
    event: 'REQUEST_CHANGES',
    comments: [],
  });

  execFileSync(
    'gh',
    [
      'api',
      '--method',
      'POST',
      `repos/{owner}/{repo}/pulls/${prNumber}/reviews`,
      '--input',
      '-',
    ],
    {
      encoding: 'utf8',
      input: payload,
      env: { ...process.env, GH_TOKEN: installToken },
    },
  );

  process.stdout.write(
    `[reviewer] Infra error review posted on PR #${prNumber}\n`,
  );
}

/**
 * Post a categorized author-facing failure review when the LLM call fails for
 * a known, identifiable reason (rate-limit, daily quota, auth, cost-cap,
 * context-too-large). Distinct from postInfraErrorReview, which is a
 * catch-all "we don't know what went wrong" message.
 *
 * The review event is REQUEST_CHANGES for author-actionable failures (PR is
 * too large, cost cap exceeded) and a plain comment-only review for
 * provider-side failures the author can't fix (rate-limit, auth, daily
 * quota) — those should not block merge under branch protection.
 *
 * @param {object} params
 * @param {number} params.prNumber
 * @param {'rate-limit'|'quota'|'auth'|'cost-cap'|'context-too-large'} params.kind
 * @param {object} [params.details]
 * @param {number} [params.details.retryAfterSeconds]
 * @param {number} [params.details.cumulativeUsd]
 * @param {number} [params.details.capUsd]
 */
export async function postKnownLlmFailureReview({
  prNumber,
  kind,
  details = {},
}) {
  const appId = process.env.REVIEWER_BOT_APP_ID;
  const privateKeyPem = process.env.REVIEWER_BOT_APP_PRIVATE_KEY;

  if (!appId || !privateKeyPem) {
    throw new Error(
      'REVIEWER_BOT_APP_ID and REVIEWER_BOT_APP_PRIVATE_KEY must be set for live review mode',
    );
  }

  const repoEnv = process.env.GITHUB_REPOSITORY;
  if (!repoEnv || !repoEnv.includes('/')) {
    throw new Error(
      'GITHUB_REPOSITORY env var is required for live review mode',
    );
  }
  const [owner, repo] = repoEnv.split('/');

  const { body, event } = buildKnownFailureBody(kind, details);

  const jwt = mintAppJwt(appId, privateKeyPem);
  const installToken = await getInstallationToken(jwt, owner, repo);

  const payload = JSON.stringify({ body, event, comments: [] });

  execFileSync(
    'gh',
    [
      'api',
      '--method',
      'POST',
      `repos/{owner}/{repo}/pulls/${prNumber}/reviews`,
      '--input',
      '-',
    ],
    {
      encoding: 'utf8',
      input: payload,
      env: { ...process.env, GH_TOKEN: installToken },
    },
  );

  process.stdout.write(
    `[reviewer] Known LLM failure review posted (kind=${kind}, event=${event}) on PR #${prNumber}\n`,
  );
}

/**
 * @param {string} kind
 * @param {object} details
 * @returns {{ body: string, event: 'COMMENT' | 'REQUEST_CHANGES' }}
 */
export function buildKnownFailureBody(kind, details = {}) {
  switch (kind) {
    case 'rate-limit': {
      const wait = details.retryAfterSeconds
        ? `~${Math.ceil(details.retryAfterSeconds)}s`
        : 'a minute';
      return {
        event: 'COMMENT',
        body:
          '## Reviewer rate-limited\n\n' +
          '<!-- bot-infra-failure: true -->\n' +
          `The Gemini API per-minute rate limit was hit on this run. Wait ${wait}, then re-apply the \`bot:ready-for-review\` label (remove and add it again) to retry. The reviewer workflow does not fire on plain pushes — only on \`opened\` / \`ready_for_review\` / \`labeled\` events.\n\n` +
          '_This is not a code issue — no review was posted because the LLM API throttled the request._',
      };
    }
    case 'quota':
      return {
        event: 'COMMENT',
        body:
          '## Reviewer daily quota exhausted\n\n' +
          '<!-- bot-infra-failure: true -->\n' +
          'The Gemini API free-tier daily quota has been used up for today. **The reviewer does not retry on its own** — the workflow only fires on `pull_request.opened`, `pull_request.ready_for_review`, and `pull_request.labeled` events, never on a timer (and not on plain pushes).\n\n' +
          'To get a review on this PR:\n' +
          "- After Google's daily reset (00:00 Pacific time), re-apply the `bot:ready-for-review` label (remove and add it again) to re-trigger the reviewer.\n" +
          '- Or, to remove the daily cap entirely, enable billing on the Google AI Studio project tied to `GEMINI_CODE_REVIEW_API_KEY` (a maintainer action).\n\n' +
          '_This is not a code issue — no review was posted because the API quota is exhausted._',
      };
    case 'auth':
      return {
        event: 'COMMENT',
        body:
          '## Reviewer authentication failed\n\n' +
          '<!-- bot-infra-failure: true -->\n' +
          'The Gemini API rejected the request key (`GEMINI_CODE_REVIEW_API_KEY`). The key is missing, invalid, or revoked.\n\n' +
          '**Maintainer action required**: regenerate the API key at https://aistudio.google.com/apikey and update the `GEMINI_CODE_REVIEW_API_KEY` repository secret. Then re-apply the `bot:ready-for-review` label to retry.\n\n' +
          '_This is not a code issue — the reviewer cannot authenticate._',
      };
    case 'cost-cap': {
      const cumulative =
        typeof details.cumulativeUsd === 'number'
          ? `$${details.cumulativeUsd.toFixed(4)}`
          : 'over budget';
      const cap =
        typeof details.capUsd === 'number'
          ? `$${details.capUsd.toFixed(2)}`
          : 'the configured cap';
      return {
        event: 'REQUEST_CHANGES',
        body:
          '## Reviewer cost cap exceeded\n\n' +
          `The estimated review cost (${cumulative}) exceeds the per-PR budget (${cap}). The PR is too large to review automatically.\n\n` +
          '**Recommended actions:**\n' +
          '- Split this PR into smaller, independently-reviewable changes, **or**\n' +
          '- Request a human review by tagging a maintainer.\n\n' +
          'A maintainer can also raise `REVIEWER_COST_CAP_USD` in the workflow if larger PRs should be allowed.',
      };
    }
    case 'context-too-large':
      return {
        event: 'REQUEST_CHANGES',
        body:
          '## PR exceeds reviewer model context\n\n' +
          "This PR's diff plus expanded file context is larger than the review model's input window. The review could not run.\n\n" +
          '**Recommended actions:**\n' +
          '- Split this PR into smaller pieces, **or**\n' +
          '- Request a human review.',
      };
    default:
      return {
        event: 'REQUEST_CHANGES',
        body:
          '## Review bot infrastructure error\n\n' +
          '<!-- bot-infra-failure: true -->\n' +
          'The automated review could not complete. Apply the `bot:ready-for-review` label to re-trigger, or request a human review.',
      };
  }
}
