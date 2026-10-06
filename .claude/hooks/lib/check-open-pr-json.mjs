/**
 * JSON helpers for .claude/hooks/check-open-pr.sh (LS-10612).
 *
 * Replaces the hook's inline `python -c` parsers: on Windows `python` often
 * resolves only to the Microsoft Store App Execution Alias
 * (%LOCALAPPDATA%\Microsoft\WindowsApps), which prints "Python was not
 * found..." and exits non-zero, so the hook silently mis-parsed PR state.
 * Node is a hard repo prerequisite. Builtins only — no node_modules, so this
 * runs from any worktree regardless of pool/symlink health.
 *
 * Output contract is byte-identical to the Python versions it replaces:
 *
 *   node check-open-pr-json.mjs pr          (PR_JSON env = `gh pr view --json
 *                                            number,state,isDraft,labels,mergeable,headRefOid`)
 *     → "<number>|<state>|<isDraft>|<labels-csv>|<mergeable>|<head-sha7>"
 *       or no output (the hook then allows stop) when the JSON is empty,
 *       unparseable, or missing number/state.
 *
 *   node check-open-pr-json.mjs state <file> (Periodic Wake Protocol state)
 *     → "terminal" when idleCount >= 6 or cycleCount >= 12, "ok" otherwise,
 *       "unknown" when the file is unreadable or not a JSON object.
 *
 * Fails open: never throws, always exits 0.
 */

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Python-style truthiness `x or fallback`, for JSON values. */
const or = (v, fallback) =>
  v === null ||
  v === undefined ||
  v === false ||
  v === 0 ||
  v === '' ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)
    ? fallback
    : v;

const isObject = (v) =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** @returns {string | null} the pipe-delimited summary, or null to emit nothing. */
export function parsePr(raw) {
  let pr;
  try {
    pr = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(pr) || Object.keys(pr).length === 0) return null;
  if (!('number' in pr) || !('state' in pr)) return null;
  const labels = pr.labels ?? [];
  if (
    !Array.isArray(labels) ||
    !labels.every((l) => isObject(l) && 'name' in l)
  ) {
    return null;
  }
  const draft = or(pr.isDraft, false) ? 'true' : 'false';
  const mergeable = or(pr.mergeable, 'UNKNOWN');
  const sha = String(or(pr.headRefOid, '')).slice(0, 7);
  return [
    pr.number,
    pr.state,
    draft,
    labels.map((l) => l.name).join(','),
    mergeable,
    sha,
  ].join('|');
}

/** @returns {'terminal' | 'ok' | 'unknown'} */
export function classifyState(raw) {
  let state;
  try {
    state = JSON.parse(raw);
  } catch {
    return 'unknown';
  }
  if (!isObject(state)) return 'unknown';
  const idle = or(state.idleCount, 0);
  const cycle = or(state.cycleCount, 0);
  if (typeof idle !== 'number' || typeof cycle !== 'number') return 'unknown';
  return idle >= 6 || cycle >= 12 ? 'terminal' : 'ok';
}

function main([mode, file]) {
  if (mode === 'pr') {
    const out = parsePr(process.env.PR_JSON ?? '');
    if (out !== null) process.stdout.write(`${out}\n`);
    return;
  }
  if (mode === 'state') {
    let raw;
    try {
      raw = readFileSync(file, 'utf8');
    } catch {
      raw = '';
    }
    process.stdout.write(`${classifyState(raw)}\n`);
  }
}

const isEntry = (() => {
  try {
    return (
      realpathSync(process.argv[1]) ===
      realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
})();

if (isEntry) {
  try {
    main(process.argv.slice(2));
  } catch {
    // fail open
  }
}
