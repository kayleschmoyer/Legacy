import { minifiedJson } from '@legacy-sports/mcp-format';
import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface VariablesCheckParams {
  names?: string[];
}

interface GitHubVariable {
  name: string;
  value: string;
  created_at: string;
  updated_at: string;
}

interface GitHubVariablesResponse {
  total_count: number;
  variables: GitHubVariable[];
}

export async function variablesCheck(
  params: VariablesCheckParams,
): Promise<ToolResult> {
  try {
    // Reject empty names array early
    if (Array.isArray(params.names) && params.names.length === 0) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'At least one variable name must be provided when using the names parameter.',
          },
        ],
      };
    }

    const repo = await getRepoOwnerName();
    const basePath = `/repos/${repo.owner}/${repo.name}/actions/variables`;

    // If specific names requested, use per-variable endpoint for targeted checks
    if (params.names?.length) {
      const results = await Promise.all(
        params.names.map(async (name) => {
          try {
            const variable = await githubRest<GitHubVariable>({
              method: 'GET',
              path: `${basePath}/${encodeURIComponent(name)}`,
            });
            return {
              name,
              exists: true,
              value: variable.value,
              createdAt: variable.created_at,
              updatedAt: variable.updated_at,
            };
          } catch {
            return { name, exists: false };
          }
        }),
      );

      return {
        content: [
          {
            type: 'text',
            text: minifiedJson({
              checked: params.names.length,
              results,
            }),
          },
        ],
      };
    }

    // No specific names — paginate through all variables (GitHub returns max 100 per page)
    const allVariables: Array<{
      name: string;
      value: string;
      createdAt: string;
      updatedAt: string;
    }> = [];
    let page = 1;
    let totalCount = 0;
    for (;;) {
      const data = await githubRest<GitHubVariablesResponse>({
        method: 'GET',
        path: basePath,
        query: { per_page: '100', page: String(page) },
      });
      totalCount = data.total_count;
      for (const v of data.variables) {
        allVariables.push({
          name: v.name,
          value: v.value,
          createdAt: v.created_at,
          updatedAt: v.updated_at,
        });
      }
      if (allVariables.length >= totalCount || data.variables.length === 0) {
        break;
      }
      page++;
    }

    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            totalCount,
            variables: allVariables,
          }),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to check variables: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
