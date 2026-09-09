#!/usr/bin/env node
/**
 * Fake `prettier` binary for scripts/__tests__/pc-format-commit.test.mjs.
 *
 * Simulates prettier's `--list-different` / `--write` contract for a fixed
 * set of "dirty" files, and -- to model an agent editing an unrelated file
 * while a backgrounded `pc-format` is mid-run -- writes to UNRELATED_FILE
 * as a side effect of `--write`, before it finishes rewriting its own
 * target files. The real race in LS-9598 is a timing race; this stub makes
 * the same race deterministic by tying the "concurrent edit" to the exact
 * moment prettier is doing its rewrite.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DIRTY_FILE = 'needs-format.js';
const UNRELATED_FILE = 'unrelated.txt';
const WRITTEN_MARKER = '.stub-written';

const args = process.argv.slice(2);
const cwd = process.cwd();
const writtenMarkerPath = path.join(cwd, WRITTEN_MARKER);

if (args.includes('--list-different')) {
  // Converges after a single --write, unlike the LS-9894 two-pass/
  // never-converges stubs -- this models the common case.
  if (fs.existsSync(writtenMarkerPath)) {
    process.exit(0);
  }
  process.stdout.write(`${DIRTY_FILE}\n`);
  process.exit(1); // prettier's real exit code when differences are found
}

if (args.includes('--write')) {
  // The "agent keeps editing while pc-format runs in the background" edit.
  fs.writeFileSync(
    path.join(cwd, UNRELATED_FILE),
    'edited-while-format-was-running\n',
  );

  const targetFiles = args.filter((arg) => !arg.startsWith('-'));
  for (const file of targetFiles) {
    fs.writeFileSync(path.join(cwd, file), 'formatted-content\n');
  }
  fs.writeFileSync(writtenMarkerPath, '1');
  process.exit(0);
}

process.exit(0);
