import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAffirmationFinding,
  reclassifyAffirmationFindings,
} from '../affirmation-guard.mjs';

describe('isAffirmationFinding', () => {
  it('flags pure-praise findings from the LS-8576 reproduction (PR #6213)', () => {
    const cases = [
      {
        title: 'Fix for infinite render loop',
        body: 'This directly addresses the infinite render loop bug reported in the ticket.',
      },
      {
        title: 'useEffect dependency array',
        body: 'Crucial for preventing unnecessary re-renders in the standings table.',
      },
      {
        title: 'Refactor of the polling hook',
        body: 'This is an excellent refactor that simplifies the state machine.',
      },
    ];
    for (const f of cases) {
      assert.ok(isAffirmationFinding(f), `should flag: ${f.title}`);
    }
  });

  it('flags other common affirmation phrasings', () => {
    const cases = [
      'The mutex correctly handles the race condition.',
      'Input is now properly validated before the mutation runs.',
      'Great catch on the null case here.',
      'Good fix — this resolves the flaky test.',
      'Well-done cleanup of the legacy branch.',
    ];
    for (const body of cases) {
      assert.ok(
        isAffirmationFinding({ title: '', body }),
        `should flag: ${body}`,
      );
    }
  });

  it('does not flag findings that mix praise with an actionable defect', () => {
    const f = {
      title: 'Mostly good, one gap',
      body: 'This excellent refactor should also handle the null case at line 42.',
    };
    assert.equal(isAffirmationFinding(f), false);
  });

  it('does not flag ordinary defect findings with no affirmation phrase', () => {
    const f = {
      title: 'SQL injection via unescaped input',
      body: 'Use a parameterised query instead of string interpolation.',
    };
    assert.equal(isAffirmationFinding(f), false);
  });

  it('does not flag an affirmation phrase paired with a "needs" corrective marker', () => {
    const f = {
      title: 'Mostly good',
      body: 'This excellent refactor needs a test for the edge case.',
    };
    assert.equal(isAffirmationFinding(f), false);
  });
});

describe('reclassifyAffirmationFindings', () => {
  it('reclassifies HIGH/MEDIUM affirmations to observation, mirroring PR #6213 cycle 2', () => {
    const findings = [
      {
        severity: 'high',
        file: null,
        line: null,
        title: 'Infinite render loop fix',
        body: 'Directly addresses the infinite render loop bug.',
      },
      {
        severity: 'medium',
        file: null,
        line: null,
        title: 'Excellent refactor',
        body: 'This is an excellent refactor of the polling logic.',
      },
      {
        severity: 'high',
        file: 'src/auth.ts',
        line: 10,
        title: 'SQL injection',
        body: 'Use a parameterised query instead of string interpolation.',
      },
    ];
    const { kept, reclassified } = reclassifyAffirmationFindings(findings);

    assert.equal(kept.length, 3);
    assert.equal(reclassified.length, 2);

    const bySeverity = Object.fromEntries(kept.map((f) => [f.title, f]));
    assert.equal(
      bySeverity['Infinite render loop fix'].severity,
      'observation',
    );
    assert.equal(bySeverity['Excellent refactor'].severity, 'observation');
    assert.equal(bySeverity['SQL injection'].severity, 'high');

    assert.equal(reclassified[0].from_severity, 'high');
    assert.equal(reclassified[0].reclass_reason, 'affirmation_polarity');
  });

  it('leaves already-observation findings untouched', () => {
    const findings = [
      {
        severity: 'observation',
        file: null,
        line: null,
        title: 'Good fix',
        body: 'Good fix for the race condition.',
      },
    ];
    const { kept, reclassified } = reclassifyAffirmationFindings(findings);
    assert.equal(kept.length, 1);
    assert.equal(kept[0].severity, 'observation');
    assert.equal(reclassified.length, 0);
  });

  it('produces an empty blocking set when every finding is an affirmation (consistency guard)', () => {
    const findings = [
      {
        severity: 'high',
        file: null,
        line: null,
        title: 'A',
        body: 'Directly addresses the infinite render loop bug.',
      },
      {
        severity: 'high',
        file: null,
        line: null,
        title: 'B',
        body: 'Crucial for preventing regressions here.',
      },
      {
        severity: 'medium',
        file: null,
        line: null,
        title: 'C',
        body: 'This is an excellent refactor overall.',
      },
    ];
    const { kept } = reclassifyAffirmationFindings(findings);
    assert.ok(kept.every((f) => f.severity === 'observation'));
  });
});

