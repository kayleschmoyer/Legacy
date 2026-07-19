import { execFileSync } from 'node:child_process';

const SHADOW_MARKER = '<!-- reviewer-bot:shadow -->';

/**
 * Check whether a GitHub user has admin-level permission on this repository.
 * Returns false for non-collaborators and on API errors (safe default).
 *
 * @param {string} login  GitHub login to check
 * @returns {boolean}
 */
export function isRepoAdmin(login) {
  try {
    const result = execFileSync(
      'gh',
      [
        'api',
        `repos/{owner}/{repo}/collaborators/${encodeURIComponent(login)}/permission`,
      ],
      { encoding: 'utf8' },
    );
    return JSON.parse(result).role_name === 'admin';
  } catch {
    return false;
  }
}

/**
 * Check whether a GitHub user has maintainer-level (admin or maintain)
 * permission on this repository. Mirrors the permission bar used by the
 * Review Bot Override workflow (W5) for its human-APPROVE path.
 * Returns false for non-collaborators and on API errors (safe default).
 *
 * @param {string} login  GitHub login to check
 * @returns {boolean}
 */
export function isRepoMaintainer(login) {
  try {
    const result = execFileSync(
      'gh',
      [
        'api',
        `repos/{owner}/{repo}/collaborators/${encodeURIComponent(login)}/permission`,
      ],
      { encoding: 'utf8' },
    );
    const role = JSON.parse(result).role_name;
    return role === 'admin' || role === 'maintain';
  } catch {
    return false;
  }
}

/**
 * Fetch the current reviews on a PR via REST (fresh, not the batched GraphQL
 * snapshot from run start). Used to re-check for a human maintainer APPROVE
 * immediately before writing a failure bot-review status, closing the race
 * where a human approves while a review run is in flight.
 *
 * @param {number} prNumber
 * @param {typeof execFileSync} [exec]
 * @returns {{ userLogin: string | null, userType: string | null, state: string }[]}
 */
