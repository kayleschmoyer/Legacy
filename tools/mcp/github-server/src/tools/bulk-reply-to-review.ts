import { replyToReview, resolveReplyToReviewInput } from './reply-to-review.js';
import { assembleBatchResult, checkBatchSize, runBatch } from '../batch.js';
import type { ToolResult } from '../types.js';

export interface BulkReplyToReviewItem {
  body: string;
  threadId?: string;
  commentId?: number;
  number?: number;
  prNumber?: number;
}

export interface BulkReplyToReviewParams {
  replies: BulkReplyToReviewItem[];
}

interface BulkReplySuccess {
  index: number;
  threadId?: string;
  commentId?: number;
  number?: number;
  result: unknown;
}

/**
 * Reply to many PR review threads in one call. Each reply uses the same
 * threadId / commentId+number resolution as the single-item tool, so a mixed
 * batch of GraphQL and REST replies is supported.
 */
export async function bulkReplyToReview(
  params: BulkReplyToReviewParams,
): Promise<ToolResult> {
  const sizeError = checkBatchSize(params.replies.length);
  if (sizeError) return sizeError;

  const { succeeded, failed } = await runBatch<
    BulkReplyToReviewItem,
    BulkReplySuccess
  >(
    params.replies,
    async (item, index) => {
      const resolved = resolveReplyToReviewInput(item);
      if ('error' in resolved) {
        throw new Error(resolved.error);
      }

      const result = await replyToReview(resolved);
      const text = result.content[0]?.text ?? '';
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Plain-text errors stay as-is
      }

      if (result.isError) {
        throw new Error(typeof parsed === 'string' ? parsed : text);
      }

      return {
        index,
        threadId: resolved.threadId,
        commentId: resolved.commentId,
        number: resolved.number,
        result: parsed,
      };
    },
    {
      concurrency: 5,
      keyOf: (item) =>
        item.threadId ?? item.commentId ?? item.number ?? item.prNumber,
    },
  );

  return assembleBatchResult(params.replies.length, succeeded, failed);
}
