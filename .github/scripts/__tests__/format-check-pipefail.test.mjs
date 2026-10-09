/**
 * Regression test for the CI `format` job pipefail bug (LS-8207).
 *
 * The Format Check step in .github/workflows/ci-pipeline.yml filters the PR
 * diff down to files that actually exist on disk (partial-clone `tree:0`
 * checkouts may not materialise every blob) before handing them to prettier:
 *
 *   git diff ... -z | (while read ...; do [ -f "$f" ] && printf ...; done) | xargs ... prettier
 *
 * Under `set -o pipefail` the pipeline takes the rightmost non-zero exit. The
 * filter subshell's exit status is that of its LAST command — the final
 * `[ -f "$f" ]` test. When the alphabetically-last diffed path is missing on
 * disk, that test returns 1, which pipefail propagates, failing the whole job
 * even though prettier (the rightmost stage) already succeeded. The fix
 * terminates the subshell with `; true` so its exit status is always 0; real
 * prettier failures still surface because they come from the xargs stage.
 *
 * Run via: node --test .github/scripts/__tests__/format-check-pipefail.test.mjs
 * (wired into CI as a custom check by .github/checks/format-check-pipefail-tests.sh)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const WORKFLOW = join(here, '..', '..', 'workflows', 'ci-pipeline.yml');

// The existence-filter subshell exactly as it appears in the Format Check step.
// `present` exists on disk; `absent` (which sorts last) does not, reproducing a
// partial-clone diff whose final entry was never materialised.
const FILTER = `(while IFS= read -r -d '' f; do [ -f "$f" ] && printf '%s\\0' "$f"; done; true)`;
const BUGGY_FILTER = `(while IFS= read -r -d '' f; do [ -f "$f" ] && printf '%s\\0' "$f"; done)`;

// LS-8511: `present` used to be a temp file written moments before the bash
// subprocess `[ -f ]`-tested it, which raced intermittently under CI load
// (fresh writes aren't guaranteed visible to a just-forked child on every
// runner/filesystem). Pointing `present` at this already-loaded test file
// removes the race entirely — it's been on disk since long before the
// pipeline runs. `absent` still lives in a throwaway dir so its directory
// exists but the path itself never does, preserving the partial-clone fidelity.
const PRESENT = fileURLToPath(import.meta.url);

function shQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

// LS-10350: msys/Git-for-Windows `xargs` aborts at startup (exit 134,
// `assertion "bc_ctl.arg_max >= LINE_MAX" failed`) when the inherited
// environment is large enough to eat its ARG_MAX headroom — which it is inside
// the full `test:github-scripts` run. The pipeline needs nothing from the
// environment beyond locating bash/xargs and a temp dir, so run it with only
// those variables instead of inheriting the caller's.
const PIPELINE_ENV = Object.fromEntries(
  ['PATH', 'TMP', 'TEMP', 'SYSTEMROOT']
    .filter((name) => process.env[name] !== undefined)
    .map((name) => [name, process.env[name]]),
);
const XARGS_ARG_MAX_ABORT = /bc_ctl\.arg_max >= LINE_MAX/;

function runPipeline({ filter, downstream }) {
  const dir = mkdtempSync(join(tmpdir(), 'ls8207-'));
  try {
    const absent = join(dir, 'absent');
    const script = `
      set -o pipefail
      printf '%s\\0%s\\0' ${shQuote(PRESENT)} ${shQuote(absent)} \\
        | ${filter} \\
        | xargs -0 -r ${downstream}
    `;
    const result = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      env: PIPELINE_ENV,
    });
    // A spawn failure (e.g. bash missing from PATH, status null) must never
    // satisfy a `notEqual(status, 0)` assertion without the pipeline running.
    assert.ifError(result.error);
    // An xargs startup abort says nothing about the filter under test. Fail
    // loudly rather than let it satisfy the `notEqual(status, 0)` assertions.
    assert.doesNotMatch(
      result.stderr ?? '',
      XARGS_ARG_MAX_ABORT,
      'xargs aborted on the msys ARG_MAX assertion — the pipeline never ran (LS-10350)',
    );
    return result;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('format-check pipefail safety net (LS-8207)', () => {
  it('demonstrates the bug: the unguarded filter exits non-zero when the last diffed file is missing', () => {
    // Documents the regression — `prettier` (here: `true`) succeeds, yet the
    // pipeline still fails because the subshell ends on a failed `[ -f ]` test.
    const result = runPipeline({ filter: BUGGY_FILTER, downstream: 'true' });
    assert.notEqual(result.status, 0);
  });

  it('AC1: the guarded filter exits 0 when prettier succeeds and the last diffed file is missing', () => {
    const result = runPipeline({ filter: FILTER, downstream: 'true' });
    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}\n${result.stderr}`,
    );
  });

  it('AC2: a real downstream (prettier) failure still propagates through the guarded filter', () => {
    // `false` stands in for prettier finding a genuine formatting error; the
    // `; true` guard must not mask it — the pipeline must still fail.
    const result = runPipeline({ filter: FILTER, downstream: 'false' });
    assert.notEqual(result.status, 0);
  });

  it('AC3: the workflow Format Check step contains the guarded filter and preserves the existence test', () => {
    const yaml = readFileSync(WORKFLOW, 'utf8');
    // The fix is present: filter subshell terminates with `; true`.
    assert.match(
      yaml,
      /\[ -f "\$f" \] && printf '%s\\0' "\$f"; done; true\)/,
      'Format Check existence-filter subshell must end with `; true` (LS-8207 fix)',
    );
    // The partial-clone safety net is intact: missing blobs are still skipped.
    assert.match(
      yaml,
      /\[ -f "\$f" \] && printf '%s\\0' "\$f"/,
      'Format Check must still skip diff entries whose blobs were not materialised (AC2)',
    );
  });
});
