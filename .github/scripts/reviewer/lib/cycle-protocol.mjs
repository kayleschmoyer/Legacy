import {
  parseAuthorReply,
  isShaInPrHistory,
  FORMAT_ERROR_MESSAGE,
} from './parse-author-response.mjs';

/**
 * Cycle protocol implementation — T22.
 *
 * Three-cycle state machine that prevents agent ping-pong:
 *
 *   RAISE (cycle 1)      — initial review; may raise any issue
 *   ADJUDICATE (cycle 2) — re-evaluates C1 findings against the current diff;
 *                          cannot raise issues unrelated to author's changes
 *   VERIFY (cycle 3)     — verifies C2 mandate compliance only; no new findings
 *
 * Cycle > 3 triggers `needs-human-arbitration` escalation (handled in index.mjs).
 */

/**
 * Map of cycle number to role name.
 * @type {{ [cycle: number]: 'RAISE' | 'ADJUDICATE' | 'VERIFY' }}
 */
export const CYCLE_ROLES = { 1: 'RAISE', 2: 'ADJUDICATE', 3: 'VERIFY' };

/**
 * Returns the role name for the given cycle number.
 * Cycles beyond MAX_CYCLE are handled by escalation before this is called,
 * but for safety unknown cycles fall back to 'VERIFY'.
 *
 * @param {number} cycle
 * @returns {'RAISE' | 'ADJUDICATE' | 'VERIFY'}
 */
export function getCycleRole(cycle) {
  return CYCLE_ROLES[cycle] ?? 'VERIFY';
}

/**
 * Extract finding titles from a bot review body.
 *
 * Parses the format produced by `formatReviewBody`:
 *   <!-- issue-id: ULID -->
 *   **[SEVERITY]** <title> — `file:line` | `file` | _PR-level_
 *
 * Note: `buildInlineComments` uses a slightly different format that omits the
 * " — <loc>" suffix, so inline comment bodies are not matched by this function.
 * C2/C3 validators operate on the formal bot review body only (blocking findings
 * posted as the main review body via `formatReviewBody`).
 *
 * The regex anchors on the ` — ` separator followed by either a backtick (start
 * of a code-span location) or `_PR-level_`. This prevents premature truncation
 * when a finding title itself contains a dash or en-dash.
 *
 * @param {string | null | undefined} body
 * @returns {string[]}
 */
