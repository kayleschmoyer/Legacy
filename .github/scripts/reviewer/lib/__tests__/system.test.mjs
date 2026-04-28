import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildUserPrompt } from '../prompts/system.mjs';

const BASE_CTX = {
  title: 'Add authentication middleware',
  body: 'Implements JWT verification for all API routes.',
  headRefName: 'feat/auth',
  baseRefName: 'main',
  diff: 'diff --git a/src/auth.ts b/src/auth.ts\n+import jwt from "jsonwebtoken";',
};

describe('buildUserPrompt — baseline (no author responses)', () => {
  it('includes PR title, branch, description, and diff', () => {
    const result = buildUserPrompt(BASE_CTX);
    assert.ok(result.includes('Add authentication middleware'));
    assert.ok(result.includes('feat/auth'));
    assert.ok(result.includes('main'));
    assert.ok(result.includes('Implements JWT verification'));
    assert.ok(result.includes('import jwt from "jsonwebtoken"'));
  });

  it('omits Author Responses section when authorResponsesSection is empty string', () => {
    const result = buildUserPrompt(BASE_CTX, '');
    assert.ok(!result.includes('## Author Responses'));
  });

  it('omits Author Responses section when authorResponsesSection is not provided', () => {
    const result = buildUserPrompt(BASE_CTX);
    assert.ok(!result.includes('## Author Responses'));
  });
});

describe('buildUserPrompt — with author responses (Cycle 2+)', () => {
  const authorSection =
    '## Author Responses\n\n**SQL injection finding**: JUSTIFY: All inputs are sanitised upstream.';

  it('includes the author responses section between the diff and the review instruction', () => {
    const result = buildUserPrompt(BASE_CTX, authorSection);
    assert.ok(
      result.includes('## Author Responses'),
      'should include author responses header',
    );
    assert.ok(
      result.includes('JUSTIFY: All inputs are sanitised upstream.'),
      'should include rationale',
    );
  });

  it('positions author responses after the diff block and before the review instruction', () => {
    const result = buildUserPrompt(BASE_CTX, authorSection);
    const diffEnd = result.indexOf('```\n\n##');
    const authorStart = result.indexOf('## Author Responses');
    const reviewInstStart = result.indexOf('Review this pull request');
    assert.ok(diffEnd !== -1, 'diff end marker must exist');
    assert.ok(authorStart > diffEnd, 'author section must appear after diff');
    assert.ok(
      reviewInstStart > authorStart,
      'review instruction must appear after author section',
    );
  });

  it('preserves JSON output instructions unchanged', () => {
    const result = buildUserPrompt(BASE_CTX, authorSection);
    assert.ok(
      result.includes('{"findings":[]}'),
      'should still include empty-findings example',
    );
    assert.ok(
      result.includes('"severity"'),
      'should still include format instructions',
    );
  });
});
