'use strict';

/**
 * Resolve-on-done decision engine for
 * .github/workflows/rollbar-jira-reconcile.yml (LS-8345, per the
 * "Resolve-on-done" design in docs/ci-cd/rollbar-jira-sync-contract.md).
 * Pure — no I/O.
 *
 * The workflow only ever enumerates Rollbar items with status=active, so
 * this module never sees an already-resolved item — the "never reopen"
 * invariant holds structurally, not by branching here.
 */

/** Jira statuses that mark a linked Rollbar item as safe to resolve. */
const DONE_STATUSES = new Set(['Done', 'Closed']);

/**
 * @typedef {Object} ReconcileInput
 * @property {string} jiraStatus  Current status of the item's linked Jira issue.
 * @property {boolean} dryRun     Whether writes are gated off (repo var
 *                                ROLLBAR_JIRA_RECONCILE_AUTO is not "true").
 *
 * @typedef {Object} ReconcileAction
 * @property {'resolve' | 'propose' | 'skip'} action
 * @property {string} reason
 */

/**
 * Decide what to do with one active Rollbar item, given its linked Jira
 * ticket's current status.
 *
 * @param {ReconcileInput} input
 * @returns {ReconcileAction}
 */
function decideReconcileAction(input) {
  const { jiraStatus, dryRun } = input;

  if (!DONE_STATUSES.has(jiraStatus)) {
    return {
      action: 'skip',
      reason: `linked ticket is "${jiraStatus}" — not Done/Closed, leaving item active`,
    };
  }

  if (dryRun === true) {
    return {
      action: 'propose',
      reason: `linked ticket is "${jiraStatus}" — would resolve, but dry-run (ROLLBAR_JIRA_RECONCILE_AUTO is not "true")`,
    };
  }

  return {
    action: 'resolve',
    reason: `linked ticket is "${jiraStatus}" — resolving active → resolved`,
  };
}

/**
 * Batch variant of {@link decideReconcileAction}: apply the same `dryRun`
 * value to every input while preserving array order. Lets the workflow make
 * one `node` call per run instead of spawning a process per Rollbar item.
 *
 * @param {{jiraStatus: string}[]} items
 * @param {boolean} dryRun
 * @returns {ReconcileAction[]}
 */
function decideReconcileBatch(items, dryRun) {
  return items.map((item) =>
    decideReconcileAction({ jiraStatus: item.jiraStatus, dryRun }),
  );
}

module.exports = { decideReconcileAction, decideReconcileBatch, DONE_STATUSES };
