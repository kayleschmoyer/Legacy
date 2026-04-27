import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CYCLE_ROLES,
  getCycleRole,
  parseTitlesFromReviewBody,
  filterFindingsCycle2,
  filterFindingsCycle3,
  buildCycleRoleSection,
} from '../cycle-protocol.mjs';

// ---------------------------------------------------------------------------
// getCycleRole
// ---------------------------------------------------------------------------

describe('getCycleRole', () => {
  it('returns RAISE for cycle 1', () => {
    assert.strictEqual(getCycleRole(1), 'RAISE');
  });

  it('returns ADJUDICATE for cycle 2', () => {
    assert.strictEqual(getCycleRole(2), 'ADJUDICATE');
  });

  it('returns VERIFY for cycle 3', () => {
    assert.strictEqual(getCycleRole(3), 'VERIFY');
  });

  it('falls back to VERIFY for unknown cycles (> MAX_CYCLE)', () => {
    assert.strictEqual(getCycleRole(4), 'VERIFY');
    assert.strictEqual(getCycleRole(99), 'VERIFY');
  });

  it('CYCLE_ROLES map contains all three expected entries', () => {
    assert.deepStrictEqual(CYCLE_ROLES, {
      1: 'RAISE',
      2: 'ADJUDICATE',
      3: 'VERIFY',
    });
  });
});

// ---------------------------------------------------------------------------
// parseTitlesFromReviewBody
// ---------------------------------------------------------------------------

describe('parseTitlesFromReviewBody', () => {
  it('returns empty array for null/undefined/empty body', () => {
    assert.deepStrictEqual(parseTitlesFromReviewBody(null), []);
    assert.deepStrictEqual(parseTitlesFromReviewBody(undefined), []);
    assert.deepStrictEqual(parseTitlesFromReviewBody(''), []);
  });

  it('extracts a single title from a blocking finding', () => {
    const body = [
      '## Changes Required',
      '',
      '<!-- issue-id: 01ABCDEF1234567890ABCDEF12 -->',
      '**[HIGH]** SQL injection via unescaped user input — `src/auth/login.ts:42`',
      '',
      'The userId parameter is interpolated directly.',
    ].join('\n');

    assert.deepStrictEqual(parseTitlesFromReviewBody(body), [
      'SQL injection via unescaped user input',
    ]);
  });

  it('extracts multiple titles from a review body with several findings', () => {
    const body = [
      '<!-- issue-id: AAA -->',
      '**[CRITICAL]** Missing auth check on admin endpoint — `src/api/admin.ts`',
      '',
      'body 1',
      '',
      '<!-- issue-id: BBB -->',
      '**[HIGH]** Race condition in queue processor — `src/queue/processor.ts:88`',
      '',
      'body 2',
    ].join('\n');

    assert.deepStrictEqual(parseTitlesFromReviewBody(body), [
      'Missing auth check on admin endpoint',
      'Race condition in queue processor',
    ]);
  });

  it('is case-insensitive about severity label brackets', () => {
    // Severity is uppercase in practice, but ensure the regex isn't brittle.
    const body =
      '**[MEDIUM]** Unused variable leaking into scope — `src/lib/util.ts`';
    assert.deepStrictEqual(parseTitlesFromReviewBody(body), [
      'Unused variable leaking into scope',
    ]);
  });

  it('handles a body with no embedded findings gracefully', () => {
    assert.deepStrictEqual(
      parseTitlesFromReviewBody('LGTM — no blocking findings.'),
      [],
    );
  });

  it('extracts a PR-level finding (loc = _PR-level_)', () => {
    const body =
      '**[HIGH]** Missing rate limiting on public API — _PR-level_\n\nDetails here.';
    assert.deepStrictEqual(parseTitlesFromReviewBody(body), [
      'Missing rate limiting on public API',
    ]);
  });

  it('does not truncate titles that contain an em dash', () => {
    // Titles like "Fix null — return early" must not be split at the inner dash.
    const body =
      '**[HIGH]** Fix null — return early instead of throwing — `src/util.ts:5`';
    assert.deepStrictEqual(parseTitlesFromReviewBody(body), [
      'Fix null — return early instead of throwing',
    ]);
  });

  it('does not match inline-comment format which omits the loc suffix', () => {
    // buildInlineComments produces "**[SEVERITY]** title\n\nbody" without " — loc".
    const body = '**[HIGH]** Some inline finding\n\nDetailed explanation.';
    assert.deepStrictEqual(parseTitlesFromReviewBody(body), []);
  });
});

