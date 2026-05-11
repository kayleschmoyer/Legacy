import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { verifyReferencedPaths } from '../ref-verifier.mjs';

// Simulates a diff that changes a .md file referencing pre-existing repo paths
const MD_DIFF_WITH_REFS = `\
diff --git a/.agents/skills/dev-process/08-migration.md b/.agents/skills/dev-process/08-migration.md
index abc1234..def5678 100644
--- a/.agents/skills/dev-process/08-migration.md
+++ b/.agents/skills/dev-process/08-migration.md
@@ -10,4 +10,6 @@
 Some context here.
+Migration files are immutable once landed — enforced by the pre-commit hook at \`scripts/git-hooks/pre-commit\`.
+See also [CI workflow](.github/workflows/review.yml) for the review automation.
+And the [migration guide](docs/migrations/README.md) lives in docs.
 `;

// Diff that touches only TypeScript files — no .md files
const TS_ONLY_DIFF = `\
diff --git a/src/auth.ts b/src/auth.ts
index abc..def 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,3 +1,4 @@
+import jwt from 'jsonwebtoken';
 export function verify() {}
`;

// Diff with no path references in added lines
const MD_DIFF_NO_PATHS = `\
diff --git a/README.md b/README.md
index abc..def 100644
--- a/README.md
+++ b/README.md
@@ -1 +1,2 @@
+This is a plain text line with no file references.
`;

// Diff with URL references (should be excluded)
const MD_DIFF_WITH_URLS = `\
diff --git a/docs/intro.md b/docs/intro.md
index abc..def 100644
--- a/docs/intro.md
+++ b/docs/intro.md
@@ -1 +1,3 @@
+See \`https://example.com/path/to/page\` for more.
+Also [docs](https://github.com/owner/repo/blob/main/README.md).
`;

// Diff with package scope references (should be excluded)
const MD_DIFF_WITH_SCOPED_PKG = `\
diff --git a/docs/api.md b/docs/api.md
index abc..def 100644
--- a/docs/api.md
+++ b/docs/api.md
@@ -1 +1,2 @@
+Import from \`@legacy-sports/logging/src/logger\`.
`;

describe('verifyReferencedPaths — basic behaviour', () => {
  it('returns empty array for empty diff', () => {
    const result = verifyReferencedPaths('', 'main');
    assert.deepEqual(result, []);
  });

  it('returns empty array for non-string diff', () => {
    assert.deepEqual(verifyReferencedPaths(null, 'main'), []);
    assert.deepEqual(verifyReferencedPaths(undefined, 'main'), []);
  });

  it('returns empty array for missing baseRefName', () => {
    assert.deepEqual(verifyReferencedPaths('some diff', ''), []);
    assert.deepEqual(verifyReferencedPaths('some diff', null), []);
  });

  it('returns empty array when diff contains only .ts files', () => {
    const result = verifyReferencedPaths(TS_ONLY_DIFF, 'main', () => {
      throw new Error('should not call git for non-md diffs');
    });
    assert.deepEqual(result, []);
  });

  it('returns empty array when .md diff has no path references', () => {
    const result = verifyReferencedPaths(MD_DIFF_NO_PATHS, 'main', () => {
      throw new Error('should not call git for diffs without path references');
    });
    assert.deepEqual(result, []);
  });
});

