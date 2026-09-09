/**
 * Unit tests for the "Retry release creation" step in build-android-app.yml
 * and build-ios-app.yml (LS-9913).
 *
 * LS-9907 found that `softprops/action-gh-release` classifies *any* 403 as a
 * permanent permission error and refuses to retry, losing a release whenever
 * a GitHub App installation throttle (not an actual permission problem)
 * returns a transient 403. That fix ported a `gh api` retry loop into
 * deploy-web.yml's create-release job; this ticket ports the identical
 * pattern into build-android-app.yml and build-ios-app.yml.
 *
 * Neither workflow's release path is reachable from a PR (it only runs on
 * push to main / manual dispatch), so this cannot be exercised via a live
 * workflow dispatch. Instead this suite extracts the retry step's shell
 * script verbatim out of the parsed workflow YAML (the same "run:" block
 * body GitHub Actions would execute) and runs it against a stubbed `gh` on
 * PATH, covering all three branches:
 *  - immediate success: `gh release view` already finds the release (the
 *    duplicate-prevention check), so no `gh api` POST is made.
 *  - retry-then-success: the first attempt fails, the second succeeds.
 *  - exhaustion: all 3 attempts fail — the script must still `exit 1` so the
 *    job (and everything gated on `needs.create-release.result`) reports
 *    failure rather than silently going green over a lost release.
 *
 * A fake `sleep` is also put on PATH so the 30/60/90s backoff doesn't slow
 * the test suite down.
 *
 * Run via: node --test .github/scripts/__tests__/release-retry-script.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync,
  mkdtempSync,
  writeFileSync,
  chmodSync,
  rmSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

/**
 * Extracts the literal shell script inside a named step's `run: |` block from
 * a workflow YAML file, given only the step name. Deliberately a line-based
 * extraction rather than a full YAML parse (consistent with
 * workflow-call-permissions.mjs's rationale: GitHub Actions `${{ }}`
 * expressions inside block scalars round-trip fine through a YAML load, but a
 * targeted line scan needs no new parsing dependency for a single block).
 *
 * @param {string} workflowPath absolute path to the workflow YAML file
 * @param {string} stepName the step's `name:` value, verbatim
 * @returns {string} the dedented body of the step's `run:` block scalar
 */
function extractStepRunScript(workflowPath, stepName) {
  const lines = readFileSync(workflowPath, 'utf8').split('\n');

  const stepLineIndex = lines.findIndex((line) =>
    line.trim().startsWith(`- name: ${stepName}`),
  );
  assert.notEqual(
    stepLineIndex,
    -1,
    `step "${stepName}" not found in ${workflowPath}`,
  );
  const stepIndent = lines[stepLineIndex].match(/^(\s*)- name:/)[1].length;

  // The step block runs until the next step at the same "- " indentation, or
  // a line at or below that indentation that isn't blank.
  let stepEndIndex = lines.length;
  for (let i = stepLineIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const indent = line.match(/^(\s*)/)[1].length;
    if (indent <= stepIndent) {
      stepEndIndex = i;
      break;
    }
  }

  const runLineIndex = lines.findIndex(
    (line, i) =>
      i > stepLineIndex && i < stepEndIndex && /^\s*run:\s*\|-?\s*$/.test(line),
  );
  assert.notEqual(
    runLineIndex,
    -1,
    `no "run: |" block found in step "${stepName}"`,
  );
  const runIndent = lines[runLineIndex].match(/^(\s*)run:/)[1].length;

  const scriptLines = [];
  for (let i = runLineIndex + 1; i < stepEndIndex; i += 1) {
    const line = lines[i];
    if (line.trim() === '') {
      scriptLines.push('');
      continue;
    }
    const indent = line.match(/^(\s*)/)[1].length;
    if (indent <= runIndent) break;
    scriptLines.push(line.slice(runIndent + 2));
  }

  assert.ok(scriptLines.length > 0, `empty "run:" block in step "${stepName}"`);
  return scriptLines.join('\n');
}

/**
 * Builds a stub `gh` on PATH whose behavior is driven entirely by env vars,
 * plus a fake `sleep` that skips the real 30/60/90s backoff. `gh release
 * view` increments a shared iteration counter (it runs exactly once per loop
 * iteration in the real script); `gh api ... POST` reads that counter without
 * incrementing it.
 *
 * @param {{ viewSucceedsAtIteration: number, postSucceedsAtIteration: number }} opts
 *   0 means "never succeeds" for either.
 * @returns {{ binDir: string, iterationFile: string, cleanup: () => void }}
 */
