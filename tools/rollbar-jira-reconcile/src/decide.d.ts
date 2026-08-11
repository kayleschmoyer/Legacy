/** Jira statuses that mark a linked Rollbar item as safe to resolve. */
export declare const DONE_STATUSES: Set<string>;

export interface ReconcileInput {
  /** Current status of the item's linked Jira issue. */
  jiraStatus: string;
  /**
   * Whether writes are gated off (repo var ROLLBAR_JIRA_RECONCILE_AUTO is
   * not "true").
   */
  dryRun: boolean;
}

export interface ReconcileAction {
  action: 'resolve' | 'propose' | 'skip';
  reason: string;
}

/**
 * Decide what to do with one active Rollbar item, given its linked Jira
 * ticket's current status.
 */
export declare function decideReconcileAction(
  input: ReconcileInput,
): ReconcileAction;

/**
 * Batch variant of {@link decideReconcileAction}: apply the same `dryRun`
 * value to every input while preserving array order.
 */
export declare function decideReconcileBatch(
  items: { jiraStatus: string }[],
  dryRun: boolean,
): ReconcileAction[];
