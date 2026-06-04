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
  buildAuthorResolvedTitles,
  hasCannotComplyResponse,
  collectCannotComplyResponses,
  getMalformedInlineReplies,
} from '../cycle-protocol.mjs';
import { FORMAT_ERROR_MESSAGE } from '../parse-author-response.mjs';

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

describe('filterFindingsCycle2 — strip_reason annotation', () => {
  it('annotates with no_title_match_no_sha when body contains no SHA-like string', () => {
    const newFinding = makeFinding({
      title: 'New finding with no SHA',
      body: 'This finding body has no commit hash anywhere.',
    });

    const { stripped } = filterFindingsCycle2([newFinding], [], []);
    assert.strictEqual(stripped.length, 1);
    assert.strictEqual(stripped[0].strip_reason, 'no_title_match_no_sha');
  });

  it('annotates with no_title_match_sha_not_post_c1 when body cites a SHA that is not post-C1', () => {
    const postC1Sha = 'aaaaaaa1234567890abcdef1234567890abcdef12';
    const newFinding = makeFinding({
      title: 'New finding citing wrong SHA',
      // dead1234 contains a digit — matches tightened SHA heuristic but is not post-C1
      body: 'This was introduced in dead1234 (not a post-C1 commit).',
    });

    const { stripped } = filterFindingsCycle2([newFinding], [], [postC1Sha]);
    assert.strictEqual(stripped.length, 1);
    assert.strictEqual(
      stripped[0].strip_reason,
      'no_title_match_sha_not_post_c1',
    );
  });

  it('annotates with no_title_match_no_sha when post-C1 commits exist but body has no hex string', () => {
    const postC1Sha = 'abc1234567890abcdef1234567890abcdef123456';
    const newFinding = makeFinding({
      title: 'Unrelated finding no SHA',
      body: 'No commit reference whatsoever.',
    });

    const { stripped } = filterFindingsCycle2([newFinding], [], [postC1Sha]);
    assert.strictEqual(stripped.length, 1);
    assert.strictEqual(stripped[0].strip_reason, 'no_title_match_no_sha');
  });

  it('preserves all Finding fields on stripped findings alongside strip_reason', () => {
    const newFinding = makeFinding({
      title: 'Annotated finding',
      severity: 'critical',
      file: 'src/auth.ts',
      line: 42,
      body: 'No SHA here.',
    });

    const { stripped } = filterFindingsCycle2([newFinding], [], []);
    assert.strictEqual(stripped.length, 1);
    assert.strictEqual(stripped[0].severity, 'critical');
    assert.strictEqual(stripped[0].file, 'src/auth.ts');
    assert.strictEqual(stripped[0].line, 42);
    assert.strictEqual(stripped[0].strip_reason, 'no_title_match_no_sha');
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

  it('annotates every stripped finding with strip_reason not_in_c2_mandate_list', () => {
    const mandates = ['Mandate 1'];
    const findings = [
      makeFinding({ title: 'Mandate 1' }),
      makeFinding({ title: 'Brand new finding' }),
      makeFinding({ title: 'Another unrelated issue' }),
    ];

    const { stripped } = filterFindingsCycle3(findings, mandates);
    assert.strictEqual(stripped.length, 2);
    for (const f of stripped) {
      assert.strictEqual(f.strip_reason, 'not_in_c2_mandate_list');
    }
  });

  it('preserves all Finding fields on stripped findings alongside strip_reason', () => {
    const finding = makeFinding({
      title: 'Out-of-mandate finding',
      severity: 'high',
      file: 'src/lib.ts',
      line: 10,
    });

    const { stripped } = filterFindingsCycle3([finding], []);
    assert.strictEqual(stripped.length, 1);
    assert.strictEqual(stripped[0].severity, 'high');
    assert.strictEqual(stripped[0].file, 'src/lib.ts');
    assert.strictEqual(stripped[0].line, 10);
    assert.strictEqual(stripped[0].strip_reason, 'not_in_c2_mandate_list');
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
      section.includes('Do NOT raise new findings'),
      'should prohibit new findings unrelated to post-C1 commits',
    );
    assert.ok(section.includes('Prior issue'), 'should list the prior title');
  });

  it('cycle 2 with no prior titles omits the issues enumeration block', () => {
    const section = buildCycleRoleSection(2, []);
    // Check that the indented numbered-list format used for prior titles is absent.
    // (The text "Cycle 1." also contains "1." so we match the list item prefix instead.)
    assert.ok(
      !section.includes('  1. '),
      'should not have indented numbered list entry',
    );
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

  it('cycle 2 SHA constraint includes format example in body field', () => {
    const section = buildCycleRoleSection(2, []);
    assert.ok(
      section.includes('body'),
      'should mention the body field for SHA citation',
    );
    assert.ok(
      section.includes('a1b2c3d'),
      'should include a concrete SHA example',
    );
    assert.ok(
      section.includes('automatically strip'),
      'should warn that missing SHA causes automatic stripping',
    );
  });

  it('cycle 2 lists post-C1 commit SHAs (short form) when provided', () => {
    const shas = [
      'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      'f7e8d9c0b1a2f7e8d9c0b1a2f7e8d9c0b1a2f7e8',
    ];
    const section = buildCycleRoleSection(2, [], shas);
    assert.ok(
      section.includes('`a1b2c3d`'),
      'should include first 7 chars of first SHA',
    );
    assert.ok(
      section.includes('`f7e8d9c`'),
      'should include first 7 chars of second SHA',
    );
    assert.ok(
      section.includes('ONLY SHAs you may cite'),
      'should state these are the only permitted SHAs',
    );
  });

  it('cycle 2 omits SHA list block when no post-C1 commits provided', () => {
    const section = buildCycleRoleSection(2, [], []);
    assert.ok(
      !section.includes('ONLY SHAs you may cite'),
      'should not include SHA list when none provided',
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

// ---------------------------------------------------------------------------
// hasCannotComplyResponse
// ---------------------------------------------------------------------------

const AUTHOR_LOGIN = 'pr-author';

describe('hasCannotComplyResponse — no responses', () => {
  it('returns false when both comment arrays are empty', () => {
    assert.strictEqual(
      hasCannotComplyResponse([], [], REVIEW_AT, BOT_LOGINS, AUTHOR_LOGIN),
      false,
    );
  });

  it('returns false when authorLogin is empty (fail-safe: unknown author)', () => {
    const issueComments = [
      {
        id: 1,
        userLogin: 'someone',
        body: 'CANNOT-COMPLY: LS-1234\nReason.',
        createdAt: AFTER_REVIEW,
      },
    ];
    assert.strictEqual(
      hasCannotComplyResponse([], issueComments, REVIEW_AT, BOT_LOGINS, ''),
      false,
    );
  });

  it('returns false when all replies are FIX or JUSTIFY', () => {
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
        userLogin: AUTHOR_LOGIN,
        body: 'FIX: abc1234',
        createdAt: AFTER_REVIEW,
      },
    ];
    const issueComments = [
      {
        id: 1,
        userLogin: AUTHOR_LOGIN,
        body: 'JUSTIFY: Validated upstream.',
        createdAt: AFTER_REVIEW,
      },
    ];
    assert.strictEqual(
      hasCannotComplyResponse(
        reviewComments,
        issueComments,
        REVIEW_AT,
        BOT_LOGINS,
        AUTHOR_LOGIN,
      ),
      false,
    );
  });
});

describe('hasCannotComplyResponse — inline review thread replies', () => {
  it('returns true when an inline reply from the author is CANNOT-COMPLY', () => {
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
        userLogin: AUTHOR_LOGIN,
        body: 'CANNOT-COMPLY: LS-1234\nThis is a generated file.',
        createdAt: AFTER_REVIEW,
      },
    ];
    assert.strictEqual(
      hasCannotComplyResponse(
        reviewComments,
        [],
        REVIEW_AT,
        BOT_LOGINS,
        AUTHOR_LOGIN,
      ),
      true,
    );
  });

  it('returns false when a non-author posts CANNOT-COMPLY in an inline thread', () => {
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
        userLogin: 'third-party-reviewer',
        body: 'CANNOT-COMPLY: LS-1234\nThird-party compliance claim.',
        createdAt: AFTER_REVIEW,
      },
    ];
    assert.strictEqual(
      hasCannotComplyResponse(
        reviewComments,
        [],
        REVIEW_AT,
        BOT_LOGINS,
        AUTHOR_LOGIN,
      ),
      false,
    );
  });

  it('returns false when CANNOT-COMPLY reply is at or before the last review timestamp', () => {
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
        userLogin: AUTHOR_LOGIN,
        body: 'CANNOT-COMPLY: LS-1234\nStale reply from a prior cycle.',
        createdAt: BEFORE_REVIEW,
      },
    ];
    assert.strictEqual(
      hasCannotComplyResponse(
        reviewComments,
        [],
        REVIEW_AT,
        BOT_LOGINS,
        AUTHOR_LOGIN,
      ),
      false,
    );
  });

  it('returns false when CANNOT-COMPLY reply is from a bot login', () => {
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
        body: 'CANNOT-COMPLY: LS-1234\nBot self-reply.',
        createdAt: AFTER_REVIEW,
      },
    ];
    assert.strictEqual(
      hasCannotComplyResponse(
        reviewComments,
        [],
        REVIEW_AT,
        BOT_LOGINS,
        AUTHOR_LOGIN,
      ),
      false,
    );
  });

  it('returns false for a root (non-reply) comment even if it contains CANNOT-COMPLY', () => {
    const reviewComments = [
      {
        id: 10,
        inReplyToId: null,
        userLogin: AUTHOR_LOGIN,
        body: 'CANNOT-COMPLY: LS-1234\nRoot comment, not a reply.',
        createdAt: AFTER_REVIEW,
      },
    ];
    assert.strictEqual(
      hasCannotComplyResponse(
        reviewComments,
        [],
        REVIEW_AT,
        BOT_LOGINS,
        AUTHOR_LOGIN,
      ),
      false,
    );
  });
});

