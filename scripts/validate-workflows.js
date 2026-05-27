#!/usr/bin/env node
/**
 * Validate GitHub Actions workflow files using JSON schemas
 * This replicates VS Code's YAML validation for CI/CLI usage
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const yaml = require('js-yaml');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

// Schema URLs (same as VS Code config)
const WORKFLOW_SCHEMA_URL = 'https://json.schemastore.org/github-workflow.json';
const ACTION_SCHEMA_URL = 'https://json.schemastore.org/github-action.json';

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

// Fetch JSON schema from URL (handles redirects). Returns null on network errors
// or server-side 5xx responses so callers can skip validation gracefully when
// the schema host is offline or temporarily unavailable.
async function fetchSchema(url) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Node.js Workflow Validator' },
      redirect: 'follow',
    });

    // Treat 5xx (server-side transient errors) the same as network failures —
    // skip validation rather than blocking the workflow on an unavailable schema host.
    if (!response.ok) {
      if (response.status >= 500) {
        return null;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    // Distinguish network-level failures (no connectivity) from HTTP errors.
    // TypeError covers "fetch failed" / ENOTFOUND / ETIMEDOUT etc.
    if (error instanceof TypeError || error.cause) {
      return null;
    }
    throw new Error(`Failed to fetch schema from ${url}: ${error.message}`);
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

async function main() {
  log('🔍 Validating GitHub Actions workflows...', 'cyan');

  try {
    // Find files first so the working-directory check can run even when the
    // SchemaStore host is unreachable.
    const workflowFiles = glob.sync('.github/workflows/*.{yml,yaml}', {
      nodir: true,
    });
    const actionFiles = glob.sync('.github/actions/**/action.{yml,yaml}', {
      nodir: true,
    });
    const repoRoot = process.cwd();

    // working-directory existence check (LS-4910): catches references to
    // directories that don't exist in the repo (e.g. renamed without updating
    // the workflow). Runs independently of the schema validation so it still
    // gates `make pc` when offline.
    const wdOk = runWorkingDirectoryCheck({
      workflowFiles,
      actionFiles,
      repoRoot,
    });

    // Fetch schemas
    log('\n📥 Fetching JSON schemas...', 'cyan');
    const [workflowSchema, actionSchema] = await Promise.all([
      fetchSchema(WORKFLOW_SCHEMA_URL),
      fetchSchema(ACTION_SCHEMA_URL),
    ]);

    if (!workflowSchema || !actionSchema) {
      log(
        '\n⚠️  Schema fetch failed (network or server error) — skipping workflow validation',
        'yellow',
      );
      // Still honour the working-directory check result.
      process.exit(wdOk ? 0 : 1);
    }

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
    } else if (!wdOk) {
      // Schema validation passed but working-directory check failed.
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
  checkWorkingDirectoryPaths,
};

if (require.main === module) {
  main();
}
