import { getRepoRoot, runPnpm } from '../run-command.js';
import type { ToolResult } from '../types.js';

interface PrintSchemaParams {
  worktreePath?: string;
}

export async function printSchema(
  params: PrintSchemaParams,
): Promise<ToolResult> {
  const repoRoot = params.worktreePath || getRepoRoot();

  try {
    const output = await runPnpm(
      ['exec', 'nx', 'run', 'db:print-schema'],
      repoRoot,
    );

    // Detect if schema.graphql was modified
    const schemaChanged =
      /schema\.graphql.*changed|wrote|updated|generated/i.test(output) ||
      !/no changes|up.to.date|identical/i.test(output);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { success: true, schemaChanged, output },
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
          text: `Failed to print schema: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