describe('hasCannotComplyResponse — PR issue comments', () => {
  it('returns true when an issue comment from the author is CANNOT-COMPLY', () => {
    const issueComments = [
      {
        id: 1,
        userLogin: AUTHOR_LOGIN,
        body: 'CANNOT-COMPLY: LS-9999\nManually generated — cannot be changed.',
        createdAt: AFTER_REVIEW,
      },
    ];
    assert.strictEqual(
      hasCannotComplyResponse(
        [],
        issueComments,
        REVIEW_AT,
        BOT_LOGINS,
        AUTHOR_LOGIN,
      ),
      true,
    );
  });

  it('returns false when a non-author posts CANNOT-COMPLY as an issue comment', () => {
    const issueComments = [
      {
        id: 1,
        userLogin: 'dependabot[bot]',
        body: 'CANNOT-COMPLY: LS-9999\nDependabot compliance claim.',
        createdAt: AFTER_REVIEW,
      },
    ];
    assert.strictEqual(
      hasCannotComplyResponse(
        [],
        issueComments,
        REVIEW_AT,
        BOT_LOGINS,
        AUTHOR_LOGIN,
      ),
      false,
    );
  });

  it('returns false when CANNOT-COMPLY issue comment is at or before the last review timestamp', () => {
    const issueComments = [
      {
        id: 1,
        userLogin: AUTHOR_LOGIN,
        body: 'CANNOT-COMPLY: LS-9999\nPrior cycle reply.',
        createdAt: REVIEW_AT,
      },
    ];
    assert.strictEqual(
      hasCannotComplyResponse(
        [],
        issueComments,
        REVIEW_AT,
        BOT_LOGINS,
        AUTHOR_LOGIN,
      ),
      false,
    );
  });

  it('returns false when CANNOT-COMPLY issue comment is from a bot login', () => {
    const issueComments = [
      {
        id: 1,
        userLogin: 'github-actions[bot]',
        body: 'CANNOT-COMPLY: LS-9999\nBot issue comment.',
        createdAt: AFTER_REVIEW,
      },
    ];
    assert.strictEqual(
      hasCannotComplyResponse(
        [],
        issueComments,
        REVIEW_AT,
        BOT_LOGINS,
        AUTHOR_LOGIN,
      ),
      false,
    );
  });
});

