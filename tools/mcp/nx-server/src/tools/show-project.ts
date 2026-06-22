import { minifiedJson } from '@legacy-sports/mcp-format';
import { getRepoRoot, runNx } from '../run-command.js';
import type { ToolResult } from '../types.js';

interface ShowProjectParams {
  project: string;
  worktreePath?: string;
}

const NX_NAME_REGEX = /^[a-z0-9-._]+$/i;

export async function showProject(
  params: ShowProjectParams,
): Promise<ToolResult> {
  const cwd = params.worktreePath || getRepoRoot();

  if (!NX_NAME_REGEX.test(params.project)) {
    return {
      content: [
        {
          type: 'text',
          text: `Invalid project name: "${params.project}". Only alphanumeric characters, hyphens, underscores, and dots are allowed.`,
        },
      ],
      isError: true,
    };
  }

  try {
    const output = await runNx(
      ['show', 'project', params.project, '--json'],
      cwd,
    );

    const projectConfig = JSON.parse(output);

    // Extract key info for a concise summary
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

    // `targets` (the bare name array) is dropped — its names are the keys of
    // `targetDetails`, so keeping both repeats every target name. Agents read
    // the per-target executor/dependsOn from `targetDetails`.
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            project: params.project,
            root,
            sourceRoot,
            projectType,
            tags,
            targetDetails,
          }),
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
