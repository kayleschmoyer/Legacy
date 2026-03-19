import { runMake, getRepoRoot } from '../run-command.js';
import type { ToolResult } from '../types.js';

interface WorktreeCreateParams {
  ticket: string;
  description: string;
  parent?: string;
}

/**
 * Create a new worktree for a Jira ticket. Runs:
 *   make worktree TICKET=<number> DESC=<description> [PARENT=<parent>]
 *
 * This creates the git worktree, branch, and adds it to the VS Code workspace.
 * After creation, run make_wt_setup to install dependencies and configure the worktree.
 */
export async function worktreeCreate(
  params: WorktreeCreateParams,
): Promise<ToolResult> {
  const { ticket, description, parent } = params;

  if (process.platform !== 'win32') {
    return {
      content: [
        {
          type: 'text',
          text: 'make_worktree_create is Windows-only. Use git worktree commands directly on Linux/macOS.',
        },
      ],
      isError: true,
    };
  }

  // Extract numeric ticket ID — accept "LS-1234" or "1234" only.
  const ticketMatch = ticket.match(/^(?:LS-)?(\d+)$/i);
  if (!ticketMatch) {
    return {
      content: [
        {
          type: 'text',
          text: `Invalid ticket: "${ticket}". Expected "1234" or "LS-1234".`,
        },
      ],
      isError: true,
    };
  }
  const ticketNum = ticketMatch[1];

  // Validate description: lowercase alphanumeric + hyphens (kebab-case)
  if (!/^[a-z0-9][a-z0-9-]*$/.test(description)) {
    return {
      content: [
        {
          type: 'text',
          text: `Invalid description: "${description}". Use lowercase alphanumeric with hyphens (e.g., "fix-scoring", "add-draft-ui").`,
        },
      ],
      isError: true,
    };
  }

  const repoRoot = getRepoRoot();
  const args = ['worktree', `TICKET=${ticketNum}`, `DESC=${description}`];

  if (parent) {
    args.push(`PARENT=${parent}`);
  }

  try {
    const output = await runMake(args, repoRoot, 60_000);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              ticket: `LS-${ticketNum}`,
              description,
              parent: parent ?? 'main',
              output,
              nextSteps: [
                `Run make_wt_setup with the worktree path to install dependencies`,
                `Use worktree_set("LS-${ticketNum}") to set as active worktree`,
              ],
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: false,
              ticket: `LS-${ticketNum}`,
              error: error instanceof Error ? error.message : String(error),
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }
}