// LS-9685: both [HIGH] findings below are pure praise, and both escaped the
// guard on PR #7447 (LS-9797) cycle 2 because a bare failure noun in the
// praise matched CORRECTIVE_MARKER_RE — "fail closed" tripped `fails?`, and
// "missing/corrupt files" (naming a test case) tripped `missing`. Cycle 1
// had reviewed the identical SHA and APPROVED it; cycle 2 flipped the PR to
// CHANGES_REQUESTED and set bot-review=FAILURE on these two alone. Bodies
// are reproduced verbatim from the submitted review.
const PR_7447_ESCAPES = [
  {
    severity: 'high',
    file: 'scripts/validate-workflows.js',
    line: 28,
    title: 'Vendored schemas improve CI reliability and security',
    body: "The change to vendor GitHub workflow schemas and implement a 'fail closed' loading mechanism significantly enhances the reliability and security of the CI pipeline. It removes a dependency on a live external service, preventing unexpected CI failures due to upstream schema changes, and ensures that workflow validation always runs against a known-good schema. This directly addresses the root cause of LS-9797.",
  },
  {
    severity: 'high',
    file: 'scripts/__tests__/validate-workflows.test.mjs',
    line: 118,
    title: 'Robust tests for vendored schema loading and validation',
    body: "The addition of comprehensive unit tests for the vendored schemas, covering offline loading, error handling for missing/corrupt files, and the specific `workflow_call` regression, provides strong assurance of the correctness and reliability of the new validation mechanism. This is crucial for maintaining the integrity of the CI pipeline's security gates.",
  },
];

describe('isAffirmationFinding — failure-noun false negatives (LS-9685)', () => {
  it('flags the two pure-praise findings that escaped on PR #7447', () => {
    for (const f of PR_7447_ESCAPES) {
      assert.ok(isAffirmationFinding(f), `should flag: ${f.title}`);
    }
  });

  it('flags praise whose failure nouns describe a design posture', () => {
    const cases = [
      'The loader correctly implements fail-closed behaviour when the schema is unreadable.',
      'Good call making the parser fail fast on malformed input.',
    ];
    for (const body of cases) {
      assert.ok(
        isAffirmationFinding({ title: '', body }),
        `should flag: ${body}`,
      );
    }
  });

  it('flags praise whose failure nouns name a handled or tested case', () => {
    const cases = [
      'This properly handles missing environment variables at startup.',
      'Excellent work covering the incorrect-token path in the new tests.',
      'Great catch adding a test for the missing-file case.',
    ];
    for (const body of cases) {
      assert.ok(
        isAffirmationFinding({ title: '', body }),
        `should flag: ${body}`,
      );
    }
  });

  it('still refuses praise that reports an open defect with the same nouns', () => {
    const cases = [
      'This excellent refactor is missing a null check on the response.',
      'Correctly handles the retry path, but the timeout value is incorrect.',
      'Properly validates the payload, though the error branch fails to log.',
      'Solid approach overall — the enum switch breaks when a new stat group is added.',
      'Good fix for the race, but the token comparison is vulnerable to timing attacks.',
      // The failure noun is the predicate, not the object of "tests" —
      // an open defect, however close the handling vocabulary sits.
      'Great work on the retry helper. Tests are missing for the error path.',
      'Excellent approach, though coverage of the timeout branch is incorrect.',
    ];
    for (const body of cases) {
      assert.equal(
        isAffirmationFinding({ title: '', body }),
        false,
        `should not flag: ${body}`,
      );
    }
  });

  it('still refuses mixed praise + critique carrying a deontic marker', () => {
    const cases = [
      'This excellent refactor should also handle the null case at line 42.',
      'This excellent refactor needs a test for the edge case.',
      'Great work here; consider extracting the retry helper instead of inlining it.',
    ];
    for (const body of cases) {
      assert.equal(
        isAffirmationFinding({ title: '', body }),
        false,
        `should not flag: ${body}`,
      );
    }
  });
});

