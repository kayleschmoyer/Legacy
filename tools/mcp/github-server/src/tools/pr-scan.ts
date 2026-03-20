import { runGh, runGhJson, runGraphQL, getRepoOwnerName } from '../gh.js';
import type { ToolResult } from '../types.js';

interface PRScanParams {
  limit?: number;
  applyLabels?: boolean;
}

interface PRListItem {
  number: number;
  title: string;
  headRefName: string;
  mergeable: string;
  labels: Array<{ name: string }>;
  statusCheckRollup: Array<{
    name: string;
    status: string;
    conclusion: string | null;
  }> | null;
}

interface ThreadDetail {
  id: string;
  path: string | null;
  line: number | null;
  body: string;
  truncated?: true;
}

interface ThreadFetchResult {
  threads: ThreadDetail[];
  truncated: boolean;
}

interface BatchThreadsResponse {
  data: {
    repository: {
      [alias: string]: {
        reviewThreads: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: Array<{
            id: string;
            isResolved: boolean;
            isOutdated: boolean;
            comments: {
              nodes: Array<{
                path: string | null;
                line: number | null;
                body: string;
              }>;
            };
          }>;
        };
      };
    };
  };
}

const FAILING_CONCLUSIONS = new Set([
  'FAILURE',
  'ERROR',
  'CANCELLED',
  'TIMED_OUT',
]);
const PENDING_STATUSES = new Set(['IN_PROGRESS', 'QUEUED', 'PENDING']);

const PR_FIELDS = [
  'number',
  'title',
  'headRefName',
  'mergeable',
  'statusCheckRollup',
  'labels',
];

/**
 * Map CI check names to PR labels. Each entry is a regex tested against the
 * failed check name and the label to apply when it matches. Order matters —
 * the first match wins for a given check.
 */
const CHECK_NAME_TO_LABEL: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /Quality Gates/i, label: 'CI: Quality Gates' },
  { pattern: /Build Validation/i, label: 'CI: Build Failure' },
  { pattern: /E2E Tests/i, label: 'CI: E2E Failure' },
  { pattern: /Migration/i, label: 'CI: Migration' },
];

/** All CI failure labels managed by this tool. */
const ALL_CI_LABELS = CHECK_NAME_TO_LABEL.map((e) => e.label);

/** Derive CI failure labels from a list of failed check names. */
function labelsForFailedChecks(failedChecks: string[]): string[] {
  const labels = new Set<string>();
  for (const check of failedChecks) {
    for (const { pattern, label } of CHECK_NAME_TO_LABEL) {
      if (pattern.test(check)) {
        labels.add(label);
        break;
      }
    }
  }
  return [...labels];
}

interface LabelAction {
  prNumber: number;
  added: string[];
  removed: string[];
  error?: string;
}

/**
 * Synchronize CI failure labels on scanned PRs:
 * - ciFailing PRs get labels matching their failed checks (additive)
 * - clean PRs get stale CI labels removed
 */
