import { minifiedJson } from '@legacy-sports/mcp-format';
import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface CreateLabelParams {
  name: string;
  color?: string;
  description?: string;
}

// GitHub rejects a label description longer than this with a 422. Matches
// the cap enforced by `.github/scripts/sync-labels.py --check`.
const MAX_DESCRIPTION_LENGTH = 100;

/**
 * Check whether a 422 error from GitHub is specifically an "already_exists"
 * error by parsing the response JSON embedded in the error message.
 * Falls back to a GET request to confirm label existence.
 */
export async function isAlreadyExistsError(
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

/**
 * A label with the given name already exists — PATCH it if the caller's
 * color/description differ from the current definition, otherwise no-op.
 */
async function upsertExistingLabel(
  owner: string,
  repoName: string,
  params: CreateLabelParams,
  color: string | undefined,
): Promise<ToolResult> {
  const encodedName = encodeURIComponent(params.name);
  const current = await githubRest<{
    name: string;
    color: string;
    description: string | null;
  }>({
    method: 'GET',
    path: `/repos/${owner}/${repoName}/labels/${encodedName}`,
  });

  const desiredColor = color?.toLowerCase();
  const desiredDescription = params.description;
  const colorChanged =
    desiredColor !== undefined && desiredColor !== current.color.toLowerCase();
  const descriptionChanged =
    desiredDescription !== undefined &&
    desiredDescription !== (current.description ?? '');

  if (!colorChanged && !descriptionChanged) {
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            created: false,
            updated: false,
            name: params.name,
            message:
              'Label already exists and matches the requested color/description',
          }),
        },
      ],
    };
  }

  const patchBody: Record<string, string> = {};
  if (colorChanged) patchBody.color = desiredColor;
  if (descriptionChanged) patchBody.description = desiredDescription;

  const result = await githubRest<{
    name: string;
    color: string;
    description: string | null;
  }>({
    method: 'PATCH',
    path: `/repos/${owner}/${repoName}/labels/${encodedName}`,
    body: patchBody,
  });

  return {
    content: [
      {
        type: 'text',
        text: minifiedJson({
          created: false,
          updated: true,
          name: result.name,
          color: result.color,
          description: result.description,
        }),
      },
    ],
  };
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

    // Validate description length up front — GitHub's API caps it at 100
    // chars and returns a raw 422 otherwise.
    if (
      params.description &&
      params.description.length > MAX_DESCRIPTION_LENGTH
    ) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Invalid description for "${params.name}": ${params.description.length} characters exceeds GitHub's ${MAX_DESCRIPTION_LENGTH}-character limit`,
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
            text: minifiedJson({
              created: true,
              name: result.name,
              color: result.color,
              description: result.description,
            }),
          },
        ],
      };
    } catch (error) {
      // Check if 422 is specifically because label already exists
      if (
        await isAlreadyExistsError(error, repo.owner, repo.name, params.name)
      ) {
        return upsertExistingLabel(repo.owner, repo.name, params, color);
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
