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
 * Observations are appended as a separate "## Observations" section with no
 * issue-id markers — they are informational and do not require author responses.
 * They are intentionally excluded from the cycle-protocol title regex so they
 * are not tracked across review cycles.
 *
 * Unanchored non-blocking findings (whose cited position is not part of the
 * PR diff, so no inline thread can be created) are appended as a
 * "## Non-blocking findings (no inline thread)" section. Like observations,
 * they carry no issue-id markers and no **[SEVERITY]** tag, so they are not
 * tracked by the cycle protocol and require no FIX/JUSTIFY responses.
 *
 * @param {Array<import('./findings.mjs').Finding & { issueId: string }>} blockingWithIds
 * @param {'REQUEST_CHANGES'|'APPROVE'} event
 * @param {import('./findings.mjs').Finding[]} [observations]
 * @param {{ fallbackModel?: string, unanchored?: import('./findings.mjs').Finding[] }} [opts]
 * @returns {string}
 */
export function formatReviewBody(
  blockingWithIds,
  event,
  observations = [],
  { fallbackModel, unanchored = [] } = {},
) {
  const banner = fallbackModel
    ? `> [!NOTE]\n> This review was generated using **${fallbackModel}** (fallback) because the primary model was temporarily unavailable. Quality may differ slightly.\n\n`
    : '';

  const parts = [];

  if (event === 'APPROVE') {
    parts.push(`${banner}LGTM — no blocking findings.`);
  } else {
    parts.push(`${banner}## Changes Required\n`);
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
  }

  if (unanchored.length > 0) {
    parts.push('## Non-blocking findings (no inline thread)\n');
    parts.push(
      "_The cited locations are not part of this PR's diff, so these findings could not be posted as inline review threads. They are advisory and do not require FIX/JUSTIFY responses._",
    );
    for (const f of unanchored) {
      const loc = f.file
        ? f.line != null
          ? `\`${f.file}:${f.line}\``
          : `\`${f.file}\``
        : '_PR-level_';
      // Observation-style formatting: no issue-id marker and no **[SEVERITY]**
      // tag, so parseTitlesFromReviewBody does not track these titles across
      // cycles and the author protocol does not demand thread replies for them.
      parts.push(`**${f.title}** — ${loc} _(${f.severity})_\n\n${f.body}`);
    }
  }

  if (observations.length > 0) {
    parts.push('## Observations\n');
    for (const f of observations) {
      const loc = f.file
        ? f.line != null
          ? `\`${f.file}:${f.line}\``
          : `\`${f.file}\``
        : '_PR-level_';
      // No issue-id marker: observations are informational and not tracked by
      // the cycle protocol. No [OBSERVATION] severity tag so parseTitlesFromReviewBody
      // does not pick up these titles and carry them into the next cycle.
      parts.push(`**${f.title}** — ${loc}\n\n${f.body}`);
    }
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

// Matches a unified-diff hunk header and captures the RIGHT-side start line and
// (optional) line count, e.g. `@@ -12,7 +12,9 @@` or `@@ -5 +7 @@`.
const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/**
 * Parse a unified diff into the RIGHT-side line ranges that GitHub accepts for
 * inline review comments (`side: 'RIGHT'`): for each file, every line covered
 * by a hunk on the new side (context + added lines). Lines outside these
 * ranges cause `POST /pulls/{n}/reviews` to reject the whole submission with
 * HTTP 422 ("line must be part of the diff").
 *
 * File paths are taken from `+++ b/<path>` headers, which are only recognized
 * between a `diff --git` line and that file's first hunk — an added content
 * line starting with `++ ` (rendered as `+++ ...` in the diff) cannot be
 * mistaken for a file header.
 *
 * @param {string | null | undefined} diff  Unified diff (e.g. from `gh pr diff`)
 * @returns {Map<string, Array<[number, number]>> | null}  Inclusive
 *   [start, end] ranges keyed by repo-relative path, or null when no diff was
 *   provided (caller should then skip position validation).
 */
export function parseCommentableLineRanges(diff) {
  if (typeof diff !== 'string' || !diff.trim()) return null;

  /** @type {Map<string, Array<[number, number]>>} */
  const ranges = new Map();
  let currentPath = null;
  let inFileHeader = false;

  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      inFileHeader = true;
      currentPath = null;
      continue;
    }
    if (inFileHeader && line.startsWith('+++ ')) {
      const target = line.slice(4).trim();
      currentPath = target === '/dev/null' ? null : target.replace(/^b\//, '');
      continue;
    }
    const m = line.match(HUNK_HEADER_RE);
    if (m) {
      inFileHeader = false;
      if (currentPath !== null) {
        const start = Number(m[1]);
        const count = m[2] === undefined ? 1 : Number(m[2]);
        // A deletion-only hunk has a zero RIGHT-side count — nothing to anchor.
        if (count > 0) {
          if (!ranges.has(currentPath)) ranges.set(currentPath, []);
          ranges.get(currentPath).push([start, start + count - 1]);
        }
      }
    }
  }

  return ranges;
}

/**
 * Whether an inline comment at (path, line) on the RIGHT side would be
 * accepted by GitHub for the diff described by `ranges`.
 *
 * @param {Map<string, Array<[number, number]>>} ranges  From parseCommentableLineRanges
 * @param {string} path
 * @param {number} line
 * @returns {boolean}
 */
export function isPositionInDiff(ranges, path, line) {
  const fileRanges = ranges.get(path);
  if (!fileRanges) return false;
  return fileRanges.some(([start, end]) => line >= start && line <= end);
}

/**
 * Split findings by whether they can become inline review comments on this
 * diff. Findings without a file+line can never be inline (`unlocated`);
 * findings whose position falls outside the diff's RIGHT-side hunk ranges are
 * `unanchored`. When `ranges` is null (no diff available), every located
 * finding is treated as anchorable and the 422 body-only retry in
 * postRealReview remains the safety net.
 *
 * @param {Array<import('./findings.mjs').Finding & { issueId: string }>} findingsWithIds
 * @param {Map<string, Array<[number, number]>> | null} ranges
 * @returns {{ anchorable: typeof findingsWithIds, unanchored: typeof findingsWithIds, unlocated: typeof findingsWithIds }}
 */
export function partitionFindingsForInline(findingsWithIds, ranges) {
  const anchorable = [];
  const unanchored = [];
  const unlocated = [];
  for (const f of findingsWithIds) {
    if (f.file == null || f.line == null) {
      unlocated.push(f);
    } else if (ranges === null || isPositionInDiff(ranges, f.file, f.line)) {
      anchorable.push(f);
    } else {
      unanchored.push(f);
    }
  }
  return { anchorable, unanchored, unlocated };
}

/**
 * Post a real GitHub PR review as the Code Reviewer Bot.
 *
 * - critical/high findings → REQUEST_CHANGES (review body lists findings;
 *                            those with file+line also become inline threads)
 * - no blocking findings   → APPROVE
 * - medium/low findings    → inline comments on the same review submission;
 *                            those whose position cannot be anchored to the
 *                            diff are appended to the review body instead
 * - observation findings   → appended to the review body as "## Observations";
 *                            no inline threads, no issue-id markers
 *
 * When `diff` is provided, each inline comment's (path, line) is validated
 * against the diff's hunk ranges BEFORE posting, and only the individually
 * invalid comments are demoted to the review body. Without this, a single
 * out-of-diff position makes GitHub 422 the whole submission and the retry
 * drops every inline thread (LS-8499).
 *
 * Requires env vars:
 *   REVIEWER_BOT_APP_ID          — GitHub App numeric ID (public variable)
 *   REVIEWER_BOT_APP_PRIVATE_KEY — PEM-encoded RSA private key (secret)
 *   GITHUB_REPOSITORY            — "owner/repo" (set automatically by Actions)
 *
 * @param {number} prNumber
 * @param {{ blocking: import('./findings.mjs').Finding[],
 *            nonBlocking: import('./findings.mjs').Finding[],
 *            observations?: import('./findings.mjs').Finding[],
 *            fallbackModel?: string,
 *            diff?: string }} gated
 */
export async function postRealReview(
  prNumber,
  { blocking, nonBlocking, observations = [], fallbackModel, diff },
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

  const ranges = parseCommentableLineRanges(diff);
  const blockingSplit = partitionFindingsForInline(blockingWithIds, ranges);
  const nonBlockingSplit = partitionFindingsForInline(
    nonBlockingWithIds,
    ranges,
  );

  for (const f of [
    ...blockingSplit.unanchored,
    ...nonBlockingSplit.unanchored,
  ]) {
    process.stderr.write(
      `[reviewer] Inline position outside diff — no thread for ${f.file}:${f.line} ("${f.title}")\n`,
    );
  }

  // Blocking findings are always in the review body, so an unanchorable
  // blocking finding loses only its thread. Non-blocking findings exist ONLY
  // as inline comments — demote the ones that cannot anchor (or have no
  // location at all) into the body so they are not silently lost.
  const unanchoredNonBlocking = [
    ...nonBlockingSplit.unanchored,
    ...nonBlockingSplit.unlocated,
  ];

  const body = formatReviewBody(blockingWithIds, event, observations, {
    fallbackModel,
    unanchored: unanchoredNonBlocking,
  });
  const comments = buildInlineComments([
    ...blockingSplit.anchorable,
    ...nonBlockingSplit.anchorable,
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
  let postedInline = comments.length;
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
    // Last-resort safety net: pre-validation above should have caught bad
    // positions, but GitHub can still 422 on cases the hunk parser does not
    // model (renames with unusual paths, stale head, ...). Log the API detail
    // (gh prints the response body to stdout) so the offending comment is
    // identifiable, then retry body-only so the blocking findings still land.
    const detail = [err.stdout, err.stderr]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 600);
    process.stderr.write(
      `[reviewer] Inline comments rejected (422) despite pre-validation; retrying body-only. Detail: ${detail}\n`,
    );
    execFileSync('gh', ghArgs, {
      encoding: 'utf8',
      input: JSON.stringify({ body, event, comments: [] }),
      env: ghEnv,
    });
    postedInline = 0;
  }

  const demoted =
    blockingSplit.unanchored.length + unanchoredNonBlocking.length;
  process.stdout.write(
    `[reviewer] Real review posted (${event}): ${blockingWithIds.length} blocking, ${nonBlockingWithIds.length} non-blocking, ${postedInline} inline thread(s) posted${demoted > 0 ? `, ${demoted} finding(s) demoted to body (no diff anchor)` : ''}\n`,
  );
}

/**
 * Post a COMMENT review indicating a persistent LLM API failure. Uses the
 * same GitHub App authentication as postRealReview so the review appears
 * from the bot account.
 *
 * COMMENT (not REQUEST_CHANGES) is deliberate: nothing was actually read, so
 * this must not set `reviewDecision` on the PR or block the merge-gate
 * ruleset the way a real "changes required" verdict does (LS-9568).
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
    event: 'COMMENT',
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
 * a known, identifiable reason (rate-limit, daily quota, billing, auth,
 * cost-cap, context-too-large). Distinct from postInfraErrorReview, which is a
 * catch-all "we don't know what went wrong" message.
 *
 * Transient, non-author-actionable kinds (rate-limit, quota, billing, auth) post
 * COMMENT — nothing was actually read, so the review must not set
 * `reviewDecision` or block the merge gate (LS-9568). Author-actionable kinds
 * (cost-cap, context-too-large) post REQUEST_CHANGES because they describe a
 * real property of the PR itself (too big / too expensive to review) that the
 * author must act on. Re-apply the `bot:ready-for-review` label to re-trigger
 * after provider-side issues resolve.
 *
 * @param {object} params
 * @param {number} params.prNumber
 * @param {'rate-limit'|'quota'|'billing'|'auth'|'cost-cap'|'context-too-large'} params.kind
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
 * Post an APPROVE review when the review-bot-override label was applied.
 * Skips LLM analysis entirely — posts a direct APPROVE from the bot account
 * with a note explaining the override. Requires the same env vars as
 * postRealReview.
 *
 * @param {number} prNumber
 */
export async function postOverrideApproveReview(prNumber) {
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

  const body =
    '> [!NOTE]\n' +
    '> The `review-bot-override` label was applied by a maintainer — this review was automatically approved without running the LLM review pass.\n\n' +
    'LGTM — override applied.';

  const jwt = mintAppJwt(appId, privateKeyPem);
  const installToken = await getInstallationToken(jwt, owner, repo);

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
      input: JSON.stringify({ body, event: 'APPROVE', comments: [] }),
      env: { ...process.env, GH_TOKEN: installToken },
    },
  );

  process.stdout.write(
    `[reviewer] Override-approve review posted on PR #${prNumber}\n`,
  );
}

