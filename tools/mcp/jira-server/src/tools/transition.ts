import { jiraRequest } from '../jira-api.js';
import { searchJqlAll } from '../jql-search.js';
import { matchesStatus } from '../locale.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { claimTicket } from './claim-ticket.js';

export const VALID_STATUSES = [
  'Backlog',
  'To Do',
  'In Progress',
  'In Review',
  'Done',
] as const;
export type ValidStatus = (typeof VALID_STATUSES)[number];

export type TransitionAction = 'transition' | 'claim';

interface TransitionParams {
  key: string;
  status: string;
  cascade?: boolean;
}

interface ConsolidatedParams {
  keys: string | string[];
  status: string;
  action?: TransitionAction;
  cascade?: boolean;
  assignee?: string;
  /**
   * Optional deprecation label. When set, the response includes a
   * `deprecation` field so callers can surface the warning. Used by the
   * `jira_bulk_transition` and `jira_claim_ticket` alias registrations.
   */
  deprecation?: string;
}

const JIRA_KEY_REGEX = /^[A-Z][A-Z0-9_]+-\d+$/;

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

interface PerKeyResult {
  status?: string;
  error?: string;
  [extra: string]: unknown;
}

/**
 * Consolidated entry point for `jira_transition`. Handles both single-key and
 * multi-key transitions, and the `claim` action which performs the
 * assignee-set + transition sequence atomically (delegates to `claimTicket`).
 *
 * Return shape: `{ results: { [key]: { status?, error?, ... } }, success, ... }`.
 */
export async function consolidatedTransition(
  params: ConsolidatedParams,
): Promise<CallToolResult> {
  const action: TransitionAction = params.action ?? 'transition';
  const keys = Array.isArray(params.keys) ? params.keys : [params.keys];

  if (keys.length === 0) {
    return errorResult('At least one key is required.', params.deprecation);
  }
  if (keys.length > 50) {
    return errorResult(
      'At most 50 keys are allowed per call.',
      params.deprecation,
    );
  }

  const invalidKeys = keys.filter((k) => !JIRA_KEY_REGEX.test(k));
  if (invalidKeys.length > 0) {
    return errorResult(
      `Invalid Jira key(s): ${invalidKeys.join(', ')}. Expected format: PROJECT-123`,
      params.deprecation,
    );
  }

  if (!VALID_STATUSES.includes(params.status as ValidStatus)) {
    return errorResult(
      `Invalid status "${params.status}". Must be one of: ${VALID_STATUSES.join(', ')}`,
      params.deprecation,
    );
  }

  if (params.cascade && keys.length > 1) {
    return errorResult(
      'cascade=true is not supported when transitioning multiple keys. Pass a single key or set cascade=false.',
      params.deprecation,
    );
  }

  if (action === 'claim' && params.status !== 'In Progress') {
    return errorResult(
      `action: 'claim' only supports status: 'In Progress' (got "${params.status}").`,
      params.deprecation,
    );
  }

  const results: Record<string, PerKeyResult> = {};
  const CONCURRENCY = 5;

  async function runOne(key: string): Promise<void> {
    try {
      if (action === 'claim') {
        const claim = await claimTicket({ key, assignee: params.assignee });
        const text = (claim.content[0] as { text: string }).text;
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (claim.isError) {
          const parsedError =
            typeof parsed['error'] === 'string' ? parsed['error'] : undefined;
          results[key] = {
            error: parsedError ?? text ?? 'claim failed',
          };
          return;
        }
        // Merge claim metadata (action, claimed, ticket, warnings, blockers).
        results[key] = {
          ...(parsed as PerKeyResult),
          // For claimed tickets the resulting Jira status is In Progress; for
          // ALREADY_CLAIMED/STOP report the current ticket status.
          status:
            (parsed['claimed'] === true && 'In Progress') ||
            ((parsed['ticket'] as { status?: string } | undefined)?.status ??
              undefined),
        };
        return;
      }

      const r = await transition({
        key,
        status: params.status,
        cascade: params.cascade,
      });
      const text = (r.content[0] as { text: string }).text;
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed['success'] === true) {
        const entry: PerKeyResult = { status: params.status };
        if (parsed['warnings']) entry['warnings'] = parsed['warnings'];
        if (parsed['cascadedSubtasks'])
          entry['cascadedSubtasks'] = parsed['cascadedSubtasks'];
        results[key] = entry;
      } else {
        results[key] = {
          error: String(parsed['error'] ?? 'transition failed'),
        };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results[key] = { error: msg };
    }
  }

  for (let i = 0; i < keys.length; i += CONCURRENCY) {
    const chunk = keys.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(runOne));
  }

  const failedKeys = keys.filter((k) => results[k]?.error !== undefined);

  const response: Record<string, unknown> = {
    success: failedKeys.length === 0,
    action,
    status: params.status,
    total: keys.length,
    succeeded: keys.length - failedKeys.length,
    failed: failedKeys.length,
    results,
  };
  if (params.deprecation) response['deprecation'] = params.deprecation;

  // Per the MCP partial-failure rule, surface isError when *any* key fails so
  // agents that only check the top-level flag can't silently drop a partial
  // failure.
  return {
    content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
    ...(failedKeys.length > 0 ? { isError: true } : {}),
  };
}

function errorResult(message: string, deprecation?: string): CallToolResult {
  const payload: Record<string, unknown> = {
    success: false,
    error: message,
  };
  if (deprecation) payload['deprecation'] = deprecation;
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(payload) }],
  };
}
