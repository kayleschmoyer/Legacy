#!/usr/bin/env node
/**
 * Validate GitHub Actions workflow files using JSON schemas
 * This replicates VS Code's YAML validation for CI/CLI usage
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const glob = require('glob');
const yaml = require('js-yaml');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

// Terminal colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Vendored SchemaStore schemas (LS-9797).
//
// These are checked into the repo rather than fetched at run time. The
// validator previously fetched https://json.schemastore.org/github-workflow.json
// live on EVERY run, which made this check a function of a third party's
// current HEAD rather than of the repo's contents. On 2026-09-01 SchemaStore
// tightened `workflow_call` to reject a null value and every open PR went red
// at once — including diffs touching nothing but markdown — with no repo
// change to bisect and nothing to roll back.
//
// With the schemas vendored, an upstream change arrives the way any other
// breaking change does: as a reviewable, revertable commit. Refresh them with
// `make update-workflow-schemas` (scripts/update-workflow-schemas.js), which
// also has a `--check` mode for asking, on demand, whether upstream moved.
const SCHEMA_DIR = path.join(__dirname, 'schemas');
const WORKFLOW_SCHEMA_PATH = path.join(SCHEMA_DIR, 'github-workflow.json');
const ACTION_SCHEMA_PATH = path.join(SCHEMA_DIR, 'github-action.json');

// Load a vendored schema from disk.
//
// This fails CLOSED, unlike the network fetch it replaces: a missing or corrupt
// vendored schema is a repo problem we control and must fix, not a transient
// outage to shrug off. The old fail-open behaviour meant a SchemaStore blip
// silently downgraded CI to "no workflow validation ran" while still reporting
// green — observed in practice while writing this change.
function loadSchema(schemaPath) {
  const rel = path.relative(process.cwd(), schemaPath);
  let raw;
  try {
    raw = fs.readFileSync(schemaPath, 'utf8');
  } catch (error) {
    throw new Error(
      `Missing vendored schema ${rel} (${error.code || error.message}). ` +
        'Run `make update-workflow-schemas` to restore it.',
    );
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Corrupt vendored schema ${rel}: ${error.message}. ` +
        'Run `make update-workflow-schemas` to restore it.',
    );
  }
}

// GitHub Actions events that are valid at runtime but not yet present in the
// SchemaStore github-workflow.json schema. Strip them from the `on` object
// before AJV validation to avoid false positives. Update this list as the
// upstream schema catches up.
const KNOWN_VALID_EVENTS_NOT_IN_SCHEMA = new Set([
  // No entries currently — repository_ruleset was removed; it is NOT a valid
  // GitHub Actions workflow trigger (GitHub returns "Unexpected value" at parse time).
]);

// Extract every working-directory value declared in a workflow or composite
// action file, along with enough context to point a developer at the offending
// step. Returns an array of { file, location, value }.
//
// Sources scanned:
//   - workflow: jobs.<id>.defaults.run.working-directory
//   - workflow: jobs.<id>.steps[N].working-directory
//   - composite action: runs.steps[N].working-directory
function collectWorkingDirectories(filePath, data) {
  const found = [];
  if (!data || typeof data !== 'object') return found;

  const pushStep = (location, step) => {
    if (!step || typeof step !== 'object') return;
    if (typeof step['working-directory'] === 'string') {
      found.push({
        file: filePath,
        location,
        value: step['working-directory'],
      });
    }
  };

  // Workflow file: jobs.<id>.{defaults.run.working-directory, steps[].working-directory}
  if (data.jobs && typeof data.jobs === 'object') {
    for (const [jobId, job] of Object.entries(data.jobs)) {
      if (!job || typeof job !== 'object') continue;
      const defaultWd = job.defaults?.run?.['working-directory'];
      if (typeof defaultWd === 'string') {
        found.push({
          file: filePath,
          location: `jobs.${jobId}.defaults.run`,
          value: defaultWd,
        });
      }
      if (Array.isArray(job.steps)) {
        job.steps.forEach((step, i) => {
          const label = step?.name ? `"${step.name}"` : `index ${i}`;
          pushStep(`jobs.${jobId}.steps[${i}] (${label})`, step);
        });
      }
    }
  }

  // Composite action: runs.steps[].working-directory
  if (data.runs?.using === 'composite' && Array.isArray(data.runs.steps)) {
    data.runs.steps.forEach((step, i) => {
      const label = step?.name ? `"${step.name}"` : `index ${i}`;
      pushStep(`runs.steps[${i}] (${label})`, step);
    });
  }

  return found;
}

// Check that every working-directory value resolves to a real path in the repo.
// Skips values containing GitHub expression interpolation (${{ ... }}) and any
// absolute paths (which are valid on the runner but cannot be verified against
// the repo tree). Returns an array of { file, location, value, reason }.
function checkWorkingDirectoryPaths(entries, repoRoot) {
  const failures = [];
  for (const entry of entries) {
    const { value } = entry;
    if (value.includes('${{')) continue; // Dynamic — cannot verify statically.
    if (path.isAbsolute(value)) continue; // Resolved on runner, not in repo.

    const absolute = path.resolve(repoRoot, value);
    // Ensure the path stays inside the repo. A working-directory that escapes
    // the checkout (e.g. ../../etc) is almost certainly a bug, so flag it.
    const relative = path.relative(repoRoot, absolute);
    if (relative.startsWith('..')) {
      failures.push({
        ...entry,
        reason: `escapes repository root (resolves to ${absolute})`,
      });
      continue;
    }

    if (!fs.existsSync(absolute)) {
      failures.push({
        ...entry,
        reason: `directory does not exist (resolved to ${path.relative(repoRoot, absolute) || '.'})`,
      });
      continue;
    }

    const stat = fs.statSync(absolute);
    if (!stat.isDirectory()) {
      failures.push({
        ...entry,
        reason: `path exists but is not a directory`,
      });
    }
  }
  return failures;
}

// Run the working-directory existence check across every workflow and action
// file. Returns true if all paths resolve, false otherwise (and prints errors).
function runWorkingDirectoryCheck({ workflowFiles, actionFiles, repoRoot }) {
  log('\n🔍 Checking working-directory paths exist...', 'cyan');

  const entries = [];
  for (const file of [...workflowFiles, ...actionFiles]) {
    try {
      const data = yaml.load(fs.readFileSync(file, 'utf8'));
      entries.push(...collectWorkingDirectories(file, data));
    } catch {
      // YAML parse errors are surfaced by the schema validator; skip here.
    }
  }

  const failures = checkWorkingDirectoryPaths(entries, repoRoot);
  if (failures.length === 0) {
    log(
      `✓ All ${entries.length} working-directory value(s) point to existing paths`,
      'green',
    );
    return true;
  }

  log(`\n❌ ${failures.length} working-directory path(s) failed:`, 'red');
  for (const f of failures) {
    log(`\n  ${path.relative(repoRoot, f.file)}`, 'red');
    log(`    at ${f.location}`, 'yellow');
    log(`    working-directory: ${f.value}`, 'yellow');
    log(`    ${f.reason}`, 'red');
  }
  return false;
}

// Run the same yamllint pass the pre-commit hook (scripts/git-hooks/pre-commit)
// runs on staged files, but across every workflow/action file so this check
// catches the same violations before commit time (LS-9911).
//
// Before this, `pc-workflows` only ran the JSON-schema + working-directory
// checks above, while the actual pre-commit hook separately shelled out to
// `python -m yamllint`, which is stricter (e.g. .yamllint.yml's 200-char
// line-length rule isn't checked by anything in this file). That gap let
// `make pc` / `pc-workflows` report green on a diff the pre-commit hook would
// still block — a validation-gate inconsistency the two checks should not
// have.
//
// Degrades gracefully (a warning, not a failure) when python/yamllint isn't
// on PATH, since that's an environment gap rather than a workflow-file
// problem — mirrors the fail-open posture used elsewhere in this file only
// for genuinely external dependencies, not for the repo's own vendored state.
function isYamllintAvailable(pythonCandidates = ['python3', 'python']) {
  for (const python of pythonCandidates) {
    const result = spawnSync(python, ['-m', 'yamllint', '--version']);
    if (!result.error && result.status === 0) {
      return python;
    }
  }
  return null;
}

function runYamllintCheck({
  workflowFiles,
  actionFiles,
  repoRoot,
  pythonCandidates,
}) {
  log('\n🔍 Running yamllint...', 'cyan');

  const python = isYamllintAvailable(pythonCandidates);
  if (!python) {
    log(
      '⚠️  yamllint not available (no `python`/`python3` with the `yamllint` ' +
        'module found on PATH) — SKIPPING this check. Install it with ' +
        '`pip install yamllint` to catch these violations here instead of at ' +
        'commit time.',
      'yellow',
    );
    return true;
  }

  const files = [...workflowFiles, ...actionFiles];
  if (files.length === 0) {
    log('✓ No workflow/action files to lint', 'green');
    return true;
  }

  const result = spawnSync(python, ['-m', 'yamllint', ...files], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if (result.error) {
    log(
      `⚠️  Failed to invoke yamllint (${result.error.message}) — SKIPPING this check.`,
      'yellow',
    );
    return true;
  }

  if (result.status === 0) {
    log(`✓ yamllint passed for ${files.length} file(s)`, 'green');
    return true;
  }

  log('\n❌ yamllint found violation(s):', 'red');
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
  console.log(output.trim());
  return false;
}

// Validate a single YAML file
async function validateFile(filePath, schema, ajv) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = yaml.load(content);

    // Remove events that are valid in GitHub Actions but missing from the
    // SchemaStore schema so they don't generate false-positive failures.
    // Only applies when `on` is a plain mapping object — array form
    // (e.g. `on: [push, pull_request]`) never contains the new events
    // and must not be converted to an object.
    if (
      data &&
      typeof data.on === 'object' &&
      data.on !== null &&
      !Array.isArray(data.on)
    ) {
      const stripped = Object.fromEntries(
        Object.entries(data.on).filter(
          ([key]) => !KNOWN_VALID_EVENTS_NOT_IN_SCHEMA.has(key),
        ),
      );
      data.on = stripped;

      // GitHub Actions treats a bare `workflow_call:` (no value, parsed by
      // js-yaml as `null`) as a valid trigger with no declared inputs —
      // this is common, valid syntax (e.g. `on: { workflow_call:,
      // pull_request: ... }`). The SchemaStore schema's `workflow_call`
      // property requires `type: object` with no `null` alternative (unlike
      // most other event keys, which explicitly allow `null`), so AJV
      // rejects it with a false-positive "must be object" / "must match
      // exactly one schema in oneOf" (LS-9801). Normalize null to an empty
      // object before validation — semantically identical, and satisfies
      // the schema's stricter type requirement.
      if (data.on.workflow_call === null) {
        data.on.workflow_call = {};
      }
    }

    const validate = ajv.compile(schema);
    const valid = validate(data);

    if (!valid) {
      return {
        file: filePath,
        errors: validate.errors,
      };
    }

    return null;
  } catch (error) {
    return {
      file: filePath,
      errors: [{ message: `YAML parsing error: ${error.message}` }],
    };
  }
}

// Format error messages for display
function formatErrors(results) {
  results.forEach(({ file, errors }) => {
    log(`\n❌ ${path.relative(process.cwd(), file)}`, 'red');
    errors.forEach((err) => {
      if (err.instancePath) {
        log(`   Path: ${err.instancePath}`, 'yellow');
      }
      log(`   ${err.message || 'Validation error'}`, 'red');
      if (err.params) {
        log(`   Details: ${JSON.stringify(err.params)}`, 'yellow');
      }
    });
  });
}

// Lightweight single-file mode (LS-8705): parse + schema-check one workflow
// or action file, skipping the full-repo glob, the working-directory check,
// and the second (irrelevant) schema load. Intended for iterative editing,
// where re-running the full validator after every keystroke is too slow.
function isActionFile(filePath) {
  return /(^|[/\\])action\.ya?ml$/.test(filePath);
}

async function validateSingleFile(filePath) {
  log(`🔍 Validating ${filePath}...`, 'cyan');

  if (!fs.existsSync(filePath)) {
    log(`\n❌ File not found: ${filePath}`, 'red');
    process.exit(1);
  }

  // --file runs outside main()'s try/catch, so surface a load failure as a
  // one-line error rather than an unhandled rejection stack.
  let schema;
  try {
    schema = loadSchema(
      isActionFile(filePath) ? ACTION_SCHEMA_PATH : WORKFLOW_SCHEMA_PATH,
    );
  } catch (error) {
    log(
      `
❌ ${error.message}`,
      'red',
    );
    process.exit(1);
  }

  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
  });
  addFormats(ajv);

  const result = await validateFile(filePath, schema, ajv);
  if (result) {
    formatErrors([result]);
    log(`\n❌ ${filePath} failed validation`, 'red');
    process.exit(1);
  }

  log(`✓ ${filePath} is valid`, 'green');
  process.exit(0);
}

async function main() {
  const fileArgIndex = process.argv.indexOf('--file');
  if (fileArgIndex !== -1) {
    const filePath = process.argv[fileArgIndex + 1];
    if (!filePath) {
      log('\n❌ --file requires a path argument', 'red');
      process.exit(1);
    }
    await validateSingleFile(filePath);
    return;
  }

  log('🔍 Validating GitHub Actions workflows...', 'cyan');

  try {
    const workflowFiles = glob.sync('.github/workflows/*.{yml,yaml}', {
      nodir: true,
    });
    const actionFiles = glob.sync('.github/actions/**/action.{yml,yaml}', {
      nodir: true,
    });
    const repoRoot = process.cwd();

    // working-directory existence check (LS-4910): catches references to
    // directories that don't exist in the repo (e.g. renamed without updating
    // the workflow). Runs independently of the schema validation.
    const wdOk = runWorkingDirectoryCheck({
      workflowFiles,
      actionFiles,
      repoRoot,
    });

    // yamllint pass (LS-9911): same check the pre-commit hook runs, so this
    // validator and the hook can't disagree on green/red.
    const yamllintOk = runYamllintCheck({
      workflowFiles,
      actionFiles,
      repoRoot,
    });

    // Load the vendored schemas from disk. No network involved, so this check
    // is now a pure function of the repo contents — it cannot change verdict
    // without a diff, and it cannot silently skip itself when a host is down.
    log('\n📖 Loading vendored JSON schemas...', 'cyan');
    const workflowSchema = loadSchema(WORKFLOW_SCHEMA_PATH);
    const actionSchema = loadSchema(ACTION_SCHEMA_PATH);

    const ajv = new Ajv({
      allErrors: true,
      strict: false,
      allowUnionTypes: true,
    });
    addFormats(ajv);

    log(
      `\n📝 Found ${workflowFiles.length} workflows and ${actionFiles.length} actions\n`,
      'cyan',
    );

    const failures = [];

    // Validate workflow files
    for (const file of workflowFiles) {
      const result = await validateFile(file, workflowSchema, ajv);
      if (result) failures.push(result);
      else log(`✓ ${path.relative(process.cwd(), file)}`, 'green');
    }

    // Validate action files
    for (const file of actionFiles) {
      const result = await validateFile(file, actionSchema, ajv);
      if (result) failures.push(result);
      else log(`✓ ${path.relative(process.cwd(), file)}`, 'green');
    }

    // Results
    if (failures.length > 0) {
      formatErrors(failures);
      log(`\n❌ ${failures.length} file(s) failed validation`, 'red');
      process.exit(1);
    } else if (!wdOk || !yamllintOk) {
      // Schema validation passed but another check failed.
      process.exit(1);
    } else {
      log(`\n✅ All workflow files are valid!`, 'green');
      process.exit(0);
    }
  } catch (error) {
    log(`\n❌ Validation failed: ${error.message}`, 'red');
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Allow the helpers to be required from unit tests without executing main().
module.exports = {
  collectWorkingDirectories,
  loadSchema,
  validateFile,
  WORKFLOW_SCHEMA_PATH,
  ACTION_SCHEMA_PATH,
  checkWorkingDirectoryPaths,
  isActionFile,
  isYamllintAvailable,
  runYamllintCheck,
};

if (require.main === module) {
  main();
}
