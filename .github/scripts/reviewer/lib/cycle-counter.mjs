/**
 * Tamper-proof review cycle counter.
 *
 * The cycle is derived from immutable PR review history (formal GitHub reviews
 * submitted via the Reviews API), NOT from marker comments. Deleting or editing
 * comments cannot affect the count.
 *
 * cycle = count(formal reviews authored by the reviewer bot) + 1
 *
 * In shadow mode (T9) the bot posts plain PR comments, not formal reviews, so
 * the counter always returns 1 — correct for the first pass. Once the reviewer
 * switches to blocking mode (T18) and submits formal CHANGES_REQUESTED reviews,
 * the counter increments per cycle automatically.
 */

/** Known GitHub login identifiers for the code-reviewer bot. */
export const REVIEWER_BOT_LOGINS = new Set(['legacy-sports-review-bot[bot]']);

/** GitHub login for Code Writer Bot (the bot that authors PRs via its installation token). */
export const CODE_WRITER_BOT_LOGIN = 'code-writer-bot[bot]';

/**
 * Returns true when the PR author is Code Writer Bot.
 *
 * Code Writer Bot PRs use the full RAISE/ADJUDICATE/VERIFY cycle protocol (§7).
 * All other PRs — including agent-authored PRs pushed under the developer's
 * identity — use the §8a relaxed single-pass review path.
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
 * @param {Array<{ userLogin: string | null }>} reviews  All formal reviews on the PR
 * @param {Set<string>} [botLogins]               Override the bot login set (testing)
 * @returns {number}  1 for first review, 2 after one prior bot review, etc.
 */
export function computeCycle(reviews, botLogins = REVIEWER_BOT_LOGINS) {
  const botReviewCount = reviews.filter((r) =>
    botLogins.has(r.userLogin),
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
