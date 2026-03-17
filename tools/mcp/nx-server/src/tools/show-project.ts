import { getRepoRoot, runNx } from '../run-command.js';
import type { ToolResult } from '../types.js';

interface ShowProjectParams {
  project: string;
  worktreePath?: string;
}

export async function showProject(
  params: ShowProjectParams,
): Promise<ToolResult> {
  const cwd = params.worktreePath || getRepoRoot();

  try {
    const output = await runNx(
      ['show', 'project', params.project, '--json'],
      cwd,
    );

    const projectConfig = JSON.parse(output);

    // Extract key info for a concise summary
    const targets = Object.keys(projectConfig.targets || {});
    const tags = projectConfig.tags || [];
    const root = projectConfig.root;
    const sourceRoot = projectConfig.sourceRoot;
    const projectType = projectConfig.projectType;

    // Build target details with dependencies
    const targetDetails: Record<
      string,
      { executor?: string; dependsOn?: string[] }
    > = {};
    for (const [name, config] of Object.entries(projectConfig.targets || {})) {
      const cfg = config as {
        executor?: string;
        dependsOn?: string[];
      };
      targetDetails[name] = {
        ...(cfg.executor && { executor: cfg.executor }),
        ...(cfg.dependsOn?.length && { dependsOn: cfg.dependsOn }),
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              project: params.project,
              root,
              sourceRoot,
              projectType,
              tags,
              targets,
              targetDetails,
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
          text: `Failed to show project "${params.project}": ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