describe('hasCannotComplyResponse — mixed batch', () => {
  it('returns true when only one of many replies is CANNOT-COMPLY from the author', () => {
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
        userLogin: AUTHOR_LOGIN,
        body: 'FIX: abc1234',
        createdAt: AFTER_REVIEW,
      },
    ];
    const issueComments = [
      {
        id: 1,
        userLogin: AUTHOR_LOGIN,
        body: 'JUSTIFY: Validated upstream.',
        createdAt: AFTER_REVIEW,
      },
      {
        id: 2,
        userLogin: AUTHOR_LOGIN,
        body: 'CANNOT-COMPLY: LS-5678\nThis change requires modifying a generated file.',
        createdAt: AFTER_REVIEW,
      },
    ];
    assert.strictEqual(
      hasCannotComplyResponse(
        reviewComments,
        issueComments,
        REVIEW_AT,
        BOT_LOGINS,
        AUTHOR_LOGIN,
      ),
      true,
    );
  });

  it('returns false when CANNOT-COMPLY exists but only from a non-author', () => {
    const issueComments = [
      {
        id: 1,
        userLogin: AUTHOR_LOGIN,
        body: 'FIX: abc1234',
        createdAt: AFTER_REVIEW,
      },
      {
        id: 2,
        userLogin: 'third-party',
        body: 'CANNOT-COMPLY: LS-5678\nThird party forced escalation attempt.',
        createdAt: AFTER_REVIEW,
      },
    ];
    assert.strictEqual(
      hasCannotComplyResponse(
        [],
        issueComments,
        REVIEW_AT,
        BOT_LOGINS,
        AUTHOR_LOGIN,
      ),
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// filterFindingsCycle2 — resolution suppression (author FIX / JUSTIFY)
// ---------------------------------------------------------------------------

describe("filterFindingsCycle2 — suppresses FIX'd C1 findings via resolvedTitles", () => {
  it('strips a re-raised C1 finding whose title is in resolvedTitles', () => {
    const c1Titles = ['Unsafe type assertion'];
    const finding = makeFinding({ title: 'Unsafe type assertion' });
    const resolvedTitles = new Set(['unsafe type assertion']);

    const { kept, stripped } = filterFindingsCycle2(
      [finding],
      c1Titles,
      [],
      resolvedTitles,
    );
    assert.strictEqual(kept.length, 0);
    assert.strictEqual(stripped.length, 1);
    assert.strictEqual(stripped[0].strip_reason, 'author_fixed');
  });

  it('strips a re-raised C1 finding case-insensitively', () => {
    const c1Titles = ['SQL injection via unescaped input'];
    const finding = makeFinding({ title: 'SQL injection via unescaped input' });
    const resolvedTitles = new Set(['sql injection via unescaped input']);

    const { kept, stripped } = filterFindingsCycle2(
      [finding],
      c1Titles,
      [],
      resolvedTitles,
    );
    assert.strictEqual(kept.length, 0);
    assert.strictEqual(stripped[0].strip_reason, 'author_fixed');
  });

  it('keeps a C1 finding not in resolvedTitles (author did not FIX it)', () => {
    const c1Titles = ['Auth bypass on /admin', 'SQL injection'];
    const findings = [
      makeFinding({ title: 'Auth bypass on /admin' }),
      makeFinding({ title: 'SQL injection' }),
    ];
    const resolvedTitles = new Set(['sql injection']);

    const { kept, stripped } = filterFindingsCycle2(
      findings,
      c1Titles,
      [],
      resolvedTitles,
    );
    assert.strictEqual(kept.length, 1);
    assert.strictEqual(kept[0].title, 'Auth bypass on /admin');
    assert.strictEqual(stripped.length, 1);
    assert.strictEqual(stripped[0].strip_reason, 'author_fixed');
  });

  it('resolvedTitles takes precedence over the priorSet (FIX before C1 keep)', () => {
    // A C1 finding that has been FIX'd should be stripped, not kept.
    const c1Titles = ['Race condition in processor'];
    const finding = makeFinding({ title: 'Race condition in processor' });
    const resolvedTitles = new Set(['race condition in processor']);

    const { kept, stripped } = filterFindingsCycle2(
      [finding],
      c1Titles,
      [],
      resolvedTitles,
    );
    assert.strictEqual(
      kept.length,
      0,
      'should not keep when in resolvedTitles',
    );
    assert.strictEqual(stripped[0].strip_reason, 'author_fixed');
  });
});

describe("filterFindingsCycle2 — suppresses JUSTIFY'd C1 findings via justifiedTitles", () => {
  it('strips a re-raised C1 finding whose title is in justifiedTitles', () => {
    const c1Titles = ['Missing tests for GraphQL changes'];
    const finding = makeFinding({ title: 'Missing tests for GraphQL changes' });
    const justifiedTitles = new Set(['missing tests for graphql changes']);

    const { kept, stripped } = filterFindingsCycle2(
      [finding],
      c1Titles,
      [],
      new Set(),
      justifiedTitles,
    );
    assert.strictEqual(kept.length, 0);
    assert.strictEqual(stripped.length, 1);
    assert.strictEqual(stripped[0].strip_reason, 'author_justified');
  });

  it('resolvedTitles wins over justifiedTitles when both contain the same title', () => {
    const c1Titles = ['Type assertion unsafe'];
    const finding = makeFinding({ title: 'Type assertion unsafe' });
    const resolvedTitles = new Set(['type assertion unsafe']);
    const justifiedTitles = new Set(['type assertion unsafe']);

    const { kept, stripped } = filterFindingsCycle2(
      [finding],
      c1Titles,
      [],
      resolvedTitles,
      justifiedTitles,
    );
    assert.strictEqual(stripped.length, 1);
    assert.strictEqual(stripped[0].strip_reason, 'author_fixed');
  });

  it('suppresses a non-C1 finding if its title happens to match justifiedTitles', () => {
    const c1Titles = ['Existing C1 finding'];
    const newFinding = makeFinding({ title: 'Brand new issue' });
    const justifiedTitles = new Set(['brand new issue']);

    const { kept, stripped } = filterFindingsCycle2(
      [newFinding],
      c1Titles,
      [],
      new Set(),
      justifiedTitles,
    );
    assert.strictEqual(stripped.length, 1);
    assert.strictEqual(stripped[0].strip_reason, 'author_justified');
  });
});

// ---------------------------------------------------------------------------
// filterFindingsCycle3 — resolution suppression (author FIX)
// ---------------------------------------------------------------------------

describe("filterFindingsCycle3 — suppresses FIX'd mandate findings via resolvedTitles", () => {
  it('strips a mandate finding whose title is in resolvedTitles', () => {
    const mandates = ['Error handling gap in useLeagueChat'];
    const finding = makeFinding({
      title: 'Error handling gap in useLeagueChat',
    });
    const resolvedTitles = new Set(['error handling gap in useleaguechat']);

    const { kept, stripped } = filterFindingsCycle3(
      [finding],
      mandates,
      resolvedTitles,
    );
    assert.strictEqual(kept.length, 0);
    assert.strictEqual(stripped.length, 1);
    assert.strictEqual(stripped[0].strip_reason, 'author_fixed');
  });

  it('strips a mandate finding case-insensitively', () => {
    const mandates = ['Auth bypass on /admin'];
    const finding = makeFinding({ title: 'Auth bypass on /admin' });
    const resolvedTitles = new Set(['auth bypass on /admin']);

    const { kept, stripped } = filterFindingsCycle3(
      [finding],
      mandates,
      resolvedTitles,
    );
    assert.strictEqual(stripped[0].strip_reason, 'author_fixed');
  });

  it('resolvedTitles takes precedence over the mandate list', () => {
    const mandates = ['Unsafe type assertion', 'Race condition'];
    const findings = [
      makeFinding({ title: 'Unsafe type assertion' }),
      makeFinding({ title: 'Race condition' }),
    ];
    const resolvedTitles = new Set(['unsafe type assertion']);

    const { kept, stripped } = filterFindingsCycle3(
      findings,
      mandates,
      resolvedTitles,
    );
    assert.strictEqual(kept.length, 1);
    assert.strictEqual(kept[0].title, 'Race condition');
    assert.strictEqual(stripped.length, 1);
    assert.strictEqual(stripped[0].strip_reason, 'author_fixed');
  });

  it('keeps mandate findings not in resolvedTitles unchanged', () => {
    const mandates = ['Missing auth check'];
    const finding = makeFinding({ title: 'Missing auth check' });

    const { kept, stripped } = filterFindingsCycle3(
      [finding],
      mandates,
      new Set(),
    );
    assert.strictEqual(kept.length, 1);
    assert.strictEqual(stripped.length, 0);
  });

  it('empty resolvedTitles behaves identically to calling without the param', () => {
    const mandates = ['Mandate A', 'Mandate B'];
    const findings = [
      makeFinding({ title: 'Mandate A' }),
      makeFinding({ title: 'Off-mandate finding' }),
    ];

    const withEmpty = filterFindingsCycle3(findings, mandates, new Set());
    const withoutParam = filterFindingsCycle3(findings, mandates);
    assert.deepStrictEqual(withEmpty.kept.length, withoutParam.kept.length);
    assert.deepStrictEqual(
      withEmpty.stripped.length,
      withoutParam.stripped.length,
    );
  });
});

// ---------------------------------------------------------------------------
// buildAuthorResolvedTitles
// ---------------------------------------------------------------------------

const PR_SHAS = [
  'abc1234567890abcdef1234567890abcdef123456',
  'deadbeef1234567890abcdef1234567890abcdef',
];

describe('buildAuthorResolvedTitles — basic resolution', () => {
  it('returns empty sets when items is empty', () => {
    const { resolvedTitles, justifiedTitles } = buildAuthorResolvedTitles(
      [],
      PR_SHAS,
    );
    assert.strictEqual(resolvedTitles.size, 0);
    assert.strictEqual(justifiedTitles.size, 0);
  });

  it('adds a title to resolvedTitles when FIX sha exists in PR history', () => {
    const items = [
      {
        title: 'Unsafe type assertion',
        parsed: { type: 'FIX', sha: 'abc1234' },
      },
    ];
    const { resolvedTitles } = buildAuthorResolvedTitles(items, PR_SHAS);
    assert.ok(resolvedTitles.has('unsafe type assertion'));
  });

  it('does NOT add to resolvedTitles when FIX sha is not in PR history', () => {
    const items = [
      {
        title: 'Unsafe type assertion',
        parsed: { type: 'FIX', sha: 'aaaaaaa' },
      },
    ];
    const { resolvedTitles } = buildAuthorResolvedTitles(items, PR_SHAS);
    assert.strictEqual(resolvedTitles.size, 0);
  });

  it('adds a title to justifiedTitles for JUSTIFY replies', () => {
    const items = [
      {
        title: 'Missing tests for new component',
        parsed: {
          type: 'JUSTIFY',
          rationale: 'pre-existing component has no tests; out of scope',
        },
      },
    ];
    const { justifiedTitles } = buildAuthorResolvedTitles(items, PR_SHAS);
    assert.ok(justifiedTitles.has('missing tests for new component'));
  });

  it('skips items with null title', () => {
    const items = [
      { title: null, parsed: { type: 'FIX', sha: 'abc1234' } },
      { title: null, parsed: { type: 'JUSTIFY', rationale: 'reason' } },
    ];
    const { resolvedTitles, justifiedTitles } = buildAuthorResolvedTitles(
      items,
      PR_SHAS,
    );
    assert.strictEqual(resolvedTitles.size, 0);
    assert.strictEqual(justifiedTitles.size, 0);
  });

  it('normalizes titles to lowercase', () => {
    const items = [
      {
        title: 'SQL Injection Via Unescaped Input',
        parsed: { type: 'FIX', sha: 'abc1234' },
      },
    ];
    const { resolvedTitles } = buildAuthorResolvedTitles(items, PR_SHAS);
    assert.ok(resolvedTitles.has('sql injection via unescaped input'));
    assert.ok(!resolvedTitles.has('SQL Injection Via Unescaped Input'));
  });

  it('handles a CANNOT-COMPLY item without adding to either set', () => {
    const items = [
      {
        title: 'Generated file lint error',
        parsed: {
          type: 'CANNOT-COMPLY',
          issueId: 'LS-1234',
          reason: 'Generated file.',
        },
      },
    ];
    const { resolvedTitles, justifiedTitles } = buildAuthorResolvedTitles(
      items,
      PR_SHAS,
    );
    assert.strictEqual(resolvedTitles.size, 0);
    assert.strictEqual(justifiedTitles.size, 0);
  });

  it('handles mixed items correctly', () => {
    const items = [
      {
        title: 'Unsafe cast',
        parsed: { type: 'FIX', sha: 'abc1234' }, // valid SHA
      },
      {
        title: 'Missing tests',
        parsed: { type: 'JUSTIFY', rationale: 'out of scope' },
      },
      {
        title: 'Another issue',
        parsed: { type: 'FIX', sha: 'aaaaaaa' }, // invalid SHA
      },
      {
        title: null,
        parsed: { type: 'FIX', sha: 'abc1234' }, // no title
      },
    ];
    const { resolvedTitles, justifiedTitles } = buildAuthorResolvedTitles(
      items,
      PR_SHAS,
    );
    assert.ok(resolvedTitles.has('unsafe cast'), 'valid FIX → resolved');
    assert.ok(
      !resolvedTitles.has('another issue'),
      'invalid SHA → not resolved',
    );
    assert.ok(justifiedTitles.has('missing tests'), 'JUSTIFY → justified');
    assert.strictEqual(resolvedTitles.size, 1);
    assert.strictEqual(justifiedTitles.size, 1);
  });
});

// ---------------------------------------------------------------------------
// buildAuthorResponsesSection — items field exposure
// ---------------------------------------------------------------------------

describe('buildAuthorResponsesSection — exposes items field', () => {
  it('returns items as empty array when no valid responses', () => {
    const result = buildAuthorResponsesSection([], [], REVIEW_AT, BOT_LOGINS);
    assert.ok(Array.isArray(result.items), 'items should be an array');
    assert.strictEqual(result.items.length, 0);
  });

  it('returns items with parsed responses and titles for inline thread replies', () => {
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
    assert.strictEqual(result.items.length, 1);
    assert.strictEqual(result.items[0].title, 'Unused variable in handler');
    assert.strictEqual(result.items[0].parsed.type, 'FIX');
    assert.strictEqual(result.items[0].parsed.sha, 'abc1234');
  });

  it('returns items with null title for PR-level issue comments', () => {
    const issueComments = [
      {
        id: 1,
        userLogin: 'author',
        body: 'JUSTIFY: pre-existing; out of scope',
        createdAt: AFTER_REVIEW,
      },
    ];
    const result = buildAuthorResponsesSection(
      [],
      issueComments,
      REVIEW_AT,
      BOT_LOGINS,
    );
    assert.strictEqual(result.items.length, 1);
    assert.strictEqual(result.items[0].title, null);
    assert.strictEqual(result.items[0].parsed.type, 'JUSTIFY');
  });
});

// ---------------------------------------------------------------------------
// buildCycleRoleSection — resolvedTitles integration
// ---------------------------------------------------------------------------

describe('buildCycleRoleSection cycle 2 — resolvedTitles', () => {
  it('lists pre-verified FIX replies when resolvedTitles is provided', () => {
    const resolvedTitles = new Set([
      'unsafe type assertion',
      'missing null check',
    ]);
    const section = buildCycleRoleSection(
      2,
      ['Prior issue'],
      [],
      resolvedTitles,
    );
    assert.ok(
      section.includes('Pre-verified FIX replies'),
      'should mention pre-verified section',
    );
    assert.ok(
      section.includes('unsafe type assertion'),
      'should list resolved title 1',
    );
    assert.ok(
      section.includes('missing null check'),
      'should list resolved title 2',
    );
  });

  it('omits resolved titles from the re-evaluate list', () => {
    const resolvedTitles = new Set(['fixed issue']);
    const priorTitles = ['Fixed issue', 'Pending issue'];
    const section = buildCycleRoleSection(2, priorTitles, [], resolvedTitles);
    assert.ok(
      !section.includes('Fixed issue'),
      'resolved title should not appear in re-evaluate list',
    );
    assert.ok(
      section.includes('Pending issue'),
      'non-resolved title should still appear',
    );
  });

  it('omits pre-verified block when resolvedTitles is empty', () => {
    const section = buildCycleRoleSection(2, ['Prior issue'], [], new Set());
    assert.ok(
      !section.includes('Pre-verified FIX replies'),
      'no pre-verified block when no resolved titles',
    );
  });
});

describe('buildCycleRoleSection cycle 3 — resolvedTitles', () => {
  it('lists pre-verified FIX replies in the resolved block', () => {
    const resolvedTitles = new Set(['auth bypass on /admin']);
    const section = buildCycleRoleSection(
      3,
      ['Auth bypass on /admin', 'Race condition'],
      [],
      resolvedTitles,
    );
    assert.ok(
      section.includes('Pre-verified FIX replies'),
      'should mention pre-verified section',
    );
    assert.ok(
      section.includes('auth bypass on /admin'),
      'should list the resolved mandate',
    );
  });

  it('omits resolved mandates from the verify list', () => {
    const resolvedTitles = new Set(['auth bypass on /admin']);
    const section = buildCycleRoleSection(
      3,
      ['Auth bypass on /admin', 'Race condition'],
      [],
      resolvedTitles,
    );
    assert.ok(
      section.includes('Race condition'),
      'non-resolved mandate should be in verify list',
    );
    assert.ok(
      !section.match(/Mandates from Cycle 2[^]*Auth bypass on \/admin/),
      'resolved mandate should not appear in numbered verify list',
    );
  });
});

// ---------------------------------------------------------------------------
// getMalformedInlineReplies
// ---------------------------------------------------------------------------

describe('getMalformedInlineReplies — returns empty when no MALFORMED replies', () => {
  it('returns empty array when there are no review comments', () => {
    const result = getMalformedInlineReplies([], REVIEW_AT, BOT_LOGINS);
    assert.deepStrictEqual(result, []);
  });

  it('returns empty array when all replies are valid (FIX/JUSTIFY)', () => {
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
    const result = getMalformedInlineReplies(
      reviewComments,
      REVIEW_AT,
      BOT_LOGINS,
    );
    assert.deepStrictEqual(result, []);
  });

  it('returns empty array when MALFORMED reply is at or before the last review timestamp', () => {
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
        body: 'I will fix this',
        createdAt: BEFORE_REVIEW,
      },
    ];
    const result = getMalformedInlineReplies(
      reviewComments,
      REVIEW_AT,
      BOT_LOGINS,
    );
    assert.deepStrictEqual(result, []);
  });

  it('returns empty array when MALFORMED reply is from a bot login', () => {
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
        body: 'Some unrecognised bot message',
        createdAt: AFTER_REVIEW,
      },
    ];
    const result = getMalformedInlineReplies(
      reviewComments,
      REVIEW_AT,
      BOT_LOGINS,
    );
    assert.deepStrictEqual(result, []);
  });

  it('returns empty array when reply targets a non-bot root comment', () => {
    const reviewComments = [
      {
        id: 10,
        inReplyToId: null,
        userLogin: 'human-reviewer',
        body: 'Please check this.',
        createdAt: REVIEW_AT,
      },
      {
        id: 11,
        inReplyToId: 10,
        userLogin: 'author',
        body: 'Some random text',
        createdAt: AFTER_REVIEW,
      },
    ];
    const result = getMalformedInlineReplies(
      reviewComments,
      REVIEW_AT,
      BOT_LOGINS,
    );
    assert.deepStrictEqual(result, []);
  });
});