describe('reclassifyAffirmationFindings — PR #7447 regression (LS-9685)', () => {
  it('gates the PR #7447 cycle-2 review to zero blocking findings', () => {
    const { kept, reclassified } =
      reclassifyAffirmationFindings(PR_7447_ESCAPES);

    assert.equal(reclassified.length, 2);
    assert.ok(kept.every((f) => f.severity === 'observation'));
    assert.ok(reclassified.every((f) => f.from_severity === 'high'));
    assert.ok(
      reclassified.every((f) => f.reclass_reason === 'affirmation_polarity'),
    );
  });
});

// LS-9826: this [HIGH][contract] finding is reproduced verbatim from PR
// #7473 (LS-9634 session, 2026-09-03). It escaped the guard because the verb
// after "correctly" was "uses" (not in the correctly-verb list) and the
// closing line ("This is a critical security improvement...") didn't match
// any affirmation phrase. It set the review to changes_requested and blocked
// the merge queue despite describing only correct, already-implemented
// behavior with no actionable ask.
const PR_7473_ESCAPE = {
  severity: 'high',
  file: 'tools/mcp/github-server/src/tools/list-prs.ts',
  line: 160,
  title: 'Robust regex validation for paths parameter',
  body: 'The compilePathPatterns function correctly uses safe-regex to prevent catastrophic backtracking (ReDoS) attacks from user-provided regex patterns. It also includes length validation and clear error messages for invalid patterns. This is a critical security improvement for handling external input.',
};

describe('isAffirmationFinding — "correctly uses" / critical-improvement template (LS-9826)', () => {
  it('flags the pure-praise finding that escaped on PR #7473', () => {
    assert.ok(isAffirmationFinding(PR_7473_ESCAPE));
  });

  it('flags other "correctly/properly uses" and "good practice" phrasings', () => {
    const cases = [
      'The helper correctly uses a bounded retry to avoid hammering the API.',
      'This properly uses a parameterised query to guard against injection.',
      'Adding a changelog entry here is a good practice.',
      'This is a critical improvement for the auth flow overall.',
    ];
    for (const body of cases) {
      assert.ok(
        isAffirmationFinding({ title: '', body }),
        `should flag: ${body}`,
      );
    }
  });

  it('does not flag "uses"/"improvement" phrasing that also carries a defect', () => {
    const cases = [
      'This correctly uses safe-regex, but should also cap the pattern count.',
      'Good practice overall, though the error message needs to redact the internal path.',
    ];
    for (const body of cases) {
      assert.equal(
        isAffirmationFinding({ title: '', body }),
        false,
        `should not flag: ${body}`,
      );
    }
  });
});

describe('reclassifyAffirmationFindings — PR #7473 regression (LS-9826)', () => {
  it('reclassifies the escaped finding to observation severity', () => {
    const { kept, reclassified } = reclassifyAffirmationFindings([
      PR_7473_ESCAPE,
    ]);
    assert.equal(reclassified.length, 1);
    assert.equal(kept[0].severity, 'observation');
    assert.equal(reclassified[0].from_severity, 'high');
    assert.equal(reclassified[0].reclass_reason, 'affirmation_polarity');
  });
});
