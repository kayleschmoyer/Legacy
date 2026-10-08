/**
 * Unchanged-diff re-affirmation (LS-10963).
 *
 * `bot:ready-for-review` persists through merge (LS-4678), so every push to an
 * approved PR fires Reviewer (W1) again — including pushes that change the head
 * SHA but not the PR's own change: a merge from the base branch, the
 * `update-branch` API (e.g. e2e-hold-resume.yml), or a clean rebase. Re-running
 * the full multi-pass LLM review on an identical diff costs money, and a
 * nondeterministic non-APPROVE on it burns a review cycle (MAX_CYCLE) with no
 * code change — enough to push a PR into `needs-human-arbitration`.
 *
 * This module decides whether the PR's own diff at head H is identical to the
 * diff at A, the commit of the bot's most recent approval. If so, index.mjs
 * re-posts the APPROVE verdict on H without calling the LLM.
 *
 * Comparison method — GitHub compare API, `compare/{base}...{sha}`, for A and
 * for H against the CURRENT base branch. The three-dot form diffs each commit
 * against its merge-base with the base branch, so it yields exactly "the PR's
 * own change" at that commit, independent of how much of the base branch has
 * been merged in. Chosen over `git patch-id` on the workflow's checkout
 * because a rebase or force-push leaves A unreachable from any ref, so
 * `actions/checkout` (even with fetch-depth: 0) does not have it — whereas
 * GitHub keeps A addressable because a PR review references it. Two REST calls,
 * no clone.
 *
 * The fingerprint per file is (status, previous_filename, filename, patch),
 * where the patch's `@@ -a,b +c,d @@ <section>` hunk headers are reduced to
 * `@@` — the same normalisation `git patch-id` applies — so upstream lines
 * added above a hunk do not defeat the match, while any change to the PR's
 * added/removed lines OR their surrounding context still does. Files GitHub
 * returns without a `patch` (binary, or too large) fall back to the head blob
 * SHA, which is conservative: if anything in such a file differs, so does the
 * fingerprint. A compare response at GitHub's 300-file cap is treated as
 * unusable (the file list may be truncated).
 *
 * Fail open: every helper here returns "not unchanged" (with a reason) on any
 * error or doubt, and the caller then runs the normal full review.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { APPROVE_BODY_TEXT } from './post-review.mjs';
import {
  REVIEWER_BOT_LOGINS,
  isInfraErrorReview,
  isThreadReplyArtifactReview,
} from './cycle-counter.mjs';

const MAX_BUFFER = 32 * 1024 * 1024;

/** GitHub's compare API returns at most this many files; at the cap the list may be truncated. */
export const COMPARE_MAX_FILES = 300;

/**
 * Hidden marker embedded in a re-affirmed APPROVE body, carrying the full SHA
 * of the approval it re-affirms. Informational (audit trail); the approval
 * detection below keys on APPROVE_BODY_TEXT, which re-affirmed bodies also
 * contain, so re-affirmations chain across several base-branch merges.
 */
export const REAFFIRMED_APPROVAL_MARKER = 'bot-reaffirmed-approval';

/**
 * Issue-comment text the reviewer posts when it resets the cycle counter
 * (admin `bot:reset-cycle-counter` and the LS-4857 post-arbitration auto-reset
 * in index.mjs). Both paths dismiss prior bot approvals — a reset posted after
 * the approval means someone deliberately asked for a fresh review, so the
 * dismissed approval must not be re-affirmed.
 */
const CYCLE_RESET_COMMENT_PATTERNS = [
  'Cycle counter reset by',
  'Cycle counter auto-reset',
];

/**
 * Whether a bot review is an LLM-clean approval: the body postRealReview
 * writes for APPROVE (`formatReviewBody`), in state APPROVED or — because
 * `dismiss_stale_reviews_on_push` in .github/ruleset.json flips it on the very
 * push that triggers this run — DISMISSED. GraphQL reports only the current
 * state, so the original verdict is recovered from the body. The override
 * approval ("LGTM — override applied.") deliberately does not match: it never
 * reviewed the diff.
 *
 * @param {{ state?: string | null, body?: string | null }} review
 * @returns {boolean}
 */
export function isLlmApprovalReview(review) {
  if (review.state !== 'APPROVED' && review.state !== 'DISMISSED') return false;
  return (review.body ?? '').includes(APPROVE_BODY_TEXT);
}

/**
 * The bot's most recent approval, provided it is also the bot's most recent
 * verdict. Infra-error and thread-reply-artifact reviews are not verdicts and
 * are skipped (mirrors computeCycle); any later REQUEST_CHANGES review — even
 * a dismissed one — means the latest verdict is not an approval, so null.
 *
 * @param {Array<{ userLogin: string | null, state?: string | null, body?: string | null, submittedAt?: string, commitId?: string | null }>} reviews
 * @param {Set<string>} [botLogins]
 * @returns {object | null}
 */
export function findLatestBotApproval(
  reviews,
  botLogins = REVIEWER_BOT_LOGINS,
) {
  const latestVerdict =
    reviews
      .filter(
        (r) =>
          botLogins.has(r.userLogin) &&
          !isInfraErrorReview(r) &&
          !isThreadReplyArtifactReview(r),
      )
      .slice()
      .sort((a, b) => (a.submittedAt < b.submittedAt ? -1 : 1))
      .at(-1) ?? null;
  if (!latestVerdict || !isLlmApprovalReview(latestVerdict)) return null;
  if (!latestVerdict.commitId) return null;
  return latestVerdict;
}

