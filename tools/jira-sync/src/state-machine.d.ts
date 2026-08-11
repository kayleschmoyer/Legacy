/**
 * Type declarations for state-machine.js.
 */

/** Status rank along the forward axis. Backlog and To Do share rank 0. */
export const STATUS_RANK: Record<string, number>;

export interface SyncEvent {
  /** GitHub event name ('push' | 'pull_request'). */
  eventName: string;
  /** pull_request action (opened, closed, ...). */
  action?: string;
  /** pull_request merged flag (closed events). */
  merged?: boolean;
  /** pull_request draft flag (opened/reopened events). */
  isDraft?: boolean;
}

export interface GuardResult {
  allowed: boolean;
  /** True when current already equals target. */
  noop: boolean;
  reason: string;
}

export function decideTarget(event: SyncEvent): string | null;
export function isAllowedMove(
  current: string,
  target: string,
  event: SyncEvent,
): GuardResult;
