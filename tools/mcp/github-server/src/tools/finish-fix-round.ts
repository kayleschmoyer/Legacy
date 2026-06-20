import { minifiedJson } from '@legacy-sports/mcp-format';
import { getRepoOwnerName } from '../auth.js';
import { githubGraphQL, githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

export type ReplyKind = 'FIX' | 'JUSTIFY' | 'CANNOT-COMPLY';

export interface FinishFixRoundReply {
  threadId: string;
  kind: ReplyKind;
  sha?: string;
  body?: string;
}

export interface FinishFixRoundParams {
  prNumber: number;
  replies: FinishFixRoundReply[];
  /** Label to apply after replying + resolving. Defaults to `bot:ready-for-review`. */
  readyLabel?: string;
}

interface ReplyMutationResponse {
  addPullRequestReviewThreadReply: {
    comment: { id: string; body: string };
  };
}

interface ResolveMutationResponse {
  [alias: string]: { thread: { isResolved: boolean } };
}

const REPLY_MUTATION = `
mutation($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) {
    comment { id body }
  }
}`;

const KIND_PREFIX: Record<ReplyKind, string> = {
  FIX: 'FIX:',
  JUSTIFY: 'JUSTIFY:',
  'CANNOT-COMPLY': 'CANNOT-COMPLY:',
};

interface ValidationError {
  index: number;
  threadId?: string;
  message: string;
}

/**
 * Validate every reply spec before any side effect. FIX requires `sha`;
 * JUSTIFY and CANNOT-COMPLY require `body`. Returns the list of validation
 * errors; an empty list means the input is safe to process.
 */
export function validateReplies(
  replies: FinishFixRoundReply[],
): ValidationError[] {
  const errors: ValidationError[] = [];
  const kinds: ReplyKind[] = ['FIX', 'JUSTIFY', 'CANNOT-COMPLY'];

  if (!Array.isArray(replies) || replies.length === 0) {
    errors.push({ index: -1, message: 'replies must be a non-empty array' });
    return errors;
  }

  for (let i = 0; i < replies.length; i++) {
    const r = replies[i];
    if (!r || typeof r !== 'object') {
      errors.push({ index: i, message: 'reply must be an object' });
      continue;
    }
    if (typeof r.threadId !== 'string' || r.threadId.trim().length === 0) {
      errors.push({ index: i, message: 'threadId is required (non-empty)' });
    }
    if (!kinds.includes(r.kind)) {
      errors.push({
        index: i,
        threadId: r.threadId,
        message: `kind must be one of ${kinds.join(', ')}`,
      });
      continue;
    }
    if (r.kind === 'FIX') {
      if (typeof r.sha !== 'string' || r.sha.trim().length === 0) {
        errors.push({
          index: i,
          threadId: r.threadId,
          message: 'FIX replies require a non-empty `sha`',
        });
      }
    } else {
      if (typeof r.body !== 'string' || r.body.trim().length === 0) {
        errors.push({
          index: i,
          threadId: r.threadId,
          message: `${r.kind} replies require a non-empty \`body\``,
        });
      }
    }
  }
  return errors;
}

/**
 * Build the reply body the Reviewer Bot expects. FIX is strict — exactly
 * `FIX: <sha>` with no trailing prose. JUSTIFY and CANNOT-COMPLY use the
 * caller-provided body, prefixed if the body does not already start with
 * the kind token.
 */
export function buildReplyBody(reply: FinishFixRoundReply): string {
  if (reply.kind === 'FIX') {
    return `FIX: ${reply.sha!.trim()}`;
  }
  const prefix = KIND_PREFIX[reply.kind];
  const body = reply.body!.trim();
  if (body.startsWith(prefix)) return body;
  return `${prefix} ${body}`;
}

interface ReplyOutcome {
  threadId: string;
  kind: ReplyKind;
  body: string;
  success: boolean;
  commentNodeId?: string;
  error?: string;
}

async function postReply(reply: FinishFixRoundReply): Promise<ReplyOutcome> {
  const body = buildReplyBody(reply);
  try {
    const res = await githubGraphQL<ReplyMutationResponse>(REPLY_MUTATION, {
      threadId: reply.threadId,
      body,
    });
    return {
      threadId: reply.threadId,
      kind: reply.kind,
      body,
      success: true,
      commentNodeId: res.data.addPullRequestReviewThreadReply.comment.id,
    };
  } catch (err) {
    return {
      threadId: reply.threadId,
      kind: reply.kind,
      body,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
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

interface ResolveOutcome {
  threadId: string;
  isResolved: boolean;
  error?: string;
}

async function resolveBatch(threadIds: string[]): Promise<ResolveOutcome[]> {
  if (threadIds.length === 0) return [];
  const BATCH_SIZE = 50;
  const out: ResolveOutcome[] = [];
  for (let i = 0; i < threadIds.length; i += BATCH_SIZE) {
    const batch = threadIds.slice(i, i + BATCH_SIZE);
    try {
      const { query, variables } = buildBatchResolveMutation(batch);
      const res = await githubGraphQL<ResolveMutationResponse>(
        query,
        variables,
      );
      for (let j = 0; j < batch.length; j++) {
        const data = res.data[`t${j}`];
        out.push({
          threadId: batch[j],
          isResolved: data?.thread?.isResolved ?? false,
          ...(data ? {} : { error: 'no response data for thread' }),
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      for (const id of batch) {
        out.push({ threadId: id, isResolved: false, error: msg });
      }
    }
  }
  return out;
}

/**
 * Finish a fix round: post per-thread replies, resolve threads answered
 * with `FIX:` (JUSTIFY and CANNOT-COMPLY remain open for bot/human
 * adjudication), and apply the ready-for-review label that re-triggers the
 * Reviewer Bot cycle. Validates every reply before any side effect — a
 * single invalid entry rejects the whole call. Per-thread reply failures
 * do not block successful replies; failed threads are surfaced in
 * `errors[]` and are NOT resolved.
 */
export async function finishFixRound(
  params: FinishFixRoundParams,
): Promise<ToolResult> {
  const validationErrors = validateReplies(params.replies);
  if (validationErrors.length > 0) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: minifiedJson({
            error: 'validation failed — no side effects performed',
            validationErrors,
          }),
        },
      ],
    };
  }

  const readyLabel = params.readyLabel ?? 'bot:ready-for-review';

  // Post all replies in parallel. Per-thread failures are captured, not thrown.
  const replyOutcomes = await Promise.all(params.replies.map(postReply));

  // Only resolve threads where:
  //  1. the reply succeeded, AND
  //  2. the kind is FIX. JUSTIFY and CANNOT-COMPLY must stay open so the
  //     bot (or a human reviewer) can adjudicate them in the next cycle.
  const threadIdsToResolve = replyOutcomes
    .filter((o) => o.success && o.kind === 'FIX')
    .map((o) => o.threadId);

  const resolveOutcomes = await resolveBatch(threadIdsToResolve);

  // Apply the ready-for-review label last. Idempotent on the GitHub side.
  let labelApplied = false;
  let labelError: string | undefined;
  try {
    const repo = await getRepoOwnerName();
    await githubRest({
      method: 'POST',
      path: `/repos/${repo.owner}/${repo.name}/issues/${params.prNumber}/labels`,
      body: { labels: [readyLabel] },
    });
    labelApplied = true;
  } catch (err) {
    labelError = err instanceof Error ? err.message : String(err);
  }

  const replyErrors = replyOutcomes
    .filter((o) => !o.success)
    .map((o) => ({ threadId: o.threadId, kind: o.kind, error: o.error! }));
  const resolveErrors = resolveOutcomes
    .filter((r) => r.error || !r.isResolved)
    .map((r) => ({
      threadId: r.threadId,
      error: r.error ?? 'thread not resolved',
    }));
  const errors: Array<{
    stage: 'reply' | 'resolve' | 'label';
    threadId?: string;
    kind?: ReplyKind;
    error: string;
  }> = [
    ...replyErrors.map((e) => ({ stage: 'reply' as const, ...e })),
    ...resolveErrors.map((e) => ({ stage: 'resolve' as const, ...e })),
    ...(labelError ? [{ stage: 'label' as const, error: labelError }] : []),
  ];

  const replied = replyOutcomes.filter((o) => o.success).length;
  const resolved = resolveOutcomes.filter((r) => r.isResolved).length;

  return {
    isError: errors.length > 0,
    content: [
      {
        type: 'text',
        text: minifiedJson({
          prNumber: params.prNumber,
          replied,
          resolved,
          labelApplied,
          readyLabel,
          replies: replyOutcomes.map((o) => ({
            threadId: o.threadId,
            kind: o.kind,
            body: o.body,
            success: o.success,
            ...(o.commentNodeId ? { commentNodeId: o.commentNodeId } : {}),
            ...(o.error ? { error: o.error } : {}),
          })),
          resolutions: resolveOutcomes,
          errors,
        }),
      },
    ],
  };
}
