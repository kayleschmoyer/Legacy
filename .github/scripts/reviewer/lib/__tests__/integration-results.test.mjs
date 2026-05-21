import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractIntegrationResults,
  formatIntegrationResultsSection,
} from '../integration-results.mjs';

describe('extractIntegrationResults', () => {
  it('returns an empty list when no comments contain blocks', () => {
    const out = extractIntegrationResults([
      { id: 1, body: 'Looks good!' },
      { id: 2, body: '## Heading\n\nbody text' },
    ]);
    assert.deepEqual(out, []);
  });

  it('parses a well-formed block with spec, status, duration, report', () => {
    const out = extractIntegrationResults([
      {
        id: 10,
        body:
          '## Integration Test Results\n\n<integration-results>\n' +
          'spec: apps/web-e2e/src/integration/tests/foo.integration.spec.ts\n' +
          'status: passed\n' +
          'duration_ms: 12345\n' +
          'report: https://example.test/r/1\n' +
          '</integration-results>',
      },
    ]);
    assert.deepEqual(out, [
      {
        spec: 'apps/web-e2e/src/integration/tests/foo.integration.spec.ts',
        status: 'passed',
        durationMs: 12345,
        report: 'https://example.test/r/1',
        commentId: 10,
      },
    ]);
  });

  it('parses multiple blocks from a single comment body', () => {
    const out = extractIntegrationResults([
      {
        id: 11,
        body: [
          '<integration-results>',
          'spec: apps/web-e2e/src/integration/tests/a.integration.spec.ts',
          'status: passed',
          'duration_ms: 1000',
          '</integration-results>',
          '',
          '<integration-results>',
          'spec: apps/web-e2e/src/integration/tests/b.integration.spec.ts',
          'status: failed',
          'duration_ms: 2000',
          '</integration-results>',
        ].join('\n'),
      },
    ]);
    assert.equal(out.length, 2);
    assert.equal(out[0].spec.endsWith('a.integration.spec.ts'), true);
    assert.equal(out[1].status, 'failed');
  });

  it('skips blocks missing the required spec or status field', () => {
    const out = extractIntegrationResults([
      {
        id: 12,
        body:
          '<integration-results>\n' +
          'status: passed\n' +
          'duration_ms: 100\n' +
          '</integration-results>',
      },
      {
        id: 13,
        body:
          '<integration-results>\n' +
          'spec: apps/web-e2e/src/integration/tests/x.integration.spec.ts\n' +
          'duration_ms: 100\n' +
          '</integration-results>',
      },
    ]);
    assert.deepEqual(out, []);
  });

  it('lower-cases status and tolerates absent duration / report', () => {
    const out = extractIntegrationResults([
      {
        id: 14,
        body:
          '<integration-results>\n' +
          'spec: apps/web-e2e/src/integration/tests/x.integration.spec.ts\n' +
          'status: PASSED\n' +
          '</integration-results>',
      },
    ]);
    assert.deepEqual(out, [
      {
        spec: 'apps/web-e2e/src/integration/tests/x.integration.spec.ts',
        status: 'passed',
        durationMs: null,
        report: null,
        commentId: 14,
      },
    ]);
  });

  it('keeps only the most recent result per spec across comments', () => {
    const comments = [
      {
        id: 20,
        body: '<integration-results>\nspec: apps/web-e2e/src/integration/tests/x.integration.spec.ts\nstatus: failed\nduration_ms: 100\n</integration-results>',
      },
      {
        id: 21,
        body: '<integration-results>\nspec: apps/web-e2e/src/integration/tests/x.integration.spec.ts\nstatus: passed\nduration_ms: 200\n</integration-results>',
      },
    ];
    const out = extractIntegrationResults(comments);
    assert.equal(out.length, 1);
    assert.equal(out[0].status, 'passed');
    assert.equal(out[0].commentId, 21);
  });

  it('ignores unparseable duration_ms and treats it as null', () => {
    const out = extractIntegrationResults([
      {
        id: 30,
        body: '<integration-results>\nspec: apps/web-e2e/src/integration/tests/x.integration.spec.ts\nstatus: passed\nduration_ms: not-a-number\n</integration-results>',
      },
    ]);
    assert.equal(out[0].durationMs, null);
  });
});

describe('formatIntegrationResultsSection', () => {
  it('returns an empty string when there are no results', () => {
    assert.equal(formatIntegrationResultsSection([]), '');
  });

  it('emits a section with safety markers and the do-not-flag directive', () => {
    const section = formatIntegrationResultsSection([
      {
        spec: 'apps/web-e2e/src/integration/tests/foo.integration.spec.ts',
        status: 'passed',
        durationMs: 123,
        report: 'https://example.test/r/1',
        commentId: 1,
      },
    ]);
    assert.match(section, /BEGIN INTEGRATION RESULTS/);
    assert.match(section, /END INTEGRATION RESULTS/);
    assert.match(section, /## Integration Test Results/);
    assert.match(section, /status: passed/);
    assert.match(section, /duration_ms: 123/);
    assert.match(section, /report: https:\/\/example\.test\/r\/1/);
    assert.match(
      section,
      /do NOT flag a "missing Playwright evidence" finding/,
    );
  });

  it('omits absent duration / report fields from the bullet line', () => {
    const section = formatIntegrationResultsSection([
      {
        spec: 'apps/web-e2e/src/integration/tests/x.integration.spec.ts',
        status: 'failed',
        durationMs: null,
        report: null,
        commentId: 2,
      },
    ]);
    assert.match(section, /status: failed/);
    assert.equal(/duration_ms:/.test(section), false);
    assert.equal(/report:/.test(section), false);
  });
});