function makeStubGh({ viewSucceedsAtIteration, postSucceedsAtIteration }) {
  const binDir = mkdtempSync(path.join(tmpdir(), 'gh-stub-'));
  const iterationFile = path.join(binDir, 'iteration.txt');
  writeFileSync(iterationFile, '0');

  writeFileSync(path.join(binDir, 'sleep'), '#!/usr/bin/env bash\nexit 0\n');
  chmodSync(path.join(binDir, 'sleep'), 0o755);

  const stubUrl = 'https://github.example/legacy-sports/releases/tag/stub';
  writeFileSync(
    path.join(binDir, 'gh'),
    `#!/usr/bin/env bash
set -euo pipefail
ITERATION_FILE="${iterationFile}"

if [ "\${1:-}" = "release" ] && [ "\${2:-}" = "view" ]; then
  iteration=$(( $(cat "\${ITERATION_FILE}") + 1 ))
  echo "\${iteration}" > "\${ITERATION_FILE}"
  if [ "${viewSucceedsAtIteration}" != "0" ] && [ "\${iteration}" -ge "${viewSucceedsAtIteration}" ]; then
    echo "${stubUrl}"
    exit 0
  fi
  exit 1
elif [ "\${1:-}" = "api" ]; then
  iteration=$(cat "\${ITERATION_FILE}")
  if [ "${postSucceedsAtIteration}" != "0" ] && [ "\${iteration}" -ge "${postSucceedsAtIteration}" ]; then
    echo "${stubUrl}"
    exit 0
  fi
  exit 1
fi

echo "unexpected gh invocation: $*" >&2
exit 1
`,
  );
  chmodSync(path.join(binDir, 'gh'), 0o755);

  return {
    binDir,
    stubUrl,
    cleanup: () => rmSync(binDir, { recursive: true, force: true }),
  };
}

/**
 * Runs an extracted retry script against a stubbed `gh`/`sleep` on PATH.
 *
 * @returns {{ status: number, stdout: string, stderr: string, outputFileContents: string }}
 */
function runRetryScript(
  script,
  { viewSucceedsAtIteration, postSucceedsAtIteration },
  extraEnv = {},
) {
  const stub = makeStubGh({ viewSucceedsAtIteration, postSucceedsAtIteration });
  const workDir = mkdtempSync(path.join(tmpdir(), 'release-retry-run-'));
  const githubOutput = path.join(workDir, 'github_output');
  writeFileSync(githubOutput, '');
  writeFileSync(
    path.join(workDir, 'release-body.md'),
    '## stub release body\n',
  );

  const scriptPath = path.join(workDir, 'retry.sh');
  writeFileSync(scriptPath, script);
  chmodSync(scriptPath, 0o755);

  let status = 0;
  let stdout = '';
  let stderr = '';
  try {
    stdout = execFileSync('bash', [scriptPath], {
      env: {
        ...extraEnv,
        PATH: `${stub.binDir}:${process.env.PATH}`,
        RUNNER_TEMP: workDir,
        GITHUB_OUTPUT: githubOutput,
        GITHUB_REPOSITORY: 'bkrupa/legacy-sports',
        GITHUB_SHA: 'deadbeefcafef00dfacade1234567890abcdef0',
        GH_TOKEN: 'stub-token',
      },
      encoding: 'utf8',
    });
  } catch (err) {
    status = err.status ?? 1;
    stdout = err.stdout ?? '';
    stderr = err.stderr ?? '';
  } finally {
    stub.cleanup();
  }

  const outputFileContents = readFileSync(githubOutput, 'utf8');
  rmSync(workDir, { recursive: true, force: true });
  return { status, stdout, stderr, outputFileContents, stubUrl: stub.stubUrl };
}

const WORKFLOWS = [
  {
    label: 'build-android-app.yml',
    file: path.join(REPO_ROOT, '.github/workflows/build-android-app.yml'),
    env: {
      TAG: 'android-v1.2.3-45',
      TITLE: 'Android Release v1.2.3 (abc1234)',
      BUILD_TYPE: 'release',
    },
  },
  {
    label: 'build-ios-app.yml',
    file: path.join(REPO_ROOT, '.github/workflows/build-ios-app.yml'),
    env: {
      TAG: 'ios-v1.2.3-45',
      TITLE: 'iOS IPA v1.2.3 (abc1234)',
    },
  },
];

for (const workflow of WORKFLOWS) {
  describe(`${workflow.label} — Retry release creation`, () => {
    const script = extractStepRunScript(
      workflow.file,
      'Retry release creation',
    );

    it('extracted script is non-empty and loops 3 attempts', () => {
      assert.match(script, /for attempt in 1 2 3/);
      assert.match(script, /gh release view/);
      assert.match(script, /gh api/);
    });

    it('immediate success: gh release view finds it on the first check, no POST needed', () => {
      const result = runRetryScript(
        script,
        { viewSucceedsAtIteration: 1, postSucceedsAtIteration: 0 },
        workflow.env,
      );
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.outputFileContents, /^url=https:\/\//m);
      assert.doesNotMatch(result.stdout, /retry 2\/3|retry 3\/3/);
    });

    it('retry-then-success: first attempt fails, second attempt succeeds', () => {
      const result = runRetryScript(
        script,
        { viewSucceedsAtIteration: 0, postSucceedsAtIteration: 2 },
        workflow.env,
      );
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.outputFileContents, /^url=https:\/\//m);
      assert.match(result.stdout, /retry 1\/3.*failed/s);
      assert.match(result.stdout, /Created release .* on retry 2/);
    });

    it('exhaustion: all 3 attempts fail, exits 1 and never reports success', () => {
      const result = runRetryScript(
        script,
        { viewSucceedsAtIteration: 0, postSucceedsAtIteration: 0 },
        workflow.env,
      );
      assert.equal(result.status, 1);
      assert.equal(result.outputFileContents, '');
      assert.match(result.stdout, /Could not create GitHub release/);
      assert.match(result.stdout, /gh release create/);
    });
  });
}
