'use strict';

/**
 * Forward-only transition state machine for automated Jira syncing
 * (RFC: docs/rfcs/draft-declared-ticket-linkage.md §3).
 *
 * Automation may only move a ticket forward along
 *   To Do → In Progress → In Review → Done
 * with exactly two event-scoped downgrades, both only from In Review:
 *   - PR closed without merging      → In Progress
 *   - PR converted to draft          → In Progress
 *
 * A merged PR can never un-Done a ticket; a push can never demote anything.
 */

/** Status rank along the forward axis. Backlog and To Do share rank 0. */
const STATUS_RANK = {
  Backlog: 0,
  'To Do': 0,
  'In Progress': 1,
  'In Review': 2,
  Done: 3,
};

/**
 * @typedef {Object} SyncEvent
 * @property {string} eventName  GitHub event name ('push' | 'pull_request').
 * @property {string} [action]   pull_request action (opened, closed, ...).
 * @property {boolean} [merged]  pull_request merged flag (closed events).
 * @property {boolean} [isDraft] pull_request draft flag (opened/reopened events).
 */

/**
 * Map a GitHub event to the target status it requests, independent of any
 * per-ticket guard. Returns null when the event requests no transition.
 *
 * Push events return 'In Progress' — callers must apply the open-PR gate
 * first (see plan.js); a push to a branch with an open PR never reaches
 * the state machine.
 *
 * @param {SyncEvent} event
 * @returns {string | null}
 */
function decideTarget(event) {
  if (event.eventName === 'push') {
    return 'In Progress';
  }
  if (event.eventName !== 'pull_request') {
    return null;
  }
  switch (event.action) {
    case 'opened':
    case 'reopened':
      return event.isDraft === true ? 'In Progress' : 'In Review';
    case 'ready_for_review':
      return 'In Review';
    case 'converted_to_draft':
      return 'In Progress';
    case 'closed':
      return event.merged === true ? 'Done' : 'In Progress';
    default:
      return null;
  }
}

/**
 * The two permitted downgrade cells: only In Review → In Progress, and only
 * on these specific pull_request actions.
 *
 * @param {SyncEvent} event
 * @returns {boolean}
 */
function isPermittedDowngradeEvent(event) {
  if (event.eventName !== 'pull_request') {
    return false;
  }
  if (event.action === 'converted_to_draft') {
    return true;
  }
  return event.action === 'closed' && event.merged !== true;
}

/**
 * @typedef {Object} GuardResult
 * @property {boolean} allowed
 * @property {boolean} noop   True when current already equals target.
 * @property {string} reason
 */

/**
 * Monotonic transition guard. Callers must read the ticket's *current*
 * status from Jira immediately before consulting this.
 *
 * @param {string} current  Current Jira status name.
 * @param {string} target   Requested target status name.
 * @param {SyncEvent} event The triggering GitHub event.
 * @returns {GuardResult}
 */
function isAllowedMove(current, target, event) {
  const currentRank =
    STATUS_RANK[/** @type {keyof typeof STATUS_RANK} */ (current)];
  const targetRank =
    STATUS_RANK[/** @type {keyof typeof STATUS_RANK} */ (target)];

  if (currentRank === undefined) {
    return {
      allowed: false,
      noop: false,
      reason: `unknown current status "${current}" — refusing to transition`,
    };
  }
  if (targetRank === undefined) {
    return {
      allowed: false,
      noop: false,
      reason: `unknown target status "${target}" — refusing to transition`,
    };
  }
  if (current === target) {
    return {
      allowed: false,
      noop: true,
      reason: `already at "${current}" — nothing to do`,
    };
  }
  if (targetRank > currentRank) {
    return {
      allowed: true,
      noop: false,
      reason: `forward move "${current}" → "${target}"`,
    };
  }
  if (
    current === 'In Review' &&
    target === 'In Progress' &&
    isPermittedDowngradeEvent(event)
  ) {
    return {
      allowed: true,
      noop: false,
      reason: `permitted downgrade "In Review" → "In Progress" on ${event.eventName}/${event.action}`,
    };
  }
  return {
    allowed: false,
    noop: false,
    reason: `backward move "${current}" → "${target}" refused (monotonic guard)`,
  };
}

module.exports = { STATUS_RANK, decideTarget, isAllowedMove };
