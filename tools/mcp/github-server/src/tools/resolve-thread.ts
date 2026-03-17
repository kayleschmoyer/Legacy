import { runGraphQL } from '../gh.js';
import type { ToolResult } from '../types.js';

interface ResolveThreadParams {
  threadId: string;
}

interface ResolveResponse {
  data: {
    resolveReviewThread: {
      thread: { isResolved: boolean };
    };
  };
}

const RESOLVE_MUTATION = `
mutation($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { isResolved }
  }
}`;

export async function resolveThread(
  params: ResolveThreadParams,
): Promise<ToolResult> {
  try {
    const result = await runGraphQL<ResolveResponse>(RESOLVE_MUTATION, {
      threadId: params.threadId,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              threadId: params.threadId,
              isResolved: result.data.resolveReviewThread.thread.isResolved,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to resolve thread ${params.threadId}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
