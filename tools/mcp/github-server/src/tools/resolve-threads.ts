import { getRepoOwnerName } from '../auth.js';
import { githubGraphQL, githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface ResolveThreadsParams {
  threadIds: string[];
  prNumber?: number;
}

interface ResolveResponse {
  [alias: string]: {
    thread: { isResolved: boolean };
  };
}

function buildBatchResolveMutation(threadIds: string[]): {
  query: string;
  variables: Record<string, string>;
} {
  const variableDecls = threadIds.map((_, i) => `$id${i}: ID!`).join(', ');
  const mutations = threadIds.map(
    (_, i) => `
    t${i}: resolveReviewThread(input: { threadId: $id${i} }) {
      thread { isResolved }
    }`,
  );

  const query = `mutation(${variableDecls}) {
  ${mutations.join('\n')}
}`;

  const variables: Record<string, string> = {};
  threadIds.forEach((id, i) => {
    variables[`id${i}`] = id;
  });

  return { query, variables };
}

export async function resolveThreads(
  params: ResolveThreadsParams,
): Promise<ToolResult> {
  const uniqueIds = [...new Set(params.threadIds)];

  if (uniqueIds.length === 0) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'No thread IDs provided.' }],
    };
  }

  // Batch in groups of 50 to stay within GraphQL limits
  const BATCH_SIZE = 50;
  const results: Array<{
    threadId: string;
    isResolved: boolean;
    error?: string;
  }> = [];

  for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
    const batch = uniqueIds.slice(i, i + BATCH_SIZE);
    try {
      const { query, variables } = buildBatchResolveMutation(batch);
      const response = await githubGraphQL<ResolveResponse>(query, variables);

      for (let j = 0; j < batch.length; j++) {
        const alias = `t${j}`;
        const data = response.data[alias];
        if (!data) {
          results.push({
            threadId: batch[j],
            isResolved: false,
            error: `No response data for thread (alias ${alias}) — may be an invalid thread ID`,
          });
        } else {
          results.push({
            threadId: batch[j],
            isResolved: data.thread?.isResolved ?? false,
          });
        }
      }
    } catch (error) {
      for (const id of batch) {
        results.push({
          threadId: id,
          isResolved: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const resolved = results.filter((r) => r.isResolved && !r.error).length;
  const failed = results.filter((r) => r.error).length;

  // If a PR number was provided and threads were resolved, trigger the
  // Copilot Auto-Approve recheck workflow so bot-review status gets updated.
  // This closes the gap where threads are resolved without a code push.
  let recheckTriggered = false;
  let recheckError: string | undefined;
  if (params.prNumber && resolved > 0 && failed === 0) {
    try {
      const repo = await getRepoOwnerName();
      await githubRest({
        method: 'POST',
        path: `/repos/${repo.owner}/${repo.name}/actions/workflows/copilot-auto-approve.yml/dispatches`,
        body: {
          ref: 'main',
          inputs: { pr_number: String(params.prNumber) },
        },
      });
      recheckTriggered = true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // Workflow dispatch requires Actions write permission (classic PAT
      // needs the `workflow` scope; fine-grained tokens need Actions write).
      // Surface this clearly so the caller knows what to fix.
      recheckError =
        `Failed to trigger bot-review recheck: ${msg}. ` +
        'Ensure the token has Actions workflow permissions ' +
        '(classic PAT: `workflow` scope; fine-grained: Actions write).';
    }
  }

  return {
    isError: failed > 0 ? true : undefined,
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            total: results.length,
            resolved,
            failed,
            results,
            recheckTriggered,
            ...(recheckError ? { recheckError } : {}),
          },
          null,
          2,
        ),
      },
    ],
  };
}
