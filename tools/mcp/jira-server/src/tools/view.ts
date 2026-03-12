import { runAcli } from '../acli.js';
import type { ToolResult } from '../types.js';

interface ViewParams {
  key: string;
}

interface ParsedTicket {
  key: string;
  summary: string;
  status: string;
  type: string;
  description: string;
  assignee: string;
  parent: string;
  blockers: Array<{ key: string; type: string }>;
}

/** Parse acli workitem view output into structured data. */
function parseViewOutput(output: string, key: string): ParsedTicket {
  const field = (name: string): string => {
    const pattern = new RegExp(`^${name}:\\s*(.*)$`, 'mi');
    const match = pattern.exec(output);
    return match ? match[1].trim() : '';
  };

  /**
   * Capture a potentially multi-line field value, from the field header line
   * through subsequent lines up to (but not including) the next field header
   * (e.g., "Status:", "Assignee:") or the end of the output.
   */
  const blockField = (name: string): string => {
    const pattern = new RegExp(`^${name}:\\s*([\\s\\S]*?)(?=^\\w+:|$)`, 'mi');
    const match = pattern.exec(output);
    return match ? match[1].trim() : '';
  };

  return {
    key,
    summary: field('Summary'),
    status: field('Status'),
    type: field('Type'),
    description: blockField('Description'),
    assignee: field('Assignee'),
    parent: field('Parent'),
    blockers: [], // populated by link list
  };
}

/** Parse acli link list output into blocker entries. */
function parseBlockers(output: string): Array<{ key: string; type: string }> {
  const blockers: Array<{ key: string; type: string }> = [];
  const lines = output.split('\n');
  for (const line of lines) {
    // Look for "is blocked by" link type entries
    const match = /is blocked by\s+(LS-\d+)/i.exec(line);
    if (match) {
      blockers.push({ key: match[1], type: 'blocked-by' });
    }
  }
  return blockers;
}

/** View ticket details in a structured format. */
export async function view(params: ViewParams): Promise<ToolResult> {
  const { key } = params;

  const viewOutput = await runAcli(['workitem', 'view', key]);
  const ticket = parseViewOutput(viewOutput, key);

  // Fetch linked issues to find blockers
  try {
    const linkOutput = await runAcli([
      'workitem',
      'link',
      'list',
      '--key',
      key,
    ]);
    if (linkOutput) {
      ticket.blockers = parseBlockers(linkOutput);
    }
  } catch {
    // No links or link list failed — not critical
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(ticket, null, 2),
      },
    ],
  };
}
