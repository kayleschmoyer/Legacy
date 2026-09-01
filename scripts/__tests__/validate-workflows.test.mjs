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
  validateFile,
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
