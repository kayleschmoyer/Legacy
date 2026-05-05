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
