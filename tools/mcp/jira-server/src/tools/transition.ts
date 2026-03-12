import { runAcli } from '../acli.js';
import type { ToolResult } from '../types.js';

const VALID_STATUSES = ['In Progress', 'In Review', 'Done'] as const;
type ValidStatus = (typeof VALID_STATUSES)[number];

interface TransitionParams {
  key: string;
  status: string;
}

/** Transition a Jira ticket to a new status with validation. */
export async function transition(
  params: TransitionParams,
): Promise<ToolResult> {
  const { key, status } = params;

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

  await runAcli(['workitem', 'transition', '--key', key, '--status', status]);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success: true, key, status }),
      },
    ],
  };
}
