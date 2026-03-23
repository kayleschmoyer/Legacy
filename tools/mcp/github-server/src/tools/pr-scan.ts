import { getRepoOwnerName } from '../auth.js';
import { githubGraphQL, githubRest } from '../github-api.js';
import { FAILED_CONCLUSIONS } from '../types.js';
import type { ToolResult } from '../types.js';

interface PRScanParams {
  limit?: number;
  applyLabels?: boolean;
  compact?: boolean;
}

interface CheckRunNode {
  __typename: 'CheckRun';
  name: string;
  status: string;
  conclusion: string | null;
}

interface StatusContextNode {
  __typename: 'StatusContext';
  context: string;
  state: string;
}

type StatusCheckNode = CheckRunNode | StatusContextNode;

interface PRNode {
  number: number;
  title: string;
  headRefName: string;
  mergeable: string;
  labels: { nodes: Array<{ name: string }> };
  commits: {
    nodes: Array<{
      commit: {
        statusCheckRollup: {
          contexts: {
            nodes: StatusCheckNode[];
          };
        } | null;
      };
    }>;
  };
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
}

const PENDING_STATUSES = new Set(['IN_PROGRESS', 'QUEUED', 'PENDING']);

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

function normalizeCheckConclusion(node: StatusCheckNode): {
  name: string;
  conclusion: string | null;
  status: string;
} {
  if (node.__typename === 'CheckRun') {
    return {
      name: node.name,
      status: node.status,
      conclusion: node.conclusion,
    };
  }
  return {
    name: node.context,
    status: node.state,
    conclusion:
      node.state === 'SUCCESS'
        ? 'SUCCESS'
        : node.state === 'PENDING'
          ? null
          : node.state,
  };
}

/**
 * Synchronize CI failure labels on scanned PRs using REST API:
 * - ciFailing PRs get labels matching their failed checks (additive)
 * - clean PRs get stale CI labels removed
 */
async function syncCILabels(
  owner: string,
  repo: string,
  ciFailing: Array<{ number: number; failedChecks: string[] }>,
  clean: Array<{ number: number }>,
  existingLabels: Map<number, string[]>,
): Promise<LabelAction[]> {
  const actions: LabelAction[] = [];

  for (const pr of ciFailing) {
    const desired = labelsForFailedChecks(pr.failedChecks);
    const current = existingLabels.get(pr.number) ?? [];
    const toAdd = desired.filter((l) => !current.includes(l));
    const toRemove = current.filter(
      (l) => ALL_CI_LABELS.includes(l) && !desired.includes(l),
    );

    if (toAdd.length === 0 && toRemove.length === 0) continue;

    try {
      const basePath = `/repos/${owner}/${repo}/issues/${pr.number}/labels`;
      if (toAdd.length > 0) {
        await githubRest({
          method: 'POST',
          path: basePath,
          body: { labels: toAdd },
        });
      }
      for (const label of toRemove) {
        await githubRest({
          method: 'DELETE',
          path: `${basePath}/${encodeURIComponent(label)}`,
        });
      }
      actions.push({ prNumber: pr.number, added: toAdd, removed: toRemove });
    } catch (err) {
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

    try {
      const basePath = `/repos/${owner}/${repo}/issues/${pr.number}/labels`;
      for (const label of toRemove) {
        await githubRest({
          method: 'DELETE',
          path: `${basePath}/${encodeURIComponent(label)}`,
        });
      }
      actions.push({ prNumber: pr.number, added: [], removed: toRemove });
    } catch (err) {
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
    const response = await githubGraphQL<BatchThreadsResponse>(query, {
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

const LIST_OPEN_PRS_QUERY = `
query($owner: String!, $repo: String!, $first: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequests(first: $first, states: [OPEN], orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        number
        title
        headRefName
        mergeable
        labels(first: 20) { nodes { name } }
        commits(last: 1) {
          nodes {
            commit {
              statusCheckRollup {
                contexts(first: 100) {
                  nodes {
                    ... on CheckRun { __typename name status conclusion }
                    ... on StatusContext { __typename context state }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`;

interface ListOpenPRsResponse {
  repository: {
    pullRequests: {
      nodes: PRNode[];
    };
  };
}

export async function prScan(params: PRScanParams): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();
    const limit = Math.min(params.limit ?? 100, 100);

    const result = await githubGraphQL<ListOpenPRsResponse>(
      LIST_OPEN_PRS_QUERY,
      {
        owner: repo.owner,
        repo: repo.name,
        first: limit,
      },
    );

    const prs = result.data.repository.pullRequests.nodes;

    type BasePR = { number: number; title: string; headRefName: string };
    type CIFailingPR = BasePR & { failedChecks: string[] };
    type ReviewPR = BasePR & {
      threads: ThreadDetail[];
      threadsTruncated: boolean;
    };

    const conflicting: BasePR[] = [];
    const ciFailing: CIFailingPR[] = [];
    const ciPending: BasePR[] = [];
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

      const commitNode = pr.commits.nodes[0];
      const checkNodes =
        commitNode?.commit.statusCheckRollup?.contexts.nodes ?? [];

      if (checkNodes.length === 0) {
        ciPending.push(base);
        continue;
      }

      const checks = checkNodes.map(normalizeCheckConclusion);

      const failed = checks.filter(
        (c) => c.conclusion && FAILED_CONCLUSIONS.has(c.conclusion),
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

    // Fetch unresolved thread details for ALL PRs
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
        prs.map((pr) => [pr.number, pr.labels.nodes.map((l) => l.name)]),
      );
      labelActions = await syncCILabels(
        repo.owner,
        repo.name,
        ciFailing,
        clean,
        existingLabels,
      );
    }

    // Compact mode: return only essential fields to reduce token usage
    if (params.compact) {
      const compactOutput = {
        scannedAt: new Date().toISOString(),
        totalOpen: prs.length,
        conflicting: conflicting.map((p) => ({
          number: p.number,
          branch: p.headRefName,
        })),
        reviews: reviews.map((p) => ({
          number: p.number,
          branch: p.headRefName,
          threadCount: p.threads.length,
          ...(p.threadsTruncated ? { threadsTruncated: true } : {}),
        })),
        ciFailing: ciFailing.map((p) => ({
          number: p.number,
          branch: p.headRefName,
          failedChecks: p.failedChecks,
        })),
        ciPending: ciPending.map((p) => ({
          number: p.number,
          branch: p.headRefName,
        })),
        clean: clean.map((p) => ({
          number: p.number,
          branch: p.headRefName,
        })),
        ...(labelActions.length > 0 ? { labelActions } : {}),
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(compactOutput) }],
      };
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