// ---------------------------------------------------------------------------
// filterFindingsCycle2 — synthetic tests (AC: Cycle 2 cannot raise new issues
// unrelated to author's changes)
// ---------------------------------------------------------------------------

/** @param {Partial<import('../findings.mjs').Finding>} overrides */
function makeFinding(overrides) {
  return {
    severity: 'high',
    file: 'src/index.ts',
    line: 1,
    title: 'Default finding title',
    body: 'Default body text.',
    ...overrides,
  };
}

describe('filterFindingsCycle2 — keeps re-raised C1 findings', () => {
  it('keeps a finding whose title matches a C1 title exactly', () => {
    const c1Titles = ['SQL injection via unescaped user input'];
    const finding = makeFinding({
      title: 'SQL injection via unescaped user input',
    });

    const { kept, stripped } = filterFindingsCycle2([finding], c1Titles, []);
    assert.strictEqual(kept.length, 1);
    assert.strictEqual(stripped.length, 0);
  });

  it('keeps a finding whose title matches a C1 title case-insensitively', () => {
    const c1Titles = ['SQL injection via unescaped user input'];
    const finding = makeFinding({
      title: 'sql injection via unescaped user input',
    });

    const { kept, stripped } = filterFindingsCycle2([finding], c1Titles, []);
    assert.strictEqual(kept.length, 1);
    assert.strictEqual(stripped.length, 0);
  });
});

describe('filterFindingsCycle2 — strips new findings unrelated to author changes', () => {
  it('strips a completely new finding when there are no post-C1 commits', () => {
    const c1Titles = ['SQL injection via unescaped user input'];
    const newFinding = makeFinding({
      title: 'Missing null check in new handler',
    });

    const { kept, stripped } = filterFindingsCycle2([newFinding], c1Titles, []);
    assert.strictEqual(kept.length, 0);
    assert.strictEqual(stripped.length, 1);
    assert.strictEqual(stripped[0].title, 'Missing null check in new handler');
  });

  it('strips a new finding even when post-C1 commits exist but none are cited in the body', () => {
    const c1Titles = ['Existing issue'];
    const postC1Shas = ['abc1234567890abcdef1234567890abcdef123456'];
    const newFinding = makeFinding({
      title: 'Unrelated new finding',
      body: 'This body does not mention any commit SHA.',
    });

    const { kept, stripped } = filterFindingsCycle2(
      [newFinding],
      c1Titles,
      postC1Shas,
    );
    assert.strictEqual(kept.length, 0);
    assert.strictEqual(stripped.length, 1);
  });
});

describe('filterFindingsCycle2 — keeps new findings that cite post-C1 commits', () => {
  it('keeps a new finding whose body contains a 7-char SHA prefix of a post-C1 commit', () => {
    const postC1Sha = 'abc1234567890abcdef1234567890abcdef123456';
    const finding = makeFinding({
      title: 'New bug introduced in commit abc1234',
      body: 'Commit abc1234 introduced a null-dereference in the handler.',
    });

    const { kept, stripped } = filterFindingsCycle2([finding], [], [postC1Sha]);
    assert.strictEqual(kept.length, 1);
    assert.strictEqual(stripped.length, 0);
  });

  it('is case-insensitive when matching SHA prefixes in body text', () => {
    const postC1Sha = 'ABC1234567890ABCDEF1234567890ABCDEF123456';
    const finding = makeFinding({
      title: 'New issue from author commit',
      body: 'The change in abc1234 broke the retry logic.',
    });

    const { kept, stripped } = filterFindingsCycle2([finding], [], [postC1Sha]);
    assert.strictEqual(kept.length, 1);
    assert.strictEqual(stripped.length, 0);
  });
});

describe('filterFindingsCycle2 — mixed batch', () => {
  it('correctly partitions a mixed set of findings', () => {
    const c1Titles = ['Auth bypass on /admin'];
    const postC1Shas = ['deadbeef1234567890abcdef1234567890abcdef'];

    const findings = [
      makeFinding({ title: 'Auth bypass on /admin' }), // re-raised — keep
      makeFinding({ title: 'New unrelated finding', body: 'no sha here' }), // new, no cite — strip
      makeFinding({
        // new, cites post-C1 — keep
        title: 'Null deref introduced by author',
        body: 'deadbeef introduced this regression.',
      }),
    ];

    const { kept, stripped } = filterFindingsCycle2(
      findings,
      c1Titles,
      postC1Shas,
    );
    assert.strictEqual(kept.length, 2);
    assert.strictEqual(stripped.length, 1);
    assert.strictEqual(stripped[0].title, 'New unrelated finding');
  });
});

