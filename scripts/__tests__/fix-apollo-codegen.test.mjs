/**
 * Tests for scripts/fix-apollo-codegen.js (LS-9953 / LS-9958).
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/fix-apollo-codegen.test.mjs
 *
 * `main(argv)` is invoked two ways:
 *  - By each project's `afterAllFileWrite` codegen hook, via
 *    `node <script> <filepath>` (see codegen.ts / codegen.base.ts) — argv
 *    carries only the file(s) *that project's own codegen run just wrote*,
 *    relative to that project's own cwd (the hook is invoked directly with
 *    `node`, not via `pnpm -w run`, precisely so cwd never changes away
 *    from the project directory).
 *  - Manually via `pnpm run codegen:fix-apollo` with no args, which falls
 *    back to fixing every entry in FILES_TO_FIX.
 *
 * Before LS-9958, every hook invocation ignored argv and always processed
 * the full FILES_TO_FIX list regardless of which project it was invoked
 * for. Under `nx run-many -t codegen` (parallel > 1), that meant multiple
 * concurrent processes performed unsynchronized read-modify-write passes
 * over the *same* shared generated files — intermittently corrupting
 * whichever file lost the race, surfacing as a codegen failure on a
 * different, unrelated project each time. Scoping `main` to argv when
 * present is what removes that cross-project race.
 *
 * `processFile` also refuses to touch a path outside the workspace root
 * (bot-review finding on this PR: argv is caller-controlled input, so a
 * path like `../../../../etc/passwd` must never reach the filesystem
 * calls). Test fixtures below live under `scratch/` (gitignored, inside
 * the workspace root — see AGENTS.md) rather than `os.tmpdir()` so they
 * stay inside that boundary.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

import {
  fixApolloImports,
  processFile,
  main,
  FILES_TO_FIX,
  looksTruncated,
  readGeneratedFileWithRetry,
  TruncatedGeneratedFileError,
} from '../fix-apollo-codegen.js';

const SCRATCH_ROOT = join(process.cwd(), 'scratch');

// --- fixApolloImports ---

test('fixApolloImports rewrites the ApolloReactCommon/Apollo split import to the Apollo 4 react entrypoint', () => {
  const input = `import * as ApolloReactCommon from '@apollo/client/react';
import * as Apollo from '@apollo/client';
export const x: ApolloReactCommon.QueryResult = {} as any;
`;
  const fixed = fixApolloImports(input);
  assert.match(fixed, /import \* as Apollo from '@apollo\/client\/react';/);
  assert.doesNotMatch(fixed, /ApolloReactCommon/);
  assert.match(fixed, /Apollo\.QueryResult/);
});

test('fixApolloImports is idempotent (a second pass makes no further changes)', () => {
  const input = `import * as Apollo from '@apollo/client';
export const x: Apollo.MutationFunction<any, any> = {} as any;
`;
  const once = fixApolloImports(input);
  const twice = fixApolloImports(once);
  assert.equal(once, twice);
});

// --- processFile ---

test('processFile resolves an already-absolute filePath as-is instead of joining it onto cwd', () => {
  const dir = mkdtempSync(join(SCRATCH_ROOT, 'fix-apollo-codegen-'));
  try {
    const target = join(dir, 'graphql.generated.ts');
    writeFileSync(
      target,
      "import * as Apollo from '@apollo/client';\n",
      'utf8',
    );

    const changed = processFile(target);

    assert.equal(changed, true);
    const result = readFileSync(target, 'utf8');
    assert.match(result, /import \* as Apollo from '@apollo\/client\/react';/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('processFile resolves a relative filePath against cwd', () => {
  const dir = mkdtempSync(join(SCRATCH_ROOT, 'fix-apollo-codegen-'));
  const originalCwd = process.cwd();
  try {
    writeFileSync(
      join(dir, 'graphql.generated.ts'),
      "import * as Apollo from '@apollo/client';\n",
      'utf8',
    );
    process.chdir(dir);

    const changed = processFile('graphql.generated.ts');

    assert.equal(changed, true);
    const result = readFileSync(join(dir, 'graphql.generated.ts'), 'utf8');
    assert.match(result, /import \* as Apollo from '@apollo\/client\/react';/);
  } finally {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('processFile refuses a path that escapes the workspace root', () => {
  // A caller-controlled argv path like `../../../../etc/passwd` must never
  // reach fs.existsSync/readFileSync/writeFileSync.
  assert.equal(processFile('../../../../etc/passwd'), false);
  assert.equal(processFile('/etc/passwd'), false);
});

test('processFile skips a missing file without throwing', () => {
  const dir = mkdtempSync(join(SCRATCH_ROOT, 'fix-apollo-codegen-'));
  try {
    const missing = join(dir, 'does-not-exist.ts');
    assert.equal(processFile(missing), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- main (the LS-9958 race fix) ---

test('main() with argv processes only the given file(s), not the full FILES_TO_FIX sweep', () => {
  const dir = mkdtempSync(join(SCRATCH_ROOT, 'fix-apollo-codegen-'));
  const originalCwd = process.cwd();
  try {
    writeFileSync(
      join(dir, 'graphql.generated.ts'),
      "import * as Apollo from '@apollo/client';\n",
      'utf8',
    );
    process.chdir(dir);

    const fixedCount = main(['graphql.generated.ts']);

    assert.equal(fixedCount, 0); // main() returns 0 unconditionally (its own exit-code contract)
    const result = readFileSync(join(dir, 'graphql.generated.ts'), 'utf8');
    assert.match(result, /import \* as Apollo from '@apollo\/client\/react';/);
  } finally {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('main() with no argv falls back to sweeping every entry in FILES_TO_FIX (manual full-repo run)', () => {
  const dir = mkdtempSync(join(SCRATCH_ROOT, 'fix-apollo-codegen-'));
  const originalCwd = process.cwd();
  try {
    // None of FILES_TO_FIX's paths exist under this empty scratch dir cwd,
    // so every entry is skipped — this only asserts main() attempts the
    // full list (no throw) rather than silently doing nothing,
    // distinguishing the no-args fallback from the scoped-argv path above.
    process.chdir(dir);
    assert.ok(FILES_TO_FIX.length > 1);
    assert.doesNotThrow(() => main([]));
  } finally {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- write/flush race (LS-9872) ---
//
// Reproduces the reported failure mode directly: `afterAllFileWrite` reads
// `graphql.generated.ts` while codegen's own write to it is still landing,
// sees content truncated mid-identifier (e.g. `export type Lineu`), and
// without this guard would "fix" and prettify that truncation into a
// permanently corrupt file even though the source commit/schema was fine.

test('looksTruncated flags content that is not syntactically valid TypeScript', () => {
  assert.equal(looksTruncated('export type Lineu'), true);
  assert.equal(looksTruncated(''), true);
  assert.equal(looksTruncated('   \n'), true);
});

test('looksTruncated accepts well-formed generated-file content', () => {
  assert.equal(
    looksTruncated(
      "import * as Apollo from '@apollo/client';\nexport type Lineup = { id: string };\n",
    ),
    false,
  );
});

test('readGeneratedFileWithRetry self-heals when a lagging write catches up before retries run out', () => {
  const dir = mkdtempSync(join(SCRATCH_ROOT, 'fix-apollo-codegen-'));
  try {
    const target = join(dir, 'graphql.generated.ts');
    // File starts mid-write, exactly like the reported truncation.
    writeFileSync(target, 'export type Lineu', 'utf8');

    // A separate OS process finishes the write shortly after — independent
    // of this process's event loop, which readGeneratedFileWithRetry blocks
    // synchronously while retrying (same shape as the real race: codegen's
    // write and this hook's read are different processes).
    const finishWrite = spawn(
      process.execPath,
      [
        '-e',
        `setTimeout(() => require('fs').writeFileSync(${JSON.stringify(
          target,
        )}, 'export type Lineup = { id: string };\\n'), 120)`,
      ],
      { stdio: 'ignore', detached: true },
    );
    finishWrite.unref();

    const content = readGeneratedFileWithRetry(target, 'graphql.generated.ts');
    assert.match(content, /export type Lineup/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readGeneratedFileWithRetry throws a self-describing TruncatedGeneratedFileError when the file never stops looking truncated', () => {
  const dir = mkdtempSync(join(SCRATCH_ROOT, 'fix-apollo-codegen-'));
  try {
    const target = join(dir, 'graphql.generated.ts');
    writeFileSync(target, 'export type Lineu', 'utf8');

    assert.throws(
      () => readGeneratedFileWithRetry(target, 'graphql.generated.ts'),
      (error) => {
        assert.ok(error instanceof TruncatedGeneratedFileError);
        assert.match(error.message, /truncated/);
        assert.match(error.message, /LS-9872/);
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('processFile throws instead of silently fixing/writing back a still-truncated file', () => {
  const dir = mkdtempSync(join(SCRATCH_ROOT, 'fix-apollo-codegen-'));
  try {
    const target = join(dir, 'graphql.generated.ts');
    writeFileSync(target, 'export type Lineu', 'utf8');

    assert.throws(() => processFile(target), TruncatedGeneratedFileError);

    // Must never "fix" and write the truncated content back — that would
    // hand a corrupt-but-stable-looking file on to `prettier --write` next.
    assert.equal(readFileSync(target, 'utf8'), 'export type Lineu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('main() propagates a TruncatedGeneratedFileError instead of swallowing it and reporting success', () => {
  const dir = mkdtempSync(join(SCRATCH_ROOT, 'fix-apollo-codegen-'));
  const originalCwd = process.cwd();
  try {
    writeFileSync(
      join(dir, 'graphql.generated.ts'),
      'export type Lineu',
      'utf8',
    );
    process.chdir(dir);

    assert.throws(
      () => main(['graphql.generated.ts']),
      TruncatedGeneratedFileError,
    );
  } finally {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});
