import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateUlid,
  formatReviewBody,
  buildInlineComments,
  buildKnownFailureBody,
  parseCommentableLineRanges,
  isPositionInDiff,
  partitionFindingsForInline,
} from '../post-review.mjs';
import { INFRA_ERROR_MARKER } from '../cycle-counter.mjs';
import { parseTitlesFromReviewBody } from '../cycle-protocol.mjs';

describe('generateUlid', () => {
  it('returns a 26-character string', () => {
    const id = generateUlid();
    assert.strictEqual(id.length, 26);
  });

  it('uses only Crockford Base32 characters', () => {
    const B32 = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;
    assert.match(generateUlid(), B32);
  });

  it('generates unique values', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateUlid()));
    assert.strictEqual(ids.size, 50);
  });

  it('produces a lexicographically larger ID for a later timestamp', () => {
    // Patch Date.now to control timestamps so the ordering assertion is not
    // tautological. IDs from a later timestamp must sort after IDs from an
    // earlier timestamp (guaranteed by the ULID spec; random suffix is only
    // monotonic within the same millisecond for the monotonic variant).
    const orig = Date.now;
    try {
      Date.now = () => 1_700_000_000_000;
      const earlier = generateUlid();
      Date.now = () => 1_700_000_001_000; // 1 second later
      const later = generateUlid();
      assert.ok(later > earlier, `expected ${later} > ${earlier}`);
    } finally {
      Date.now = orig;
    }
  });
});

