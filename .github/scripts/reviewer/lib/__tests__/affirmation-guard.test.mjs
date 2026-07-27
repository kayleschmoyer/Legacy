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
