/**
 * Tamper-proof review cycle counter.
 *
 * The cycle is derived from immutable PR review history (formal GitHub reviews
 * submitted via the Reviews API), NOT from marker comments. Deleting or editing
 * comments cannot affect the count.
 *
 * cycle = count(formal reviews authored by the reviewer bot) + 1
 *
 * Infrastructure-error reviews (posted by postInfraErrorReview when the LLM
 * API fails) are excluded from the count. They carry no LLM findings, so
 * treating them as a completed cycle would cause the C2 validator on the
 * subsequent retry to strip all real findings as "new issues outside author's
 * changes" (since the infra-error body has no ## Finding titles to match).
 *
 * In shadow mode (T9) the bot posts plain PR comments, not formal reviews, so
 * the counter always returns 1 — correct for the first pass. Once the reviewer
 * switches to blocking mode (T18) and submits formal CHANGES_REQUESTED reviews,
 * the counter increments per cycle automatically.
 */

/** Body prefix that identifies an infra-error review (posted by postInfraErrorReview). */
export const INFRA_ERROR_REVIEW_PREFIX = '## Review bot infrastructure error';

/** Known GitHub login identifiers for the code-reviewer bot. */
export const REVIEWER_BOT_LOGINS = new Set(['legacy-sports-review-bot[bot]']);

/** GitHub login for Code Writer Bot (the bot that authors PRs via its installation token). */
export const CODE_WRITER_BOT_LOGIN = 'code-writer-bot[bot]';

/**
 * Returns true when the PR author is Code Writer Bot.
 *
 * This is used for telemetry classification only — author identity does NOT
 * affect review behavior. All non-draft, non-fork PRs follow the same
 * RAISE/ADJUDICATE/VERIFY cycle protocol regardless of author.
 *
 * @param {{ login?: string | null, is_bot?: boolean | null } | null | undefined} author
 * @returns {boolean}
 */
export function isCodeWriterBotAuthor(author) {
  const isBot = author?.is_bot ?? author?.login?.endsWith('[bot]') ?? false;
  return isBot && author?.login === CODE_WRITER_BOT_LOGIN;
}

/** Reviews posted in cycle > MAX_CYCLE trigger escalation instead. */
export const MAX_CYCLE = 3;

/**
 * Compute the current review cycle from PR review history.
 *
 * Infra-error reviews (body starts with INFRA_ERROR_REVIEW_PREFIX) are excluded
 * from the count — they carry no LLM findings and must not advance the cycle.
 *
 * @param {Array<{ userLogin: string | null, body?: string | null }>} reviews  All formal reviews on the PR
 * @param {Set<string>} [botLogins]               Override the bot login set (testing)
 * @returns {number}  1 for first review, 2 after one prior bot review, etc.
 */
export function computeCycle(reviews, botLogins = REVIEWER_BOT_LOGINS) {
  const botReviewCount = reviews.filter(
    (r) =>
      botLogins.has(r.userLogin) &&
      !(r.body ?? '').startsWith(INFRA_ERROR_REVIEW_PREFIX),
  ).length;
  return botReviewCount + 1;
}

/**
 * Whether the current cycle exceeds the maximum and should escalate to humans
 * instead of posting another bot review.
 *
 * @param {number} cycle
 * @returns {boolean}
 */
export function isEscalationRequired(cycle) {
  return cycle > MAX_CYCLE;
}
