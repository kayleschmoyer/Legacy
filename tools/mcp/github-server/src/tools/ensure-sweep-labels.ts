import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';
import { isAlreadyExistsError } from './create-label.js';

interface SweepLabel {
  name: string;
  color: string;
  description: string;
}

const SWEEP_LABELS: SweepLabel[] = [
  {
    name: 'sweep-claimed',
    color: 'e4e669',
    description: 'PR currently being processed by a sweep agent',
  },
  {
    name: 'sweep-stale-claim',
    color: 'd93f0b',
    description: 'Sweep claim is stale (agent may have crashed)',
  },
];

interface LabelEnsureResult {
  name: string;
  created: boolean;
}

/**
 * Idempotently ensure sweep coordination labels exist on the repository.
 * Returns one entry per label indicating whether it was created or already existed.
 * Exported for use as a shared utility (e.g. called from sweep-stale-claims startup).
 */
export async function ensureSweepLabelsInternal(): Promise<
  LabelEnsureResult[]
> {
  const repo = await getRepoOwnerName();
  const results: LabelEnsureResult[] = [];

  for (const label of SWEEP_LABELS) {
    try {
      await githubRest<{ name: string }>({
        method: 'POST',
        path: `/repos/${repo.owner}/${repo.name}/labels`,
        body: {
          name: label.name,
          color: label.color,
          description: label.description,
        },
      });
      results.push({ name: label.name, created: true });
    } catch (error) {
      if (
        await isAlreadyExistsError(error, repo.owner, repo.name, label.name)
      ) {
        results.push({ name: label.name, created: false });
        continue;
      }
      throw error;
    }
  }

  return results;
}

/**
 * MCP tool handler: ensure sweep coordination labels exist on the repository.
 * Idempotent — safe to call at sweep startup every time.
 */
export async function ensureSweepLabels(): Promise<ToolResult> {
  try {
    const results = await ensureSweepLabelsInternal();

    const created = results.filter((r) => r.created).map((r) => r.name);
    const existing = results.filter((r) => !r.created).map((r) => r.name);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              ensured: results.map((r) => r.name),
              created,
              alreadyExisted: existing,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to ensure sweep labels: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
