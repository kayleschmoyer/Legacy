import { minifiedJson } from '@legacy-sports/mcp-format';
import { readFileSync } from 'node:fs';
import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface VariableSetParams {
  name: string;
  value?: string;
  valueFile?: string;
}

/**
 * Repo variables (unlike secrets) have no dedicated upsert endpoint — creating
 * an existing name 422s and updating a missing one 404s. Probe existence with
 * a GET first so the caller doesn't need to know or track prior state.
 */
export async function variableSet(
  params: VariableSetParams,
): Promise<ToolResult> {
  try {
    if (!params.value && !params.valueFile) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'Provide either "value" or "valueFile" parameter.',
          },
        ],
      };
    }

    if (params.value && params.valueFile) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'Provide either "value" or "valueFile", not both.',
          },
        ],
      };
    }

    let value: string;
    if (params.valueFile) {
      try {
        value = readFileSync(params.valueFile, 'utf-8');
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Cannot read file "${params.valueFile}": ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    } else {
      value = params.value as string;
    }

    const repo = await getRepoOwnerName();
    const basePath = `/repos/${repo.owner}/${repo.name}/actions/variables`;
    const encodedName = encodeURIComponent(params.name);

    let exists = true;
    try {
      await githubRest({ method: 'GET', path: `${basePath}/${encodedName}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/\(404\)/.test(message)) {
        throw err;
      }
      exists = false;
    }

    if (exists) {
      await githubRest({
        method: 'PATCH',
        path: `${basePath}/${encodedName}`,
        body: { name: params.name, value },
      });
    } else {
      await githubRest({
        method: 'POST',
        path: basePath,
        body: { name: params.name, value },
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            success: true,
            name: params.name,
            method: exists ? 'update' : 'create',
            message: `Variable "${params.name}" ${exists ? 'updated' : 'created'}`,
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
          text: `Failed to set variable "${params.name}": ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
