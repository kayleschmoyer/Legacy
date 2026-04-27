const LOC_THRESHOLD = 150;

const SENSITIVE_PATH_PATTERNS = [
  /^lib\/auth\//,
  /^lib\/payments\//,
  /^lambdas\/auth\//,
  /^lambdas\/payments\//,
  /^lib\/db-client\/migrations\//,
  /^terraform\//,
  /^\.github\/workflows\//,
];

function countDiffLoc(diff) {
  let count = 0;
  for (const line of diff.split('\n')) {
    if (
      (line.startsWith('+') || line.startsWith('-')) &&
      !line.startsWith('+++') &&
      !line.startsWith('---')
    ) {
      count++;
    }
  }
  return count;
}

function touchesSensitivePaths(diff) {
  for (const match of diff.matchAll(/^diff --git a\/(.+) b\/(.+)$/gm)) {
    const oldPath = match[1];
    const newPath = match[2];
    if (
      SENSITIVE_PATH_PATTERNS.some((p) => p.test(oldPath) || p.test(newPath))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Returns true when the PR qualifies for single-pass review (≤150 LOC and no
 * sensitive paths touched). Returns false when multi-pass is required.
 *
 * @param {string} diff  Unified diff from `gh pr diff`
 * @returns {boolean}
 */
export function isTrivialPR(diff) {
  return countDiffLoc(diff) <= LOC_THRESHOLD && !touchesSensitivePaths(diff);
}

// Each pass has a name and a per-pass focus instruction appended to the user prompt.
// The base system prompt and diff context are shared across all passes so
// the Anthropic provider can cache them; only the focus line is fresh content.
const PASSES = [
  {
    name: 'correctness',
    focus:
      'Focus on correctness: bugs, edge cases, error handling, concurrency, off-by-one errors, and null safety. Surface any logic defects.',
  },
  {
    name: 'security',
    focus:
      'Focus on security: injection vulnerabilities, authentication/authorization flaws, secrets exposure, input validation, dependency risk, SSRF, and deserialization issues.',
  },
  {
    name: 'contract',
    focus:
      'Focus on contracts: API breakage, missing or inadequate tests, type safety violations, and downstream caller impact.',
  },
];

/**
 * Run three sequential review passes (correctness → security → contract).
 *
 * Each pass receives the same `system` and base `user` prompt so prompt caching
 * is effective on the Anthropic provider; only the focus instruction appended to
 * `user` differs per pass.
 *
 * @param {object} provider  LLMProvider instance
 * @param {string} system    Shared system prompt
 * @param {string} user      Base user prompt (PR context + diff)
 * @returns {Promise<{passes: Array<{passName: string, text: string}>, usage: import('./providers/provider.mjs').ProviderUsage}>}
 */
export async function runMultiPass(provider, system, user) {
  const passes = [];
  const usage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
  };
  for (const pass of PASSES) {
    const focusedUser = `${user}\n\n---\n\n**Review focus for this pass**: ${pass.focus}`;
    const result = await provider.review({ system, user: focusedUser });
    passes.push({ passName: pass.name, text: result.text });
    if (result.usage) {
      usage.inputTokens += result.usage.inputTokens ?? 0;
      usage.cachedInputTokens += result.usage.cachedInputTokens ?? 0;
      usage.outputTokens += result.usage.outputTokens ?? 0;
      usage.costUsd += result.usage.costUsd ?? 0;
    }
  }
  return { passes, usage };
}
