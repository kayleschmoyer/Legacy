import { LOGGER } from '@legacy-sports/logging/server';
import type { ToolResult } from '../types.js';
import { listPRComments } from './list-pr-comments.js';

export interface ListReviewCommentsParams {
  number: number;
  since?: string;
  reviewId?: number;
}

/**
 * @deprecated Use `listPRComments({ type: 'review' })` instead. This alias will
 * be removed in a future release.
 */
export async function listReviewComments(
  params: ListReviewCommentsParams,
): Promise<ToolResult> {
  LOGGER.warn(
    'github_list_review_comments is deprecated; use github_list_pr_comments with type: "review" instead.',
  );
  return listPRComments({ ...params, type: 'review' });
}
