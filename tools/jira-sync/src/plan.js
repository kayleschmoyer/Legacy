'use strict';

const { extractKeys } = require('./keys');
const { parseMarker } = require('./marker');
const { decideTarget } = require('./state-machine');

/**
 * Decide which ticket keys to transition, and to what status, for a given
 * GitHub event. Pure planning — no I/O. The caller supplies the open-PR
 * count for push events (one GitHub API GET in the workflow adapter).
 *
 * Key-selection rules (RFC §3, phase 1):
 *   - pull_request events: the marker's `primary` key only. When no marker
 *     is present, fall back to PR-title key parsing. `primary: none` and
 *     invalid markers transition nothing.
 *   - push events: branch-name keys only, and only when the branch has no
 *     open PR. Commit-message sweeping is deliberately gone — it swept
 *     foreign keys from main's commits after rebases.
 *
 * @typedef {Object} PlanInput
 * @property {string} eventName        'push' | 'pull_request'
 * @property {string} [action]         pull_request action
 * @property {boolean} [merged]        pull_request merged flag
 * @property {string} [branch]         head branch name
 * @property {string} [prTitle]
 * @property {string} [prBody]
 * @property {number} [openPrCount]    open PRs for the branch (push events)
 *
 * @typedef {Object} PlanResult
 * @property {boolean} skip
 * @property {string} reason
 * @property {string[]} keys
 * @property {string | null} target
 */

/**
 * @param {PlanInput} input
 * @returns {PlanResult}
 */
function planSync(input) {
  /** @param {string} reason */
  const skip = (reason) => ({ skip: true, reason, keys: [], target: null });

  if (input.eventName === 'push') {
    if ((input.openPrCount ?? 0) > 0) {
      return skip(
        `branch has ${input.openPrCount} open PR(s) — push events never change ticket status while a PR is open`,
      );
    }
    const keys = extractKeys(input.branch);
    if (keys.length === 0) {
      return skip(
        'no ticket keys in branch name — pre-PR pushes transition branch-name keys only',
      );
    }
    return {
      skip: false,
      reason: 'pre-PR push on ticket branch',
      keys,
      target: 'In Progress',
    };
  }

  if (input.eventName === 'pull_request') {
    const target = decideTarget(input);
    if (target === null) {
      return skip(
        `no transition defined for pull_request action "${input.action}"`,
      );
    }

    const marker = parseMarker(input.prBody);
    /** @type {string[]} */
    let keys;
    if (marker.present) {
      if (!marker.valid) {
        return skip(
          `jira-link marker is invalid (${marker.error}) — transitioning nothing`,
        );
      }
      if (marker.primary === null) {
        return skip('jira-link marker declares "primary: none"');
      }
      keys = [marker.primary];
    } else {
      keys = extractKeys(input.prTitle);
      if (keys.length === 0) {
        return skip('no jira-link marker and no ticket keys in PR title');
      }
    }
    return {
      skip: false,
      reason: `pull_request ${input.action}`,
      keys,
      target,
    };
  }

  return skip(`unsupported event "${input.eventName}"`);
}

module.exports = { planSync };
