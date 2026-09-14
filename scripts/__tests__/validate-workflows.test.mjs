/**
 * Tests for the working-directory existence check in scripts/validate-workflows.js
 * (LS-4910).
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/validate-workflows.test.mjs
 *
 * The check is the line of defense added after LS-4909, where a step's
 * working-directory pointed at terraform/packer/ months after that directory
 * had been renamed to terraform/runners/packer/. The bug stayed latent because
 * actionlint validates schema, not paths.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const {
  collectWorkingDirectories,
  checkWorkingDirectoryPaths,
  isActionFile,
  isYamllintAvailable,
  runYamllintCheck,
  validateFile,
  loadSchema,
  WORKFLOW_SCHEMA_PATH,
  ACTION_SCHEMA_PATH,
  isYamllintRequired,
} = require(resolve(__dirname, '..', 'validate-workflows.js'));

const Ajv = require('ajv');
const addFormats = require('ajv-formats');

// js-yaml is a project dep used by the script under test.
const yaml = require('js-yaml');

function parseYaml(text) {
  return yaml.load(text);
}

test('collectWorkingDirectories extracts step-level working-directory', () => {
  const data = parseYaml(`
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Setup
        run: echo hi
      - name: Build AMI via Packer
        working-directory: terraform/packer
        run: packer build .
`);
  const entries = collectWorkingDirectories('file.yml', data);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].value, 'terraform/packer');
  assert.match(entries[0].location, /jobs\.build\.steps\[1\]/);
  assert.match(entries[0].location, /Build AMI via Packer/);
});

test('collectWorkingDirectories extracts job-level defaults.run.working-directory', () => {
  const data = parseYaml(`
jobs:
  plan:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: terraform/main
    steps:
      - run: terraform plan
`);
  const entries = collectWorkingDirectories('file.yml', data);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].value, 'terraform/main');
  assert.equal(entries[0].location, 'jobs.plan.defaults.run');
});

test('collectWorkingDirectories handles composite actions', () => {
  const data = parseYaml(`
runs:
  using: composite
  steps:
    - name: Composite step
      working-directory: tools/something
      shell: bash
      run: echo hi
`);
  const entries = collectWorkingDirectories('action.yml', data);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].value, 'tools/something');
});

test('checkWorkingDirectoryPaths fails when path does not exist (LS-4909 regression)', () => {
  // Build a temp repo containing only terraform/runners/packer (the post-rename
  // layout) and assert that a working-directory pointing at terraform/packer
  // (the pre-LS-4909 stale value) is flagged.
  const tmpRepo = mkdtempSync(join(tmpdir(), 'ls-4910-'));
  try {
    mkdirSync(join(tmpRepo, 'terraform', 'runners', 'packer'), {
      recursive: true,
    });

    const entries = [
      {
        file: 'fake-workflow.yml',
        location: 'jobs.build.steps[8] ("Build AMI via Packer")',
        value: 'terraform/packer',
      },
    ];

    const failures = checkWorkingDirectoryPaths(entries, tmpRepo);
    assert.equal(failures.length, 1);
    assert.equal(failures[0].value, 'terraform/packer');
    assert.match(failures[0].reason, /does not exist/);
  } finally {
    rmSync(tmpRepo, { recursive: true, force: true });
  }
});

test('checkWorkingDirectoryPaths passes when path exists (post-LS-4909 fix)', () => {
  const tmpRepo = mkdtempSync(join(tmpdir(), 'ls-4910-'));
  try {
    mkdirSync(join(tmpRepo, 'terraform', 'runners', 'packer'), {
      recursive: true,
    });

    const entries = [
      {
        file: 'fake-workflow.yml',
        location: 'jobs.build.steps[8]',
        value: 'terraform/runners/packer',
      },
    ];

    const failures = checkWorkingDirectoryPaths(entries, tmpRepo);
    assert.equal(failures.length, 0);
  } finally {
    rmSync(tmpRepo, { recursive: true, force: true });
  }
});

test('checkWorkingDirectoryPaths skips values containing ${{ ... }} expressions', () => {
  const tmpRepo = mkdtempSync(join(tmpdir(), 'ls-4910-'));
  try {
    const entries = [
      {
        file: 'fake.yml',
        location: 'jobs.x.steps[0]',
        value: '${{ inputs.dir }}/sub',
      },
    ];
    const failures = checkWorkingDirectoryPaths(entries, tmpRepo);
    assert.equal(failures.length, 0);
  } finally {
    rmSync(tmpRepo, { recursive: true, force: true });
  }
});

test('checkWorkingDirectoryPaths skips absolute paths', () => {
  const tmpRepo = mkdtempSync(join(tmpdir(), 'ls-4910-'));
  try {
    const absolute =
      process.platform === 'win32' ? 'C:\\runner\\work' : '/runner/work';
    const entries = [
      { file: 'fake.yml', location: 'jobs.x.steps[0]', value: absolute },
    ];
    const failures = checkWorkingDirectoryPaths(entries, tmpRepo);
    assert.equal(failures.length, 0);
  } finally {
    rmSync(tmpRepo, { recursive: true, force: true });
  }
});

test('checkWorkingDirectoryPaths flags paths that escape the repo root', () => {
  const tmpRepo = mkdtempSync(join(tmpdir(), 'ls-4910-'));
  try {
    const entries = [
      { file: 'fake.yml', location: 'jobs.x.steps[0]', value: '../outside' },
    ];
    const failures = checkWorkingDirectoryPaths(entries, tmpRepo);
    assert.equal(failures.length, 1);
    assert.match(failures[0].reason, /escapes repository root/);
  } finally {
    rmSync(tmpRepo, { recursive: true, force: true });
  }
});

// isActionFile (LS-8705): routes --file <path> to the correct schema.
test('isActionFile matches action.yml and action.yaml at any depth', () => {
  assert.equal(isActionFile('.github/actions/setup/action.yml'), true);
  assert.equal(isActionFile('.github/actions/setup/action.yaml'), true);
  assert.equal(isActionFile('action.yml'), true);
});

test('isActionFile rejects workflow files', () => {
  assert.equal(isActionFile('.github/workflows/ci.yml'), false);
  assert.equal(isActionFile('.github/workflows/action-runner.yml'), false);
});

// validateFile / workflow_call null-coercion (LS-9801): SchemaStore's
// github-workflow.json requires `on.workflow_call` to be `type: object`,
// with no `null` alternative — unlike most other event keys. A bare
// `workflow_call:` (no value) is valid, common GitHub Actions syntax and
// js-yaml parses it as `null`, which the schema then rejects as a
// false-positive "must match exactly one schema in oneOf".
function makeOnWorkflowCallSchema() {
  return {
    type: 'object',
    properties: {
      on: {
        type: 'object',
        properties: {
          workflow_call: { type: 'object' },
          pull_request: { type: ['object', 'null'] },
        },
        additionalProperties: false,
      },
    },
  };
}

function makeAjv() {
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
  });
  addFormats(ajv);
  return ajv;
}

test('validateFile normalizes a bare `workflow_call:` (null) to {} before validation (LS-9801)', async () => {
  const tmpRepo = mkdtempSync(join(tmpdir(), 'ls-9801-'));
  try {
    const filePath = join(tmpRepo, 'workflow.yml');
    writeFileSync(
      filePath,
      'on:\n  workflow_call:\n  pull_request:\n    branches: [main]\n',
    );

    const result = await validateFile(
      filePath,
      makeOnWorkflowCallSchema(),
      makeAjv(),
    );
    assert.equal(result, null, JSON.stringify(result?.errors));
  } finally {
    rmSync(tmpRepo, { recursive: true, force: true });
  }
});

test('validateFile still fails when workflow_call is a genuinely invalid type (e.g. a string)', async () => {
  const tmpRepo = mkdtempSync(join(tmpdir(), 'ls-9801-'));
  try {
    const filePath = join(tmpRepo, 'workflow.yml');
    writeFileSync(filePath, 'on:\n  workflow_call: "oops"\n');

    const result = await validateFile(
      filePath,
      makeOnWorkflowCallSchema(),
      makeAjv(),
    );
    assert.notEqual(result, null);
  } finally {
    rmSync(tmpRepo, { recursive: true, force: true });
  }
});

test('checkWorkingDirectoryPaths flags paths that exist but are files, not directories', () => {
  const tmpRepo = mkdtempSync(join(tmpdir(), 'ls-4910-'));
  try {
    writeFileSync(join(tmpRepo, 'a-file'), 'hi');
    const entries = [
      { file: 'fake.yml', location: 'jobs.x.steps[0]', value: 'a-file' },
    ];
    const failures = checkWorkingDirectoryPaths(entries, tmpRepo);
    assert.equal(failures.length, 1);
    assert.match(failures[0].reason, /not a directory/);
  } finally {
    rmSync(tmpRepo, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// yamllint pass (LS-9911)
//
// pc-workflows previously ran only the schema + working-directory checks
// above, while the actual pre-commit hook separately shelled out to
// `python -m yamllint`, which is stricter (e.g. the repo's 200-char
// line-length rule). That let `make pc` / `pc-workflows` report green on a
// diff the pre-commit hook would still block. These tests cover both the
// happy path and the missing-yamllint path.
//
// LS-10104: the missing-yamllint path used to return success everywhere,
// which made the check a silent no-op on CI runners (no yamllint installed).
// It now FAILS when required (CI / REQUIRE_YAMLLINT) and only stays non-fatal,
// with a loud banner, on a local dev box.
// ---------------------------------------------------------------------------

const MISSING = [['no-such-yamllint-binary-ls-10104']];

function withMissingYamllint(env) {
  const tmpRepo = mkdtempSync(join(tmpdir(), 'ls-10104-'));
  try {
    const filePath = join(tmpRepo, 'workflow.yml');
    writeFileSync(filePath, `${'x'.repeat(500)}\n`);
    return runYamllintCheck({
      workflowFiles: [filePath],
      actionFiles: [],
      repoRoot: tmpRepo,
      candidates: MISSING,
      env,
    });
  } finally {
    rmSync(tmpRepo, { recursive: true, force: true });
  }
}

test('isYamllintAvailable returns null when no candidate binary exists', () => {
  assert.equal(isYamllintAvailable(MISSING), null);
});

// LS-10104 regression: the npm `yaml-lint` devDependency ships a
// node_modules/.bin/yamllint that exits 0 on `--version` (printing a bare
// `1.7.0`) but only checks YAML parses. Under `pnpm run` it shadowed the real
// linter and the line-length test passed vacuously in CI. Simulated with
// `node -e` so the test needs no stub files and runs on every platform. The
// trailing `--` matters: isYamllintAvailable appends `--version`, which node
// would otherwise consume as its own flag and print node's version instead.
const fakeVersion = (text) => [
  process.execPath,
  '-e',
  `console.log(${JSON.stringify(text)})`,
  '--',
];

test('isYamllintAvailable rejects a runnable binary that is not Python yamllint', () => {
  assert.equal(isYamllintAvailable([fakeVersion('1.7.0')]), null);
});

test('isYamllintAvailable accepts a binary that identifies as Python yamllint', () => {
  const candidate = fakeVersion('yamllint 1.38.0');
  assert.deepEqual(isYamllintAvailable([candidate]), candidate);
});

test('isYamllintAvailable skips an impostor and falls through to the real yamllint', () => {
  const real = fakeVersion('yamllint 1.38.0');
  assert.deepEqual(isYamllintAvailable([fakeVersion('1.7.0'), real]), real);
});

// LS-10126 regression: the fallback above only proves that distinct
// *candidate entries* are tried in order. In production there is exactly one
// bare `yamllint` candidate, resolved via PATH lookup — so an impostor and a
// real yamllint sharing that name but sitting in different PATH directories
// (the actual `pnpm run` shape: node_modules/.bin/yamllint shadowing a
// `uv tool install`'d yamllint later on PATH) were never disambiguated at
// all; the first PATH hit won regardless of what it printed. Build a real
// two-directory PATH with an impostor first and a real yamllint second and
// confirm the bare-command candidate finds the real one.
test('isYamllintAvailable finds a same-named real yamllint later on PATH, past an impostor shadowing it first', () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'ls-10126-'));
  const impostorDir = join(tmpRoot, 'node_modules', '.bin');
  const realDir = join(tmpRoot, 'real-bin');
  mkdirSync(impostorDir, { recursive: true });
  mkdirSync(realDir, { recursive: true });

  const impostorPath = join(impostorDir, 'yamllint');
  const realPath = join(realDir, 'yamllint');
  writeFileSync(impostorPath, '#!/usr/bin/env node\nconsole.log("1.7.0");\n', {
    mode: 0o755,
  });
  writeFileSync(
    realPath,
    '#!/usr/bin/env node\nconsole.log("yamllint 1.38.0");\n',
    { mode: 0o755 },
  );

  const originalPath = process.env.PATH;
  try {
    // Keep the original PATH after our two directories so `#!/usr/bin/env
    // node` can still resolve node itself; neither fake script is named
    // anything the real PATH would already contain, so ordering still puts
    // our impostor first and our real fake second.
    process.env.PATH = [impostorDir, realDir, originalPath].join(
      process.platform === 'win32' ? ';' : ':',
    );
    assert.deepEqual(isYamllintAvailable([['yamllint']]), [realPath]);
  } finally {
    process.env.PATH = originalPath;
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('isYamllintRequired: CI or REQUIRE_YAMLLINT, ignoring falsy spellings', () => {
  assert.equal(isYamllintRequired({}), false);
  assert.equal(isYamllintRequired({ CI: 'true' }), true);
  assert.equal(isYamllintRequired({ CI: '1' }), true);
  assert.equal(isYamllintRequired({ CI: 'false' }), false);
  assert.equal(isYamllintRequired({ CI: '0' }), false);
  assert.equal(isYamllintRequired({ REQUIRE_YAMLLINT: '1' }), true);
});

test('runYamllintCheck FAILS when yamllint is missing in CI (no silent skip)', () => {
  assert.equal(withMissingYamllint({ CI: 'true' }), false);
});

test('runYamllintCheck FAILS when yamllint is missing and REQUIRE_YAMLLINT=1', () => {
  assert.equal(withMissingYamllint({ REQUIRE_YAMLLINT: '1' }), false);
});

test('runYamllintCheck is non-fatal when yamllint is missing on a local dev box', () => {
  assert.equal(withMissingYamllint({}), true);
});

test('runYamllintCheck returns true when there are no workflow/action files', () => {
  const ok = runYamllintCheck({
    workflowFiles: [],
    actionFiles: [],
    repoRoot: process.cwd(),
    candidates: MISSING,
    env: { CI: 'true' },
  });
  assert.equal(ok, true);
});

// The remaining tests require an actual yamllint installation and are
// skipped when one isn't present locally. CI installs yamllint before
// custom-checks, so they do run there.
const yamllintBinary = isYamllintAvailable();

// Each temp repo gets its own .yamllint.yml. Without one, yamllint walks up
// from the temp dir, finds no project config, and falls back to the ambient
// user config (~/.config/yamllint/config, XDG_CONFIG_HOME,
// YAMLLINT_CONFIG_FILE). If that config relaxed line-length, the violation
// test would pass vacuously. A project config outranks all of those.
function writeHermeticYamllintConfig(dir) {
  writeFileSync(
    join(dir, '.yamllint.yml'),
    'extends: default\nrules:\n  line-length:\n    max: 80\n',
  );
}

test(
  'runYamllintCheck passes on a clean file (requires yamllint)',
  { skip: !yamllintBinary },
  () => {
    const tmpRepo = mkdtempSync(join(tmpdir(), 'ls-9911-'));
    writeHermeticYamllintConfig(tmpRepo);
    try {
      const filePath = join(tmpRepo, 'workflow.yml');
      writeFileSync(filePath, 'on:\n  push:\n');

      const ok = runYamllintCheck({
        workflowFiles: [filePath],
        actionFiles: [],
        repoRoot: tmpRepo,
      });
      assert.equal(ok, true);
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true });
    }
  },
);

test(
  'runYamllintCheck fails on a line-length violation (requires yamllint)',
  { skip: !yamllintBinary },
  () => {
    const tmpRepo = mkdtempSync(join(tmpdir(), 'ls-9911-'));
    writeHermeticYamllintConfig(tmpRepo);
    try {
      const filePath = join(tmpRepo, 'workflow.yml');
      writeFileSync(
        filePath,
        `on:\n  push:\n# ${Array(60).fill('word').join(' ')}\n`,
      );

      const ok = runYamllintCheck({
        workflowFiles: [filePath],
        actionFiles: [],
        repoRoot: tmpRepo,
      });
      assert.equal(ok, false);
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true });
    }
  },
);

// ---------------------------------------------------------------------------
// Vendored schemas (LS-9797)
//
// The validator used to fetch github-workflow.json from SchemaStore live on
// every run. On 2026-09-01 upstream tightened `workflow_call` to reject a null
// value; every open PR went red at once with no repo diff to bisect. The
// schemas are now vendored under scripts/schemas/, so the check is a pure
// function of the repo contents.
//
// Note the division of labour with the LS-9801 tests above: those cover
// validateFile's null-coercion behaviour against a synthetic schema. These
// cover the vendored artefacts themselves — that they load offline, that they
// fail closed when absent, and that the real vendored schema genuinely encodes
// the tightened `workflow_call` rule the coercion exists to satisfy.
// ---------------------------------------------------------------------------

test('vendored workflow + action schemas load from disk without network', () => {
  const workflow = loadSchema(WORKFLOW_SCHEMA_PATH);
  const action = loadSchema(ACTION_SCHEMA_PATH);
  assert.ok(workflow.properties?.on, 'workflow schema describes `on`');
  assert.ok(action.properties?.runs, 'action schema describes `runs`');
});

test('loadSchema fails closed on a missing schema file', () => {
  // Deliberately the opposite of the old fetchSchema(), which returned null on
  // failure and let the caller skip validation entirely. A vendored schema that
  // has gone missing is our bug, not a transient outage.
  assert.throws(
    () => loadSchema(resolve(__dirname, 'no-such-schema.json')),
    /Missing vendored schema.*update-workflow-schemas/s,
  );
});

test('loadSchema fails closed on a corrupt schema file', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'ls-9797-'));
  try {
    const bad = join(tmp, 'github-workflow.json');
    writeFileSync(bad, '{ not json');
    assert.throws(
      () => loadSchema(bad),
      /Corrupt vendored schema.*update-workflow-schemas/s,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// The vendored schema must actually encode the tightened rule. Validated
// directly against AJV rather than through validateFile, which deliberately
// coerces null -> {} first (LS-9801) and would mask this.
test('vendored schema itself rejects a null `workflow_call` and accepts {}', () => {
  const schema = loadSchema(WORKFLOW_SCHEMA_PATH);
  const validate = makeAjv().compile(schema);

  assert.equal(
    validate({
      on: { workflow_call: {} },
      jobs: {
        noop: { 'runs-on': 'ubuntu-latest', steps: [{ run: 'echo hi' }] },
      },
    }),
    true,
    '`workflow_call: {}` should satisfy the vendored schema',
  );

  const validNull = validate({
    on: { workflow_call: null },
    jobs: { noop: { 'runs-on': 'ubuntu-latest', steps: [{ run: 'echo hi' }] } },
  });
  assert.equal(
    validNull,
    false,
    'a null `workflow_call` should fail the vendored schema',
  );
  assert.ok(
    validate.errors.some((e) => e.instancePath === '/on/workflow_call'),
    `expected an /on/workflow_call error, got ${JSON.stringify(validate.errors)}`,
  );
});

// End-to-end guard: every workflow in the repo validates against the vendored
// schema, so a regression fails this suite rather than waiting for CI.
test('every workflow in the repo validates against the vendored schema', async () => {
  const schema = loadSchema(WORKFLOW_SCHEMA_PATH);
  const ajv = makeAjv();
  const repoRoot = resolve(__dirname, '..', '..');
  const glob = require('glob');

  const files = glob.sync('.github/workflows/*.{yml,yaml}', {
    cwd: repoRoot,
    absolute: true,
    nodir: true,
  });
  assert.ok(files.length > 0, 'expected to find workflow files');

  const failures = [];
  for (const file of files) {
    const result = await validateFile(file, schema, ajv);
    if (result) failures.push(result.file);
  }
  assert.deepEqual(failures, [], 'workflows failed schema validation');
});
