#!/usr/bin/env node
/**
 * Fake `prettier` binary for scripts/__tests__/pc-format-commit.test.mjs
 * (LS-9894): models a file whose formatting only converges after prettier's
 * `--write` runs TWICE, the way GFM markdown table column padding can behave
 * in real prettier -- the first `--write` leaves output that prettier's own
 * `--list-different` still flags as different, and only a second `--write`
 * settles it.
 *
 * State is tracked via a counter file on disk since each invocation is a
 * fresh process.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DIRTY_FILE = 'needs-format.md';
const COUNTER_FILE = '.stub-write-count';

const args = process.argv.slice(2);
const cwd = process.cwd();
const counterPath = path.join(cwd, COUNTER_FILE);

function writeCount() {
  return fs.existsSync(counterPath)
    ? Number(fs.readFileSync(counterPath, 'utf8'))
    : 0;
}

if (args.includes('--list-different')) {
  // Converged once two writes have happened.
  if (writeCount() >= 2) {
    process.exit(0);
  }
  process.stdout.write(`${DIRTY_FILE}\n`);
  process.exit(1); // prettier's real exit code when differences are found
}

if (args.includes('--write')) {
  const count = writeCount() + 1;
  fs.writeFileSync(counterPath, String(count));

  const targetFiles = args.filter((arg) => !arg.startsWith('-'));
  for (const file of targetFiles) {
    fs.writeFileSync(path.join(cwd, file), `formatted-content-pass-${count}\n`);
  }
  process.exit(0);
}

process.exit(0);
