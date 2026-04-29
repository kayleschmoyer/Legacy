import { parseAuthorReply } from './parse-author-response.mjs';

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
 * Cycle 2 post-LLM validator.
 *
 * Strips findings that are **new** (not present in Cycle 1) and do **not**
 * reference a commit the author pushed since C1's review.
 *
 * "Present in C1" = the finding's title (case-insensitive) matches a title
 * extracted from the prior bot review body.
 *
 * "Cites a post-C1 commit" = the finding's `body` field contains a hex string
 * of 7–40 characters that prefix-matches any SHA in `postC1CommitShas`.
 *
 * @param {import('./findings.mjs').Finding[]} findings
 * @param {string[]} priorTitles     Titles from Cycle 1's review body
 * @param {string[]} postC1CommitShas Full 40-char SHAs of commits added after C1
 * @returns {{ kept: import('./findings.mjs').Finding[], stripped: import('./findings.mjs').Finding[] }}
 */
export function filterFindingsCycle2(findings, priorTitles, postC1CommitShas) {
  const priorSet = new Set(priorTitles.map((t) => t.toLowerCase()));

  const kept = [];
  const stripped = [];

  for (const f of findings) {
    // Re-raised from C1 — always keep.
    if (priorSet.has(f.title.toLowerCase())) {
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
      stripped.push(f);
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
 * @param {import('./findings.mjs').Finding[]} findings
 * @param {string[]} mandateTitles Titles from Cycle 2's review body
 * @returns {{ kept: import('./findings.mjs').Finding[], stripped: import('./findings.mjs').Finding[] }}
 */
export function filterFindingsCycle3(findings, mandateTitles) {
  const mandateSet = new Set(mandateTitles.map((t) => t.toLowerCase()));

  const kept = [];
  const stripped = [];

  for (const f of findings) {
    if (mandateSet.has(f.title.toLowerCase())) {
      kept.push(f);
    } else {
      stripped.push(f);
    }
  }

  return { kept, stripped };
}

/**
 * Build the "Your Role This Cycle" section injected into the system prompt.
 *
 * @param {number} cycle
 * @param {string[]} [priorTitles] Titles from the previous cycle's review body
 * @returns {string}
 */
export function buildCycleRoleSection(cycle, priorTitles = []) {
  if (cycle === 1) {
    return `\
## Your Role This Cycle: RAISE (Cycle 1 of 3)

You are performing the **initial review**. Raise ALL genuine issues you find — \
correctness, security, contract violations, and quality concerns. There are no \
restrictions on what you may raise in this cycle.`;
  }

  if (cycle === 2) {
    const priorBlock =
      priorTitles.length > 0
        ? `\n\nIssues from Cycle 1 you must re-evaluate:\n${priorTitles.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}`
        : '';

    return `\
## Your Role This Cycle: ADJUDICATE (Cycle 2 of 3)

You are **adjudicating Cycle 1 findings** against the current code state. \
Re-evaluate each prior finding against the current diff **and** any author \
replies provided below. If the issue is still present and unaddressed, re-raise \
it (it becomes a mandate). If it is resolved or the justification is sound, omit it.${priorBlock}

**Evaluating author replies (provided as "## Author Responses" in the user prompt):**
- \`FIX: <sha>\` — verify the fix in the diff. If the issue is resolved, omit the finding.
- \`JUSTIFY: <rationale>\` — evaluate the justification. If it is sound and the \
code pattern is demonstrably safe given the rationale, accept it and omit the finding. \
If the justification is weak or the risk remains, re-raise the finding as a mandate.
- No reply — treat as unaddressed; re-raise if the issue is still present in the diff.

**Your instructions:**
- **Re-raise** findings from Cycle 1 that are still present and unaddressed \
(these become mandates the author MUST fix before Cycle 3).
- **Accept** findings that are no longer present in the current diff or whose \
\`JUSTIFY\` rationale is sound (omit them from your output).

**Validator-enforced constraint (post-LLM):**
- **Do NOT raise findings** that were absent from Cycle 1 and do not cite a \
post-C1 commit SHA — such findings are automatically stripped. You MAY raise a \
new finding only if it was **directly introduced** by a commit the author pushed \
since Cycle 1; cite the commit SHA in your finding body.`;
  }

  if (cycle === 3) {
    const mandateBlock =
      priorTitles.length > 0
        ? `\n\nMandates from Cycle 2 you must verify:\n${priorTitles.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}`
        : '';

    return `\
## Your Role This Cycle: VERIFY (Cycle 3 of 3)

You are **verifying mandate compliance** — checking only whether the author \
addressed each specific mandate issued in Cycle 2.${mandateBlock}

**Rules — strictly enforced by the post-LLM validator:**
- Output findings **only** for mandates that are still unaddressed.
- If a mandate is fulfilled: do NOT include it in your output.
- If all mandates are fulfilled: output an empty array \`[]\`.
- **Do NOT raise new issues** — any finding not in the Cycle 2 mandate list \
will be automatically stripped.`;
  }

  // Cycle > 3 should trigger escalation before this function is called.
  return '';
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
 * @returns {{ section: string, formatErrors: number }}
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

  if (items.length === 0) return { section: '', formatErrors };

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

  return { section: lines.join('\n'), formatErrors };
}
