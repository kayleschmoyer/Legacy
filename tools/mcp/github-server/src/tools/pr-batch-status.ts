import { runGhJson, runGraphQL, getRepoOwnerName } from '../gh.js';
import { summarizeCIStatus } from '../types.js';
import type { ToolResult } from '../types.js';

interface PRBatchStatusParams {
  prNumbers: number[];
}

interface PRDetail {
  number: number;
  title: string;
  state: string;
  headRefName: string;
  baseRefName: string;
  author: { login: string };
  isDraft: boolean;
  mergeable: string;
  reviewDecision: string | null;
  updatedAt: string;
  url: string;
  labels: Array<{ name: string }>;
  statusCheckRollup: Array<{
    name: string;
    status: string;
    conclusion: string | null;
  }> | null;
  reviews: Array<{
    author: { login: string };
    state: string;
    submittedAt: string;
  }> | null;
}

interface GraphQLBatchResponse {
  data: {
    repository: {
      [alias: string]: {
        reviewThreads: {
          totalCount: number;
          pageInfo: { hasNextPage: boolean };
          nodes: Array<{ isResolved: boolean }>;
        };
      };
    };
  };
}

const PR_DETAIL_FIELDS = [
  'number',
  'title',
  'state',
  'headRefName',
  'baseRefName',
  'author',
  'isDraft',
  'mergeable',
  'reviewDecision',
  'updatedAt',
  'url',
  'labels',
  'statusCheckRollup',
  'reviews',
];

function buildBatchReviewThreadsQuery(prNumbers: number[]): string {
  const fragments = prNumbers.map(
    (num) => `
    pr_${num}: pullRequest(number: ${num}) {
      reviewThreads(first: 100) {
        totalCount
        pageInfo { hasNextPage }
        nodes { isResolved }
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

export async function prBatchStatus(
  params: PRBatchStatusParams,
): Promise<ToolResult> {
  const uniquePrNumbers = [...new Set(params.prNumbers)];

  try {
    // 1. Fetch detailed PR info for each (in parallel, batches of 10)
    const BATCH_SIZE = 10;
    const prDetails: PRDetail[] = [];

    for (let i = 0; i < uniquePrNumbers.length; i += BATCH_SIZE) {
      const batch = uniquePrNumbers.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map((num) =>
          runGhJson<PRDetail>([
            'pr',
            'view',
            String(num),
            '--json',
            PR_DETAIL_FIELDS.join(','),
          ]),
        ),
      );
      prDetails.push(...results);
    }

    // 2. Batch-fetch review thread counts via a single GraphQL query
    const repo = await getRepoOwnerName();
    const query = buildBatchReviewThreadsQuery(uniquePrNumbers);
    const graphqlResult = await runGraphQL<GraphQLBatchResponse>(query, {
      owner: repo.owner,
      repo: repo.name,
    });

    // 3. Combine results
    const rows = prDetails.map((pr) => {
      const alias = `pr_${pr.number}`;
      const threadData = graphqlResult.data.repository[alias];
      const totalThreads = threadData?.reviewThreads.totalCount ?? -1;
      const unresolvedThreads =
        threadData?.reviewThreads.nodes.filter((t) => !t.isResolved).length ??
        -1;
      const threadCountTruncated =
        threadData?.reviewThreads.pageInfo.hasNextPage ?? false;

      const checks = pr.statusCheckRollup ?? [];
      const ciJobs = checks.map((c) => ({
        name: c.name,
        status: c.status,
        conclusion: c.conclusion,
      }));

      const ciSummary = summarizeCIStatus(ciJobs);

      const reviews = (pr.reviews ?? []).map((r) => ({
        author: r.author.login,
        state: r.state,
        submittedAt: r.submittedAt,
      }));

      return {
        number: pr.number,
        title: pr.title,
        branch: pr.headRefName,
        base: pr.baseRefName,
        author: pr.author.login,
        isDraft: pr.isDraft,
        mergeable: pr.mergeable,
        ciSummary,
        ciJobs,
        reviewDecision: pr.reviewDecision,
        reviews,
        unresolvedThreads,
        totalThreads,
        threadCountTruncated,
        labels: pr.labels.map((l) => l.name),
        updatedAt: pr.updatedAt,
        url: pr.url,
      };
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ count: rows.length, prs: rows }, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to fetch batch PR status: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