describe('formatReviewBody', () => {
  it('returns LGTM message for APPROVE event', () => {
    const body = formatReviewBody([], 'APPROVE');
    assert.match(body, /LGTM/);
  });

  it('includes finding titles in REQUEST_CHANGES body', () => {
    const findings = [
      {
        issueId: '01HZ000000000000000000001',
        severity: 'high',
        title: 'SQL injection risk',
        body: 'Use parameterised queries.',
        file: 'src/db.js',
        line: 42,
      },
    ];
    const body = formatReviewBody(findings, 'REQUEST_CHANGES');
    assert.match(body, /SQL injection risk/);
    assert.match(body, /<!-- issue-id: 01HZ000000000000000000001 -->/);
    assert.match(body, /HIGH/);
    assert.match(body, /`src\/db\.js:42`/);
  });

  it('uses _PR-level_ when finding has no file', () => {
    const findings = [
      {
        issueId: '01HZ000000000000000000002',
        severity: 'critical',
        title: 'Missing auth',
        body: 'All routes must be authenticated.',
        file: null,
        line: null,
      },
    ];
    const body = formatReviewBody(findings, 'REQUEST_CHANGES');
    assert.match(body, /_PR-level_/);
  });

  it('includes each finding exactly once', () => {
    const findings = [
      {
        issueId: generateUlid(),
        severity: 'high',
        title: 'Issue A',
        body: 'desc A',
        file: null,
        line: null,
      },
      {
        issueId: generateUlid(),
        severity: 'critical',
        title: 'Issue B',
        body: 'desc B',
        file: null,
        line: null,
      },
    ];
    const body = formatReviewBody(findings, 'REQUEST_CHANGES');
    assert.match(body, /Issue A/);
    assert.match(body, /Issue B/);
  });

  it('appends Observations section when observations are provided on APPROVE', () => {
    const obs = [
      {
        severity: 'observation',
        title: 'Race condition correctly handled',
        body: 'The mutex now prevents concurrent writes.',
        file: 'src/queue.ts',
        line: 55,
      },
    ];
    const body = formatReviewBody([], 'APPROVE', obs);
    assert.match(body, /LGTM/);
    assert.match(body, /## Observations/);
    assert.match(body, /Race condition correctly handled/);
    assert.match(body, /`src\/queue\.ts:55`/);
  });

  it('appends Observations section when observations are provided on REQUEST_CHANGES', () => {
    const blocking = [
      {
        issueId: '01HZ000000000000000000003',
        severity: 'high',
        title: 'SQL injection risk',
        body: 'Use parameterised queries.',
        file: 'src/db.js',
        line: 42,
      },
    ];
    const obs = [
      {
        severity: 'observation',
        title: 'Error boundary correctly placed',
        body: 'The fallback renders outside the theme provider.',
        file: 'src/main.tsx',
        line: 117,
      },
    ];
    const body = formatReviewBody(blocking, 'REQUEST_CHANGES', obs);
    assert.match(body, /## Changes Required/);
    assert.match(body, /SQL injection risk/);
    assert.match(body, /## Observations/);
    assert.match(body, /Error boundary correctly placed/);
  });

  it('observations have no issue-id markers', () => {
    const obs = [
      {
        severity: 'observation',
        title: 'Handled correctly',
        body: 'desc',
        file: null,
        line: null,
      },
    ];
    const body = formatReviewBody([], 'APPROVE', obs);
    assert.ok(
      !body.includes('<!-- issue-id:'),
      'observations must not embed issue-id markers',
    );
  });

  it('observations have no [OBSERVATION] severity tag so parseTitlesFromReviewBody ignores them', () => {
    const obs = [
      {
        severity: 'observation',
        title: 'Should not be tracked',
        body: 'desc',
        file: 'src/foo.ts',
        line: 1,
      },
    ];
    const body = formatReviewBody([], 'APPROVE', obs);
    assert.ok(
      !body.includes('[OBSERVATION]'),
      'severity tag must be absent from observations',
    );
  });

  it('omits Observations section when observations array is empty', () => {
    const body = formatReviewBody([], 'APPROVE', []);
    assert.ok(
      !body.includes('## Observations'),
      'Observations section must be absent when empty',
    );
  });

  it('prepends fallback banner when fallbackModel is set (REQUEST_CHANGES)', () => {
    const findings = [
      {
        issueId: generateUlid(),
        severity: 'high',
        title: 'Some finding',
        body: 'Fix it.',
        file: null,
        line: null,
      },
    ];
    const body = formatReviewBody(findings, 'REQUEST_CHANGES', [], {
      fallbackModel: 'gemini-2.5-flash-lite',
    });
    assert.match(body, /gemini-2\.5-flash-lite/);
    assert.match(body, /fallback/);
    assert.match(body, /Some finding/);
  });

  it('prepends fallback banner when fallbackModel is set (APPROVE)', () => {
    const body = formatReviewBody([], 'APPROVE', [], {
      fallbackModel: 'gemini-2.5-flash-lite',
    });
    assert.match(body, /gemini-2\.5-flash-lite/);
    assert.match(body, /LGTM/);
  });

  it('omits fallback banner when fallbackModel is not set', () => {
    const body = formatReviewBody([], 'APPROVE');
    assert.doesNotMatch(body, /fallback/);
    assert.doesNotMatch(body, /gemini-2\.5-flash-lite/);
  });
});

// ---------------------------------------------------------------------------
// buildKnownFailureBody — infra-failure marker presence
// Ensures transient failures carry the INFRA_ERROR_MARKER so they are
// excluded from the cycle counter (LS-4108).
// ---------------------------------------------------------------------------

describe('buildKnownFailureBody infra-failure marker', () => {
  it('rate-limit body contains the infra-failure marker', () => {
    const { body } = buildKnownFailureBody('rate-limit', {
      retryAfterSeconds: 60,
    });
    assert.ok(
      body.includes(INFRA_ERROR_MARKER),
      `expected '${INFRA_ERROR_MARKER}' in rate-limit body`,
    );
  });

  it('quota body contains the infra-failure marker', () => {
    const { body } = buildKnownFailureBody('quota');
    assert.ok(
      body.includes(INFRA_ERROR_MARKER),
      `expected '${INFRA_ERROR_MARKER}' in quota body`,
    );
  });

  it('auth body contains the infra-failure marker', () => {
    const { body } = buildKnownFailureBody('auth');
    assert.ok(
      body.includes(INFRA_ERROR_MARKER),
      `expected '${INFRA_ERROR_MARKER}' in auth body`,
    );
  });

  it('cost-cap body does NOT contain the infra-failure marker (author-actionable)', () => {
    const { body } = buildKnownFailureBody('cost-cap', {
      cumulativeUsd: 1.0,
      capUsd: 0.5,
    });
    assert.ok(
      !body.includes(INFRA_ERROR_MARKER),
      `expected '${INFRA_ERROR_MARKER}' to be absent from cost-cap body`,
    );
  });

  it('context-too-large body does NOT contain the infra-failure marker (author-actionable)', () => {
    const { body } = buildKnownFailureBody('context-too-large');
    assert.ok(
      !body.includes(INFRA_ERROR_MARKER),
      `expected '${INFRA_ERROR_MARKER}' to be absent from context-too-large body`,
    );
  });

  it('default (unknown) body contains the infra-failure marker', () => {
    const { body } = buildKnownFailureBody('unknown-kind');
    assert.ok(
      body.includes(INFRA_ERROR_MARKER),
      `expected '${INFRA_ERROR_MARKER}' in default fallback body`,
    );
  });

  it('rate-limit uses COMMENT event (not a review verdict — nothing was read)', () => {
    const { event } = buildKnownFailureBody('rate-limit');
    assert.strictEqual(event, 'COMMENT');
  });

  it('quota uses COMMENT event (not a review verdict — nothing was read)', () => {
    const { event } = buildKnownFailureBody('quota');
    assert.strictEqual(event, 'COMMENT');
  });

  it('auth uses COMMENT event (not a review verdict — nothing was read)', () => {
    const { event } = buildKnownFailureBody('auth');
    assert.strictEqual(event, 'COMMENT');
  });

  it('cost-cap still uses REQUEST_CHANGES event (author-actionable, not infra)', () => {
    const { event } = buildKnownFailureBody('cost-cap');
    assert.strictEqual(event, 'REQUEST_CHANGES');
  });

  it('context-too-large still uses REQUEST_CHANGES event (author-actionable, not infra)', () => {
    const { event } = buildKnownFailureBody('context-too-large');
    assert.strictEqual(event, 'REQUEST_CHANGES');
  });

  it('default (unknown) uses COMMENT event', () => {
    const { event } = buildKnownFailureBody('unknown-kind');
    assert.strictEqual(event, 'COMMENT');
  });
});

describe('buildInlineComments', () => {
  it('returns an empty array when no findings have file+line', () => {
    const findings = [
      {
        issueId: generateUlid(),
        severity: 'medium',
        title: 'Tip',
        body: 'Consider refactoring.',
        file: null,
        line: null,
      },
    ];
    assert.deepEqual(buildInlineComments(findings), []);
  });

  it('maps findings with file+line to inline comment objects', () => {
    const id = generateUlid();
    const findings = [
      {
        issueId: id,
        severity: 'low',
        title: 'Unused var',
        body: 'Remove unused variable.',
        file: 'src/utils.js',
        line: 10,
      },
    ];
    const comments = buildInlineComments(findings);
    assert.strictEqual(comments.length, 1);
    assert.strictEqual(comments[0].path, 'src/utils.js');
    assert.strictEqual(comments[0].line, 10);
    assert.strictEqual(comments[0].side, 'RIGHT');
    assert.match(comments[0].body, new RegExp(`issue-id: ${id}`));
    assert.match(comments[0].body, /Unused var/);
    assert.match(comments[0].body, /LOW/);
  });

  it('skips findings that have a file but no line', () => {
    const findings = [
      {
        issueId: generateUlid(),
        severity: 'medium',
        title: 'File-level issue',
        body: 'Fix this file.',
        file: 'src/foo.js',
        line: null,
      },
    ];
    assert.deepEqual(buildInlineComments(findings), []);
  });
});

// ---------------------------------------------------------------------------
// Diff position validation (LS-8499)
// One out-of-diff inline comment position used to 422 the whole review
// submission, and the retry dropped EVERY inline thread. These helpers
// pre-validate positions against the diff so only individually-invalid
// comments are demoted to the review body.
// ---------------------------------------------------------------------------

/** Build a minimal unified diff for a single modified file with given hunks. */
function diffFor(path, hunkHeaders) {
  return [
    `diff --git a/${path} b/${path}`,
    'index 1111111..2222222 100644',
    `--- a/${path}`,
    `+++ b/${path}`,
    ...hunkHeaders.flatMap((h) => [h, ' context line']),
  ].join('\n');
}

describe('parseCommentableLineRanges', () => {
  it('returns null for empty or missing diff', () => {
    assert.strictEqual(parseCommentableLineRanges(undefined), null);
    assert.strictEqual(parseCommentableLineRanges(null), null);
    assert.strictEqual(parseCommentableLineRanges(''), null);
    assert.strictEqual(parseCommentableLineRanges('   \n'), null);
  });

  it('parses RIGHT-side ranges from hunk headers', () => {
    const ranges = parseCommentableLineRanges(
      diffFor('src/app.js', ['@@ -10,4 +12,6 @@', '@@ -40,2 +44,3 @@']),
    );
    assert.deepEqual(ranges.get('src/app.js'), [
      [12, 17],
      [44, 46],
    ]);
  });

  it('handles a new file (-0,0 +1,N)', () => {
    const diff = [
      'diff --git a/scripts/new.mjs b/scripts/new.mjs',
      'new file mode 100644',
      'index 0000000..3333333',
      '--- /dev/null',
      '+++ b/scripts/new.mjs',
      '@@ -0,0 +1,200 @@',
      '+line one',
    ].join('\n');
    const ranges = parseCommentableLineRanges(diff);
    assert.deepEqual(ranges.get('scripts/new.mjs'), [[1, 200]]);
  });

  it('produces no ranges for a deleted file (+++ /dev/null)', () => {
    const diff = [
      'diff --git a/old.js b/old.js',
      'deleted file mode 100644',
      '--- a/old.js',
      '+++ /dev/null',
      '@@ -1,10 +0,0 @@',
      '-gone',
    ].join('\n');
    const ranges = parseCommentableLineRanges(diff);
    assert.strictEqual(ranges.size, 0);
  });

  it('treats an omitted count as 1 (@@ -5 +7 @@)', () => {
    const ranges = parseCommentableLineRanges(diffFor('a.js', ['@@ -5 +7 @@']));
    assert.deepEqual(ranges.get('a.js'), [[7, 7]]);
  });

  it('skips deletion-only hunks (+N,0)', () => {
    const ranges = parseCommentableLineRanges(
      diffFor('a.js', ['@@ -10,3 +9,0 @@']),
    );
    assert.strictEqual(ranges.has('a.js'), false);
  });

  it('does not mistake an added content line starting with ++ for a file header', () => {
    const diff = [
      'diff --git a/a.js b/a.js',
      'index 1111111..2222222 100644',
      '--- a/a.js',
      '+++ b/a.js',
      '@@ -1,2 +1,3 @@',
      ' context',
      '+++ evil-looking added line',
      ' context',
      '@@ -10,2 +11,2 @@',
      ' context',
    ].join('\n');
    const ranges = parseCommentableLineRanges(diff);
    // Both hunks must be attributed to a.js, not to "evil-looking added line".
    assert.deepEqual(ranges.get('a.js'), [
      [1, 3],
      [11, 12],
    ]);
    assert.strictEqual(ranges.size, 1);
  });

  it('tracks multiple files independently', () => {
    const diff = [
      diffFor('first.js', ['@@ -1,2 +1,4 @@']),
      diffFor('second.js', ['@@ -30,5 +33,7 @@']),
    ].join('\n');
    const ranges = parseCommentableLineRanges(diff);
    assert.deepEqual(ranges.get('first.js'), [[1, 4]]);
    assert.deepEqual(ranges.get('second.js'), [[33, 39]]);
  });
});

describe('isPositionInDiff', () => {
  const ranges = parseCommentableLineRanges(
    diffFor('src/app.js', ['@@ -10,4 +12,6 @@']),
  );

  it('accepts a line inside a hunk range', () => {
    assert.strictEqual(isPositionInDiff(ranges, 'src/app.js', 12), true);
    assert.strictEqual(isPositionInDiff(ranges, 'src/app.js', 17), true);
  });

  it('rejects a line outside every hunk range', () => {
    assert.strictEqual(isPositionInDiff(ranges, 'src/app.js', 11), false);
    assert.strictEqual(isPositionInDiff(ranges, 'src/app.js', 18), false);
    assert.strictEqual(isPositionInDiff(ranges, 'src/app.js', 1), false);
  });

  it('rejects a file not present in the diff', () => {
    assert.strictEqual(isPositionInDiff(ranges, 'src/other.js', 12), false);
  });
});

describe('partitionFindingsForInline', () => {
  const ranges = parseCommentableLineRanges(
    diffFor('src/app.js', ['@@ -10,4 +12,6 @@']),
  );
  const mk = (over) => ({
    issueId: generateUlid(),
    severity: 'medium',
    title: 'finding',
    body: 'desc',
    file: 'src/app.js',
    line: 12,
    ...over,
  });

  it('splits anchorable / unanchored / unlocated', () => {
    const inDiff = mk({ title: 'in diff' });
    const outOfDiff = mk({ title: 'out of diff', line: 999 });
    const wrongFile = mk({ title: 'wrong file', file: 'src/other.js' });
    const noLine = mk({ title: 'no line', line: null });
    const noFile = mk({ title: 'no file', file: null, line: null });
    const { anchorable, unanchored, unlocated } = partitionFindingsForInline(
      [inDiff, outOfDiff, wrongFile, noLine, noFile],
      ranges,
    );
    assert.deepEqual(anchorable, [inDiff]);
    assert.deepEqual(unanchored, [outOfDiff, wrongFile]);
    assert.deepEqual(unlocated, [noLine, noFile]);
  });

  it('treats every located finding as anchorable when ranges is null (no diff)', () => {
    const outOfDiff = mk({ line: 999 });
    const noLine = mk({ line: null });
    const { anchorable, unanchored, unlocated } = partitionFindingsForInline(
      [outOfDiff, noLine],
      null,
    );
    assert.deepEqual(anchorable, [outOfDiff]);
    assert.deepEqual(unanchored, []);
    assert.deepEqual(unlocated, [noLine]);
  });
});

describe('formatReviewBody unanchored section', () => {
  const unanchored = [
    {
      issueId: generateUlid(),
      severity: 'medium',
      title: 'Unanchorable finding',
      body: 'The cited line is not in the diff.',
      file: 'src/app.js',
      line: 999,
    },
  ];

  it('appends the section with location and severity', () => {
    const body = formatReviewBody([], 'APPROVE', [], { unanchored });
    assert.match(body, /## Non-blocking findings \(no inline thread\)/);
    assert.match(body, /Unanchorable finding/);
    assert.match(body, /`src\/app\.js:999`/);
    assert.match(body, /_\(medium\)_/);
  });

  it('embeds no issue-id markers for unanchored findings', () => {
    const body = formatReviewBody([], 'APPROVE', [], { unanchored });
    assert.ok(!body.includes('<!-- issue-id:'));
  });

  it('unanchored titles are not tracked by parseTitlesFromReviewBody', () => {
    const blocking = [
      {
        issueId: generateUlid(),
        severity: 'high',
        title: 'Tracked blocking finding',
        body: 'desc',
        file: 'src/db.js',
        line: 42,
      },
    ];
    const body = formatReviewBody(blocking, 'REQUEST_CHANGES', [], {
      unanchored,
    });
    assert.deepEqual(parseTitlesFromReviewBody(body), [
      'Tracked blocking finding',
    ]);
  });

  it('omits the section when there are no unanchored findings', () => {
    const body = formatReviewBody([], 'APPROVE', [], { unanchored: [] });
    assert.ok(!body.includes('## Non-blocking findings'));
  });
});
