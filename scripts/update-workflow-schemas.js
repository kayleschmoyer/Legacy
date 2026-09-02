#!/usr/bin/env node
/**
 * Refresh the vendored SchemaStore JSON schemas used by
 * scripts/validate-workflows.js (LS-9797).
 *
 * Why these schemas are vendored
 * ------------------------------
 * validate-workflows.js used to fetch github-workflow.json from SchemaStore on
 * EVERY run, which made `custom-checks` a function of a third party's current
 * HEAD rather than of the repo's contents. On 2026-09-01 SchemaStore tightened
 * `workflow_call` to reject a null value; every open PR went red simultaneously
 * -- including diffs touching nothing but markdown -- with no repo change to
 * bisect and no way to roll back.
 *
 * Vendoring makes an upstream schema change arrive the same way any other
 * breaking change does: as a reviewable, revertable, bisectable commit.
 *
 * Usage
 * -----
 *   node scripts/update-workflow-schemas.js            # fetch + write (make update-workflow-schemas)
 *   node scripts/update-workflow-schemas.js --check    # report drift, write nothing (exit 1 if drifted)
 *
 * `--check` is deliberately NOT wired into CI. Wiring it in would recreate the
 * exact failure mode this change exists to remove: upstream edits their file,
 * our CI goes red with no diff of ours. Run it by hand when you want to know.
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_DIR = path.join(__dirname, 'schemas');

const SCHEMAS = [
  {
    url: 'https://json.schemastore.org/github-workflow.json',
    file: 'github-workflow.json',
    describes: '.github/workflows/*.yml',
  },
  {
    url: 'https://json.schemastore.org/github-action.json',
    file: 'github-action.json',
    describes: '.github/actions/**/action.yml',
  },
];

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

// Fetch the schema as raw text. We persist bytes verbatim rather than
// re-serialising the parsed object so that `--check` compares against exactly
// what upstream serves, and so a future diff shows upstream's real formatting
// change rather than noise from our own JSON.stringify.
async function fetchSchemaText(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Node.js Workflow Validator' },
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const text = await response.text();
  // Parse to validate it really is JSON before we overwrite a known-good copy.
  JSON.parse(text);
  return text;
}

async function main() {
  const checkOnly = process.argv.includes('--check');

  log(
    checkOnly
      ? '🔍 Checking vendored workflow schemas against SchemaStore...'
      : '📥 Refreshing vendored workflow schemas from SchemaStore...',
    'cyan',
  );

  fs.mkdirSync(SCHEMA_DIR, { recursive: true });

  let drifted = 0;
  let written = 0;

  for (const { url, file } of SCHEMAS) {
    const target = path.join(SCHEMA_DIR, file);

    let upstream;
    try {
      upstream = await fetchSchemaText(url);
    } catch (error) {
      log(`\n❌ Failed to fetch ${url}`, 'red');
      log(`   ${error.message}`, 'red');
      process.exit(1);
    }

    const current = fs.existsSync(target)
      ? fs.readFileSync(target, 'utf8')
      : null;

    if (current === upstream) {
      log(`✓ ${path.relative(process.cwd(), target)} is up to date`, 'green');
      continue;
    }

    drifted++;

    if (checkOnly) {
      const detail =
        current === null
          ? 'missing locally'
          : `differs from upstream (local ${current.length} bytes, upstream ${upstream.length} bytes)`;
      log(`⚠️  ${path.relative(process.cwd(), target)} ${detail}`, 'yellow');
      continue;
    }

    fs.writeFileSync(target, upstream);
    written++;
    log(
      `↻ ${path.relative(process.cwd(), target)} updated (${upstream.length} bytes)`,
      'yellow',
    );
  }

  if (checkOnly) {
    if (drifted > 0) {
      log(
        `\n⚠️  ${drifted} vendored schema(s) differ from upstream.`,
        'yellow',
      );
      log(
        '   Run `make update-workflow-schemas` and open a PR to adopt the change',
        'yellow',
      );
      log('   deliberately — review the diff before merging.', 'yellow');
      process.exit(1);
    }
    log('\n✅ Vendored schemas match SchemaStore', 'green');
    return;
  }

  if (written === 0) {
    log(
      '\n✅ Vendored schemas already up to date — nothing to commit',
      'green',
    );
    return;
  }

  log(`\n✅ Updated ${written} schema(s).`, 'green');
  log(
    '   Next: run `make lint-workflows` to confirm every workflow in the',
    'cyan',
  );
  log(
    '   repo still validates, then commit the schema diff on its own so the',
    'cyan',
  );
  log('   upstream change is bisectable.', 'cyan');
}

if (require.main === module) {
  main();
}

module.exports = { SCHEMAS, SCHEMA_DIR };
