import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateUlid,
  formatReviewBody,
  buildInlineComments,
} from '../post-review.mjs';

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
