#!/usr/bin/env node
'use strict';

/**
 * CLI adapter for .github/workflows/rollbar-jira-reconcile.yml. Prints
 * JSON to stdout; the workflow parses it with jq. Output goes through
 * process.stdout so it stays copy-paste-clean (no logger prefixes) — this
 * package is dependency-free by design so the workflow can run it with
 * bare node, without a pnpm install (mirrors tools/jira-sync).
 *
 * Commands:
 *   decide --jira-status <status> --dry-run <true|false>
 *     → { action, reason }
 *
 *   decide-batch --dry-run <true|false>
 *     Reads JSON Lines from stdin (one object per line, each with at least
 *     a "jiraStatus" field — extra fields are passed through unchanged) and
 *     writes one decision JSON line per input line to stdout, merging in
 *     { action, reason }. One process handles every item in a run instead
 *     of one process per item.
 */

const fs = require('node:fs');

const { decideReconcileAction, decideReconcileBatch } = require('./decide');

/**
 * @param {string[]} argv
 * @returns {Record<string, string>}
 */
function parseFlags(argv) {
  /** @type {Record<string, string>} */
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      throw new Error(`unexpected argument: ${arg}`);
    }
    const name = arg.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`missing value for --${name}`);
    }
    flags[name] = value;
    i += 1;
  }
  return flags;
}

/** @param {Record<string, string>} flags */
function runDecide(flags) {
  const jiraStatus = flags['jira-status'];
  const dryRunRaw = flags['dry-run'];
  if (!jiraStatus || !dryRunRaw) {
    throw new Error('decide requires --jira-status and --dry-run');
  }
  if (dryRunRaw !== 'true' && dryRunRaw !== 'false') {
    // Fail closed: a malformed boolean must never silently enable writes.
    throw new Error(`--dry-run must be "true" or "false", got "${dryRunRaw}"`);
  }
  return decideReconcileAction({ jiraStatus, dryRun: dryRunRaw === 'true' });
}

/** @param {Record<string, string>} flags */
function runDecideBatch(flags) {
  const dryRunRaw = flags['dry-run'];
  if (!dryRunRaw) {
    throw new Error('decide-batch requires --dry-run');
  }
  if (dryRunRaw !== 'true' && dryRunRaw !== 'false') {
    // Fail closed: a malformed boolean must never silently enable writes.
    throw new Error(`--dry-run must be "true" or "false", got "${dryRunRaw}"`);
  }
  const dryRun = dryRunRaw === 'true';

  const input = fs.readFileSync(0, 'utf8');
  const lines = input.split('\n').filter((line) => line.trim().length > 0);
  /** @type {Record<string, unknown>[]} */
  const items = lines.map((line) => JSON.parse(line));
  items.forEach((item, index) => {
    if (typeof item.jiraStatus !== 'string' || item.jiraStatus === '') {
      throw new Error(
        `decide-batch input line ${index + 1} missing "jiraStatus"`,
      );
    }
  });

  const decisions = decideReconcileBatch(
    /** @type {{jiraStatus: string}[]} */ (items),
    dryRun,
  );
  return items.map((item, index) => ({ ...item, ...decisions[index] }));
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);

  if (command === 'decide') {
    const result = runDecide(flags);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else if (command === 'decide-batch') {
    const results = runDecideBatch(flags);
    for (const result of results) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  } else {
    throw new Error(
      `unknown command "${command ?? ''}" — expected decide or decide-batch`,
    );
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `rollbar-jira-reconcile: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }
}

module.exports = { parseFlags, runDecide, runDecideBatch };
