import { pathToFileURL } from 'node:url';

/**
 * Decision helper for the base-push merge-conflict sweep
 * (check-conflicts-sweep.yml).
 *
 * After test-merging a PR head against the just-pushed (live) main, the sweep
 * must decide whether to (re)post the "No Merge Conflicts" required status —
 * a commit status since LS-9604 (previously a check run; the `'in_progress'`/
 * `'queued'` recordedStatus values below are unreachable for a commit status,
 * kept only because check-conflicts.yml's now-retired check-run POSTs used to
 * produce them and the function is otherwise unchanged). Only posts when the
 * recorded state actually disagrees with the fresh result, so steady state
 * posts nothing and duplicate posts never accrue (the LS-7992 concern).
 *
 * This is the exact branching the sweep's shell used inline; extracting it makes
 * the decision unit-testable. In particular it pins the regression that started
 * this fix chain: a recorded `completed:success` with a fresh `failure` (a
 * conflict introduced by main advancing) MUST resolve to `post`, never to a
 * silent skip — otherwise the required check stays a false green.
 *
 * @param {string} freshConclusion  The sweep's own test-merge result against
 *   live main: `'success'` (clean) or `'failure'` (conflicts).
 * @param {string} recordedStatus   Status of the newest recorded "No Merge
 *   Conflicts" state: `'completed'` | `'in_progress'` | `'queued'` | `'absent'`
 *   (or `''` when the lookup failed).
 * @param {string} recordedConclusion  Conclusion when status is `'completed'`
 *   (`'success'` | `'failure'` | …); ignored otherwise.
 * @returns {'in-sync' | 'defer-to-live' | 'post'}
 *   - `in-sync`: the recorded state already matches the fresh result — do nothing.
 *   - `defer-to-live`: a run is still executing (the PR was just pushed); it
 *     will post the authoritative result, so don't race it.
 *   - `post`: the recorded state is stale, wrong, or absent — POST the fresh
 *     result. This is the fail-open default (e.g. when the lookup returned an
 *     empty/unknown status), so a conflict is never silently left green.
 */
export function decideSweepAction(
  freshConclusion,
  recordedStatus,
  recordedConclusion,
) {
  if (freshConclusion !== 'success' && freshConclusion !== 'failure') {
    throw new Error(
      `freshConclusion must be 'success' or 'failure', got '${freshConclusion}'`,
    );
  }
  if (
    recordedStatus === 'completed' &&
    recordedConclusion === freshConclusion
  ) {
    return 'in-sync';
  }
  if (recordedStatus === 'in_progress' || recordedStatus === 'queued') {
    return 'defer-to-live';
  }
  return 'post';
}

/**
 * CLI: `node conflict-sweep-decision.mjs <freshConclusion> <recordedStatus> <recordedConclusion>`
 * prints the decision on stdout. Used by check-conflicts-sweep.yml.
 */
function main() {
  const [, , fresh, status, conclusion] = process.argv;
  process.stdout.write(
    decideSweepAction(fresh, status ?? '', conclusion ?? ''),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
