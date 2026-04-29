import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CYCLE_ROLES,
  getCycleRole,
  parseTitlesFromReviewBody,
  filterFindingsCycle2,
  filterFindingsCycle3,
  buildCycleRoleSection,
  buildAuthorResponsesSection,
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

  it('cycle 2 mentions ADJUDICATE and prohibition on new findings', () => {
    const section = buildCycleRoleSection(2, ['Prior issue']);
    assert.ok(section.includes('ADJUDICATE'), 'should include ADJUDICATE');
    assert.ok(section.includes('Cycle 2'), 'should mention Cycle 2');
    assert.ok(
      section.includes('Do NOT raise findings'),
      'should prohibit new findings',
    );
    assert.ok(section.includes('Prior issue'), 'should list the prior title');
  });

  it('cycle 2 with no prior titles omits the issues enumeration block', () => {
    const section = buildCycleRoleSection(2, []);
    assert.ok(!section.includes('1.'), 'should not have numbered list');
  });

  it('cycle 2 describes JUSTIFY evaluation and does not claim replies are absent', () => {
    const section = buildCycleRoleSection(2, ['Prior issue']);
    assert.ok(
      section.includes('JUSTIFY'),
      'should describe JUSTIFY evaluation',
    );
    assert.ok(
      section.includes('Author Responses'),
      'should reference the author responses section',
    );
    assert.ok(
      !section.includes('not provided to you'),
      'must not claim author replies are absent (they are injected into the user prompt)',
    );
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

// ---------------------------------------------------------------------------
// buildAuthorResponsesSection
// ---------------------------------------------------------------------------

const BOT_LOGINS = new Set(['github-actions[bot]', 'copilot-reviewer[bot]']);

// Inline review comment body format produced by buildInlineComments.
const BOT_INLINE_BODY =
  '<!-- issue-id: ISSUE01 -->\n**[LOW]** Unused variable in handler\n\nRemove or prefix with _.';

const REVIEW_AT = '2024-01-01T12:00:00Z';
const AFTER_REVIEW = '2024-01-01T13:00:00Z';
const BEFORE_REVIEW = '2024-01-01T11:00:00Z';

describe('buildAuthorResponsesSection — empty inputs', () => {
  it('returns empty section when no review comments or issue comments', () => {
    const result = buildAuthorResponsesSection([], [], REVIEW_AT, BOT_LOGINS);
    assert.strictEqual(result.section, '');
    assert.strictEqual(result.formatErrors, 0);
  });

  it('returns empty section and counts formatErrors when all replies are MALFORMED', () => {
    const reviewComments = [
      {
        id: 10,
        inReplyToId: null,
        userLogin: 'github-actions[bot]',
        body: BOT_INLINE_BODY,
        createdAt: REVIEW_AT,
      },
      {
        id: 11,
        inReplyToId: 10,
        userLogin: 'author',
        body: 'Some random comment that is not a valid token',
        createdAt: AFTER_REVIEW,
      },
    ];
    const result = buildAuthorResponsesSection(
      reviewComments,
      [],
      REVIEW_AT,
      BOT_LOGINS,
    );
    assert.strictEqual(result.section, '');
    assert.strictEqual(result.formatErrors, 1);
  });

  it('returns empty section when all inline replies are at or before the last review timestamp', () => {
    const reviewComments = [
      {
        id: 10,
        inReplyToId: null,
        userLogin: 'github-actions[bot]',
        body: BOT_INLINE_BODY,
        createdAt: REVIEW_AT,
      },
      {
        id: 11,
        inReplyToId: 10,
        userLogin: 'author',
        body: 'JUSTIFY: reply from a previous cycle',
        createdAt: BEFORE_REVIEW,
      },
    ];
    const result = buildAuthorResponsesSection(
      reviewComments,
      [],
      REVIEW_AT,
      BOT_LOGINS,
    );
    assert.strictEqual(result.section, '');
    assert.strictEqual(result.formatErrors, 0);
  });

  it('returns empty section when issue comments are all before the last review', () => {
    const issueComments = [
      {
        id: 1,
        userLogin: 'author',
        body: 'JUSTIFY: reason from previous cycle',
        createdAt: BEFORE_REVIEW,
      },
    ];
    const result = buildAuthorResponsesSection(
      [],
      issueComments,
      REVIEW_AT,
      BOT_LOGINS,
    );
    assert.strictEqual(result.section, '');
    assert.strictEqual(result.formatErrors, 0);
  });
});

describe('buildAuthorResponsesSection — inline thread replies (non-blocking findings)', () => {
  it('includes a JUSTIFY reply keyed to the finding title', () => {
    const reviewComments = [
      {
        id: 10,
        inReplyToId: null,
        userLogin: 'github-actions[bot]',
        body: BOT_INLINE_BODY,
        createdAt: REVIEW_AT,
      },
      {
        id: 11,
        inReplyToId: 10,
        userLogin: 'author',
        body: 'JUSTIFY: This variable is used indirectly via a closure.',
        createdAt: AFTER_REVIEW,
      },
    ];
    const result = buildAuthorResponsesSection(
      reviewComments,
      [],
      REVIEW_AT,
      BOT_LOGINS,
    );
    assert.ok(
      result.section.includes('## Author Responses'),
      'should have header',
    );
    assert.ok(
      result.section.includes('Unused variable in handler'),
      'should key to finding title',
    );
    assert.ok(
      result.section.includes(
        'JUSTIFY: This variable is used indirectly via a closure.',
      ),
      'should include rationale',
    );
    assert.strictEqual(result.formatErrors, 0);
  });

  it('includes a FIX reply keyed to the finding title', () => {
    const reviewComments = [
      {
        id: 10,
        inReplyToId: null,
        userLogin: 'github-actions[bot]',
        body: BOT_INLINE_BODY,
        createdAt: REVIEW_AT,
      },
      {
        id: 11,
        inReplyToId: 10,
        userLogin: 'author',
        body: 'FIX: abc1234',
        createdAt: AFTER_REVIEW,
      },
    ];
    const result = buildAuthorResponsesSection(
      reviewComments,
      [],
      REVIEW_AT,
      BOT_LOGINS,
    );
    assert.ok(
      result.section.includes('Unused variable in handler'),
      'should key to finding title',
    );
    assert.ok(result.section.includes('FIX: abc1234'), 'should include sha');
    assert.strictEqual(result.formatErrors, 0);
  });

  it('includes a CANNOT-COMPLY reply keyed to the finding title', () => {
    const reviewComments = [
      {
        id: 10,
        inReplyToId: null,
        userLogin: 'github-actions[bot]',
        body: BOT_INLINE_BODY,
        createdAt: REVIEW_AT,
      },
      {
        id: 11,
        inReplyToId: 10,
        userLogin: 'author',
        body: 'CANNOT-COMPLY: LS-1234\nThis is a generated file.',
        createdAt: AFTER_REVIEW,
      },
    ];
    const result = buildAuthorResponsesSection(
      reviewComments,
      [],
      REVIEW_AT,
      BOT_LOGINS,
    );
    assert.ok(
      result.section.includes('CANNOT-COMPLY: LS-1234'),
      'should include the token',
    );
    assert.ok(
      result.section.includes('This is a generated file.'),
      'should include the reason',
    );
    assert.strictEqual(result.formatErrors, 0);
  });

  it('skips replies from bot logins', () => {
    const reviewComments = [
      {
        id: 10,
        inReplyToId: null,
        userLogin: 'github-actions[bot]',
        body: BOT_INLINE_BODY,
        createdAt: REVIEW_AT,
      },
      {
        id: 11,
        inReplyToId: 10,
        userLogin: 'copilot-reviewer[bot]',
        body: 'JUSTIFY: bot self-reply',
        createdAt: AFTER_REVIEW,
      },
    ];
    const result = buildAuthorResponsesSection(
      reviewComments,
      [],
      REVIEW_AT,
      BOT_LOGINS,
    );
    assert.strictEqual(result.section, '');
    assert.strictEqual(result.formatErrors, 0);
  });

  it('includes reply without a title when root comment has no recognisable title', () => {
    const reviewComments = [
      {
        id: 20,
        inReplyToId: null,
        userLogin: 'github-actions[bot]',
        body: 'No bold severity prefix here',
        createdAt: REVIEW_AT,
      },
      {
        id: 21,
        inReplyToId: 20,
        userLogin: 'author',
        body: 'JUSTIFY: irrelevant context',
        createdAt: AFTER_REVIEW,
      },
    ];
    const result = buildAuthorResponsesSection(
      reviewComments,
      [],
      REVIEW_AT,
      BOT_LOGINS,
    );
    assert.ok(result.section.includes('JUSTIFY: irrelevant context'));
    assert.ok(
      !result.section.includes('**'),
      'should not have a bold title prefix',
    );
    assert.strictEqual(result.formatErrors, 0);
  });

  it('counts MALFORMED inline replies in formatErrors without affecting valid replies', () => {
    const reviewComments = [
      {
        id: 10,
        inReplyToId: null,
        userLogin: 'github-actions[bot]',
        body: BOT_INLINE_BODY,
        createdAt: REVIEW_AT,
      },
      {
        id: 11,
        inReplyToId: 10,
        userLogin: 'author',
        body: 'not a valid token at all',
        createdAt: AFTER_REVIEW,
      },
      {
        id: 12,
        inReplyToId: 10,
        userLogin: 'author',
        body: 'FIX: abc1234',
        createdAt: AFTER_REVIEW,
      },
    ];
    const result = buildAuthorResponsesSection(
      reviewComments,
      [],
      REVIEW_AT,
      BOT_LOGINS,
    );
    assert.ok(
      result.section.includes('FIX: abc1234'),
      'valid reply still included',
    );
    assert.strictEqual(result.formatErrors, 1);
  });
});

describe('buildAuthorResponsesSection — PR issue comments (blocking finding responses)', () => {
  it('includes a JUSTIFY issue comment posted after the last review', () => {
    const issueComments = [
      {
        id: 1,
        userLogin: 'author',
        body: 'JUSTIFY: The string interpolation uses only validated internal values.',
        createdAt: AFTER_REVIEW,
      },
    ];
    const result = buildAuthorResponsesSection(
      [],
      issueComments,
      REVIEW_AT,
      BOT_LOGINS,
    );
    assert.ok(
      result.section.includes('## Author Responses'),
      'should have header',
    );
    assert.ok(
      result.section.includes(
        'JUSTIFY: The string interpolation uses only validated internal values.',
      ),
    );
    assert.strictEqual(result.formatErrors, 0);
  });

  it('excludes a JUSTIFY issue comment posted at exactly the review timestamp', () => {
    const issueComments = [
      {
        id: 1,
        userLogin: 'author',
        body: 'JUSTIFY: exact timestamp',
        createdAt: REVIEW_AT,
      },
    ];
    const result = buildAuthorResponsesSection(
      [],
      issueComments,
      REVIEW_AT,
      BOT_LOGINS,
    );
    assert.strictEqual(result.section, '');
    assert.strictEqual(result.formatErrors, 0);
  });

  it('skips issue comments from bot logins', () => {
    const issueComments = [
      {
        id: 1,
        userLogin: 'github-actions[bot]',
        body: 'JUSTIFY: bot comment',
        createdAt: AFTER_REVIEW,
      },
    ];
    const result = buildAuthorResponsesSection(
      [],
      issueComments,
      REVIEW_AT,
      BOT_LOGINS,
    );
    assert.strictEqual(result.section, '');
    assert.strictEqual(result.formatErrors, 0);
  });

  it('includes both inline thread replies and issue comments together', () => {
    const reviewComments = [
      {
        id: 10,
        inReplyToId: null,
        userLogin: 'github-actions[bot]',
        body: BOT_INLINE_BODY,
        createdAt: REVIEW_AT,
      },
      {
        id: 11,
        inReplyToId: 10,
        userLogin: 'author',
        body: 'FIX: abc1234',
        createdAt: AFTER_REVIEW,
      },
    ];
    const issueComments = [
      {
        id: 1,
        userLogin: 'author',
        body: 'JUSTIFY: The interpolation is safe due to upstream validation.',
        createdAt: AFTER_REVIEW,
      },
    ];
    const result = buildAuthorResponsesSection(
      reviewComments,
      issueComments,
      REVIEW_AT,
      BOT_LOGINS,
    );
    assert.ok(
      result.section.includes('FIX: abc1234'),
      'should include inline thread reply',
    );
    assert.ok(
      result.section.includes(
        'JUSTIFY: The interpolation is safe due to upstream validation.',
      ),
      'should include issue comment',
    );
    assert.strictEqual(result.formatErrors, 0);
  });

  it('counts MALFORMED issue comments in formatErrors', () => {
    const issueComments = [
      {
        id: 1,
        userLogin: 'author',
        body: 'not a valid token',
        createdAt: AFTER_REVIEW,
      },
      {
        id: 2,
        userLogin: 'author',
        body: 'also not valid',
        createdAt: AFTER_REVIEW,
      },
      {
        id: 3,
        userLogin: 'author',
        body: 'JUSTIFY: this one is valid',
        createdAt: AFTER_REVIEW,
      },
    ];
    const result = buildAuthorResponsesSection(
      [],
      issueComments,
      REVIEW_AT,
      BOT_LOGINS,
    );
    assert.ok(result.section.includes('JUSTIFY: this one is valid'));
    assert.strictEqual(result.formatErrors, 2);
  });
});
