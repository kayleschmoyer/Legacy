/**
 * Type declarations for plan.js.
 */

export interface PlanInput {
  /** 'push' | 'pull_request' */
  eventName: string;
  /** pull_request action */
  action?: string;
  /** pull_request merged flag */
  merged?: boolean;
  /** head branch name */
  branch?: string;
  prTitle?: string;
  prBody?: string;
  /** open PRs for the branch (push events) */
  openPrCount?: number;
}

export interface PlanResult {
  skip: boolean;
  reason: string;
  keys: string[];
  target: string | null;
}

export function planSync(input: PlanInput): PlanResult;
