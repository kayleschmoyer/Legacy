/**
 * Affirmation/defect polarity guard for the code reviewer (LS-8576).
 *
 * The severity-classification prompt (`SEVERITY_AND_CRITIQUE_ADDENDUM` in
 * `prompts/system.mjs`) already instructs the model to use `observation`
 * severity for findings that merely confirm the PR already does the right
 * thing. In practice the model sometimes ignores that instruction and
 * assigns a blocking severity (critical/high) or non-blocking-but-still-
 * printed severity (medium/low) to a finding whose body is pure praise —
 * e.g. "directly addresses the infinite render loop bug", "crucial for
 * preventing regressions", "excellent refactor" — with no actionable
 * change requested. `gateFindingsBySeverity` then counts those affirmations
 * toward the blocking gate, so a review that is 100% praise still comes
 * back "Changes Required" (observed on PR #6213 / LS-8566 cycle 2).
 *
 * This module is a post-LLM validator, run before `gateFindingsBySeverity`:
 * any finding whose language is purely affirmative (matches a known praise
 * phrase and contains no corrective/actionable language) is reclassified to
 * `observation` severity, regardless of what severity the model assigned.
 * Because `gateFindingsBySeverity` derives the blocking count from
 * `finding.severity` alone, this reclassification is also the consistency
 * guard: a review whose findings are all affirmations will always gate to
 * zero blocking findings and therefore verdict APPROVED, never
 * "Changes Required".
 *
 * Deliberately conservative: a finding is only reclassified when it matches
 * an affirmation phrase AND contains none of the corrective markers below —
 * "this excellent refactor should also handle the null case" is left alone.
 */

// Phrases that only appear when a finding is praising something the PR
// already does correctly — never part of a defect report.
const AFFIRMATION_PHRASE_RE =
  /\b(directly addresses|crucial for|excellent (?:refactor|fix|approach|work|choice|implementation|catch)|correctly (?:implement|handle|address|resolve|prevent|fix)\w*|properly (?:handle|implement|address|guard|validat)\w*|successfully (?:fix|resolve|address|prevent)\w*|great (?:fix|work|job|catch|approach)|good (?:catch|fix|call|choice)|well[- ]?done|nicely (?:handle|do|implement)\w*|solid (?:fix|approach|implementation))\b/i;

// Language that signals an actionable defect or requested change. Presence
// of any of these disqualifies a finding from reclassification even if it
// also contains an affirmation phrase (e.g. mixed praise + critique).
// Note: "bug"/"issue" are deliberately excluded — affirmations routinely
// reference the past-tense defect they resolve ("directly addresses the
// infinite render loop bug"), so those nouns alone don't signal a still-open
// defect. The markers below are unambiguous regardless of tense.
const CORRECTIVE_MARKER_RE =
  /\b(should|must|needs?|missing|lacks?|fails?|breaks?|vulnerab\w*|incorrect|recommend|consider|does not|doesn't|n['’]t\b|require[sd]?|instead of|rather than|however|unfortunately|todo|fixme)\b/i;

/**
 * True when a finding's language is purely affirmative — praises something
 * the PR already does correctly, with no corrective/actionable content.
 *
 * @param {import('./findings.mjs').Finding} finding
 * @returns {boolean}
 */
export function isAffirmationFinding(finding) {
  const text = `${finding.title ?? ''} ${finding.body ?? ''}`;
  return AFFIRMATION_PHRASE_RE.test(text) && !CORRECTIVE_MARKER_RE.test(text);
}

/**
 * @typedef {import('./findings.mjs').Finding & { from_severity: string, reclass_reason: 'affirmation_polarity' }} ReclassifiedFinding
 */

/**
 * Reclassify findings whose language is pure affirmation to `observation`
 * severity, regardless of the severity the model assigned. Findings already
 * at `observation` severity are left untouched.
 *
 * @param {import('./findings.mjs').Finding[]} findings
 * @returns {{ kept: import('./findings.mjs').Finding[], reclassified: ReclassifiedFinding[] }}
 */
export function reclassifyAffirmationFindings(findings) {
  const kept = [];
  const reclassified = [];

  for (const f of findings) {
    if (f.severity !== 'observation' && isAffirmationFinding(f)) {
      reclassified.push({
        ...f,
        from_severity: f.severity,
        reclass_reason: 'affirmation_polarity',
      });
      kept.push({ ...f, severity: 'observation' });
    } else {
      kept.push(f);
    }
  }

  return { kept, reclassified };
}
