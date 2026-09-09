#!/usr/bin/env node
/**
 * Fake `prettier` binary for scripts/__tests__/pc-format-commit.test.mjs
 * (LS-9894): always reports the target file as differing, no matter how many
 * times `--write` runs. Models a pathological case where prettier can never
 * reach a fixed point -- the format step must fail loudly instead of
 * committing non-canonical output.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DIRTY_FILE = 'needs-format.md';

const args = process.argv.slice(2);
const cwd = process.cwd();

if (args.includes('--list-different')) {
  process.stdout.write(`${DIRTY_FILE}\n`);
  process.exit(1); // prettier's real exit code when differences are found
}

if (args.includes('--write')) {
  const targetFiles = args.filter((arg) => !arg.startsWith('-'));
  for (const file of targetFiles) {
    fs.writeFileSync(path.join(cwd, file), `formatted-content-${Date.now()}\n`);
  }
  process.exit(0);
}

process.exit(0);
