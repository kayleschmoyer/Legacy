import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface GitHubGitRef {
  ref: string;
  object: {
    sha: string;
    type: string;
  };
}

interface GitHubTagObject {
  sha: string;
  object: {
    sha: string;
    type: string;
  };
}

export interface ResolvedActionSha {
  action: string;
  sha: string;
  tag: string;
  tagType: 'lightweight' | 'annotated';
}

async function resolveTagToSha(
  owner: string,
  repo: string,
  tag: string,
): Promise<ResolvedActionSha> {
  const ref = await githubRest<GitHubGitRef>({
    method: 'GET',
    path: `/repos/${owner}/${repo}/git/refs/tags/${tag}`,
  });

  if (ref.object.type === 'commit') {
    return {
      action: `${owner}/${repo}`,
      sha: ref.object.sha,
      tag,
      tagType: 'lightweight',
    };
  }

  if (ref.object.type === 'tag') {
    // Annotated tag — dereference to get the underlying commit SHA
    const tagObject = await githubRest<GitHubTagObject>({
      method: 'GET',
      path: `/repos/${owner}/${repo}/git/tags/${ref.object.sha}`,
    });
    return {
      action: `${owner}/${repo}`,
      sha: tagObject.object.sha,
      tag,
      tagType: 'annotated',
    };
  }

  throw new Error(
    `Unexpected ref object type "${ref.object.type}" for ${owner}/${repo}@${tag}`,
  );
}

export interface ResolveActionShaParams {
  owner: string;
  repo: string;
  tag: string;
}

export async function resolveActionSha(
  params: ResolveActionShaParams,
): Promise<ToolResult> {
  try {
    const resolved = await resolveTagToSha(
      params.owner,
      params.repo,
      params.tag,
    );
    return {
      content: [{ type: 'text', text: JSON.stringify(resolved, null, 2) }],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to resolve ${params.owner}/${params.repo}@${params.tag}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export interface ResolveActionShasParams {
  actions: Array<{ owner: string; repo: string; tag: string }>;
}

export async function resolveActionShas(
  params: ResolveActionShasParams,
): Promise<ToolResult> {
  const results = await Promise.allSettled(
    params.actions.map((a) => resolveTagToSha(a.owner, a.repo, a.tag)),
  );

  const resolved = results.map((result, i) => {
    const a = params.actions[i]!;
    if (result.status === 'fulfilled') return result.value;
    return {
      action: `${a.owner}/${a.repo}`,
      tag: a.tag,
      error:
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason),
    };
  });

  const allFailed = results.every((r) => r.status === 'rejected');
  return {
    isError: allFailed,
    content: [{ type: 'text', text: JSON.stringify(resolved, null, 2) }],
  };
}
