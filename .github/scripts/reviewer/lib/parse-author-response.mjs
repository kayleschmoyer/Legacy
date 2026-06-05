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
 *   CANNOT-COMPLY: <id>\n<reason> – author claims compliance is impossible (Cycle 3+)
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

  // CANNOT-COMPLY: <issue-id>\n<reason>  — reason must appear on the next line(s).
  // Check before JUSTIFY so "CANNOT-COMPLY:" is not partially matched.
  const cannotMatch = trimmed.match(/^CANNOT-COMPLY:\s+(\S+)\s*\n([\s\S]+)$/);
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
