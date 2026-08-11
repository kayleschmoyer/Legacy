/** Format-error message posted in-thread when a reply is unrecognized. */
export const FORMAT_ERROR_MESSAGE =
  'Format error. Expected "FIX: <sha>" or "JUSTIFY: <rationale>". Your reply was treated as unaddressed.';

/**
 * Parse the body of an author reply to a review thread.
 *
 * Recognized tokens (all case-sensitive; leading/trailing whitespace on the
 * full body is trimmed before matching):
 *   FIX: <sha>                   – author fixed the issue at the cited commit
 *                                  (<sha> = 7–40 hex chars; trailing prose on the
 *                                   same line after the SHA is tolerated)
 *   JUSTIFY: <rationale>         – author explains why issue should be dismissed
 *   CANNOT-COMPLY: <id> <reason> – author claims compliance is impossible (Cycle 3+).
 *                                  The reason may follow the id on the same line or
 *                                  on the next line(s) (LS-8750) — both are documented
 *                                  forms in pr-lifecycle/SKILL.md.
 *
 * SHA validation against actual PR commits is NOT performed here — use
 * `isShaInPrHistory` after receiving a FIX result.
 *
 * @param {string} body  Raw reply text from the author
 * @returns {ParsedResponse}
 *
 * @typedef {{ type: 'FIX', sha: string }} FixResponse
 * @typedef {{ type: 'JUSTIFY', rationale: string }} JustifyResponse
 * @typedef {{ type: 'CANNOT-COMPLY', issueId: string, reason: string }} CannotComplyResponse
 * @typedef {{ type: 'MALFORMED', originalBody: string }} MalformedResponse
 * @typedef {FixResponse | JustifyResponse | CannotComplyResponse | MalformedResponse} ParsedResponse
 */
export function parseAuthorReply(body) {
  const trimmed = body.trim();
  if (!trimmed) return { type: 'MALFORMED', originalBody: trimmed };

  const firstLine = trimmed.split('\n')[0];

  // FIX: <sha>  — sha is a 7–40 char hex commit SHA (full or abbreviated).
  // Trailing prose on the same line is tolerated (e.g. "FIX: a1b2c3d done in
  // this commit") so an otherwise-valid reply is not rejected as MALFORMED and
  // forced to burn a review cycle (LS-7768). The SHA must be the first token and
  // be followed by whitespace or end-of-line; a non-hex first token (e.g.
  // "FIX: see below") is still MALFORMED because no commit can be verified.
  const fixMatch = firstLine.match(/^FIX:\s+([0-9a-fA-F]{7,40})(?:\s|$)/);
  if (fixMatch) {
    return { type: 'FIX', sha: fixMatch[1] };
  }

  // CANNOT-COMPLY: <issue-id> <reason>  — reason may follow the id on the same
  // line or on the next line(s). The id must be separated from the colon by a
  // space/tab (not a newline) so a reply that omits the id entirely (colon
  // directly followed by a newline) is still MALFORMED rather than treating
  // the reason's first word as the id. Reported on PR #6379 (LS-8750): a
  // same-line reply ("CANNOT-COMPLY: manual-android-verification No Android
  // device...") was rejected because the old regex required a hard newline
  // between id and reason, contradicting the documented same-line form.
  // Check before JUSTIFY so "CANNOT-COMPLY:" is not partially matched.
  const cannotMatch = trimmed.match(/^CANNOT-COMPLY:[ \t]+(\S+)\s+([\s\S]+)$/);
  if (cannotMatch) {
    return {
      type: 'CANNOT-COMPLY',
      issueId: cannotMatch[1],
      reason: cannotMatch[2].trim(),
    };
  }

  // JUSTIFY: <rationale>  — rationale may span multiple lines.
  const justifyMatch = trimmed.match(/^JUSTIFY:\s+([\s\S]+)$/);
  if (justifyMatch) {
    return { type: 'JUSTIFY', rationale: justifyMatch[1].trim() };
  }

  return { type: 'MALFORMED', originalBody: trimmed };
}

/**
 * Check whether a SHA (full or abbreviated) exists in the PR's commit history.
 *
 * Uses prefix-matching so short SHAs (e.g. "abc1234") resolve against the
 * full 40-character SHAs returned by the GitHub API.
 *
 * @param {string} sha            Commit SHA from a FIX: token (may be abbreviated)
 * @param {string[]} prCommitShas Full 40-char SHAs from the PR's commit list
 * @returns {boolean}
 */
export function isShaInPrHistory(sha, prCommitShas) {
  const normalized = sha.toLowerCase();
  if (!normalized) return false;
  return prCommitShas.some((fullSha) =>
    fullSha.toLowerCase().startsWith(normalized),
  );
}

/**
 * Parse an issue-id-qualified `FIX:`/`JUSTIFY:` reply to a PR-level
 * (threadless) finding, posted as a top-level PR (issue) comment.
 *
 * PR-level findings have no review thread, so a plain `FIX: <sha>` /
 * `JUSTIFY: <rationale>` reply cannot be tied back to a specific finding
 * when more than one is open. This mirrors the `CANNOT-COMPLY: <issue-id>`
 * convention `parseAuthorReply` already supports — the issue-id sits alone
 * on the first line, the payload follows on the next line(s):
 *
 *   FIX: <issue-id>
 *   <sha>
 *
 *   JUSTIFY: <issue-id>
 *   <rationale>
 *
 * Returns `null` when the body does not match this qualified shape —
 * callers should fall back to `parseAuthorReply` for the unqualified,
 * single-line `FIX:`/`JUSTIFY:` form (LS-7938).
 *
 * @param {string} body  Raw issue-comment text from the author
 * @returns {{ type: 'FIX', issueId: string, sha: string } | { type: 'JUSTIFY', issueId: string, rationale: string } | null}
 */
export function parseIssueScopedReply(body) {
  const trimmed = body.trim();
  if (!trimmed) return null;

  const fixMatch = trimmed.match(
    /^FIX:\s+(\S+)\s*\n([0-9a-fA-F]{7,40})(?:\s|$)/,
  );
  if (fixMatch) {
    return { type: 'FIX', issueId: fixMatch[1], sha: fixMatch[2] };
  }

  const justifyMatch = trimmed.match(/^JUSTIFY:\s+(\S+)\s*\n([\s\S]+)$/);
  if (justifyMatch) {
    return {
      type: 'JUSTIFY',
      issueId: justifyMatch[1],
      rationale: justifyMatch[2].trim(),
    };
  }

  return null;
}
