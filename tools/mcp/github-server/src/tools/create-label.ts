import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface CreateLabelParams {
  name: string;
  color?: string;
  description?: string;
}

/**
 * Check whether a 422 error from GitHub is specifically an "already_exists"
 * error by parsing the response JSON embedded in the error message.
 * Falls back to a GET request to confirm label existence.
 */
async function isAlreadyExistsError(
  error: unknown,
  owner: string,
  repo: string,
  labelName: string,
): Promise<boolean> {
  // Try to parse the error message for the GitHub error response JSON
  const errMsg = error instanceof Error ? error.message : String(error);
  if (!errMsg.includes('422')) return false;

  // Extract JSON body from error message (format: "... failed (422): {json}")
  const jsonMatch = errMsg.match(/\(422\):\s*(.+)$/s);
  if (jsonMatch) {
    try {
      const body = JSON.parse(jsonMatch[1]) as {
        errors?: Array<{ code?: string }>;
      };
      if (body.errors?.some((e) => e.code === 'already_exists')) {
        return true;
      }
      // 422 but not already_exists — it's a different validation error
      return false;
    } catch {
      // JSON parse failed — fall through to GET check
    }
  }

  // Fallback: GET the label to confirm it exists
  try {
    await githubRest<{ name: string }>({
      method: 'GET',
      path: `/repos/${owner}/${repo}/labels/${encodeURIComponent(labelName)}`,
    });
    return true;
  } catch {
    return false;
  }
}

export async function createLabel(
  params: CreateLabelParams,
): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();
    const path = `/repos/${repo.owner}/${repo.name}/labels`;

    // Strip leading '#' from color if provided
    const color = params.color?.replace(/^#/, '');

    // Validate color format (must be exactly 6 hex characters after stripping #)
    if (color && !/^[0-9a-fA-F]{6}$/.test(color)) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Invalid color "${params.color}": must be exactly 6 hex characters (e.g. "ff0000" or "#ff0000")`,
          },
        ],
      };
    }

    const body: Record<string, string> = { name: params.name };
    if (color) body.color = color;
    if (params.description) body.description = params.description;

    try {
      const result = await githubRest<{
        name: string;
        color: string;
        description: string | null;
      }>({
        method: 'POST',
        path,
        body,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                created: true,
                name: result.name,
                color: result.color,
                description: result.description,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      // Check if 422 is specifically because label already exists
      if (
        await isAlreadyExistsError(error, repo.owner, repo.name, params.name)
      ) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  created: false,
                  name: params.name,
                  message: 'Label already exists',
                },
                null,
                2,
              ),
            },
          ],
        };
      }
      throw error;
    }
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to create label "${params.name}": ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
