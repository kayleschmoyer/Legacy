import { jiraRequest } from '../jira-api.js';
import { searchJqlAll } from '../jql-search.js';
import { matchesStatus } from '../locale.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const VALID_STATUSES = ['In Progress', 'In Review', 'Done'] as const;
export type ValidStatus = (typeof VALID_STATUSES)[number];

interface TransitionParams {
  key: string;
  status: string;
  cascade?: boolean;
}

interface SubtaskFields {
  summary: string;
  status: { name: string };
}

interface JiraTransition {
  id: string;
  name: string;
  to: { name: string };
}

interface TransitionsResponse {
  transitions: JiraTransition[];
}

/** Transition a Jira ticket to a new status via REST API. */
export async function transition(
  params: TransitionParams,
): Promise<CallToolResult> {
  const { key, status, cascade = false } = params;

  if (!VALID_STATUSES.includes(status as ValidStatus)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: `Invalid status "${status}". Must be one of: ${VALID_STATUSES.join(', ')}`,
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    // Fetch available transitions for this issue
    const { transitions } = await jiraRequest<TransitionsResponse>({
      method: 'GET',
      path: `/rest/api/3/issue/${key}/transitions`,
    });

    const match = transitions.find(
      (t) => matchesStatus(t.name, status) || matchesStatus(t.to.name, status),
    );

    if (!match) {
      const available = transitions.map((t) => t.to.name).join(', ');
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `No transition to "${status}" available. Available: ${available}`,
            }),
          },
        ],
        isError: true,
      };
    }

    // When transitioning to Done, check for open subtasks
    const warnings: string[] = [];
    const cascadedKeys: string[] = [];

    if (status === 'Done') {
      try {
        const allIssues = await searchJqlAll<SubtaskFields>({
          jql: `parent = ${JSON.stringify(key)} AND status != "Done"`,
          fields: ['summary', 'status'],
          maxResults: 50,
        });

        if (allIssues.length > 0) {
          const openKeys = allIssues.map(
            (i) => `${i.key} (${i.fields.status.name})`,
          );

          if (cascade) {
            // Cascade: transition open subtasks to Done
            for (const issue of allIssues) {
              try {
                const childTransitions = await jiraRequest<TransitionsResponse>(
                  {
                    method: 'GET',
                    path: `/rest/api/3/issue/${issue.key}/transitions`,
                  },
                );
                const doneTransition = childTransitions.transitions.find(
                  (t) =>
                    matchesStatus(t.name, 'Done') ||
                    matchesStatus(t.to.name, 'Done'),
                );
                if (doneTransition) {
                  await jiraRequest({
                    method: 'POST',
                    path: `/rest/api/3/issue/${issue.key}/transitions`,
                    body: { transition: { id: doneTransition.id } },
                  });
                  cascadedKeys.push(issue.key);
                } else {
                  warnings.push(
                    `No Done transition available for ${issue.key} (${issue.fields.status.name})`,
                  );
                }
              } catch {
                warnings.push(`Failed to cascade transition to ${issue.key}`);
              }
            }
          } else {
            warnings.push(
              `${allIssues.length} open subtask(s) will be orphaned: ${openKeys.join(', ')}. ` +
                'Use cascade: true to auto-transition them to Done.',
            );
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        warnings.push(`Failed to check subtasks: ${msg}`);
      }
    }

    await jiraRequest({
      method: 'POST',
      path: `/rest/api/3/issue/${key}/transitions`,
      body: { transition: { id: match.id } },
    });

    const response: Record<string, unknown> = {
      success: true,
      key,
      status,
    };
    if (warnings.length > 0) response.warnings = warnings;
    if (cascadedKeys.length > 0) response.cascadedSubtasks = cascadedKeys;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: `Jira request failed: ${message}`,
          }),
        },
      ],
      isError: true,
    };
  }
}