/**
 * Whether a cycle-counter reset comment was posted after `sinceIso`.
 *
 * @param {Array<{ body?: string | null, createdAt?: string }>} issueComments
 * @param {string} sinceIso
 * @returns {boolean}
 */
export function hasCycleResetSince(issueComments, sinceIso) {
  return (issueComments ?? []).some(
    (c) =>
      (c.createdAt ?? '') > (sinceIso ?? '') &&
      CYCLE_RESET_COMMENT_PATTERNS.some((p) => (c.body ?? '').includes(p)),
  );
}

/**
 * Normalise a unified-diff patch the way `git patch-id` does for line
 * numbers: hunk headers lose their offsets and section heading, so a shift
 * caused purely by base-branch lines above the hunk does not register as a
 * change. Every `+`, `-` and context line is kept verbatim.
 *
 * @param {string} patch
 * @returns {string}
 */
export function normalizePatch(patch) {
  return patch
    .split('\n')
    .map((line) => (line.startsWith('@@') ? '@@' : line))
    .join('\n');
}

/**
 * Fingerprint the PR's own change from a `compare/{base}...{sha}` response.
 * Returns null when the response is not usable for an exact comparison.
 *
 * @param {{ files?: Array<{ filename: string, status: string, previous_filename?: string, patch?: string, sha?: string | null }> }} compare
 * @returns {string | null}  sha256 hex digest, or null
 */
export function fingerprintCompare(compare) {
  const files = compare?.files;
  if (!Array.isArray(files)) return null;
  if (files.length >= COMPARE_MAX_FILES) return null;
  const entries = files.map((f) => {
    const content =
      typeof f.patch === 'string'
        ? `patch:${normalizePatch(f.patch)}`
        : `blob:${f.sha ?? ''}`;
    return [f.status, f.previous_filename ?? '', f.filename, content].join(
      '\0',
    );
  });
  entries.sort();
  return createHash('sha256').update(entries.join('\0\0')).digest('hex');
}

/**
 * Fetch `compare/{base}...{sha}` and fingerprint it.
 *
 * @param {string} baseRef
 * @param {string} sha
 * @param {typeof execFileSync} [exec]
 * @returns {string | null}
 */
export function fetchDiffFingerprint(baseRef, sha, exec = execFileSync) {
  // The basehead path segment accepts slashes in branch names as-is (same
  // convention as base-branch-ci.mjs); execFileSync means no shell parsing.
  const raw = exec(
    'gh',
    ['api', `repos/{owner}/{repo}/compare/${baseRef}...${sha}`],
    { encoding: 'utf8', maxBuffer: MAX_BUFFER },
  );
  return fingerprintCompare(JSON.parse(raw));
}

/**
 * Decide whether the PR's diff at `headSha` is unchanged since the bot's last
 * approval. Never throws — any error yields `{ unchanged: false }` so the
 * caller falls back to a full review (fail open).
 *
 * @param {{
 *   reviews: object[],
 *   issueComments?: object[],
 *   headSha: string,
 *   baseRef: string,
 *   exec?: typeof execFileSync,
 * }} params
 * @returns {{ unchanged: true, approval: object, approvedSha: string } | { unchanged: false, reason: string }}
 */
export function checkDiffUnchangedSinceApproval({
  reviews,
  issueComments = [],
  headSha,
  baseRef,
  exec = execFileSync,
}) {
  try {
    if (!headSha || !baseRef) {
      return { unchanged: false, reason: 'missing head SHA or base ref' };
    }
    const approval = findLatestBotApproval(reviews ?? []);
    if (!approval) {
      return {
        unchanged: false,
        reason: 'latest bot verdict is not an approval',
      };
    }
    if (hasCycleResetSince(issueComments, approval.submittedAt)) {
      return {
        unchanged: false,
        reason: 'cycle counter was reset after the approval',
      };
    }
    const approvedSha = approval.commitId;
    if (approvedSha === headSha) {
      return { unchanged: true, approval, approvedSha };
    }
    const approvedFp = fetchDiffFingerprint(baseRef, approvedSha, exec);
    const headFp = fetchDiffFingerprint(baseRef, headSha, exec);
    if (!approvedFp || !headFp) {
      return {
        unchanged: false,
        reason: 'compare response unusable (file list missing or truncated)',
      };
    }
    if (approvedFp !== headFp) {
      return {
        unchanged: false,
        reason: `diff changed since approved ${approvedSha.slice(0, 7)}`,
      };
    }
    return { unchanged: true, approval, approvedSha };
  } catch (err) {
    return {
      unchanged: false,
      reason: `comparison failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * The notice prepended to the re-affirmed APPROVE body.
 *
 * @param {string} approvedSha
 * @returns {string}
 */
export function buildReaffirmNotice(approvedSha) {
  return (
    `<!-- ${REAFFIRMED_APPROVAL_MARKER}: ${approvedSha} -->\n` +
    `> [!NOTE]\n` +
    `> Diff unchanged since approved \`${approvedSha.slice(0, 7)}\`; re-affirmed without re-review (LS-10963).`
  );
}
