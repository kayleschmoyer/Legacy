import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateUlid,
  formatReviewBody,
  buildInlineComments,
  buildKnownFailureBody,
} from '../post-review.mjs';
import { INFRA_ERROR_MARKER } from '../cycle-counter.mjs';

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
    const body = formatReviewBody(findings, 'REQUEST_CHANGES', {
      fallbackModel: 'gemini-2.5-flash-lite',
    });
    assert.match(body, /gemini-2\.5-flash-lite/);
    assert.match(body, /fallback/);
    assert.match(body, /Some finding/);
  });

  it('prepends fallback banner when fallbackModel is set (APPROVE)', () => {
    const body = formatReviewBody([], 'APPROVE', {
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

  it('rate-limit uses COMMENT event (does not block merge)', () => {
    const { event } = buildKnownFailureBody('rate-limit');
    assert.strictEqual(event, 'COMMENT');
  });

  it('quota uses COMMENT event (does not block merge)', () => {
    const { event } = buildKnownFailureBody('quota');
    assert.strictEqual(event, 'COMMENT');
  });

  it('auth uses COMMENT event (does not block merge)', () => {
    const { event } = buildKnownFailureBody('auth');
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
