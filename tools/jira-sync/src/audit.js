'use strict';

const { extractKeys } = require('./keys');
const { parseMarker } = require('./marker');

/**
 * Audit planning for .github/workflows/jira-status-audit.yml — phase 4 of
 * the declared-ticket-linkage RFC (docs/rfcs/draft-declared-ticket-linkage.md
 * §4, LS-7897). Pure planning — no I/O.
 *
 * Given a PR snapshot, decide which single ticket key the PR declares and
 * what Jira status that ticket is expected to be in:
 *
 *   merged PR            → Done
 *   open draft PR        → In Progress
 *   open ready PR        → In Review
 *
 * Key selection is marker-first (the `<!-- jira-link -->` PR-body marker),
 * falling back to PR-title keys for pre-marker PRs, then to branch-name
 * keys — the audit's historical key source — so PRs predating both the
 * marker and the title convention keep their audit coverage.
 *
 * Repairs themselves stay forward-only: the workflow consults the monotonic
 * guard (state-machine.js) with a non-pull_request event, under which no
 * downgrade is ever permitted. The audit never demotes a ticket; drift the
 * guard refuses to fix is labeled instead.
 *
 * @typedef {Object} AuditInput
 * @property {boolean} merged   Whether the PR is merged.
 * @property {boolean} [isDraft]
 * @property {string} [title]
 * @property {string} [body]
 * @property {string} [branch]  Head branch name.
 *
 * @typedef {Object} AuditResult
 * @property {boolean} skip
 * @property {string} reason
 * @property {string | null} key      The declared ticket key, or null.
 * @property {'marker' | 'title' | 'branch' | null} source
 * @property {string} expected        Expected Jira status for the PR state.
 */

/**
 * @param {AuditInput} input
 * @returns {AuditResult}
 */
function planAudit(input) {
  const expected = input.merged
    ? 'Done'
    : input.isDraft === true
      ? 'In Progress'
      : 'In Review';

  /** @param {string} reason */
  const skip = (reason) => ({
    skip: true,
    reason,
    key: null,
    source: null,
    expected,
  });

  const marker = parseMarker(input.body);
  if (marker.present) {
    if (!marker.valid) {
      return skip(
        `jira-link marker is invalid (${marker.error}) — auditing nothing`,
      );
    }
    if (marker.primary === null) {
      return skip('jira-link marker declares "primary: none"');
    }
    return {
      skip: false,
      reason: 'declared by jira-link marker',
      key: marker.primary,
      source: 'marker',
      expected,
    };
  }

  const titleKeys = extractKeys(input.title);
  if (titleKeys.length > 0) {
    return {
      skip: false,
      reason: 'no jira-link marker — PR-title key fallback',
      key: titleKeys[0],
      source: 'title',
      expected,
    };
  }

  const branchKeys = extractKeys(input.branch);
  if (branchKeys.length > 0) {
    return {
      skip: false,
      reason: 'no jira-link marker or title key — branch-name key fallback',
      key: branchKeys[0],
      source: 'branch',
      expected,
    };
  }

  return skip('no jira-link marker and no ticket keys in title or branch');
}

/**
 * Decide what the audit should do for one PR/ticket pair, given the
 * ticket's current status, the expected status, the monotonic guard's
 * verdict, the auto-repair gate, and whether the PR already carries the
 * jira-mismatch label. Pure — the workflow executes the returned actions
 * (Jira transition, label add/remove, comment).
 *
 * Label semantics: the jira-mismatch label marks drift the audit did not
 * fix. It is removed when the ticket is in sync (or about to be repaired)
 * and added when drift is only proposed (dry-run) or refused by the guard.
 * For 'repair', the caller must apply removeLabel only after the Jira
 * transition actually succeeds.
 *
 * @typedef {Object} AuditActionInput
 * @property {string} current       Current Jira status.
 * @property {string} expected      Expected Jira status from PR state.
 * @property {boolean} guardAllowed Monotonic guard verdict for current → expected.
 * @property {boolean} autoRepair   Whether auto-repair writes are enabled.
 * @property {boolean} hasLabel     PR currently carries jira-mismatch.
 *
 * @typedef {Object} AuditAction
 * @property {'in-sync' | 'repair' | 'propose' | 'refuse'} action
 * @property {boolean} addLabel     Apply jira-mismatch (and the proposed-action comment).
 * @property {boolean} removeLabel  Clear a stale jira-mismatch label.
 * @property {string} reason
 *
 * @param {AuditActionInput} input
 * @returns {AuditAction}
 */
function decideAuditAction(input) {
  if (input.current === input.expected) {
    return {
      action: 'in-sync',
      addLabel: false,
      removeLabel: input.hasLabel === true,
      reason: `already at "${input.expected}" — clear any stale mismatch label`,
    };
  }
  if (input.guardAllowed === true && input.autoRepair === true) {
    return {
      action: 'repair',
      addLabel: false,
      removeLabel: input.hasLabel === true,
      reason: `auto-repair "${input.current}" → "${input.expected}" (remove label only after the transition succeeds)`,
    };
  }
  if (input.guardAllowed === true) {
    return {
      action: 'propose',
      addLabel: input.hasLabel !== true,
      removeLabel: false,
      reason: `dry-run — propose "${input.current}" → "${input.expected}" via label + comment`,
    };
  }
  return {
    action: 'refuse',
    addLabel: input.hasLabel !== true,
    removeLabel: false,
    reason: `guard refused "${input.current}" → "${input.expected}" — label + comment for manual review`,
  };
}

module.exports = { planAudit, decideAuditAction };
