#!/usr/bin/env node
/**
 * Hand-off record between `pc-lint` and `pc-format` (LS-10532).
 *
 * `scripts/lint-fix-changed.js` (pc-lint) runs `eslint --fix`, which can leave
 * rewrites uncommitted. `pc-format` refuses to touch a file that already has
 * uncommitted changes (it can't tell a hand edit from a format fix), so a file
 * eslint rewrote -- the exact case LS-10145 ordered pc-format after pc-lint
 * for -- deadlocked it.
 *
 * pc-lint therefore records, per file it rewrote, the content hash it left
 * behind -- but only for files that were CLEAN before the fix pass, so the
 * dirt is provably eslint's alone. pc-format exempts a dirty file from its
 * guard only while its current hash still equals the recorded one: any edit
 * made since (by the author) changes the hash and restores the refusal.
 *
 * The record lives in the git dir, so it is never tracked, never shows in
 * `git status`, and is per-worktree.
 */

'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function gitDir(cwd) {
  const out = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
    cwd,
    encoding: 'utf8',
  }).trim();
  return out;
}

function markerPath(cwd) {
  return path.join(gitDir(cwd), 'pc-lint-fixed.json');
}

/** Hash of the file's working-tree content, or null if it does not exist. */
function hashFile(cwd, relFile) {
  if (!fs.existsSync(path.join(cwd, relFile))) return null;
  return execFileSync('git', ['hash-object', '--', relFile], {
    cwd,
    encoding: 'utf8',
  }).trim();
}

/** Repo-relative paths with any uncommitted change (staged, unstaged, untracked). */
function dirtyPaths(cwd) {
  const out = execFileSync('git', ['status', '--porcelain', '-z'], {
    cwd,
    encoding: 'utf8',
  });
  const entries = out.split('\0').filter(Boolean);
  const paths = new Set();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    paths.add(entry.slice(3));
    // Rename/copy entries are followed by the origin path as its own record.
    if (entry[0] === 'R' || entry[0] === 'C') i++;
  }
  return paths;
}

function writeMarker(cwd, fixed) {
  const file = markerPath(cwd);
  if (Object.keys(fixed).length === 0) {
    fs.rmSync(file, { force: true });
    return;
  }
  fs.writeFileSync(file, JSON.stringify({ fixed }, null, 2));
}

/** `{ relFile: hash }` of the files the last pc-lint pass rewrote; `{}` if none. */
function readMarker(cwd) {
  try {
    const parsed = JSON.parse(fs.readFileSync(markerPath(cwd), 'utf8'));
    return parsed && typeof parsed.fixed === 'object' && parsed.fixed
      ? parsed.fixed
      : {};
  } catch {
    return {};
  }
}

function clearMarker(cwd) {
  fs.rmSync(markerPath(cwd), { force: true });
}

module.exports = {
  hashFile,
  dirtyPaths,
  writeMarker,
  readMarker,
  clearMarker,
};
