// Shared blocker resolution for jira-server's list- and tree-shaped tools.
//
// Jira returns `issuelinks` inside the same search/issue response as summary and
// status, so blocker state costs nothing extra to carry. Every tool that already
// fetches issues (jira_search, jira_list_children, jira_get_all_descendants,
// jira_check_blockers) resolves it through this module so a dispatching agent
// never has to fan N single-key jira_check_blockers calls out to a sub-agent.

import { matchesStatus } from './locale.js';

/** The Jira field name to request when blocker state is wanted. */
export const BLOCKER_FIELD = 'issuelinks';

export interface JiraIssueLink {
  type: { name: string; inward: string };
  inwardIssue?: { key: string; fields: { status: { name: string } } };
}

export interface BlockerRef {
  key: string;
  status: string;
}

export interface BlockerInfo extends BlockerRef {
  reason: string;
}

export interface BlockerVerdict {
  canProceed: boolean;
  blockers: BlockerInfo[];
  recommendation: string;
}

/** A blocker stops work until it reaches at least "In Review". */
function isActive(status: string): boolean {
  return !matchesStatus(status, 'Done') && !matchesStatus(status, 'In Review');
}

/**
 * Narrow an issue link to an "is blocked by" link with a resolved `inwardIssue`.
 * The outward direction of a Blocks link (this issue blocks another) populates
 * `outwardIssue` instead and must not count as a blocker here.
 *
 * Generic over the link shape so callers that carry richer `inwardIssue.fields`
 * (jira_view expands summary; claim-ticket reads status) share this one
 * definition of what "blocked by" means instead of re-deriving it.
 */
export function isBlockerLink<
  L extends { type: { inward: string }; inwardIssue?: unknown },
>(link: L): link is L & { inwardIssue: NonNullable<L['inwardIssue']> } {
  return (
    link.inwardIssue !== undefined &&
    link.type.inward.toLowerCase().includes('is blocked by')
  );
}

/** Every "is blocked by" link on an issue, regardless of blocker status. */
export function blockerRefs(issuelinks: JiraIssueLink[] = []): BlockerRef[] {
  return issuelinks.filter(isBlockerLink).map((link) => ({
    key: link.inwardIssue.key,
    status: link.inwardIssue.fields.status.name,
  }));
}

/** Blockers that are neither Done nor In Review — these stop work outright. */
export function activeBlockers(issuelinks: JiraIssueLink[] = []): BlockerRef[] {
  return blockerRefs(issuelinks).filter((b) => isActive(b.status));
}

/**
 * The 3-way dependency check:
 * - blocker not In Review/Done -> STOP
 * - exactly one blocker In Review -> base off that blocker's branch
 * - blockers Done, or none -> base off main
 *
 * Multiple In Review blockers are ambiguous (which branch is the parent?) and
 * are escalated to a human rather than guessed at.
 */
export function evaluateBlockers(
  issuelinks: JiraIssueLink[] = [],
): BlockerVerdict {
  const refs = blockerRefs(issuelinks);

  if (refs.length === 0) {
    return { canProceed: true, blockers: [], recommendation: 'base off main' };
  }

  const blockers: BlockerInfo[] = refs.map((ref) => ({
    ...ref,
    reason: describe(ref.status),
  }));

  const unresolved = refs.filter((b) => isActive(b.status));
  const inReview = refs.filter((b) => matchesStatus(b.status, 'In Review'));

  if (unresolved.length > 0) {
    return {
      canProceed: false,
      blockers,
      recommendation: `STOP — blocker(s) not ready: ${unresolved
        .map((b) => `${b.key} (${b.status})`)
        .join(', ')}`,
    };
  }

  if (inReview.length === 1) {
    return {
      canProceed: true,
      blockers,
      recommendation: `base off ${inReview[0].key} branch`,
    };
  }

  if (inReview.length > 1) {
    return {
      canProceed: false,
      blockers,
      recommendation: `STOP — multiple blockers are In Review; a human must choose the parent branch from: ${inReview
        .map((b) => b.key)
        .join(', ')}`,
    };
  }

  return { canProceed: true, blockers, recommendation: 'base off main' };
}

function describe(status: string): string {
  if (matchesStatus(status, 'Done')) return 'Resolved — no longer blocking';
  if (matchesStatus(status, 'In Review'))
    return 'In Review — use its branch as parent';
  return `Status is "${status}" — must reach at least "In Review" before proceeding`;
}

/**
 * Table cells for the `includeBlockers` column pair on list-shaped tools.
 * `blockers` lists only the still-relevant links (Done ones are noise): an
 * unblocked row that names an `LS-x(In Review)` blocker is the signal to base
 * the branch off LS-x rather than main.
 */
export function blockerColumns(issuelinks: JiraIssueLink[] = []): {
  blocked: string;
  blockers: string;
} {
  const relevant = blockerRefs(issuelinks).filter(
    (b) => !matchesStatus(b.status, 'Done'),
  );

  return {
    blocked: relevant.some((b) => isActive(b.status)) ? 'yes' : 'no',
    blockers: relevant.map((b) => `${b.key}(${b.status})`).join('; '),
  };
}

/** Columns appended to a list-tool table when includeBlockers is set. */
export const BLOCKER_COLUMNS = ['blocked', 'blockers'] as const;
