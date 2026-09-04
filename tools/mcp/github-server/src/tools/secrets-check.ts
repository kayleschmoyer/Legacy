import { minifiedJson } from '@legacy-sports/mcp-format';
import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface SecretsCheckParams {
  names?: string[];
  environment?: string;
}

interface GitHubSecret {
  name: string;
  created_at: string;
  updated_at: string;
}

interface GitHubSecretsResponse {
  total_count: number;
  secrets: GitHubSecret[];
}

function isForbiddenIntegrationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /failed \(403\)/.test(error.message) &&
    /resource not accessible by integration/i.test(error.message)
  );
}

export async function secretsCheck(
  params: SecretsCheckParams,
): Promise<ToolResult> {
  try {
    // Reject empty names array early
    if (Array.isArray(params.names) && params.names.length === 0) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'At least one secret name must be provided when using the names parameter.',
          },
        ],
      };
    }

    const repo = await getRepoOwnerName();
    const basePath = params.environment
      ? `/repos/${repo.owner}/${repo.name}/environments/${encodeURIComponent(params.environment)}/secrets`
      : `/repos/${repo.owner}/${repo.name}/actions/secrets`;

    // If specific names requested, use per-secret endpoint for targeted checks
    if (params.names?.length) {
      const results = await Promise.all(
        params.names.map(async (name) => {
          try {
            const secret = await githubRest<GitHubSecret>({
              method: 'GET',
              path: `${basePath}/${encodeURIComponent(name)}`,
            });
            return {
              name,
              exists: true,
              createdAt: secret.created_at,
              updatedAt: secret.updated_at,
            };
          } catch (error) {
            // A 403 "resource not accessible by integration" means the token
            // lacks the Secrets: Read permission for this per-secret GET — it
            // says nothing about whether the secret exists. Blindly folding
            // that into exists:false (LS-9645) tells callers a live secret is
            // missing, which risks blocking on a non-issue or creating a
            // duplicate/misnamed secret. Surface it as a permission gap
            // instead; only a genuine 404 means exists:false.
            if (isForbiddenIntegrationError(error)) {
              return {
                name,
                exists: null,
                error: 'forbidden',
                hint:
                  'GitHub 403 "Resource not accessible by integration" — the token ' +
                  'lacks the "Secrets: Read" permission for this check, so existence ' +
                  'could not be determined. This is not proof the secret is missing.',
              };
            }
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
              ...(params.environment
                ? { environment: params.environment }
                : {}),
              results,
            }),
          },
        ],
      };
    }

    // No specific names — paginate through all secrets (GitHub returns max 100 per page)
    const allSecrets: Array<{
      name: string;
      createdAt: string;
      updatedAt: string;
    }> = [];
    let page = 1;
    let totalCount = 0;
    try {
      for (;;) {
        const data = await githubRest<GitHubSecretsResponse>({
          method: 'GET',
          path: basePath,
          query: { per_page: '100', page: String(page) },
        });
        totalCount = data.total_count;
        for (const s of data.secrets) {
          allSecrets.push({
            name: s.name,
            createdAt: s.created_at,
            updatedAt: s.updated_at,
          });
        }
        if (allSecrets.length >= totalCount || data.secrets.length === 0) {
          break;
        }
        page++;
      }
    } catch (error) {
      // List mode needs a repo/environment permission (`secrets:read`) the
      // Agent Author App token may not carry, even when per-name checks
      // (single-secret GET) succeed with the same token — LS-5210. Degrade
      // gracefully instead of throwing so callers can fall back to `names`.
      if (isForbiddenIntegrationError(error)) {
        return {
          content: [
            {
              type: 'text',
              text: minifiedJson({
                degraded: true,
                ...(params.environment
                  ? { environment: params.environment }
                  : {}),
                reason:
                  'Bulk secret listing is not accessible with the current token scope ' +
                  '(GitHub 403 "Resource not accessible by integration"). Per-secret ' +
                  'checks are unaffected.',
                hint: 'Pass names: ["SECRET_NAME", ...] to check specific secrets instead.',
              }),
            },
          ],
        };
      }
      throw error;
    }

    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            totalCount,
            ...(params.environment ? { environment: params.environment } : {}),
            secrets: allSecrets,
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
          text: `Failed to check secrets: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
