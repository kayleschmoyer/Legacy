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
// so callers can skip validation gracefully when offline.
async function fetchSchema(url) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Node.js Workflow Validator' },
      redirect: 'follow',
    });

    if (!response.ok) {
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
  'repository_ruleset', // added 2024-Q4 — https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#repository_ruleset
]);

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
    // Fetch schemas
    log('📥 Fetching JSON schemas...', 'cyan');
    const [workflowSchema, actionSchema] = await Promise.all([
      fetchSchema(WORKFLOW_SCHEMA_URL),
      fetchSchema(ACTION_SCHEMA_URL),
    ]);

    if (!workflowSchema || !actionSchema) {
      log(
        '\n⚠️  Schema fetch failed (network unavailable) — skipping workflow validation',
        'yellow',
      );
      process.exit(0);
    }

    const ajv = new Ajv({
      allErrors: true,
      strict: false,
      allowUnionTypes: true,
    });
    addFormats(ajv);

    // Find files
    const workflowFiles = glob.sync('.github/workflows/*.{yml,yaml}', {
      nodir: true,
    });
    const actionFiles = glob.sync('.github/actions/**/action.{yml,yaml}', {
      nodir: true,
    });

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

main();