export function listPrReviewsFresh(prNumber, exec = execFileSync) {
  const raw = exec(
    'gh',
    ['api', `repos/{owner}/{repo}/pulls/${prNumber}/reviews`, '--paginate'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  // --paginate emits one JSON array per page, newline-separated (same parse
  // idiom as findLatestLabelActor above).
  const reviews = raw
    .trim()
    .split(/\n(?=\[)/)
    .flatMap((chunk) => JSON.parse(chunk));
  return reviews.map((r) => ({
    userLogin: r.user?.login ?? null,
    userType: r.user?.type ?? null,
    state: r.state,
  }));
}

/**
 * Find a live (non-dismissed) APPROVE review authored by a human with
 * maintainer-level repo permission. With dismiss_stale_reviews_on_push active
 * in the branch ruleset, any review still in state APPROVED vouches for the
 * current head SHA — approvals on earlier SHAs are auto-dismissed on push.
 *
 * A human maintainer approval supersedes the bot review entirely (pipeline
 * automation policy): callers stand down / suppress failure status writes
 * when this returns a login. Permission bar (admin/maintain) mirrors the
 * Review Bot Override workflow (W5).
 *
 * Bots are excluded by REST `user.type === 'Bot'` and by the `[bot]` login
 * suffix (which the GraphQL normalizer guarantees for Bot authors).
 *
 * @param {{ userLogin?: string | null, userType?: string | null, state: string }[]} reviews
 * @param {(login: string) => boolean} [checkPermission]
 * @returns {string | null}  approver login, or null
 */
export function findHumanMaintainerApproval(
  reviews,
  checkPermission = isRepoMaintainer,
) {
  const candidates = [
    ...new Set(
      reviews
        .filter(
          (r) =>
            r.state === 'APPROVED' &&
            r.userLogin &&
            !r.userLogin.endsWith('[bot]') &&
            r.userType !== 'Bot',
        )
        .map((r) => r.userLogin),
    ),
  ];
  for (const login of candidates) {
    if (checkPermission(login)) return login;
  }
  return null;
}

/**
 * Add a label to a PR/issue.
 *
 * @param {number} prNumber
 * @param {string} label
 */
export function addLabel(prNumber, label) {
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
    { encoding: 'utf8', input: JSON.stringify({ labels: [label] }) },
  );
}

/**
 * Find the GitHub login of the most recent actor who applied a given label
 * to the PR. Returns '' if the label was never applied or the API call fails.
 *
 * Used to recover the cycle-reset sender when the workflow run that GitHub
 * triggered for the `bot:reset-cycle-counter` label was cancelled by a sibling
 * `labeled` event (cancel-in-progress concurrency). Without this fallback the
 * surviving run sees CYCLE_RESET_SENDER='' and skips the reset (LS-4178).
 *
 * @param {number} prNumber
 * @param {string} label
 * @param {typeof execFileSync} [exec]
 * @returns {string}
 */
export function findLatestLabelActor(prNumber, label, exec = execFileSync) {
  try {
    const raw = exec(
      'gh',
      ['api', `repos/{owner}/{repo}/issues/${prNumber}/timeline`, '--paginate'],
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
    );
    const events = raw
      .trim()
      .split(/\n(?=\[)/)
      .flatMap((chunk) => JSON.parse(chunk));
    const labeledEvents = events.filter(
      (e) => e.event === 'labeled' && e.label?.name === label,
    );
    if (labeledEvents.length === 0) return '';
    const latest = labeledEvents[labeledEvents.length - 1];
    return latest.actor?.login ?? '';
  } catch {
    return '';
  }
}

/**
 * Dismiss a formal review via the GitHub Reviews API. Only CHANGES_REQUESTED
 * and APPROVED reviews can be dismissed; the call is a no-op for other states.
 *
 * Used by the admin cycle-reset path (LS-4474) to durably mark prior bot
 * review cycles as superseded — the dismissal state persists across runs even
 * if the current run is cancelled by `cancel-in-progress` concurrency before
 * it can remove the `bot:reset-cycle-counter` label or post a fresh review.
 *
 * The bot's installation token (GH_TOKEN) authenticates as the reviewer App,
 * which has permission to dismiss its own reviews.
 *
 * @param {number} prNumber
 * @param {number} reviewId
 * @param {string} message  Visible dismissal reason
 */
export function dismissReview(prNumber, reviewId, message) {
  try {
    execFileSync(
      'gh',
      [
        'api',
        `repos/{owner}/{repo}/pulls/${prNumber}/reviews/${reviewId}/dismissals`,
        '-X',
        'PUT',
        '--input',
        '-',
      ],
      { encoding: 'utf8', input: JSON.stringify({ message }) },
    );
  } catch (err) {
    process.stderr.write(
      `[reviewer] Failed to dismiss review ${reviewId} on PR #${prNumber}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
}

/**
 * Remove a label from a PR/issue. Silently ignores 404 (label not present).
 *
 * @param {number} prNumber
 * @param {string} label
 */
export function removeLabel(prNumber, label) {
  try {
    execFileSync(
      'gh',
      [
        'api',
        `repos/{owner}/{repo}/issues/${prNumber}/labels/${encodeURIComponent(label)}`,
        '-X',
        'DELETE',
      ],
      { encoding: 'utf8' },
    );
  } catch (err) {
    if (!/HTTP 404|404 Not Found/.test(String(err))) throw err;
  }
}

const PR_FIELDS = [
  'number',
  'title',
  'body',
  'isDraft',
  'isCrossRepository',
  'author',
  'headRefName',
  'baseRefName',
].join(',');

/**
 * Fetch PR metadata and unified diff via the gh CLI.
 *
 * @param {number} prNumber
 * @returns {{ number: number, title: string, body: string, isDraft: boolean,
 *             isCrossRepository: boolean, author: { login: string, is_bot: boolean },
 *             headRefName: string, baseRefName: string, diff: string }}
 */
export function getPullRequestContext(prNumber) {
  const json = execFileSync(
    'gh',
    ['pr', 'view', String(prNumber), '--json', PR_FIELDS],
    { encoding: 'utf8' },
  );
  const pr = JSON.parse(json);

  let diff = '';
  try {
    diff = execFileSync('gh', ['pr', 'diff', String(prNumber)], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err) {
    process.stderr.write(`[github] Failed to fetch diff: ${err.message}\n`);
  }

  return { ...pr, diff };
}

/**
 * Set the bot-review commit status for a given SHA.
 *
 * @param {string} sha
 * @param {'pending'|'success'|'failure'} state
 * @param {string} description
 */
export function setCommitStatus(sha, state, description) {
  execFileSync(
    'gh',
    [
      'api',
      `repos/{owner}/{repo}/statuses/${sha}`,
      '-X',
      'POST',
      '--input',
      '-',
    ],
    {
      encoding: 'utf8',
      input: JSON.stringify({ state, context: 'bot-review', description }),
    },
  );
}

/**
 * Post a shadow review comment on a PR, replacing any prior comment carrying
 * the shadow marker so re-runs on the same PR never duplicate the comment.
 *
 * @param {number} prNumber
 * @param {string} body  Review text (the marker prefix is added automatically)
 */
export async function postShadowComment(prNumber, body) {
  const fullBody = `${SHADOW_MARKER}\n\n${body}`;

  // Paginate all comments. gh api --paginate outputs one JSON array per page
  // separated by newlines; split and flatten to search all pages.
  const rawPages = execFileSync(
    'gh',
    ['api', `repos/{owner}/{repo}/issues/${prNumber}/comments`, '--paginate'],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  );
  const allComments = rawPages
    .trim()
    .split(/\n(?=\[)/)
    .flatMap((chunk) => JSON.parse(chunk));
  const existing = allComments.find((c) => c.body.startsWith(SHADOW_MARKER));

  const payload = JSON.stringify({ body: fullBody });

  if (existing) {
    execFileSync(
      'gh',
      [
        'api',
        `repos/{owner}/{repo}/issues/comments/${existing.id}`,
        '-X',
        'PATCH',
        '--input',
        '-',
      ],
      { encoding: 'utf8', input: payload },
    );
  } else {
    execFileSync(
      'gh',
      [
        'api',
        `repos/{owner}/{repo}/issues/${prNumber}/comments`,
        '-X',
        'POST',
        '--input',
        '-',
      ],
      { encoding: 'utf8', input: payload },
    );
  }
}