/**
 * @param {string} kind
 * @param {object} details
 * @returns {{ body: string, event: 'REQUEST_CHANGES'|'COMMENT' }}
 */
export function buildKnownFailureBody(kind, details = {}) {
  switch (kind) {
    case 'rate-limit': {
      const wait = details.retryAfterSeconds
        ? `~${Math.ceil(details.retryAfterSeconds)}s`
        : 'a minute';
      return {
        // COMMENT, not REQUEST_CHANGES: nothing was read, so this must not
        // set reviewDecision or block the merge gate (LS-9568).
        event: 'COMMENT',
        body:
          '## Reviewer rate-limited\n\n' +
          '<!-- bot-infra-failure: true -->\n' +
          `The Gemini API per-minute rate limit was hit on this run after exhausting in-job retries with backoff. Wait ${wait}, then re-apply the \`bot:ready-for-review\` label (remove and add it again) to retry. The reviewer workflow does not fire on plain pushes — only on \`opened\` / \`ready_for_review\` / \`labeled\` events.\n\n` +
          '_This is not a code issue — no review was posted because the LLM API throttled the request._',
      };
    }
    case 'billing':
      return {
        // COMMENT for the same reason as rate-limit: nothing was read, so this
        // must not set reviewDecision or block the merge gate (LS-9568).
        event: 'COMMENT',
        body:
          '## Reviewer billing credits exhausted\n\n' +
          '<!-- bot-infra-failure: true -->\n' +
          'The Gemini API rejected this run with HTTP 429 `RESOURCE_EXHAUSTED` because **the billing account behind the API key has no usable credit** — usually depleted prepayment credits, sometimes a disabled or suspended billing account. This is a billing state, not a rate limit.\n\n' +
          '> [!IMPORTANT]\n' +
          '> **Waiting will not help, and re-applying `bot:ready-for-review` will not help.** Every retry fails identically until billing is topped up. The in-job retry ladder is skipped for this failure class for the same reason.\n\n' +
          '**Account owner action required**: top up the prepayment credits (or fix the billing account) for the Google Cloud project tied to `GEMINI_CODE_REVIEW_API_KEY` at https://aistudio.google.com/apikey. Once credits are restored, re-apply the `bot:ready-for-review` label (remove and add it again) to run the review.\n\n' +
          '_This is not a code issue — no review was posted because the reviewer has no API credits._',
      };
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
        event: 'COMMENT',
        body:
          '## Review bot infrastructure error\n\n' +
          '<!-- bot-infra-failure: true -->\n' +
          'The automated review could not complete. Apply the `bot:ready-for-review` label to re-trigger, or request a human review.',
      };
  }
}
