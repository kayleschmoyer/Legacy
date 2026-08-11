/**
 * Type declarations for audit.js.
 */

export interface AuditInput {
  /** Whether the PR is merged. */
  merged: boolean;
  isDraft?: boolean;
  title?: string;
  body?: string;
  /** Head branch name. */
  branch?: string;
}

export interface AuditResult {
  skip: boolean;
  reason: string;
  /** The declared ticket key, or null. */
  key: string | null;
  source: 'marker' | 'title' | 'branch' | null;
  /** Expected Jira status for the PR state. */
  expected: string;
}

export interface AuditActionInput {
  /** Current Jira status. */
  current: string;
  /** Expected Jira status from PR state. */
  expected: string;
  /** Monotonic guard verdict for current → expected. */
  guardAllowed: boolean;
  /** Whether auto-repair writes are enabled. */
  autoRepair: boolean;
  /** PR currently carries jira-mismatch. */
  hasLabel: boolean;
}

export interface AuditAction {
  action: 'in-sync' | 'repair' | 'propose' | 'refuse';
  /** Apply jira-mismatch (and the proposed-action comment). */
  addLabel: boolean;
  /** Clear a stale jira-mismatch label. */
  removeLabel: boolean;
  reason: string;
}

export function planAudit(input: AuditInput): AuditResult;
export function decideAuditAction(input: AuditActionInput): AuditAction;
