/**
 * GitHub API helpers for review-thread parsing and cycle-counter integration.
 *
 * All functions use the `gh` CLI (authenticated via GH_TOKEN) and follow the
 * same execFileSync pattern used by other reviewer scripts in this package.
 */

import { execFileSync } from 'node:child_process';

const MAX_BUFFER = 10 * 1024 * 1024;

/**
 * Split paginated `gh api --paginate` output (one JSON array per page,
 * separated by newlines) into a flat array.
 *
 * @param {string} raw  stdout from `gh api --paginate`
 * @returns {unknown[]}
 */
function flattenPages(raw) {
  return raw
    .trim()
    .split(/\n(?=\[)/)
    .flatMap((chunk) => JSON.parse(chunk));
}

/**
 * Fetch all formal reviews on a PR.
 *
 * @param {number} prNumber
 * @returns {{ id: number, userLogin: string | null, state: string,
 *             body: string | null, submittedAt: string, commitId: string }[]}
 */
export function getPrReviews(prNumber) {
  const raw = execFileSync(
    'gh',
    ['api', `repos/{owner}/{repo}/pulls/${prNumber}/reviews`, '--paginate'],
    { encoding: 'utf8', maxBuffer: MAX_BUFFER },
  );
  return flattenPages(raw).map((r) => ({
    id: r.id,
    userLogin: r.user?.login ?? null,
    state: r.state,
    body: r.body ?? null,
    submittedAt: r.submitted_at,
    commitId: r.commit_id,
  }));
}

/**
 * Fetch the full list of commit SHAs on a PR (for FIX: SHA validation).
 *
 * @param {number} prNumber
 * @returns {string[]}  40-char commit SHAs, oldest to newest
 */
export function getPrCommits(prNumber) {
  const raw = execFileSync(
    'gh',
    ['api', `repos/{owner}/{repo}/pulls/${prNumber}/commits`, '--paginate'],
    { encoding: 'utf8', maxBuffer: MAX_BUFFER },
  );
  return flattenPages(raw).map((c) => c.sha);
}

/**
 * Post a reply directly in a PR review thread (in-thread error message).
 *
 * @param {number} inReplyToId  The `id` of the top-level review comment that
 *                              started the thread (not the thread node ID)
 * @param {string} body
 */
export function postReviewThreadReply(inReplyToId, body) {
  const payload = JSON.stringify({ body });
  execFileSync(
    'gh',
    [
      'api',
      `repos/{owner}/{repo}/pulls/comments/${inReplyToId}/replies`,
      '-X',
      'POST',
      '--input',
      '-',
    ],
    { encoding: 'utf8', input: payload, maxBuffer: MAX_BUFFER },
  );
}

/**
 * Post an issue-level comment (used for escalation notices).
 *
 * @param {number} prNumber
 * @param {string} body
 */
export function postEscalationComment(prNumber, body) {
  const payload = JSON.stringify({ body });
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
    { encoding: 'utf8', input: payload, maxBuffer: MAX_BUFFER },
  );
}

/**
 * Add a label to a PR/issue.
 *
 * @param {number} prNumber
 * @param {string} label
 */
export function addLabel(prNumber, label) {
  const payload = JSON.stringify({ labels: [label] });
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
    { encoding: 'utf8', input: payload, maxBuffer: MAX_BUFFER },
  );
}
