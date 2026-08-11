import { runTarget } from './run-target.js';
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

/**
 * Thin, discoverable entry point over `runTarget` for the single-spec
 * iteration loop (LS-8917): resolves `config` to the matching colon-suffixed
 * jest target (e.g. "mobile" -> "test:mobile") that `runTarget` already
 * supports, so agents don't need to know that config-scoped jest projects
 * expose their variants as target suffixes.
 */
export async function runTest(params: RunTestParams): Promise<ToolResult> {
  const validationError = validateTestPathPatterns(params.testPathPatterns);
  if (validationError != null) {
    return {
      content: [{ type: 'text', text: validationError }],
      isError: true,
    };
  }

  const target = params.config ? `test:${params.config}` : 'test';
  return runTarget({
    project: params.project,
    target,
    noCache: params.noCache,
    updateSnapshot: params.updateSnapshot,
    args: ['--testPathPatterns', params.testPathPatterns],
    worktreePath: params.worktreePath,
  });
}