export function parseTitlesFromReviewBody(body) {
  if (!body) return [];
  // Anchor the separator on the loc patterns produced by formatReviewBody so
  // that titles containing " — " are not truncated prematurely.
  const matches = [
    ...body.matchAll(/\*\*\[[A-Z]+\]\*\*\s+(.+?)\s+—\s+(?:`|_PR-level_)/g),
  ];
  return matches.map((m) => m[1].trim());
}

/**
 * @typedef {'no_title_match_no_sha' | 'no_title_match_sha_not_post_c1' | 'not_in_c2_mandate_list' | 'author_fixed' | 'author_justified'} StripReason
 *
 * @typedef {import('./findings.mjs').Finding & { strip_reason: StripReason }} StrippedFinding
 */

/**
 * Cycle 2 post-LLM validator.
 *
 * Strips findings that are **new** (not present in Cycle 1) and do **not**
 * reference a commit the author pushed since C1's review.
 *
 * Also strips C1 findings that the author has demonstrably resolved:
 *   - `resolvedTitles` — findings where the author posted `FIX: <sha>` and
 *     the SHA was verified to exist in the PR's commit history. Stripped with
 *     reason `'author_fixed'` even if the LLM re-raised the finding.
 *   - `justifiedTitles` — findings where the author posted `JUSTIFY: <rationale>`.
 *     Stripped with reason `'author_justified'` if the LLM re-raises after the
 *     prompt already instructed it to evaluate the rationale.
 *
 * "Present in C1" = the finding's title (case-insensitive) matches a title
 * extracted from the prior bot review body.
 *
 * "Cites a post-C1 commit" = the finding's `body` field contains a hex string
 * of 7–40 characters that prefix-matches any SHA in `postC1CommitShas`.
 *
 * Stripped findings are annotated with a `strip_reason` field:
 *   - `'author_fixed'`                    — author posted FIX: with a valid PR SHA
 *   - `'author_justified'`               — author posted JUSTIFY: rationale
 *   - `'no_title_match_no_sha'`           — no SHA-like string cited in body at all
 *   - `'no_title_match_sha_not_post_c1'`  — a SHA is cited but does not match any post-C1 commit
 *
 * @param {import('./findings.mjs').Finding[]} findings
 * @param {string[]} priorTitles      Titles from Cycle 1's review body
 * @param {string[]} postC1CommitShas Full 40-char SHAs of commits added after C1
 * @param {Set<string>} [resolvedTitles]  Lowercase titles where author FIX'd with a valid SHA
 * @param {Set<string>} [justifiedTitles] Lowercase titles where author posted JUSTIFY:
 * @returns {{ kept: import('./findings.mjs').Finding[], stripped: StrippedFinding[] }}
 */
export function filterFindingsCycle2(
  findings,
  priorTitles,
  postC1CommitShas,
  resolvedTitles = new Set(),
  justifiedTitles = new Set(),
) {
  const priorSet = new Set(priorTitles.map((t) => t.toLowerCase()));

  const kept = [];
  const stripped = [];

  for (const f of findings) {
    const titleLower = f.title.toLowerCase();

    // Author claimed this finding was fixed (FIX: sha, sha in PR history).
    // Trust the FIX reply and suppress even if the LLM re-raised it.
    if (resolvedTitles.has(titleLower)) {
      stripped.push({ ...f, strip_reason: 'author_fixed' });
      continue;
    }

    // Author provided a JUSTIFY rationale. Suppress if the LLM re-raises
    // despite having the rationale in the prompt — the LLM already had a
    // chance to evaluate it and may be pattern-matching on keywords rather
    // than re-evaluating the current code state.
    if (justifiedTitles.has(titleLower)) {
      stripped.push({ ...f, strip_reason: 'author_justified' });
      continue;
    }

    // Re-raised from C1 and not resolved/justified above — keep.
    if (priorSet.has(titleLower)) {
      kept.push(f);
      continue;
    }

    // New finding: keep only if it cites a post-C1 commit SHA.
    const bodyLower = f.body.toLowerCase();
    const citesPostC1 = postC1CommitShas.some((sha) =>
      bodyLower.includes(sha.slice(0, 7).toLowerCase()),
    );

    if (citesPostC1) {
      kept.push(f);
    } else {
      // Distinguish: did the LLM cite any SHA at all (false-negative signal)
      // or did it simply not cite any commit SHA whatsoever?
      // Require at least one digit to avoid matching pure-letter hex words (e.g. "defaced").
      const citesAnySha = /(?=[0-9a-f]*[0-9])[0-9a-f]{7,40}/.test(bodyLower);
      stripped.push({
        ...f,
        strip_reason: citesAnySha
          ? 'no_title_match_sha_not_post_c1'
          : 'no_title_match_no_sha',
      });
    }
  }

  return { kept, stripped };
}

/**
 * Cycle 3 post-LLM validator.
 *
 * Strips any finding whose title (case-insensitive) is not present in the
 * Cycle 2 mandate list. Cycle 3 may only verify what was mandated in C2;
 * all other findings are invalid for this cycle.
 *
 * Also strips mandate findings that the author has demonstrably resolved via
 * `FIX: <sha>` (sha verified in PR history), annotated with `'author_fixed'`.
 * This prevents the bot from re-flagging issues the author has already addressed
 * when the LLM fails to recognize the fix in the diff.
 *
 * Stripped findings are annotated with a `strip_reason` field:
 *   - `'author_fixed'`              — author posted FIX: with a valid PR SHA
 *   - `'not_in_c2_mandate_list'`    — finding not in the C2 mandate list
 *
 * @param {import('./findings.mjs').Finding[]} findings
 * @param {string[]} mandateTitles    Titles from Cycle 2's review body
 * @param {Set<string>} [resolvedTitles] Lowercase titles where author FIX'd with a valid SHA
 * @returns {{ kept: import('./findings.mjs').Finding[], stripped: StrippedFinding[] }}
 */
export function filterFindingsCycle3(
  findings,
  mandateTitles,
  resolvedTitles = new Set(),
) {
  const mandateSet = new Set(mandateTitles.map((t) => t.toLowerCase()));

  const kept = [];
  const stripped = [];

  for (const f of findings) {
    const titleLower = f.title.toLowerCase();

    // Author claimed this mandate was fixed (FIX: sha, sha in PR history).
    // Suppress even if the LLM re-raised it — trust the explicit FIX reply.
    if (resolvedTitles.has(titleLower)) {
      stripped.push({ ...f, strip_reason: 'author_fixed' });
      continue;
    }

    if (mandateSet.has(titleLower)) {
      kept.push(f);
    } else {
      stripped.push({ ...f, strip_reason: 'not_in_c2_mandate_list' });
    }
  }

  return { kept, stripped };
}

/**
 * Build the "Your Role This Cycle" section injected into the system prompt.
 *
 * @param {number} cycle
 * @param {string[]} [priorTitles] Titles from the previous cycle's review body
 * @param {string[]} [postC1CommitShas] Full 40-char SHAs of commits pushed since C1 (Cycle 2 only)
 * @param {Set<string>} [resolvedTitles] Lowercase titles the author FIX'd with a verified SHA (C2/C3)
 * @param {Set<string>} [justifiedTitles] Lowercase titles the author posted a JUSTIFY: reply for (C2/C3).
 *   These are excluded from the "re-evaluate"/"verify" lists and explicitly marked do-not-re-raise so a
 *   sound justification does not get re-raised and burn a review cycle toward the arbitration limit (LS-7768).
 * @returns {string}
 */
export function buildCycleRoleSection(
  cycle,
  priorTitles = [],
  postC1CommitShas = [],
  resolvedTitles = new Set(),
  justifiedTitles = new Set(),
) {
  if (cycle === 1) {
    return `\
## Your Role This Cycle: RAISE (Cycle 1 of 3)

You are performing the **initial review**. Raise ALL genuine issues you find — \
correctness, security, contract violations, and quality concerns. There are no \
restrictions on what you may raise in this cycle.`;
  }

  if (cycle === 2) {
    // Build sorted list of C1 titles that have NOT been verified as fixed and
    // were NOT justified by the author, so the LLM only re-adjudicates titles
    // that still genuinely need it. Justified titles are handled by their own
    // do-not-re-raise block below (LS-7768).
    const pendingTitles = priorTitles.filter(
      (t) =>
        !resolvedTitles.has(t.toLowerCase()) &&
        !justifiedTitles.has(t.toLowerCase()),
    );
    const priorBlock =
      pendingTitles.length > 0
        ? `\n\nIssues from Cycle 1 you must re-evaluate:\n${pendingTitles.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}`
        : '';

    const resolvedBlock =
      resolvedTitles.size > 0
        ? `\n\n**Pre-verified FIX replies — OMIT these findings (author committed a fix):**\n${[...resolvedTitles].map((t) => `  - ${t}`).join('\n')}`
        : '';

    const justifiedBlock =
      justifiedTitles.size > 0
        ? `\n\n**Author posted a JUSTIFY: reply for these findings — do NOT re-raise unless the justification is demonstrably wrong.** Re-raising a sound justification wastes a review cycle toward the arbitration limit; the validator will strip it regardless:\n${[...justifiedTitles].map((t) => `  - ${t}`).join('\n')}`
        : '';

    const shaListBlock =
      postC1CommitShas.length > 0
        ? `\n\nCommits the author pushed since Cycle 1 — these are the ONLY SHAs you may cite:\n${postC1CommitShas.map((sha) => `  - \`${sha.slice(0, 7)}\``).join('\n')}`
        : '';

    return `\
## Your Role This Cycle: ADJUDICATE (Cycle 2 of 3)

You are **adjudicating Cycle 1 findings** against the current code state. \
Re-evaluate each prior finding against the current diff **and** any author \
replies provided below. If the issue is still present and unaddressed, re-raise \
it (it becomes a mandate). If it is resolved or the justification is sound, omit it.${resolvedBlock}${justifiedBlock}${priorBlock}

**Evaluating author replies (provided as "## Author Responses" in the user prompt):**
- \`FIX: <sha>\` — verify the fix exists in HEAD. **Do NOT re-raise** if the fix \
is present in the current code, even if the original diff still shows the old \
pattern in context lines. Check the current file content, not the diff context.
- \`JUSTIFY: <rationale>\` — evaluate the justification carefully. \
**Accept the justification and omit the finding** if: (a) the rationale explains \
why the pattern is safe in this specific context, (b) the finding is correctly \
scoped as out-of-scope for this PR (e.g. "pre-existing component has no tests; \
adding tests is out of scope for this build-fix PR"), or (c) the risk is \
hypothetical rather than demonstrated. Only re-raise if the justification is \
demonstrably wrong or the risk is concrete and unmitigated.
- No reply — treat as unaddressed; re-raise if the issue is still present in the diff.

**Your instructions:**
- **Re-raise** findings from Cycle 1 that are still present and unaddressed \
(these become mandates the author MUST fix before Cycle 3).
- **Accept** findings that are no longer present in the current code or whose \
\`JUSTIFY\` rationale is sound (omit them from your output).

**⚠️ VALIDATOR-ENFORCED CONSTRAINT — mandatory for any NEW finding:**
You MAY raise a new finding (not present in Cycle 1) ONLY if the issue was \
**directly introduced** by a commit the author pushed since Cycle 1. \
Every new finding MUST include the causal commit SHA in its \`body\` field — \
the validator checks for this and will automatically strip any new finding \
whose body does not contain a matching SHA prefix (7+ hex chars).

Required format — include a phrase like this in the \`body\` field:
  \`"This issue was introduced in commit a1b2c3d."\`${shaListBlock}

**Do NOT raise new findings** that are unrelated to these post-C1 commits — \
they will be stripped before the review is posted.`;
  }

  if (cycle === 3) {
    const pendingMandates = priorTitles.filter(
      (t) =>
        !resolvedTitles.has(t.toLowerCase()) &&
        !justifiedTitles.has(t.toLowerCase()),
    );
    const mandateBlock =
      pendingMandates.length > 0
        ? `\n\nMandates from Cycle 2 you must verify:\n${pendingMandates.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}`
        : '';

    const resolvedBlock =
      resolvedTitles.size > 0
        ? `\n\n**Pre-verified FIX replies — these mandates are addressed (OMIT from output):**\n${[...resolvedTitles].map((t) => `  - ${t}`).join('\n')}`
        : '';

    const justifiedBlock =
      justifiedTitles.size > 0
        ? `\n\n**Author posted a JUSTIFY: reply for these findings — they are NOT mandates; OMIT from output unless the justification is demonstrably wrong:**\n${[...justifiedTitles].map((t) => `  - ${t}`).join('\n')}`
        : '';

    return `\
## Your Role This Cycle: VERIFY (Cycle 3 of 3)

You are **verifying mandate compliance** — checking only whether the author \
addressed each specific mandate issued in Cycle 2.${resolvedBlock}${justifiedBlock}${mandateBlock}

**Rules — strictly enforced by the post-LLM validator:**
- Output findings **only** for mandates that are still unaddressed.
- If a mandate is fulfilled: do NOT include it in your output. \
Check the **current HEAD file content**, not diff context lines — the fix may \
be present even if the original pattern appears in the diff as context.
- If all mandates are fulfilled: output an empty array \`[]\`.
- **Do NOT raise new issues** — any finding not in the Cycle 2 mandate list \
will be automatically stripped.`;
  }

  // Cycle > 3 should trigger escalation before this function is called.
  return '';
}

/**
 * Find inline review thread root comment IDs where the author posted a MALFORMED
 * reply (no FIX: / JUSTIFY: / CANNOT-COMPLY: prefix) after the last bot review.
 *
 * Returns deduplicated root comment IDs — at most one format-error reply per
 * thread even if the author posted multiple MALFORMED replies in the same thread.
 *
 * Only considers replies to bot-authored root comments so we never post into
 * human-started threads.
 *
 * @param {Array<{ id: number, inReplyToId: number | null, userLogin: string | null, body: string, createdAt: string }>} reviewComments
 * @param {string} lastBotReviewAt  ISO 8601 timestamp; replies at-or-before this are excluded
 * @param {Set<string>} botLogins
 * @returns {number[]}  Deduplicated list of root comment IDs that received a MALFORMED reply
 */
export function getMalformedInlineReplies(
  reviewComments,
  lastBotReviewAt,
  botLogins,
) {
  const botRootIds = new Set(
    reviewComments
      .filter((c) => botLogins.has(c.userLogin) && c.inReplyToId === null)
      .map((c) => c.id),
  );

  // Threads where the format-error warning was already posted since lastBotReviewAt.
  // Detected by body content rather than author login because the reply may be
  // posted via GH_TOKEN (github-actions[bot]) rather than the bot App identity.
  const alreadyWarnedThreads = new Set(
    reviewComments
      .filter(
        (c) =>
          c.inReplyToId !== null &&
          (!lastBotReviewAt || c.createdAt > lastBotReviewAt) &&
          c.body === FORMAT_ERROR_MESSAGE,
      )
      .map((c) => c.inReplyToId),
  );

  const malformedThreads = new Set();
  const validReplyThreads = new Set();

  for (const c of reviewComments) {
    if (botLogins.has(c.userLogin) || c.inReplyToId === null) continue;
    if (lastBotReviewAt && c.createdAt <= lastBotReviewAt) continue;
    if (!botRootIds.has(c.inReplyToId)) continue;
    // Skip format-error warning replies posted by any identity (e.g. github-actions[bot])
    // so they are never misclassified as author MALFORMED replies.
    if (c.body === FORMAT_ERROR_MESSAGE) continue;
    const { type } = parseAuthorReply(c.body);
    if (type === 'MALFORMED') {
      malformedThreads.add(c.inReplyToId);
    } else {
      validReplyThreads.add(c.inReplyToId);
    }
  }

  return [...malformedThreads].filter(
    (id) => !validReplyThreads.has(id) && !alreadyWarnedThreads.has(id),
  );
}

/**
 * Build the "## Author Responses" section to inject into the Cycle 2+ user prompt.
 *
 * Collects FIX/JUSTIFY/CANNOT-COMPLY tokens from two sources:
 *   1. Author replies to inline review comment threads (non-blocking findings).
 *      Each reply is matched to a finding title extracted from the bot's root comment body.
 *   2. PR-level issue comments posted after the last bot review (blocking findings).
 *      These have no specific thread to match, so they are listed without a title.
 *
 * MALFORMED replies (unrecognised tokens) are silently skipped and counted.
 * Returns an empty section string when no valid responses are found.
 *
 * @param {Array<{ id: number, inReplyToId: number | null, userLogin: string | null, body: string, createdAt: string }>} reviewComments
 * @param {Array<{ id: number, userLogin: string | null, body: string, createdAt: string }>} issueComments
 * @param {string} lastBotReviewAt     ISO 8601 timestamp of the last bot review; comments at or before this time are excluded from both sources
 * @param {Set<string>} botLogins      Login names that belong to the reviewer bot
 * @returns {{ section: string, formatErrors: number, items: Array<{ title: string | null, parsed: import('./parse-author-response.mjs').ParsedResponse }> }}
 */
export function buildAuthorResponsesSection(
  reviewComments,
  issueComments,
  lastBotReviewAt,
  botLogins,
) {
  /** @type {Array<{ title: string | null, parsed: import('./parse-author-response.mjs').ParsedResponse }>} */
  const items = [];
  let formatErrors = 0;

  // --- Part 1: inline review thread replies (blocking and non-blocking findings) ---
  // Build a map from bot root comment id → finding title extracted from the
  // comment body ("**[SEV]** title\n\n..." or "**[SEV]** title — loc").
  const rootIdToTitle = new Map();
  for (const c of reviewComments) {
    if (!botLogins.has(c.userLogin) || c.inReplyToId !== null) continue;
    const m = c.body.match(/\*\*\[[A-Z]+\]\*\*\s+(.+?)(?:\s+—\s+|\n|$)/m);
    if (m) rootIdToTitle.set(c.id, m[1].trim());
  }

  for (const c of reviewComments) {
    if (botLogins.has(c.userLogin) || c.inReplyToId === null) continue;
    if (lastBotReviewAt && c.createdAt <= lastBotReviewAt) continue;
    const parsed = parseAuthorReply(c.body);
    if (parsed.type === 'MALFORMED') {
      formatErrors++;
      continue;
    }
    items.push({ title: rootIdToTitle.get(c.inReplyToId) ?? null, parsed });
  }

  // --- Part 2: PR-level issue comments after the last bot review ---
  // Fallback channel for author responses to blocking findings. Blocking findings
  // with file+line also appear as inline threads (captured by Part 1 above);
  // PR-level blocking findings (no file/line) and any issue-comment replies land here.
  for (const c of issueComments) {
    if (botLogins.has(c.userLogin)) continue;
    if (lastBotReviewAt && c.createdAt <= lastBotReviewAt) continue;
    const parsed = parseAuthorReply(c.body);
    if (parsed.type === 'MALFORMED') {
      formatErrors++;
      continue;
    }
    items.push({ title: null, parsed });
  }

  if (items.length === 0) return { section: '', formatErrors, items };

  const lines = ['## Author Responses'];
  for (const { title, parsed } of items) {
    let responseText;
    if (parsed.type === 'FIX') {
      responseText = `FIX: ${parsed.sha}`;
    } else if (parsed.type === 'JUSTIFY') {
      responseText = `JUSTIFY: ${parsed.rationale}`;
    } else {
      responseText = `CANNOT-COMPLY: ${parsed.issueId}\n${parsed.reason}`;
    }
    lines.push(title ? `\n**${title}**: ${responseText}` : `\n${responseText}`);
  }

  return { section: lines.join('\n'), formatErrors, items };
}

/**
 * Build sets of finding titles that the author has resolved or justified
 * since the last bot review. Used by post-LLM validators to suppress
 * re-raised findings that the author has already addressed.
 *
 * Only `FIX: <sha>` replies whose SHA is present in the PR's commit history
 * are treated as resolved — a FIX citing an unknown SHA is not trusted.
 * All `JUSTIFY: <rationale>` replies are included in `justifiedTitles`
 * regardless of rationale content (the LLM evaluates quality in C2 ADJUDICATE;
 * this set is used as a fallback when the LLM re-raises despite the prompt).
 *
 * Title matching is case-insensitive (normalized to lowercase).
 *
 * @param {Array<{ title: string | null, parsed: import('./parse-author-response.mjs').ParsedResponse }>} responseItems
 *   The `items` field returned by `buildAuthorResponsesSection`.
 * @param {string[]} prCommitShas  Full 40-char SHAs of all commits in the PR
 * @returns {{ resolvedTitles: Set<string>, justifiedTitles: Set<string> }}
 */
export function buildAuthorResolvedTitles(responseItems, prCommitShas) {
  const resolvedTitles = new Set();
  const justifiedTitles = new Set();

  for (const { title, parsed } of responseItems) {
    if (!title) continue;
    const titleLower = title.toLowerCase();

    if (parsed.type === 'FIX' && isShaInPrHistory(parsed.sha, prCommitShas)) {
      resolvedTitles.add(titleLower);
    } else if (parsed.type === 'JUSTIFY') {
      justifiedTitles.add(titleLower);
    }
  }

  return { resolvedTitles, justifiedTitles };
}

/**
 * Detect whether the PR author has posted a CANNOT-COMPLY reply after the
 * last bot review. Used by index.mjs to short-circuit the LLM call in
 * Cycle 3+ and escalate to human arbitration immediately.
 *
 * Only comments from `authorLogin` are considered — this prevents a third
 * party (another commenter, a bot like dependabot) from forcing escalation
 * by posting a CANNOT-COMPLY token. An empty `authorLogin` is treated as
 * unknown and returns false (fail-safe: no escalation).
 *
 * Uses the same timestamp and bot-login filtering as
 * {@link buildAuthorResponsesSection}.
 *
 * @param {Array<{ id: number, inReplyToId: number | null, userLogin: string | null, body: string, createdAt: string }>} reviewComments
 * @param {Array<{ id: number, userLogin: string | null, body: string, createdAt: string }>} issueComments
 * @param {string} lastBotReviewAt  ISO 8601 timestamp; replies at or before this time are excluded
 * @param {Set<string>} botLogins   Login names belonging to the reviewer bot
 * @param {string} authorLogin      PR author login; only comments from this user are checked
 * @returns {boolean}
 */
export function hasCannotComplyResponse(
  reviewComments,
  issueComments,
  lastBotReviewAt,
  botLogins,
  authorLogin,
) {
  return (
    collectCannotComplyResponses(
      reviewComments,
      issueComments,
      lastBotReviewAt,
      botLogins,
      authorLogin,
    ).length > 0
  );
}

/**
 * Collect every CANNOT-COMPLY reply posted by the PR author since the last
 * bot review. Same filtering rules as {@link hasCannotComplyResponse}, but
 * returns the parsed entries instead of a boolean so callers can surface
 * the specific issue-id + reason in escalation messages.
 *
 * @typedef {{
 *   source: 'review' | 'issue',
 *   commentId: number,
 *   issueId: string,
 *   reason: string,
 *   createdAt: string,
 * }} CannotComplyEntry
 *
 * @param {Array<{ id: number, inReplyToId: number | null, userLogin: string | null, body: string, createdAt: string }>} reviewComments
 * @param {Array<{ id: number, userLogin: string | null, body: string, createdAt: string }>} issueComments
 * @param {string} lastBotReviewAt
 * @param {Set<string>} botLogins
 * @param {string} authorLogin
 * @returns {CannotComplyEntry[]}
 */
export function collectCannotComplyResponses(
  reviewComments,
  issueComments,
  lastBotReviewAt,
  botLogins,
  authorLogin,
) {
  /** @type {CannotComplyEntry[]} */
  const out = [];
  if (!authorLogin) return out;
  for (const c of reviewComments) {
    if (botLogins.has(c.userLogin) || c.inReplyToId === null) continue;
    if (c.userLogin !== authorLogin) continue;
    if (lastBotReviewAt && c.createdAt <= lastBotReviewAt) continue;
    const parsed = parseAuthorReply(c.body);
    if (parsed.type === 'CANNOT-COMPLY') {
      out.push({
        source: 'review',
        commentId: c.id,
        issueId: parsed.issueId,
        reason: parsed.reason,
        createdAt: c.createdAt,
      });
    }
  }
  for (const c of issueComments) {
    if (botLogins.has(c.userLogin)) continue;
    if (c.userLogin !== authorLogin) continue;
    if (lastBotReviewAt && c.createdAt <= lastBotReviewAt) continue;
    const parsed = parseAuthorReply(c.body);
    if (parsed.type === 'CANNOT-COMPLY') {
      out.push({
        source: 'issue',
        commentId: c.id,
        issueId: parsed.issueId,
        reason: parsed.reason,
        createdAt: c.createdAt,
      });
    }
  }
  return out;
}