describe('getMalformedInlineReplies — detects MALFORMED replies', () => {
  it('returns the root comment ID when an author posts a MALFORMED reply', () => {
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
        body: "I'll fix this",
        createdAt: AFTER_REVIEW,
      },
    ];
    const result = getMalformedInlineReplies(
      reviewComments,
      REVIEW_AT,
      BOT_LOGINS,
    );
    assert.deepStrictEqual(result, [10]);
  });

  it('deduplicates: two MALFORMED replies in the same thread yield one root ID', () => {
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
        body: 'Looks fine to me',
        createdAt: AFTER_REVIEW,
      },
      {
        id: 12,
        inReplyToId: 10,
        userLogin: 'author',
        body: 'Another bad reply',
        createdAt: AFTER_REVIEW,
      },
    ];
    const result = getMalformedInlineReplies(
      reviewComments,
      REVIEW_AT,
      BOT_LOGINS,
    );
    assert.deepStrictEqual(result, [10]);
  });

  it('returns separate root IDs for MALFORMED replies across different threads', () => {
    const reviewComments = [
      {
        id: 10,
        inReplyToId: null,
        userLogin: 'github-actions[bot]',
        body: BOT_INLINE_BODY,
        createdAt: REVIEW_AT,
      },
      {
        id: 20,
        inReplyToId: null,
        userLogin: 'github-actions[bot]',
        body: BOT_INLINE_BODY,
        createdAt: REVIEW_AT,
      },
      {
        id: 11,
        inReplyToId: 10,
        userLogin: 'author',
        body: 'will look at this',
        createdAt: AFTER_REVIEW,
      },
      {
        id: 21,
        inReplyToId: 20,
        userLogin: 'author',
        body: 'nah this is fine',
        createdAt: AFTER_REVIEW,
      },
    ];
    const result = getMalformedInlineReplies(
      reviewComments,
      REVIEW_AT,
      BOT_LOGINS,
    );
    assert.strictEqual(result.length, 2);
    assert.ok(result.includes(10));
    assert.ok(result.includes(20));
  });

  it('returns empty when the thread also has a valid author reply after the last review', () => {
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
        body: 'oops wrong format',
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
    const result = getMalformedInlineReplies(
      reviewComments,
      REVIEW_AT,
      BOT_LOGINS,
    );
    assert.deepStrictEqual(result, []);
  });

  it('returns empty when the bot already posted a format-error reply in the thread', () => {
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
        body: "I'll look at this later",
        createdAt: AFTER_REVIEW,
      },
      // Bot already warned the thread — suppress duplicate post
      {
        id: 12,
        inReplyToId: 10,
        userLogin: 'github-actions[bot]',
        body: FORMAT_ERROR_MESSAGE,
        createdAt: AFTER_REVIEW,
      },
    ];
    const result = getMalformedInlineReplies(
      reviewComments,
      REVIEW_AT,
      BOT_LOGINS,
    );
    assert.deepStrictEqual(result, []);
  });

  it('returns empty when format-error was posted by an identity not in botLogins (body-content detection)', () => {
    // Simulates the production case: postReviewThreadReply uses GH_TOKEN →
    // replies appear as 'github-actions[bot]' which is NOT in REVIEWER_BOT_LOGINS.
    const NON_BOT_ACTOR = 'workflow-runner[bot]';
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
        body: 'no idea what to do here',
        createdAt: AFTER_REVIEW,
      },
      // FORMAT_ERROR_MESSAGE was posted by an identity outside botLogins
      {
        id: 12,
        inReplyToId: 10,
        userLogin: NON_BOT_ACTOR,
        body: FORMAT_ERROR_MESSAGE,
        createdAt: AFTER_REVIEW,
      },
    ];
    const result = getMalformedInlineReplies(
      reviewComments,
      REVIEW_AT,
      BOT_LOGINS,
    );
    assert.deepStrictEqual(result, []);
  });

  it('does not classify a FORMAT_ERROR_MESSAGE reply as MALFORMED', () => {
    // Verifies that a format-error warning reply posted by a non-botLogins
    // identity (e.g. github-actions[bot] when not in REVIEWER_BOT_LOGINS)
    // is skipped rather than re-triggering another format-error post.
    const NON_BOT_ACTOR = 'workflow-runner[bot]';
    const reviewComments = [
      {
        id: 10,
        inReplyToId: null,
        userLogin: 'github-actions[bot]',
        body: BOT_INLINE_BODY,
        createdAt: REVIEW_AT,
      },
      // The only reply is the format-error warning itself — no author reply yet
      {
        id: 11,
        inReplyToId: 10,
        userLogin: NON_BOT_ACTOR,
        body: FORMAT_ERROR_MESSAGE,
        createdAt: AFTER_REVIEW,
      },
    ];
    const result = getMalformedInlineReplies(
      reviewComments,
      REVIEW_AT,
      BOT_LOGINS,
    );
    assert.deepStrictEqual(result, []);
  });
});

