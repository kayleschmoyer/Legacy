import { minifiedJson } from '@legacy-sports/mcp-format';
import { resolveTestTargetPlan } from './resolve-test-target.js';
import { runTarget } from './run-target.js';
import { getRepoRoot } from '../run-command.js';
import type { ToolResult } from '../types.js';

export interface RunTestParams {
  project: string;
  testPathPatterns: string;
  config?: string;
  updateSnapshot?: boolean;
  noCache?: boolean;
  worktreePath?: string;
}

/**
 * Real spec names/patterns are short; a long value has no legitimate use
 * here and only widens the ReDoS surface of the regex Jest builds from it.
 */
const MAX_TEST_PATH_PATTERNS_LENGTH = 300;

/**
 * Rejects the classic catastrophic-backtracking shape: a group ending in a
 * quantifier immediately followed by another quantifier, e.g. `(a+)+`,
 * `(a*)*`, `(a|a)+`. Not exhaustive, but blocks the well-known ReDoS
 * patterns without restricting normal spec-name/pipe-alternation usage.
 */
const NESTED_QUANTIFIER_REGEX = /\([^()]*[+*]\)[+*]/;

function validateTestPathPatterns(value: string): string | null {
  if (value.length > MAX_TEST_PATH_PATTERNS_LENGTH) {
    return `testPathPatterns exceeds ${MAX_TEST_PATH_PATTERNS_LENGTH} characters — pass a shorter spec name/pattern (or pipe-separated list).`;
  }
  if (NESTED_QUANTIFIER_REGEX.test(value)) {
    return 'testPathPatterns contains a nested-quantifier shape (e.g. "(a+)+") that risks catastrophic regex backtracking. Use a simpler pattern.';
  }
  return null;
}

function runJestTarget(
  params: RunTestParams,
  target: string,
): Promise<ToolResult> {
  return runTarget({
    project: params.project,
    target,
    noCache: params.noCache,
    updateSnapshot: params.updateSnapshot,
    args: ['--testPathPatterns', params.testPathPatterns],
    worktreePath: params.worktreePath,
  });
}

/** Merges one `runTarget` result per fanned-out jest target into one ToolResult. */
function mergeFanoutResults(
  project: string,
  perTarget: Array<{ target: string; result: ToolResult }>,
  skipped: string[],
): ToolResult {
  const results: Record<string, unknown> = {};
  let passed = true;
  for (const { target, result } of perTarget) {
    const text = result.content[0]?.text ?? '';
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Not JSON (e.g. a plain error string) — keep the raw text.
    }
    results[target] = parsed;
    if (result.isError) passed = false;
  }

  return {
    content: [
      {
        type: 'text',
        text: minifiedJson({
          project,
          fannedOutFromAggregateTarget: 'test',
          targets: perTarget.map((r) => r.target),
          ...(skipped.length ? { skippedNonJestTargets: skipped } : {}),
          passed,
          results,
        }),
      },
    ],
    ...(passed ? {} : { isError: true }),
  };
}

/**
 * Thin, discoverable entry point over `runTarget` for the single-spec
 * iteration loop (LS-8917): resolves `config` to the matching colon-suffixed
 * jest target (e.g. "mobile" -> "test:mobile") that `runTarget` already
 * supports, so agents don't need to know that config-scoped jest projects
 * expose their variants as target suffixes.
 *
 * When `config` is omitted, the plain "test" target is inspected first
 * (LS-9886): some projects (e.g. shared-components) define it as an
 * `nx:noop` aggregate over config-scoped jest targets, which silently drops
 * `testPathPatterns` and runs the full, unfiltered suite. In that case the
 * pattern is fanned out across the aggregate's jest-executor dependencies
 * and the results are merged, instead of silently running everything.
 */
export async function runTest(params: RunTestParams): Promise<ToolResult> {
  const validationError = validateTestPathPatterns(params.testPathPatterns);
  if (validationError != null) {
    return {
      content: [{ type: 'text', text: validationError }],
      isError: true,
    };
  }

  if (params.config) {
    return runJestTarget(params, `test:${params.config}`);
  }

  const cwd = params.worktreePath || getRepoRoot();
  const plan = await resolveTestTargetPlan(params.project, cwd);

  if (plan.kind === 'error') {
    return {
      content: [{ type: 'text', text: plan.message }],
      isError: true,
    };
  }

  if (plan.kind === 'single') {
    return runJestTarget(params, plan.target);
  }

  const perTarget = await Promise.all(
    plan.targets.map(async (target) => ({
      target,
      result: await runJestTarget(params, target),
    })),
  );

  return mergeFanoutResults(params.project, perTarget, plan.skipped);
}