async function syncCILabels(
  ciFailing: Array<{ number: number; failedChecks: string[] }>,
  clean: Array<{ number: number }>,
  existingLabels: Map<number, string[]>,
): Promise<LabelAction[]> {
  const actions: LabelAction[] = [];

  for (const pr of ciFailing) {
    const desired = labelsForFailedChecks(pr.failedChecks);
    const current = existingLabels.get(pr.number) ?? [];
    const toAdd = desired.filter((l) => !current.includes(l));
    // Remove CI labels that no longer apply (check passed/not failing)
    const toRemove = current.filter(
      (l) => ALL_CI_LABELS.includes(l) && !desired.includes(l),
    );

    if (toAdd.length === 0 && toRemove.length === 0) continue;

    const args = ['pr', 'edit', String(pr.number)];
    for (const l of toAdd) args.push('--add-label', l);
    for (const l of toRemove) args.push('--remove-label', l);

    try {
      await runGh(args);
      actions.push({ prNumber: pr.number, added: toAdd, removed: toRemove });
    } catch (err) {
      // Label failures are non-fatal — record intended changes + error and continue
      actions.push({
        prNumber: pr.number,
        added: toAdd,
        removed: toRemove,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  for (const pr of clean) {
    const current = existingLabels.get(pr.number) ?? [];
    const toRemove = current.filter((l) => ALL_CI_LABELS.includes(l));
    if (toRemove.length === 0) continue;

    const args = ['pr', 'edit', String(pr.number)];
    for (const l of toRemove) args.push('--remove-label', l);

    try {
      await runGh(args);
      actions.push({ prNumber: pr.number, added: [], removed: toRemove });
    } catch (err) {
      // non-fatal — record intended removals + error
      actions.push({
        prNumber: pr.number,
        added: [],
        removed: toRemove,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return actions;
}

function buildBatchThreadDetailQuery(prNumbers: number[]): string {
  const fragments = prNumbers.map(
    (num) => `
    pr_${num}: pullRequest(number: ${num}) {
      reviewThreads(first: 100) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          comments(first: 1) {
            nodes { path line body }
          }
        }
      }
    }`,
  );

  return `
query($owner: String!, $repo: String!) {
  repository(owner: $owner, name: $repo) {
    ${fragments.join('\n')}
  }
}`;
}

async function fetchUnresolvedThreadDetails(
  owner: string,
  repo: string,
  prNumbers: number[],
): Promise<Map<number, ThreadFetchResult>> {
  const result = new Map<number, ThreadFetchResult>();
  if (prNumbers.length === 0) return result;

  const BATCH_SIZE = 30;
  for (let i = 0; i < prNumbers.length; i += BATCH_SIZE) {
    const batch = prNumbers.slice(i, i + BATCH_SIZE);
    const query = buildBatchThreadDetailQuery(batch);
    const response = await runGraphQL<BatchThreadsResponse>(query, {
      owner,
      repo,
    });

    for (const num of batch) {
      const alias = `pr_${num}`;
      const data = response.data.repository[alias];
      if (!data) continue;

      const { nodes, pageInfo } = data.reviewThreads;
      const threads = nodes
        .filter((t) => !t.isResolved && !t.isOutdated)
        .map((t) => {
          const first = t.comments.nodes[0];
          return {
            id: t.id,
            path: first?.path ?? null,
            line: first?.line ?? null,
            body: first?.body ?? '',
          };
        });

      result.set(num, { threads, truncated: pageInfo.hasNextPage });
    }
  }

  return result;
}

export async function prScan(params: PRScanParams): Promise<ToolResult> {
  try {
    const prs = await runGhJson<PRListItem[]>([
      'pr',
      'list',
      '--state',
      'open',
      '--json',
      PR_FIELDS.join(','),
      '--limit',
      String(params.limit ?? 200),
    ]);

    type BasePR = { number: number; title: string; headRefName: string };
    type CIFailingPR = BasePR & { failedChecks: string[] };
    type ReviewPR = BasePR & {
      threads: ThreadDetail[];
      threadsTruncated: boolean;
    };

    const conflicting: BasePR[] = [];
    const ciFailing: CIFailingPR[] = [];
    const ciPending: BasePR[] = [];

    // ciPassingPRNumbers tracks PRs with no CI failures/pending so we can
    // determine the 'clean' bucket after checking review threads.
    const ciPassingNumbers = new Set<number>();

    for (const pr of prs) {
      const base: BasePR = {
        number: pr.number,
        title: pr.title,
        headRefName: pr.headRefName,
      };

      if (pr.mergeable === 'CONFLICTING') {
        conflicting.push(base);
      }

      const checks = pr.statusCheckRollup;
      if (!checks || checks.length === 0) {
        ciPending.push(base);
        continue;
      }

      const failed = checks.filter(
        (c) => c.conclusion && FAILING_CONCLUSIONS.has(c.conclusion),
      );
      const pending = checks.filter(
        (c) =>
          (!c.conclusion || c.conclusion === '') &&
          PENDING_STATUSES.has(c.status),
      );

      if (failed.length > 0) {
        ciFailing.push({ ...base, failedChecks: failed.map((c) => c.name) });
      } else if (pending.length > 0) {
        ciPending.push(base);
      } else {
        ciPassingNumbers.add(pr.number);
      }
    }

    // Fetch unresolved thread details for ALL PRs — a PR can appear in both
    // 'conflicting' and 'reviews', matching scan-prs.ps1 behavior.
    const repo = await getRepoOwnerName();
    const threadMap = await fetchUnresolvedThreadDetails(
      repo.owner,
      repo.name,
      prs.map((pr) => pr.number),
    );

    const reviews: ReviewPR[] = [];
    const clean: BasePR[] = [];

    for (const pr of prs) {
      const fetchResult = threadMap.get(pr.number);
      const threads = fetchResult?.threads ?? [];
      const truncated = fetchResult?.truncated ?? false;

      if (threads.length > 0) {
        reviews.push({
          number: pr.number,
          title: pr.title,
          headRefName: pr.headRefName,
          threads,
          threadsTruncated: truncated,
        });
      } else if (
        ciPassingNumbers.has(pr.number) &&
        pr.mergeable !== 'CONFLICTING'
      ) {
        clean.push({
          number: pr.number,
          title: pr.title,
          headRefName: pr.headRefName,
        });
      }
    }

    // Sync CI failure labels when applyLabels is enabled (default: true)
    let labelActions: LabelAction[] = [];
    if (params.applyLabels !== false) {
      const existingLabels = new Map<number, string[]>(
        prs.map((pr) => [pr.number, pr.labels.map((l) => l.name)]),
      );
      labelActions = await syncCILabels(ciFailing, clean, existingLabels);
    }

    const output = {
      scannedAt: new Date().toISOString(),
      totalOpen: prs.length,
      conflicting,
      reviews,
      ciFailing,
      ciPending,
      clean,
      ...(labelActions.length > 0 ? { labelActions } : {}),
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to scan PRs: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
