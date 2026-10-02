import { minifiedJson } from '@legacy-sports/mcp-format';
import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface GitHubRepoResponse {
  owner: { login: string };
  name: string;
  default_branch: string;
  html_url: string;
}

interface GitHubRuleset {
  id: number;
  name: string;
  target: string;
  source_type: string;
  enforcement: string;
}

interface WorkflowPermissionsResponse {
  default_workflow_permissions: string;
  can_approve_pull_request_reviews: boolean;
}

interface ActionsCacheUsageResponse {
  active_caches_size_in_bytes: number;
  active_caches_count: number;
}

interface ActionsCacheEntry {
  key: string;
  ref: string;
  size_in_bytes: number;
  created_at: string;
  last_accessed_at: string;
}

interface ActionsCacheListResponse {
  total_count: number;
  actions_caches: ActionsCacheEntry[];
}

/** GitHub's per-repo Actions cache quota; the API does not report it. */
export const ACTIONS_CACHE_LIMIT_BYTES = 10 * 1024 ** 3;
export const DEFAULT_CACHE_ROW_LIMIT = 30;
export const MAX_CACHE_ROW_LIMIT = 200;
const CACHE_PAGE_SIZE = 100;
/** Bounds the listing at 1000 caches; `partial: true` flags a larger repo. */
const CACHE_MAX_PAGES = 10;
const BYTES_PER_MB = 1024 ** 2;

export type GetRepoInfoInclude =
  | 'rulesets'
  | 'actions_permissions'
  | 'actions_cache';

export interface GetRepoInfoParams {
  /** Opt-in extra data beyond the default repo card. */
  include?: GetRepoInfoInclude[];
  /**
   * Forwarded to the rulesets endpoint's `includes_parents` query param.
   * Only meaningful when `include` contains "rulesets".
   */
  includesParents?: boolean;
  /**
   * Max cache entry rows returned across all groups (largest first).
   * Only meaningful when `include` contains "actions_cache".
   */
  cacheLimit?: number;
}

function toMB(bytes: number): number {
  return Math.round(bytes / BYTES_PER_MB);
}

/**
 * Strip the trailing per-run segments (content hashes, SHAs, run numbers) so
 * per-PR copies of one logical cache collapse into a single group, e.g.
 * `Linux-pnpm-store-3f9a2c1d` -> `Linux-pnpm-store`.
 */
export function cacheKeyPrefix(key: string): string {
  const segments = key.split('-');
  while (
    segments.length > 1 &&
    /^(?:[0-9a-f]{7,}|\d+)$/i.test(segments[segments.length - 1])
  ) {
    segments.pop();
  }
  return segments.join('-');
}

async function getActionsCache(
  repoPath: string,
  rowLimit: number,
): Promise<Record<string, unknown>> {
  const usage = await githubRest<ActionsCacheUsageResponse>({
    method: 'GET',
    path: `${repoPath}/actions/cache/usage`,
  });

  const caches: ActionsCacheEntry[] = [];
  let totalCount = 0;
  for (let page = 1; page <= CACHE_MAX_PAGES; page++) {
    const data = await githubRest<ActionsCacheListResponse>({
      method: 'GET',
      path: `${repoPath}/actions/caches`,
      query: {
        per_page: String(CACHE_PAGE_SIZE),
        page: String(page),
        sort: 'size_in_bytes',
        direction: 'desc',
      },
    });
    totalCount = data.total_count;
    caches.push(...data.actions_caches);
    if (
      data.actions_caches.length < CACHE_PAGE_SIZE ||
      caches.length >= totalCount
    ) {
      break;
    }
  }

  // Sort locally too: the row cap and group order must not depend on the
  // API honoring the sort param.
  caches.sort((a, b) => b.size_in_bytes - a.size_in_bytes);

  const groups = new Map<
    string,
    { prefix: string; count: number; bytes: number; entries: unknown[] }
  >();
  caches.forEach((cache, index) => {
    const prefix = cacheKeyPrefix(cache.key);
    let group = groups.get(prefix);
    if (!group) {
      group = { prefix, count: 0, bytes: 0, entries: [] };
      groups.set(prefix, group);
    }
    group.count += 1;
    group.bytes += cache.size_in_bytes;
    if (index < rowLimit) {
      group.entries.push({
        key: cache.key,
        ref: cache.ref,
        sizeMB: toMB(cache.size_in_bytes),
        createdAt: cache.created_at,
        lastAccessedAt: cache.last_accessed_at,
      });
    }
  });

  return {
    usageBytes: usage.active_caches_size_in_bytes,
    limitBytes: ACTIONS_CACHE_LIMIT_BYTES,
    count: usage.active_caches_count,
    groups: [...groups.values()]
      .sort((a, b) => b.bytes - a.bytes)
      .map((g) => ({
        prefix: g.prefix,
        count: g.count,
        sizeMB: toMB(g.bytes),
        entries: g.entries,
      })),
    // Entry rows dropped by the row cap (group totals still cover them).
    truncated: caches.length > rowLimit,
    // Caches beyond the page bound, missing from group totals as well.
    partial: caches.length < totalCount,
  };
}

export async function getRepoInfo(
  params: GetRepoInfoParams = {},
): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();
    const data = await githubRest<GitHubRepoResponse>({
      method: 'GET',
      path: `/repos/${repo.owner}/${repo.name}`,
    });

    const result: Record<string, unknown> = {
      owner: data.owner.login,
      name: data.name,
      defaultBranch: data.default_branch,
      url: data.html_url,
    };

    const include = params.include ?? [];

    if (include.includes('rulesets')) {
      // per_page: 100 is GitHub's max page size for this endpoint. A repo
      // with more rulesets than that would still be silently truncated, but
      // 100 covers every realistic case for a workflow-403 triage tool.
      const query: Record<string, string> = { per_page: '100' };
      if (params.includesParents !== undefined) {
        query.includes_parents = String(params.includesParents);
      }
      const rulesets = await githubRest<GitHubRuleset[]>({
        method: 'GET',
        path: `/repos/${repo.owner}/${repo.name}/rulesets`,
        query,
      });
      result.rulesets = rulesets.map((r) => ({
        id: r.id,
        name: r.name,
        target: r.target,
        sourceType: r.source_type,
        enforcement: r.enforcement,
      }));
    }

    if (include.includes('actions_permissions')) {
      const permissions = await githubRest<WorkflowPermissionsResponse>({
        method: 'GET',
        path: `/repos/${repo.owner}/${repo.name}/actions/permissions/workflow`,
      });
      result.actionsPermissions = {
        defaultWorkflowPermissions: permissions.default_workflow_permissions,
        canApprovePullRequestReviews:
          permissions.can_approve_pull_request_reviews,
      };
    }

    if (include.includes('actions_cache')) {
      result.actionsCache = await getActionsCache(
        `/repos/${repo.owner}/${repo.name}`,
        // Clamped here rather than in the zod schema: schema constraints are
        // always-resident tool-definition tokens.
        Math.min(
          MAX_CACHE_ROW_LIMIT,
          Math.max(1, Math.floor(params.cacheLimit ?? DEFAULT_CACHE_ROW_LIMIT)),
        ),
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: minifiedJson(result),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to get repo info: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
