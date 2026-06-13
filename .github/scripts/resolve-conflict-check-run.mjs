import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * Idempotency helper for the base-push merge-conflict sweep (LS-7992,
 * Phase 3 of LS-7988).
 *
 * `check-conflicts-sweep.yml` re-evaluates every open PR each time `main`
 * advances. Naively it POSTs a brand-new "No Merge Conflicts" check-run on the
 * PR head SHA on every base push, so a single head SHA accumulates multiple
 * terminal runs of a required-check NAME (observed re-firing twice within
 * minutes). GitHub's merge-API ruleset evaluator can then latch onto a stale
 * duplicate and 405 a genuinely-green PR, and the MCP triage tooling
 * double-counts the duplicates as false-red.
 *
 * To stay idempotent the sweep must UPDATE the existing check-run for
 * `(head_sha, "No Merge Conflicts")` rather than create a new one. Given the
 * check-runs GitHub already has for a head SHA (the Checks API
 * `GET /commits/{sha}/check-runs` response, optionally name-filtered), this
 * picks the id of an existing matching run to reuse, or returns null to signal
 * "no prior run — create one".
 *
 * @param {Array<{id?: unknown, name?: unknown}>} checkRuns
 *   The `check_runs` array from the Checks API (or any array of check-run-like
 *   objects).
 * @param {string} name - Required-check name to match (e.g. "No Merge Conflicts").
 * @returns {number|null} The id of the run to update, or null to create a new one.
 */
export function pickReusableCheckRunId(checkRuns, name) {
  if (!Array.isArray(checkRuns) || typeof name !== 'string' || name === '') {
    return null;
  }
  const matching = checkRuns.filter(
    (run) => run && run.name === name && Number.isInteger(run.id),
  );
  if (matching.length === 0) return null;
  // Reuse the newest matching run so repeated sweeps converge on a single
  // check-run id. GitHub assigns monotonically increasing ids, so the highest
  // id is the most recently created run for this name on this SHA.
  return matching.reduce((best, run) => (run.id > best.id ? run : best)).id;
}

/**
 * Normalizes the stdin payload into a check-runs array. Accepts either the raw
 * Checks API envelope (`{ "check_runs": [...] }`) or a bare array, so the
 * caller can pipe `gh api .../check-runs` output through verbatim.
 *
 * @param {string} raw
 * @returns {Array<unknown>}
 */
export function parseCheckRuns(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.check_runs)) return parsed.check_runs;
  return [];
}

/**
 * CLI: reads a Checks API response (envelope or bare array) on stdin and the
 * check name as argv[2]; prints the reusable check-run id to stdout, or nothing
 * when a new run should be created. Used by check-conflicts-sweep.yml.
 */
function main() {
  const name = process.argv[2];
  // readFileSync(0) reads stdin synchronously, matching the other scripts in
  // this directory (e.g. integration-select/select-specs.mjs).
  let raw = '';
  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    raw = '';
  }
  const id = pickReusableCheckRunId(parseCheckRuns(raw), name);
  if (id != null) process.stdout.write(String(id));
}

// pathToFileURL handles relative argv[1] and URL-encoding, unlike a raw
// `file://${process.argv[1]}` comparison.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
