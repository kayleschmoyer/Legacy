import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface WebhookConfig {
  url?: string;
  content_type?: string;
  insecure_ssl?: string;
}

interface GitHubWebhook {
  id: number;
  type: string;
  name: string;
  active: boolean;
  events: string[];
  config: WebhookConfig;
  created_at: string;
  updated_at: string;
  last_response?: {
    code: number | null;
    status: string;
    message: string | null;
  };
}

function formatWebhook(w: GitHubWebhook) {
  return {
    id: w.id,
    name: w.name,
    active: w.active,
    events: w.events,
    url: w.config.url,
    contentType: w.config.content_type,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
    lastResponse: w.last_response ?? null,
  };
}

export async function webhookList(): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();

    const allWebhooks: GitHubWebhook[] = [];
    let page = 1;

    while (true) {
      const pageData = await githubRest<GitHubWebhook[]>({
        method: 'GET',
        path: `/repos/${repo.owner}/${repo.name}/hooks`,
        query: { per_page: '100', page: String(page) },
      });
      allWebhooks.push(...pageData);
      if (pageData.length < 100) break;
      page++;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              count: allWebhooks.length,
              webhooks: allWebhooks.map(formatWebhook),
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `Failed to list webhooks: ${error instanceof Error ? error.message : String(error)}`,
          }),
        },
      ],
    };
  }
}

export interface WebhookUpdateParams {
  hookId: number;
  active?: boolean;
  events?: string[];
  url?: string;
  contentType?: 'json' | 'form';
}

export async function webhookUpdate(
  params: WebhookUpdateParams,
): Promise<ToolResult> {
  if (
    params.active === undefined &&
    params.events === undefined &&
    !params.url &&
    !params.contentType
  ) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error:
              'At least one field must be specified: active, events, url, or contentType.',
          }),
        },
      ],
    };
  }

  try {
    const repo = await getRepoOwnerName();

    const body: Record<string, unknown> = {};
    if (params.active !== undefined) body.active = params.active;
    if (params.events !== undefined) body.events = params.events;
    if (params.url || params.contentType) {
      const config: Record<string, string> = {};
      if (params.url) config.url = params.url;
      if (params.contentType) config.content_type = params.contentType;
      body.config = config;
    }

    const data = await githubRest<GitHubWebhook>({
      method: 'PATCH',
      path: `/repos/${repo.owner}/${repo.name}/hooks/${params.hookId}`,
      body,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { ok: true, webhook: formatWebhook(data) },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `Failed to update webhook ${params.hookId}: ${error instanceof Error ? error.message : String(error)}`,
          }),
        },
      ],
    };
  }
}

export interface WebhookPingParams {
  hookId: number;
}

export async function webhookPing(
  params: WebhookPingParams,
): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();

    // POST /repos/{owner}/{repo}/hooks/{hook_id}/pings returns 204 No Content
    await githubRest<undefined>({
      method: 'POST',
      path: `/repos/${repo.owner}/${repo.name}/hooks/${params.hookId}/pings`,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              ok: true,
              hookId: params.hookId,
              message: 'Ping sent successfully.',
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `Failed to ping webhook ${params.hookId}: ${error instanceof Error ? error.message : String(error)}`,
          }),
        },
      ],
    };
  }
}
