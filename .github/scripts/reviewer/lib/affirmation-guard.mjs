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
 * an affirmation phrase AND carries no corrective content —
 * "this excellent refactor should also handle the null case" is left alone.
 *
 * Corrective content is judged in two tiers (LS-9685). Deontic markers
 * ("should", "must", "needs", "recommend", …) are unambiguous and disqualify
 * a finding outright. Bare failure nouns ("fail", "missing", "lacks",
 * "breaks", "incorrect") are not: they describe an open defect and a
 * correctly-handled case equally well, so praise for error handling used to
 * disqualify itself. They now disqualify a finding only outside the benign
 * contexts documented on FAILURE_NOUN_RE below.
 *
 * LS-9826: the phrase list above still missed a common shape — praise
 * phrased as "correctly uses X to prevent/guard/handle Y" (verb after
 * "correctly"/"properly" is "use", not one of the listed verbs) and
 * "this is a critical security improvement" / "is a good practice"
 * closing-line templates. PR #7473 got a [HIGH] finding entirely in this
 * shape ("The compilePathPatterns function correctly uses safe-regex to
 * prevent catastrophic backtracking... This is a critical security
 * improvement for handling external input.") that set the review to
 * changes_requested with nothing actionable in it. "use" was added to the
 * correctly/properly verb lists and a template phrase was added for the
 * critical-improvement / good-practice closing lines.
 */

// Phrases that only appear when a finding is praising something the PR
// already does correctly — never part of a defect report.
const AFFIRMATION_PHRASE_RE =
  /\b(directly addresses|crucial for|excellent (?:refactor|fix|approach|work|choice|implementation|catch)|correctly (?:implement|handle|address|resolve|prevent|fix|use)\w*|properly (?:handle|implement|address|guard|validat|use)\w*|successfully (?:fix|resolve|address|prevent)\w*|great (?:fix|work|job|catch|approach)|good (?:catch|fix|call|choice|practice)|well[- ]?done|nicely (?:handle|do|implement)\w*|solid (?:fix|approach|implementation)|critical\s+(?:security|reliability|performance)?\s*improvement)\b/i;

// Unambiguously corrective language: a request for a change, a negation of
// current behaviour, or a work marker. Any of these disqualifies a finding
// from reclassification even when it also contains an affirmation phrase —
// "this excellent refactor should also handle the null case" is left alone.
// Note: "bug"/"issue" are deliberately excluded — affirmations routinely
// reference the past-tense defect they resolve ("directly addresses the
// infinite render loop bug"), so those nouns alone don't signal a still-open
// defect. The markers below are unambiguous regardless of tense.
const DEONTIC_MARKER_RE =
  /\b(should|must|needs?|recommend|consider|does not|doesn't|n['’]t\b|require[sd]?|instead of|rather than|however|unfortunately|todo|fixme)\b/i;

// Failure vocabulary that reads identically in a defect report ("the guard
// is missing") and in praise for code that handles failure ("error handling
// for missing/corrupt files"). These nouns used to sit in the same
// alternation as the deontic markers above, which made the guard weakest on
// exactly the changes it most needs to cover: CI, validation and
// error-handling PRs, whose reviews are the ones most likely to attract
// security-flavoured praise. Two pure-praise [HIGH] findings escaped that
// way on PR #7447 and gated it to CHANGES_REQUESTED — "fail closed" tripped
// `fails?` and "missing/corrupt files" (naming a test case) tripped
// `missing` (LS-9685). A failure noun now only disqualifies a finding when
// it is *not* in one of the benign contexts below.
const FAILURE_NOUN_RE =
  /\b(missing|lacks?|fails?|breaks?|vulnerab\w*|incorrect)\b/gi;

// The noun names a deliberate design posture: "fail closed", "fail open",
// "fail fast".
const FAILURE_POSTURE_RE =
  /^[-\s]*(closed|open|fast|safe|soft|hard|silently|gracefully)\b/i;

// The noun is the object of a verb describing what the code already does
// about it: "error handling for missing files", "tests covering incorrect
// input", "guards against breaks in the enum". A copula or adversative
// between the two breaks that reading — in "tests are missing for the error
// path" the noun is the predicate, i.e. an open defect — so those words are
// excluded from the intervening span.
const HANDLING_VERB_RE =
  /\b(handl|cover|test|guard|protect|prevent|avoid|detect|reject|validat|catch|tolerat|surfac)\w*\W+(?:(?!(?:is|are|was|were|be|been|being|remains?|stays?|seems?|appears?|but|yet|still|though)\b)\w+\W+){0,3}$/i;

// The noun qualifies a test case or code path rather than describing the
// PR's live behaviour: "missing-file case", "failure mode", "incorrect
// input path".
const HANDLED_SUBJECT_RE =
  /^\W*(?:\w+\W+){0,2}?(cases?|paths?|modes?|scenarios?|behaviou?rs?|tests?|coverage|handling)\b/i;

/**
 * True when at least one failure noun in `text` is reporting an open defect
 * rather than describing a failure the code deliberately handles, tests, or
 * prevents. Conservative by design: a noun counts as benign only when its
 * immediate surroundings say so, so "this excellent refactor is missing a
 * null check" still reads as a defect.
 *
 * @param {string} text
 * @returns {boolean}
 */
function hasOpenDefectVocabulary(text) {
  for (const match of text.matchAll(FAILURE_NOUN_RE)) {
    const before = text.slice(0, match.index);
    const after = text.slice(match.index + match[0].length);
    const benign =
      FAILURE_POSTURE_RE.test(after) ||
      HANDLING_VERB_RE.test(before) ||
      HANDLED_SUBJECT_RE.test(after);
    if (!benign) {
      return true;
    }
  }
  return false;
}

/**
 * True when a finding's language is purely affirmative — praises something
 * the PR already does correctly, with no corrective/actionable content.
 *
 * @param {import('./findings.mjs').Finding} finding
 * @returns {boolean}
 */
export function isAffirmationFinding(finding) {
  const text = `${finding.title ?? ''} ${finding.body ?? ''}`;
  if (!AFFIRMATION_PHRASE_RE.test(text) || DEONTIC_MARKER_RE.test(text)) {
    return false;
  }
  return !hasOpenDefectVocabulary(text);
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
