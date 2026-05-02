import { removeLabel as _removeLabel } from './github.mjs';

/**
 * Operational labels applied by triggering events or by the reviewer's own
 * self-heal path. These must be cleared at every non-shadow reviewer terminal
 * state that produces a final label set, so dashboard filters and humans
 * investigating a PR see only the labels that describe the outcome
 * (e.g. `needs-human-arbitration`, `needs-human-review`, `merge-when-ready`,
 * or — when the terminal state is itself an infra failure — a freshly
 * re-applied `review-bot-degraded`).
 *
 * - `bot:ready-for-review` triggers the reviewer workflow.
 * - `review-bot-degraded` is applied on transient infra failure to allow a
 *   labeled-event self-heal retry.
 */
export const OPERATIONAL_LABELS = Object.freeze([
  'bot:ready-for-review',
  'review-bot-degraded',
]);

/**
 * Remove operational labels from a PR. Idempotent — `removeLabel` no-ops on
 * 404 and each label is attempted independently so a failure on one does not
 * prevent the others from being cleared.
 *
 * Call this **after** applying the terminal label that describes the run's
 * outcome, so a failure to apply that label leaves the operational labels
 * intact and the workflow can self-heal on the next labeled event. Pass
 * `{ except }` when the terminal label itself is an operational label
 * (currently only `review-bot-degraded` from the infra-failure paths) so the
 * just-applied label is not removed.
 *
 * Not called from:
 *   - Shadow-mode paths — shadow runs are observation-only and do not mutate
 *     labels.
 *   - Mid-flight bail-outs after `postShadowComment` / `postRealReview`
 *     throw — those exit before a terminal label set is established and
 *     leaving operational labels intact preserves the option to retrigger.
 *
 * @param {number} prNumber
 * @param {{ except?: string, removeLabel?: (prNumber: number, label: string) => void }} [opts]
 *   `except` skips a single label (used when the terminal label is itself
 *   operational). `removeLabel` is a test override; defaults to the live
 *   `removeLabel` from `./github.mjs`.
 */
export function cleanupOperationalLabels(prNumber, opts = {}) {
  const { except, removeLabel = _removeLabel } = opts;
  for (const label of OPERATIONAL_LABELS) {
    if (label === except) continue;
    try {
      removeLabel(prNumber, label);
    } catch (err) {
      process.stderr.write(
        `[reviewer] Failed to remove label '${label}': ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
}