// ---------------------------------------------------------------------------
// collectCannotComplyResponses
// ---------------------------------------------------------------------------

describe('collectCannotComplyResponses', () => {
  it('returns empty when no responses match', () => {
    assert.deepStrictEqual(
      collectCannotComplyResponses([], [], REVIEW_AT, BOT_LOGINS, AUTHOR_LOGIN),
      [],
    );
  });

  it('returns inline CANNOT-COMPLY entries from the author with parsed issueId/reason', () => {
    const reviewComments = [
      {
        id: 10,
        inReplyToId: null,
        userLogin: 'github-actions[bot]',
        body: 'bot finding',
        createdAt: REVIEW_AT,
      },
      {
        id: 11,
        inReplyToId: 10,
        userLogin: AUTHOR_LOGIN,
        body: 'CANNOT-COMPLY: LS-1234\nGenerated file — cannot edit by hand.',
        createdAt: AFTER_REVIEW,
      },
    ];
    const result = collectCannotComplyResponses(
      reviewComments,
      [],
      REVIEW_AT,
      BOT_LOGINS,
      AUTHOR_LOGIN,
    );
    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual(result[0], {
      source: 'review',
      commentId: 11,
      issueId: 'LS-1234',
      reason: 'Generated file — cannot edit by hand.',
      createdAt: AFTER_REVIEW,
    });
  });

  it('returns CANNOT-COMPLY entries from PR issue comments', () => {
    const issueComments = [
      {
        id: 22,
        userLogin: AUTHOR_LOGIN,
        body: 'CANNOT-COMPLY: LS-9999\nVendored library.',
        createdAt: AFTER_REVIEW,
      },
    ];
    const result = collectCannotComplyResponses(
      [],
      issueComments,
      REVIEW_AT,
      BOT_LOGINS,
      AUTHOR_LOGIN,
    );
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].source, 'issue');
    assert.strictEqual(result[0].commentId, 22);
    assert.strictEqual(result[0].issueId, 'LS-9999');
  });

  it('ignores CANNOT-COMPLY replies from non-author users', () => {
    const reviewComments = [
      {
        id: 10,
        inReplyToId: null,
        userLogin: 'github-actions[bot]',
        body: 'bot finding',
        createdAt: REVIEW_AT,
      },
      {
        id: 11,
        inReplyToId: 10,
        userLogin: 'someone-else',
        body: 'CANNOT-COMPLY: LS-1234\nThird-party escalation attempt.',
        createdAt: AFTER_REVIEW,
      },
    ];
    assert.deepStrictEqual(
      collectCannotComplyResponses(
        reviewComments,
        [],
        REVIEW_AT,
        BOT_LOGINS,
        AUTHOR_LOGIN,
      ),
      [],
    );
  });

  it('ignores replies at or before the last bot review timestamp', () => {
    const reviewComments = [
      {
        id: 10,
        inReplyToId: null,
        userLogin: 'github-actions[bot]',
        body: 'bot finding',
        createdAt: REVIEW_AT,
      },
      {
        id: 11,
        inReplyToId: 10,
        userLogin: AUTHOR_LOGIN,
        body: 'CANNOT-COMPLY: LS-1234\nStale.',
        createdAt: REVIEW_AT,
      },
    ];
    assert.deepStrictEqual(
      collectCannotComplyResponses(
        reviewComments,
        [],
        REVIEW_AT,
        BOT_LOGINS,
        AUTHOR_LOGIN,
      ),
      [],
    );
  });

  it('returns an empty array when authorLogin is empty', () => {
    const issueComments = [
      {
        id: 22,
        userLogin: AUTHOR_LOGIN,
        body: 'CANNOT-COMPLY: LS-9999\nReason.',
        createdAt: AFTER_REVIEW,
      },
    ];
    assert.deepStrictEqual(
      collectCannotComplyResponses(
        [],
        issueComments,
        REVIEW_AT,
        BOT_LOGINS,
        '',
      ),
      [],
    );
  });

  it('collects multiple entries across both sources', () => {
    const reviewComments = [
      {
        id: 10,
        inReplyToId: null,
        userLogin: 'github-actions[bot]',
        body: 'bot finding',
        createdAt: REVIEW_AT,
      },
      {
        id: 11,
        inReplyToId: 10,
        userLogin: AUTHOR_LOGIN,
        body: 'CANNOT-COMPLY: LS-1\nA.',
        createdAt: AFTER_REVIEW,
      },
    ];
    const issueComments = [
      {
        id: 22,
        userLogin: AUTHOR_LOGIN,
        body: 'CANNOT-COMPLY: LS-2\nB.',
        createdAt: AFTER_REVIEW,
      },
    ];
    const result = collectCannotComplyResponses(
      reviewComments,
      issueComments,
      REVIEW_AT,
      BOT_LOGINS,
      AUTHOR_LOGIN,
    );
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].issueId, 'LS-1');
    assert.strictEqual(result[1].issueId, 'LS-2');
  });

  it('hasCannotComplyResponse remains consistent with the collector', () => {
    const issueComments = [
      {
        id: 22,
        userLogin: AUTHOR_LOGIN,
        body: 'CANNOT-COMPLY: LS-9999\nReason.',
        createdAt: AFTER_REVIEW,
      },
    ];
    assert.strictEqual(
      hasCannotComplyResponse(
        [],
        issueComments,
        REVIEW_AT,
        BOT_LOGINS,
        AUTHOR_LOGIN,
      ),
      true,
    );
    assert.strictEqual(
      hasCannotComplyResponse([], [], REVIEW_AT, BOT_LOGINS, AUTHOR_LOGIN),
      false,
    );
  });
});
