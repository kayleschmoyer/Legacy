/**
 * Merge-conflict signal detection shared by the PR triage tools
 * (`github_pr_why_blocked`, `github_pr_diagnose`, `github_pr_dashboard`,
 * `github_pr_scan`).
 *
 * The repo has FOUR conflict signals, and they can disagree:
 *   1. GraphQL `mergeable` — GitHub's lazily-computed field. It flips to
 *      UNKNOWN every time the base branch advances and can stay stale for
 *      minutes (the flakiness that motivated check-conflicts.yml, LS-4479).
 *   2. The `CI: Conflicts` label — written by check-conflicts.yml and the
 *      base-push sweep from a deterministic local `git merge` test.
 *   3. The required "No Merge Conflicts" check run — same deterministic test,
 *      surfaced as the merge-gate check.
 *   4. GraphQL `mergeStateStatus` — DIRTY means a merge conflict. It can read
 *      DIRTY while `mergeable` is still UNKNOWN (LS-10375).
 *
 * Historically the triage tools read ONLY signal 1, so during an UNKNOWN (or
 * stale-MERGEABLE) window a conflicting PR was misdiagnosed as CI_FAILING with
 * "fix the failing checks and push" advice — agents went log-diving instead of
 * rebasing. Treat any one signal firing as "this PR has merge conflicts": the
 * label/check writers remove their signals automatically when conflicts
 * resolve, so a false positive self-heals on the next check-conflicts run,
 * while a missed conflict strands the PR.
 */

/** Label applied by check-conflicts.yml / check-conflicts-sweep.yml. */
export const CONFLICT_LABEL = 'CI: Conflicts';

/** Required check produced by the check-conflicts.yml job (see ruleset.json). */
export const CONFLICT_CHECK_NAME = 'No Merge Conflicts';

export interface ConflictSignalInputs {
  /** GraphQL mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN' (or null). */
  mergeable?: string | null;
  /** GraphQL mergeStateStatus: 'DIRTY' means conflicts (LS-10375). */
  mergeStateStatus?: string | null;
  /** PR label names. */
  labels?: Iterable<string>;
  /**
   * Failing check identifiers — either raw names ("No Merge Conflicts") or the
   * processor-style `name (reason)` strings from evaluateRequiredChecks
   * ("No Merge Conflicts (failure)").
   */
  failingChecks?: Iterable<string>;
}

export interface ConflictSignals {
  /** True when any signal says the PR conflicts with its base. */
  conflicting: boolean;
  /** Which signals fired, for diagnosis details (e.g. "label:CI: Conflicts"). */
  sources: string[];
}

/**
 * True when a failing-check entry is the conflict check concluding `failure`.
 * A `cancelled`/`timed_out` conflict-check run proves nothing about conflicts
 * (cancel-in-progress leaves those behind routinely), so only a bare name or
 * an explicit `(failure)` counts.
 */
export function isConflictCheckFailure(entry: string): boolean {
  return (
    entry === CONFLICT_CHECK_NAME ||
    entry === `${CONFLICT_CHECK_NAME} (failure)`
  );
}

export function detectConflictSignals(
  inputs: ConflictSignalInputs,
): ConflictSignals {
  const sources: string[] = [];

  if (inputs.mergeable === 'CONFLICTING') {
    sources.push('mergeable:CONFLICTING');
  }
  if (inputs.mergeStateStatus === 'DIRTY') {
    sources.push('mergeState:DIRTY');
  }
  for (const label of inputs.labels ?? []) {
    if (label === CONFLICT_LABEL) {
      sources.push(`label:${CONFLICT_LABEL}`);
      break;
    }
  }
  for (const entry of inputs.failingChecks ?? []) {
    if (isConflictCheckFailure(entry)) {
      sources.push(`check:${entry}`);
      break;
    }
  }

  return { conflicting: sources.length > 0, sources };
}

/**
 * LS-9945: the label/check signals are written by an async workflow and lag
 * real git state after a conflict is resolved, while GitHub's live
 * `mergeable`/`mergeStateStatus` settle to MERGEABLE + CLEAN/UNSTABLE. When the
 * live fields confirm clear, a verdict resting solely on label/check is that
 * lag — trust the live fields. Shared by every triage tool (LS-10375).
 */
export function isStaleConflictSignalOnly(
  signals: ConflictSignals,
  inputs: Pick<ConflictSignalInputs, 'mergeable' | 'mergeStateStatus'>,
): boolean {
  return (
    signals.conflicting &&
    !signals.sources.includes('mergeable:CONFLICTING') &&
    !signals.sources.includes('mergeState:DIRTY') &&
    inputs.mergeable === 'MERGEABLE' &&
    (inputs.mergeStateStatus === 'CLEAN' ||
      inputs.mergeStateStatus === 'UNSTABLE')
  );
}
