import { streamGhLogs } from '../gh.js';
import { buildLogArgs } from '../logs.js';
import type { ToolResult } from '../types.js';

type FailureCategory =
  | 'formatting'
  | 'stale_branch'
  | 'codegen'
  | 'type_error'
  | 'test_failure'
  | 'lint'
  | 'flaky'
  | 'infrastructure'
  | 'unknown';

interface Classification {
  category: FailureCategory;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  recommendation: string;
  autoFixable: boolean;
}

interface AutoFixParams {
  runId: number;
  jobId?: number;
  attempt?: number;
  /** Maximum log lines to fetch before classification (default 500). */
  maxLines?: number;
}

/** Patterns that identify specific CI failure categories. */
const PATTERNS: Array<{
  category: FailureCategory;
  patterns: RegExp[];
  recommendation: string;
  autoFixable: boolean;
}> = [
  {
    category: 'formatting',
    patterns: [
      /nx format:check/i,
      /format:write would change/i,
      /Code style issues found/i,
      /files? would be reformatted/i,
      /Prettier.*check/i,
    ],
    recommendation:
      'Run `pnpm exec nx format:write` in the worktree, commit and push.',
    autoFixable: true,
  },
  {
    category: 'stale_branch',
    patterns: [
      /Duplicate identifier/i,
      /Cannot find name '(?!.*node_modules)/i,
      /has no exported member/i,
      /Module '"[^"]*"' has no exported member/i,
      /Property '.*' does not exist on type/i,
    ],
    recommendation:
      'Rebase onto main using `worktree_rebase`, then re-run CI. These errors likely come from a stale branch missing recent main commits.',
    autoFixable: true,
  },
  {
    category: 'codegen',
    patterns: [
      /Cannot find module '.*\.generated'/i,
      /graphql\.generated/i,
      /codegen.*out of date/i,
      /generated types? (?:are|is) stale/i,
    ],
    recommendation:
      'Run `make codegen` in the worktree, commit the generated files, and push.',
    autoFixable: true,
  },
  {
    category: 'lint',
    patterns: [
      /eslint.*error/i,
      /\d+ errors? and \d+ warnings?/i,
      /lint.*failed/i,
      /no-console/i,
      /no-unused-vars/i,
    ],
    recommendation:
      'Run `pnpm exec nx affected -t lint --fix` to auto-fix lint errors. Manual fixes may be needed for non-auto-fixable rules.',
    autoFixable: true,
  },
  {
    category: 'type_error',
    patterns: [/error TS\d+:/i, /typecheck.*failed/i, /tsc.*error/i],
    recommendation:
      'Fix the TypeScript error at the indicated file/line. If the error is in code that was recently changed on main, rebase first.',
    autoFixable: false,
  },
  {
    category: 'test_failure',
    patterns: [
      /Tests?:\s+\d+ failed/i,
      /FAIL\s+(?:apps|lib|lambdas)\//i,
      /Test Suites?:\s+\d+ failed/i,
      /expect\(received\)/i,
    ],
    recommendation:
      'Investigate the failing test. Load `skills/debug-ci-failure/SKILL.md` for the full debugging playbook.',
    autoFixable: false,
  },
  {
    category: 'infrastructure',
    patterns: [
      /ETIMEDOUT/i,
      /ECONNRESET/i,
      /rate limit/i,
      /503 Service/i,
      /The runner has received a shutdown signal/i,
      /RUNNER_TRACKING_ID/i,
    ],
    recommendation:
      'Re-run CI — this is a GitHub Actions infrastructure issue, not a code problem.',
    autoFixable: true,
  },
  {
    category: 'flaky',
    patterns: [
      /flaky/i,
      /intermittent/i,
      /timed? ?out waiting/i,
      /Jest.*timed? ?out/i,
    ],
    recommendation:
      'Re-run CI — this appears to be a flaky test or timing issue.',
    autoFixable: true,
  },
];

function classifyLogs(logs: string): Classification {
  const lines = logs.split(/\r?\n/);
  const matches: Array<{
    category: FailureCategory;
    evidence: string;
    recommendation: string;
    autoFixable: boolean;
  }> = [];

  for (const line of lines) {
    for (const {
      category,
      patterns,
      recommendation,
      autoFixable,
    } of PATTERNS) {
      if (patterns.some((p) => p.test(line))) {
        matches.push({
          category,
          evidence: line.trim(),
          recommendation,
          autoFixable,
        });
        break; // one category per line
      }
    }
  }

  if (matches.length === 0) {
    return {
      category: 'unknown',
      confidence: 'low',
      evidence: [],
      recommendation:
        'Could not classify the failure automatically. Load `skills/debug-ci-failure/SKILL.md` for manual investigation.',
      autoFixable: false,
    };
  }

  // Find the most common category
  const counts = new Map<FailureCategory, number>();
  for (const m of matches) {
    counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const topCategory = sorted[0][0];
  const topCount = sorted[0][1];
  const topMatch = matches.find((m) => m.category === topCategory)!;

  // Collect unique evidence lines for the top category (max 10)
  const evidence = [
    ...new Set(
      matches.filter((m) => m.category === topCategory).map((m) => m.evidence),
    ),
  ].slice(0, 10);

  return {
    category: topCategory,
    confidence: topCount >= 3 ? 'high' : topCount >= 2 ? 'medium' : 'low',
    evidence,
    recommendation: topMatch.recommendation,
    autoFixable: topMatch.autoFixable,
  };
}

/** Analyze CI failure logs and classify the failure type with fix recommendations. */
export async function autoFix(params: AutoFixParams): Promise<ToolResult> {
  try {
    const maxLines = params.maxLines ?? 500;
    const args = buildLogArgs({
      runId: params.runId,
      jobId: params.jobId,
      attempt: params.attempt,
      failedOnly: true,
    });
    const { lines } = await streamGhLogs(args, maxLines);
    const logs = lines.join('\n');

    const classification = classifyLogs(logs);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              runId: params.runId,
              ...(params.jobId != null && { jobId: params.jobId }),
              ...(params.attempt != null && { attempt: params.attempt }),
              ...classification,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to analyze CI run ${params.runId}: ${message}`,
        },
      ],
    };
  }
}
