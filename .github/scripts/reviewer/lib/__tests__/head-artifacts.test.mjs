import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCitedPaths,
  isMissingArtifactFinding,
  filterStaleMissingArtifactFindings,
} from '../head-artifacts.mjs';

describe('isMissingArtifactFinding', () => {
  it('detects common "missing artifact" phrasings', () => {
    const cases = [
      'Missing tests for the Apple OAuth handler',
      'The handler file does not exist',
      'No corresponding unit test for this module',
      'This function lacks a test',
      'Please add a test for the new resolver',
      'apple-oauth.ts is untested',
    ];
    for (const title of cases) {
      assert.ok(
        isMissingArtifactFinding({ title, body: '' }),
        `should flag: ${title}`,
      );
    }
  });

  it('does not flag findings that argue about existing-file content', () => {
    const f = {
      title: 'Incorrect null check in login.ts',
      body: 'The guard at line 42 uses == instead of ===.',
    };
    assert.equal(isMissingArtifactFinding(f), false);
  });
});

describe('extractCitedPaths', () => {
  it('extracts backtick-quoted and bare paths, dropping URLs and scopes', () => {
    const f = {
      title: 'Missing test for `lambdas/auth/src/apple-oauth.ts`',
      body: 'Add lambdas/auth/src/apple-oauth.test.ts. See https://ex.com/a/b and @scope/pkg.',
    };
    const paths = extractCitedPaths(f);
    assert.ok(paths.includes('lambdas/auth/src/apple-oauth.ts'));
    assert.ok(paths.includes('lambdas/auth/src/apple-oauth.test.ts'));
    assert.ok(!paths.some((p) => p.includes('://')));
    assert.ok(!paths.some((p) => p.startsWith('@')));
  });
});

describe('filterStaleMissingArtifactFindings', () => {
  it('strips a missing-artifact finding whose cited path exists at HEAD', () => {
    const findings = [
      {
        severity: 'high',
        title: 'Missing tests for Apple OAuth handler',
        body: 'Add tests at `lambdas/auth/src/apple-oauth.test.ts`.',
      },
    ];
    const exists = (p) => p === 'lambdas/auth/src/apple-oauth.test.ts';
    const { kept, stripped } = filterStaleMissingArtifactFindings(
      findings,
      exists,
    );
    assert.equal(kept.length, 0);
    assert.equal(stripped.length, 1);
    assert.equal(stripped[0].strip_reason, 'artifact_exists_at_head');
  });

  it('keeps a missing-artifact finding when the cited path does NOT exist', () => {
    const findings = [
      {
        severity: 'high',
        title: 'Missing tests for handler',
        body: 'Add `lambdas/auth/src/apple-oauth.test.ts`.',
      },
    ];
    const { kept, stripped } = filterStaleMissingArtifactFindings(
      findings,
      () => false,
    );
    assert.equal(kept.length, 1);
    assert.equal(stripped.length, 0);
  });

  it('keeps a non-missing finding even if it cites an existing path', () => {
    const findings = [
      {
        severity: 'high',
        title: 'Wrong comparison operator in `src/login.ts`',
        body: 'Uses == instead of ===.',
      },
    ];
    const { kept, stripped } = filterStaleMissingArtifactFindings(
      findings,
      () => true,
    );
    assert.equal(kept.length, 1);
    assert.equal(stripped.length, 0);
  });

  it('keeps a missing finding that cites no concrete path', () => {
    const findings = [
      {
        severity: 'medium',
        title: 'Missing test coverage',
        body: 'Add tests.',
      },
    ];
    const { kept, stripped } = filterStaleMissingArtifactFindings(
      findings,
      () => true,
    );
    assert.equal(kept.length, 1);
    assert.equal(stripped.length, 0);
  });

  it('is resilient when the existence probe throws', () => {
    const findings = [
      { severity: 'high', title: 'Missing `a/b.ts`', body: 'add it' },
    ];
    const { kept, stripped } = filterStaleMissingArtifactFindings(
      findings,
      () => {
        throw new Error('fs boom');
      },
    );
    assert.equal(kept.length, 1);
    assert.equal(stripped.length, 0);
  });
});
