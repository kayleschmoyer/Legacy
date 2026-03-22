import { jiraRequest } from '../jira-api.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { VALID_STATUSES, type ValidStatus } from './transition.js';

const JIRA_KEY_REGEX = /^[A-Z][A-Z0-9_]+-\d+$/;

interface BulkTransitionParams {
  keys: string[];
  status: string;
}

interface JiraTransition {
  id: string;
  name: string;
  to: { name: string };
}

interface TransitionsResponse {
  transitions: JiraTransition[];
}

interface TransitionResult {
  key: string;
  success: boolean;
  error?: string;
}

/** Transition multiple Jira tickets to a new status in one call. */
export async function bulkTransition(
  params: BulkTransitionParams,
): Promise<CallToolResult> {
  const { keys, status } = params;

  const invalidKeys = keys.filter((k) => !JIRA_KEY_REGEX.test(k));
  if (invalidKeys.length > 0) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: `Invalid Jira key(s): ${invalidKeys.join(', ')}. Expected format: PROJECT-123`,
          }),
        },
      ],
    };
  }

  if (!VALID_STATUSES.includes(status as ValidStatus)) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: `Invalid status "${status}". Must be one of: ${VALID_STATUSES.join(', ')}`,
          }),
        },
      ],
    };
  }

  const CONCURRENCY = 5;

  async function transitionOne(key: string): Promise<TransitionResult> {
    try {
      const encodedKey = encodeURIComponent(key);
      const { transitions } = await jiraRequest<TransitionsResponse>({
        method: 'GET',
        path: `/rest/api/3/issue/${encodedKey}/transitions`,
      });

      const match = transitions.find(
        (t) =>
          t.name.toLowerCase() === status.toLowerCase() ||
          t.to.name.toLowerCase() === status.toLowerCase(),
      );

      if (!match) {
        const availableNames = transitions.map((t) => t.to.name);
        const errorMessage =
          availableNames.length === 0
            ? `No transitions are available for this issue; cannot transition to "${status}".`
            : `No transition to "${status}" available. Available transitions: ${availableNames.join(', ')}`;
        return {
          key,
          success: false,
          error: errorMessage,
        };
      }

      await jiraRequest({
        method: 'POST',
        path: `/rest/api/3/issue/${encodedKey}/transitions`,
        body: { transition: { id: match.id } },
      });

      return { key, success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { key, success: false, error: message };
    }
  }

  const results: TransitionResult[] = [];
  for (let i = 0; i < keys.length; i += CONCURRENCY) {
    const chunk = keys.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(chunk.map(transitionOne));
    results.push(...chunkResults);
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: failed === 0,
            status,
            total: keys.length,
            succeeded,
            failed,
            results,
          },
          null,
          2,
        ),
      },
    ],
    ...(failed > 0 ? { isError: true } : {}),
  };
}
