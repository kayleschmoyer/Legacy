import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

export type PRCommentType = 'all' | 'top-level' | 'inline' | 'review';

export interface ListPRCommentsParams {
  number: number;
  type?: PRCommentType;
  reviewId?: number;
  path?: string;
  since?: string;
}

interface IssueCommentResponse {
  id: number;
  html_url: string;
  body: string;
  created_at: string;
  updated_at: string;
  user: { login: string } | null;
}

interface ReviewCommentResponse {
  id: number;
  in_reply_to_id?: number;
  html_url: string;
  body: string;
  path: string;
  line: number | null;
  original_line?: number | null;
  diff_hunk: string;
  created_at: string;
  updated_at: string;
  user: { login: string } | null;
  pull_request_review_id: number | null;
}

interface TopLevelComment {
  id: number;
  author: string;
  body: string;
  created_at: string;
  updated_at: string;
  url: string;
}

interface InlineComment {
  id: number;
  inReplyToId: number | null;
  author: string;
  body: string;
  path: string;
  line: number | null;
  diffHunk: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  reviewId: number | null;
}

interface ReviewComment {
  id: number;
  inReplyToId: number | null;
  user: string;
  path: string;
  line: number | null;
  body: string;
  createdAt: string;
  reviewId: number | null;
}

const PAGE_SIZE = 100;

async function fetchTopLevel(
  owner: string,
  name: string,
  number: number,
  since: string | undefined,
): Promise<TopLevelComment[]> {
  const basePath = `/repos/${owner}/${name}/issues/${number}/comments`;
  const all: TopLevelComment[] = [];
  let page = 1;
  while (true) {
    const query: Record<string, string> = {
      per_page: String(PAGE_SIZE),
      page: String(page),
    };
    if (since) query['since'] = since;
    const batch = await githubRest<IssueCommentResponse[]>({
      method: 'GET',
      path: basePath,
      query,
    });
    for (const c of batch) {
      all.push({
        id: c.id,
        author: c.user?.login ?? 'unknown',
        body: c.body,
        created_at: c.created_at,
        updated_at: c.updated_at,
        url: c.html_url,
      });
    }
    if (batch.length < PAGE_SIZE) break;
    page++;
  }
  return all;
}

async function fetchPullComments(
  owner: string,
  name: string,
  number: number,
  since: string | undefined,
): Promise<ReviewCommentResponse[]> {
  const basePath = `/repos/${owner}/${name}/pulls/${number}/comments`;
  const all: ReviewCommentResponse[] = [];
  let page = 1;
  while (true) {
    const query: Record<string, string> = {
      per_page: String(PAGE_SIZE),
      page: String(page),
    };
    if (since) query['since'] = since;
    const batch = await githubRest<ReviewCommentResponse[]>({
      method: 'GET',
      path: basePath,
      query,
    });
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    page++;
  }
  return all;
}

function toInline(c: ReviewCommentResponse): InlineComment {
  return {
    id: c.id,
    inReplyToId: c.in_reply_to_id ?? null,
    author: c.user?.login ?? 'unknown',
    body: c.body,
    path: c.path,
    line: c.line ?? c.original_line ?? null,
    diffHunk: c.diff_hunk,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    url: c.html_url,
    reviewId: c.pull_request_review_id,
  };
}

function toReview(c: ReviewCommentResponse): ReviewComment {
  return {
    id: c.id,
    inReplyToId: c.in_reply_to_id ?? null,
    user: c.user?.login ?? 'unknown',
    path: c.path,
    line: c.line ?? c.original_line ?? null,
    body: c.body,
    createdAt: c.created_at,
    reviewId: c.pull_request_review_id,
  };
}

export async function listPRComments(
  params: ListPRCommentsParams,
): Promise<ToolResult> {
  const { number, type = 'all', since, path: filePath, reviewId } = params;

  try {
    const repo = await getRepoOwnerName();

    if (type === 'top-level') {
      const comments = await fetchTopLevel(
        repo.owner,
        repo.name,
        number,
        since,
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { number, type, total: comments.length, comments },
              null,
              2,
            ),
          },
        ],
      };
    }

    if (type === 'inline') {
      const raw = await fetchPullComments(repo.owner, repo.name, number, since);
      const mapped = raw.map(toInline);
      const filtered = filePath
        ? mapped.filter((c) => c.path === filePath)
        : mapped;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                number,
                type,
                total: filtered.length,
                filteredByPath: filePath ?? null,
                comments: filtered,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    if (type === 'review') {
      const raw = await fetchPullComments(repo.owner, repo.name, number, since);
      let mapped = raw.map(toReview);
      if (reviewId !== undefined) {
        mapped = mapped.filter((c) => c.reviewId === reviewId);
      }
      if (filePath) {
        mapped = mapped.filter((c) => c.path === filePath);
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                number,
                type,
                total: mapped.length,
                filteredBySince: since ?? null,
                filteredByReviewId: reviewId ?? null,
                filteredByPath: filePath ?? null,
                comments: mapped,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    // type === 'all'
    const [topLevelRaw, pullRaw] = await Promise.all([
      fetchTopLevel(repo.owner, repo.name, number, since),
      fetchPullComments(repo.owner, repo.name, number, since),
    ]);

    const topLevel = topLevelRaw.map((c) => ({
      kind: 'top-level' as const,
      ...c,
    }));
    let inline = pullRaw
      .map(toInline)
      .map((c) => ({ kind: 'inline' as const, ...c }));
    if (filePath) {
      inline = inline.filter((c) => c.path === filePath);
    }
    if (reviewId !== undefined) {
      inline = inline.filter((c) => c.reviewId === reviewId);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              number,
              type,
              total: topLevel.length + inline.length,
              filteredByPath: filePath ?? null,
              filteredByReviewId: reviewId ?? null,
              topLevel: { total: topLevel.length, comments: topLevel },
              inline: { total: inline.length, comments: inline },
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to list comments for PR/issue #${number}: ${message}`,
        },
      ],
    };
  }
}
