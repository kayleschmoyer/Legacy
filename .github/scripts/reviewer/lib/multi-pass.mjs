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
      'Focus on correctness: bugs, edge cases, error handling, concurrency, off-by-one errors, null safety, and subtle business logic. Trace data flow through complex conditional branches. Validate business logic invariants and state machine transition completeness — are all valid states reachable, and are invalid transitions rejected? Surface any logic defect, including those that only manifest with specific input combinations.',
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
  {
    name: 'docs',
    focus:
      'Focus on documentation accuracy following the "Documentation Accuracy" section in reviewer-rules.md: stale inline comments/JSDoc, broken symbol/path references in docs, PR description vs diff mismatches, and inaccurate algorithm claims. Do NOT flag comment style, prose quality, or pre-existing inaccuracies in unchanged code.',
  },
];

/**
 * Create the accumulator a caller passes as `opts.resumeState` to make
 * `runMultiPass` resumable across `withRetry` attempts.
 *
 * @returns {{passes: Array<{passName: string, text: string}>, usage: import('./providers/provider.mjs').ProviderUsage}}
 */
export function createResumeState() {
  return {
    passes: [],
    usage: {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    },
  };
}

/**
 * Run four sequential review passes (correctness → security → contract → docs).
 *
 * Each pass receives the same `system` and base `user` prompt so prompt caching
 * is effective on the Anthropic provider; only the focus instruction appended to
 * `user` differs per pass.
 *
 * **Resumability (LS-9983).** Without `resumeState` a retry re-runs all four
 * passes from scratch, so a throttle on the last pass re-spends three
 * already-successful requests against the same per-minute quota the retry is
 * waiting on — a 4× quota amplifier at exactly the moment the quota is the
 * scarce resource. Pass a caller-owned `resumeState` (see `createResumeState`)
 * and each attempt picks up at the first pass that has not completed yet.
 *
 * @param {object} provider  LLMProvider instance
 * @param {string} system    Shared system prompt
 * @param {string} user      Base user prompt (PR context + diff)
 * @param {object} [opts]
 * @param {import('./cost-cap.mjs').CostCap} [opts.costCap]  Cost cap instance; throws CostCapExceededError if limit is hit
 * @param {string} [opts.providerName]  Provider name passed to costCap.estimateCost (default: 'anthropic')
 * @param {{passes: Array<{passName: string, text: string}>, usage: import('./providers/provider.mjs').ProviderUsage}} [opts.resumeState]
 *   Caller-owned accumulator shared across retry attempts. Omit for a
 *   self-contained single run.
 * @returns {Promise<{passes: Array<{passName: string, text: string}>, usage: import('./providers/provider.mjs').ProviderUsage}>}
 */
export async function runMultiPass(
  provider,
  system,
  user,
  { costCap, providerName = 'anthropic', resumeState } = {},
) {
  const state = resumeState ?? createResumeState();
  const { passes, usage } = state;
  const completed = new Set(passes.map((p) => p.passName));
  for (const pass of PASSES) {
    if (completed.has(pass.name)) continue;
    const focusedUser = `${user}\n\n---\n\n**Review focus for this pass**: ${pass.focus}`;
    if (costCap) {
      const estimate = costCap.estimateCost(
        system.length + focusedUser.length,
        providerName,
      );
      costCap.checkBefore(estimate);
    }
    const result = await provider.review({ system, user: focusedUser });
    if (costCap) {
      costCap.add(result.usage);
      costCap.checkAfter();
    }
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
