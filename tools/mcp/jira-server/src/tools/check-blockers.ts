import { runAcli } from '../acli.js';
import type { ToolResult } from '../types.js';

interface CheckBlockersParams {
  key: string;
}

interface BlockerInfo {
  key: string;
  status: string;
  reason: string;
}

interface CheckBlockersResult {
  canProceed: boolean;
  blockers: BlockerInfo[];
  recommendation: string;
}

/**
 * Check if a ticket's blockers are resolved.
 * Implements the 3-way dependency check from copilot-instructions.md Step 3:
 * - Blocker not In Review/Done → STOP
 * - Blocker In Review → base off blocker's branch
 * - Blocker Done (or no blockers) → base off main
 */
export async function checkBlockers(
  params: CheckBlockersParams,
): Promise<ToolResult> {
  const { key } = params;

  // Get linked issues
  let linkOutput: string;
  try {
    linkOutput = await runAcli(['workitem', 'link', 'list', '--key', key]);
  } catch {
    // No links — no blockers
    return makeResult({
      canProceed: true,
      blockers: [],
      recommendation: 'base off main',
    });
  }

  if (!linkOutput.trim()) {
    return makeResult({
      canProceed: true,
      blockers: [],
      recommendation: 'base off main',
    });
  }

  // Parse all "is blocked by" links
  const blockerKeys: string[] = [];
  for (const line of linkOutput.split('\n')) {
    const match = /is blocked by\s+(LS-\d+)/i.exec(line);
    if (match) {
      blockerKeys.push(match[1]);
    }
  }

  if (blockerKeys.length === 0) {
    return makeResult({
      canProceed: true,
      blockers: [],
      recommendation: 'base off main',
    });
  }

  // Check status of each blocker
  const blockers: BlockerInfo[] = [];
  for (const blockerKey of blockerKeys) {
    let status = 'Unknown';
    try {
      const statusOutput = await runAcli([
        'workitem',
        'view',
        '--key',
        blockerKey,
        '--fields',
        'status',
      ]);
      const statusMatch = /Status:\s*(.+)/i.exec(statusOutput);
      if (statusMatch) {
        status = statusMatch[1].trim();
      }
    } catch {
      status = 'Unknown (could not fetch)';
    }

    let reason: string;
    if (status === 'Done') {
      reason = 'Resolved — no longer blocking';
    } else if (status === 'In Review') {
      reason = 'In Review — use its branch as parent';
    } else {
      reason = `Status is "${status}" — must reach at least "In Review" before proceeding`;
    }

    blockers.push({ key: blockerKey, status, reason });
  }

  // Determine recommendation based on blocker statuses
  const unresolvedBlockers = blockers.filter(
    (b) => b.status !== 'Done' && b.status !== 'In Review',
  );
  const inReviewBlockers = blockers.filter((b) => b.status === 'In Review');

  let canProceed: boolean;
  let recommendation: string;

  if (unresolvedBlockers.length > 0) {
    canProceed = false;
    recommendation = `STOP — blocker(s) not ready: ${unresolvedBlockers.map((b) => `${b.key} (${b.status})`).join(', ')}`;
  } else if (inReviewBlockers.length > 0) {
    canProceed = true;
    // Recommend the first in-review blocker's branch as parent
    const parentKey = inReviewBlockers[0].key;
    recommendation = `base off ${parentKey} branch`;
  } else {
    canProceed = true;
    recommendation = 'base off main';
  }

  return makeResult({ canProceed, blockers, recommendation });
}

function makeResult(result: CheckBlockersResult): ToolResult {
  return {
    isError: !result.canProceed,
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
