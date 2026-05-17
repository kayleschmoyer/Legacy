/**
 * Unit tests for is-docs-only.mjs (LS-4478).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { isDocsOnly, parseChangedFiles } from '../is-docs-only.mjs';

describe('isDocsOnly', () => {
  it('returns true for a single docs/ file', () => {
    assert.equal(
      isDocsOnly(['docs/architecture/league-state-machine.md']),
      true,
    );
  });

  it('returns true for multiple files under docs/', () => {
    assert.equal(
      isDocsOnly(['docs/a.md', 'docs/sub/b.svg', 'docs/c.txt']),
      true,
    );
  });

  it('returns true for top-level markdown files', () => {
    assert.equal(isDocsOnly(['README.md', 'CHANGELOG.md']), true);
  });

  it('returns true for nested markdown files outside docs/', () => {
    assert.equal(isDocsOnly(['apps/web/README.md', 'lib/foo/NOTES.md']), true);
  });

  it('returns true for a mix of docs/ and *.md', () => {
    assert.equal(
      isDocsOnly(['docs/guide.md', 'apps/web/README.md', 'docs/img.png']),
      true,
    );
  });

  it('returns false when any source file is changed', () => {
    assert.equal(isDocsOnly(['docs/a.md', 'apps/web/src/main.ts']), false);
  });

  it('returns false for a lockfile change', () => {
    assert.equal(isDocsOnly(['pnpm-lock.yaml']), false);
  });

  it('returns false for workflow / CI changes', () => {
    assert.equal(isDocsOnly(['.github/workflows/ci-pipeline.yml']), false);
  });

  it('returns false for an empty file list', () => {
    assert.equal(isDocsOnly([]), false);
  });

  it('returns false for a non-array input', () => {
    assert.equal(isDocsOnly(null), false);
    assert.equal(isDocsOnly(undefined), false);
    assert.equal(isDocsOnly('docs/a.md'), false);
  });

  it('ignores blank/whitespace entries by treating them as non-docs', () => {
    assert.equal(isDocsOnly(['docs/a.md', '   ']), false);
  });

  it('does not treat .markdown or .mdx as markdown', () => {
    // Intentional: keep the allowlist tight to avoid silently widening
    // the skip surface. README.mdx must run normal CI.
    assert.equal(isDocsOnly(['README.mdx']), false);
    assert.equal(isDocsOnly(['notes.markdown']), false);
  });

  it('does not match a file whose name contains docs/ mid-path', () => {
    assert.equal(isDocsOnly(['apps/web/src/docs/page.tsx']), false);
  });
});

describe('parseChangedFiles', () => {
  it('splits LF-separated output', () => {
    assert.deepEqual(parseChangedFiles('docs/a.md\nREADME.md\n'), [
      'docs/a.md',
      'README.md',
    ]);
  });

  it('handles CRLF line endings', () => {
    assert.deepEqual(parseChangedFiles('docs/a.md\r\nREADME.md\r\n'), [
      'docs/a.md',
      'README.md',
    ]);
  });

  it('deduplicates repeated paths (e.g. rename old+new)', () => {
    assert.deepEqual(parseChangedFiles('docs/a.md\ndocs/a.md\n'), [
      'docs/a.md',
    ]);
  });

  it('drops blank lines', () => {
    assert.deepEqual(parseChangedFiles('docs/a.md\n\n\nREADME.md\n'), [
      'docs/a.md',
      'README.md',
    ]);
  });

  it('returns empty array for empty or non-string input', () => {
    assert.deepEqual(parseChangedFiles(''), []);
    assert.deepEqual(parseChangedFiles(null), []);
    assert.deepEqual(parseChangedFiles(undefined), []);
  });
});