// ---------------------------------------------------------------------------
// filterFindingsCycle3 — synthetic tests (AC: Cycle 3 verifies mandates only)
// ---------------------------------------------------------------------------

describe('filterFindingsCycle3 — keeps only C2 mandates', () => {
  it('keeps a finding whose title matches a mandate (case-insensitive)', () => {
    const mandates = ['Auth bypass on /admin'];
    const finding = makeFinding({ title: 'auth bypass on /admin' });

    const { kept, stripped } = filterFindingsCycle3([finding], mandates);
    assert.strictEqual(kept.length, 1);
    assert.strictEqual(stripped.length, 0);
  });

  it('strips a finding whose title is not in the mandate list', () => {
    const mandates = ['Auth bypass on /admin'];
    const finding = makeFinding({ title: 'Some brand new finding' });

    const { kept, stripped } = filterFindingsCycle3([finding], mandates);
    assert.strictEqual(kept.length, 0);
    assert.strictEqual(stripped.length, 1);
  });

  it('returns all stripped when mandate list is empty', () => {
    const findings = [
      makeFinding({ title: 'Finding A' }),
      makeFinding({ title: 'Finding B' }),
    ];

    const { kept, stripped } = filterFindingsCycle3(findings, []);
    assert.strictEqual(kept.length, 0);
    assert.strictEqual(stripped.length, 2);
  });

  it('returns all kept when every finding title matches a mandate', () => {
    const mandates = ['Finding A', 'Finding B'];
    const findings = [
      makeFinding({ title: 'Finding A' }),
      makeFinding({ title: 'Finding B' }),
    ];

    const { kept, stripped } = filterFindingsCycle3(findings, mandates);
    assert.strictEqual(kept.length, 2);
    assert.strictEqual(stripped.length, 0);
  });

  it('correctly partitions a mixed batch', () => {
    const mandates = ['Mandate 1', 'Mandate 2'];
    const findings = [
      makeFinding({ title: 'Mandate 1' }), // keep
      makeFinding({ title: 'New concern' }), // strip
      makeFinding({ title: 'mandate 2' }), // keep (case-insensitive)
    ];

    const { kept, stripped } = filterFindingsCycle3(findings, mandates);
    assert.strictEqual(kept.length, 2);
    assert.strictEqual(stripped.length, 1);
    assert.strictEqual(stripped[0].title, 'New concern');
  });
});

// ---------------------------------------------------------------------------
// buildCycleRoleSection
// ---------------------------------------------------------------------------

describe('buildCycleRoleSection', () => {
  it('cycle 1 mentions RAISE and no restrictions', () => {
    const section = buildCycleRoleSection(1);
    assert.ok(section.includes('RAISE'), 'should include RAISE');
    assert.ok(section.includes('Cycle 1'), 'should mention Cycle 1');
    assert.ok(
      section.includes('no restrictions'),
      'should state there are no restrictions',
    );
  });

  it('cycle 2 mentions ADJUDICATE and prohibition on new issues', () => {
    const section = buildCycleRoleSection(2, ['Prior issue']);
    assert.ok(section.includes('ADJUDICATE'), 'should include ADJUDICATE');
    assert.ok(section.includes('Cycle 2'), 'should mention Cycle 2');
    assert.ok(
      section.includes('Do NOT raise new issues'),
      'should prohibit new issues',
    );
    assert.ok(section.includes('Prior issue'), 'should list the prior title');
  });

  it('cycle 2 with no prior titles omits the issues enumeration block', () => {
    const section = buildCycleRoleSection(2, []);
    assert.ok(!section.includes('1.'), 'should not have numbered list');
  });

  it('cycle 3 mentions VERIFY and mandate-only restriction', () => {
    const section = buildCycleRoleSection(3, ['Mandate 1']);
    assert.ok(section.includes('VERIFY'), 'should include VERIFY');
    assert.ok(section.includes('Cycle 3'), 'should mention Cycle 3');
    assert.ok(
      section.includes('Do NOT raise new issues'),
      'should prohibit new issues',
    );
    assert.ok(section.includes('Mandate 1'), 'should list the mandate title');
  });

  it('returns empty string for cycle > 3 (escalation handles those)', () => {
    const section = buildCycleRoleSection(4);
    assert.strictEqual(section, '');
  });
});
