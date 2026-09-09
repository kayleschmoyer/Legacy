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

export type GetRepoInfoInclude = 'rulesets' | 'actions_permissions';

export interface GetRepoInfoParams {
  /** Opt-in extra data beyond the default repo card. */
  include?: GetRepoInfoInclude[];
  /**
   * Forwarded to the rulesets endpoint's `includes_parents` query param.
   * Only meaningful when `include` contains "rulesets".
   */
  includesParents?: boolean;
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
