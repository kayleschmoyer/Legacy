import { LOGGER } from '@legacy-sports/logging/server';
import { listPRComments } from './list-pr-comments.js';
import type { ToolResult } from '../types.js';

export interface ListPRInlineCommentsParams {
  number: number;
  path?: string;
  since?: string;
}

/**
 * @deprecated Use `listPRComments({ type: 'inline' })` instead. This alias will
 * be removed in a future release.
 */
export async function listPRInlineComments(
  params: ListPRInlineCommentsParams,
): Promise<ToolResult> {
  LOGGER.warn(
    'github_list_pr_inline_comments is deprecated; use github_list_pr_comments with type: "inline" instead.',
  );
  return listPRComments({ ...params, type: 'inline' });
}