describe('verifyReferencedPaths — path extraction', () => {
  it('extracts backtick-quoted paths and verifies against base branch', () => {
    const gitCalls = [];
    const fakeExec = (cmd, args) => {
      gitCalls.push(args.join(' '));
      // Simulate: scripts/git-hooks/pre-commit exists; others don't
      if (args[2] === 'origin/main:scripts/git-hooks/pre-commit') return;
      const err = new Error('not found');
      err.status = 128;
      throw err;
    };
    const result = verifyReferencedPaths(MD_DIFF_WITH_REFS, 'main', fakeExec);
    assert.ok(
      result.includes('scripts/git-hooks/pre-commit'),
      'should include verified backtick path',
    );
    assert.ok(
      gitCalls.some((c) =>
        c.includes('origin/main:scripts/git-hooks/pre-commit'),
      ),
      'should have called git cat-file for the backtick path',
    );
  });

  it('extracts markdown link hrefs and verifies them', () => {
    const fakeExec = (_cmd, args) => {
      if (args[2] === 'origin/main:.github/workflows/review.yml') return;
      throw new Error('not found');
    };
    const result = verifyReferencedPaths(MD_DIFF_WITH_REFS, 'main', fakeExec);
    assert.ok(
      result.includes('.github/workflows/review.yml'),
      'should include verified markdown link path',
    );
  });

  it('excludes URL-scheme references', () => {
    const gitCalls = [];
    const fakeExec = (_cmd, args) => {
      gitCalls.push(args[2]);
    };
    verifyReferencedPaths(MD_DIFF_WITH_URLS, 'main', fakeExec);
    assert.ok(
      gitCalls.every((a) => !a.includes('https:')),
      'should not call git for URL-scheme paths',
    );
  });

  it('excludes @scope/package references', () => {
    const gitCalls = [];
    const fakeExec = (_cmd, args) => {
      gitCalls.push(args[2]);
    };
    verifyReferencedPaths(MD_DIFF_WITH_SCOPED_PKG, 'main', fakeExec);
    assert.ok(
      gitCalls.every((a) => !a.includes('@legacy-sports')),
      'should not call git for scoped package paths',
    );
  });

  it('only includes paths that exist in base branch', () => {
    const fakeExec = (_cmd, args) => {
      // Only scripts/git-hooks/pre-commit exists
      if (args[2] === 'origin/main:scripts/git-hooks/pre-commit') return;
      const err = new Error('not found');
      throw err;
    };
    const result = verifyReferencedPaths(MD_DIFF_WITH_REFS, 'main', fakeExec);
    assert.ok(result.includes('scripts/git-hooks/pre-commit'));
    assert.ok(!result.includes('docs/migrations/README.md'));
  });

  it('uses the correct base ref format: origin/<baseRefName>', () => {
    const gitCalls = [];
    const fakeExec = (_cmd, args) => {
      gitCalls.push(args[2]);
    };
    verifyReferencedPaths(MD_DIFF_WITH_REFS, 'release/v2', fakeExec);
    assert.ok(
      gitCalls.some((a) => a.startsWith('origin/release/v2:')),
      'should use origin/<baseRefName> prefix',
    );
  });
});

describe('verifyReferencedPaths — resilience', () => {
  it('is non-fatal when git exits non-zero (path not found)', () => {
    const fakeExec = () => {
      const err = new Error('fatal: path not found');
      err.status = 128;
      throw err;
    };
    // Should not throw — returns empty array
    assert.doesNotThrow(() =>
      verifyReferencedPaths(MD_DIFF_WITH_REFS, 'main', fakeExec),
    );
    const result = verifyReferencedPaths(MD_DIFF_WITH_REFS, 'main', fakeExec);
    assert.deepEqual(result, []);
  });

  it('does not duplicate paths that appear multiple times in the diff', () => {
    const duplicateDiff = `\
diff --git a/docs/intro.md b/docs/intro.md
index abc..def 100644
--- a/docs/intro.md
+++ b/docs/intro.md
@@ -1 +1,3 @@
+See \`scripts/git-hooks/pre-commit\` here.
+And again: \`scripts/git-hooks/pre-commit\`.
`;
    const fakeExec = () => {
      /* exists */
    };
    const result = verifyReferencedPaths(duplicateDiff, 'main', fakeExec);
    const count = result.filter(
      (p) => p === 'scripts/git-hooks/pre-commit',
    ).length;
    assert.equal(count, 1, 'each path should appear at most once');
  });
});
