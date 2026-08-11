import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { projectListText } from '../format.js';
import { getRepoRoot, runNx } from '../run-command.js';
import type { ToolResult } from '../types.js';

interface DepGraphParams {
  project: string;
  direction?: 'dependencies' | 'dependents';
  worktreePath?: string;
}

const NX_NAME_REGEX = /^[a-z0-9-._]+$/i;

export async function depGraph(params: DepGraphParams): Promise<ToolResult> {
  const cwd = params.worktreePath || getRepoRoot();
  const direction = params.direction || 'dependencies';

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

  const tmpFile = join(cwd, 'scratch', `dep-graph-${Date.now()}.json`);
  try {
    await runNx(['graph', `--file=${tmpFile}`], cwd);

    const graphContent = await readFile(tmpFile, 'utf-8');
    const graph = JSON.parse(graphContent) as {
      graph?: {
        nodes?: Record<string, unknown>;
        dependencies?: Record<string, Array<{ target: string }>>;
      };
    };

    const nodes = graph.graph?.nodes || {};
    const deps = graph.graph?.dependencies || {};

    if (!nodes[params.project]) {
      return {
        content: [
          {
            type: 'text',
            text: `Project "${params.project}" not found in the dependency graph.`,
          },
        ],
        isError: true,
      };
    }

    let result: { project: string; related: string[] };

    if (direction === 'dependencies') {
      // What does this project depend on?
      const directDeps = (deps[params.project] || []).map(
        (d: { target: string }) => d.target,
      );
      result = { project: params.project, related: directDeps };
    } else {
      // What depends on this project?
      const dependents: string[] = [];
      for (const [projName, projDeps] of Object.entries(deps)) {
        const projDepsList = projDeps as Array<{ target: string }>;
        if (projDepsList.some((d) => d.target === params.project)) {
          dependents.push(projName);
        }
      }
      result = { project: params.project, related: dependents };
    }

    return {
      content: [
        {
          type: 'text',
          text: projectListText(
            { direction, project: result.project },
            result.related,
          ),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to query dependency graph: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  } finally {
    await unlink(tmpFile).catch(() => undefined);
  }
}
