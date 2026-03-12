import { runAcli } from '../acli.js';
import type { ToolResult } from '../types.js';

interface CreateTicketParams {
  summary: string;
  type?: string;
  description?: string;
  parent?: string;
}

/**
 * Create a Jira ticket. Avoids the --json duplication bug by parsing plain text output.
 * If parent is specified, sets it at creation time via acli --parent flag.
 */
export async function createTicket(
  params: CreateTicketParams,
): Promise<ToolResult> {
  const { summary, type = 'Task', description, parent } = params;

  const args = [
    'workitem',
    'create',
    '--project',
    'LS',
    '--type',
    type,
    '--summary',
    summary,
  ];

  if (parent) {
    args.push('--parent', parent);
  }

  if (description) {
    args.push('--description', description);
  }

  // IMPORTANT: Do NOT pass --json — it causes duplicate ticket creation
  const output = await runAcli(args);

  // Parse the key from acli plain text output (e.g., "Created LS-1234" or "Key: LS-1234")
  const keyMatch = /\b(LS-\d+)\b/.exec(output);
  if (!keyMatch) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: `Could not parse ticket key from output: ${output}`,
          }),
        },
      ],
      isError: true,
    };
  }

  const key = keyMatch[1];

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          key,
          url: `https://bkrupa.atlassian.net/browse/${key}`,
        }),
      },
    ],
  };
}
