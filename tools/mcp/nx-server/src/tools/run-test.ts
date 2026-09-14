import { minifiedJson } from '@legacy-sports/mcp-format';
import { newJestReportFile } from './jest-report-result.js';
import type { JestReportMode } from './jest-report-result.js';
import {
  resolveTestTargetPlan,
  targetShellJoinsArgs,
} from './resolve-test-target.js';
import { runTarget } from './run-target.js';
import { MAX_FAILURES } from '../jest-report.js';
import { getRepoRoot } from '../run-command.js';
import { quoteForShellJoin } from '../shell-join-quote.js';
import type { ToolResult } from '../types.js';

export interface RunTestParams {
  project: string;
  /** Jest --testPathPatterns value. Required unless `files` is used instead. */
  testPathPatterns?: string;
  testNamePattern?: string;
  config?: string;
  updateSnapshot?: boolean;
  noCache?: boolean;
  worktreePath?: string;
  /**
   * Structured failure reporting (LS-10092). Omitted, the response shape is
   * unchanged. "summary" returns only the parsed counts and failure list;
   * "json" returns those plus the ANSI-stripped raw output.
   */
  report?: JestReportMode;
  /**
   * Project-relative file paths, for a project whose "test" target runs
   * through Node's own test runner (`nx:run-commands` running
   * `node --test ...`) rather than Jest (LS-10159). Appended as positional
   * args to the underlying command. Ignored for Jest targets, which use
   * `testPathPatterns` instead.
   */
  files?: string[];
}

/**
 * Real spec names/patterns are short; a long value has no legitimate use
 * here and only widens the ReDoS surface of the regex Jest builds from it.
 */
const MAX_PATTERN_LENGTH = 300;

/**
 * Rejects the classic catastrophic-backtracking shape: a group ending in a
 * quantifier immediately followed by another quantifier, e.g. `(a+)+`,
 * `(a*)*`, `(a|a)+`. Not exhaustive, but blocks the well-known ReDoS
 * patterns without restricting normal spec-name/pipe-alternation usage.
 */
const NESTED_QUANTIFIER_REGEX = /\([^()]*[+*]\)[+*]/;

function validatePattern(paramName: string, value: string): string | null {
  if (value.length > MAX_PATTERN_LENGTH) {
    return `${paramName} exceeds ${MAX_PATTERN_LENGTH} characters — pass a shorter pattern.`;
  }
  if (NESTED_QUANTIFIER_REGEX.test(value)) {
    return `${paramName} contains a nested-quantifier shape (e.g. "(a+)+") that risks catastrophic regex backtracking. Use a simpler pattern.`;
  }
  return null;
}

/**
 * Whether either pattern value could be split by a shell word-split. Only
 * called once `testPathPatterns` has already been validated as present.
 */
function hasWhitespaceValue(params: RunTestParams): boolean {
  return (
    /\s/.test(params.testPathPatterns ?? '') ||
    /\s/.test(params.testNamePattern ?? '')
  );
}

/**
 * `shellJoinsArgs` is set when the resolved target runs through
 * `nx:run-script`, which joins the `--` passthrough into a single shell
 * command string. Multi-word pattern values then re-split into separate
 * shell words — the first word survives as the flag's value and the rest
 * reach Jest as bare positionals, i.e. extra test path patterns (LS-10153).
 * Pre-quoting the values keeps each one a single word; on every other
 * executor the values are passed through verbatim, since quote characters
 * would otherwise land inside the Jest regex.
 */
function runJestTarget(
  params: RunTestParams,
  target: string,
  shellJoinsArgs: boolean,
): Promise<ToolResult> {
  const quote = (value: string) =>
    shellJoinsArgs ? quoteForShellJoin(value) : value;

  // Callers only reach here once testPathPatterns has been validated as
  // present (the Jest-target branches of runTest all check it first).
  const args = ['--testPathPatterns', quote(params.testPathPatterns as string)];
  if (params.testNamePattern) {
    args.push('--testNamePattern', quote(params.testNamePattern));
  }
  return runTarget({
    project: params.project,
    target,
    noCache: params.noCache,
    updateSnapshot: params.updateSnapshot,
    args,
    worktreePath: params.worktreePath,
    // One report file per target: a fanned-out run executes several Jest
    // targets concurrently, and a shared path would have them overwrite each
    // other's report.
    ...(params.report
      ? { jestReport: { mode: params.report, outputFile: newJestReportFile() } }
      : {}),
  });
}

/**
 * Runs an `nx:run-commands` `node --test` target (LS-10159), appending
 * `files` as plain positional args instead of Jest's `--testPathPatterns`.
 * `updateSnapshot`/`report` are Jest-specific and have no equivalent here,
 * so they are not forwarded.
 */
function runNodeTestTarget(
  params: RunTestParams,
  target: string,
): Promise<ToolResult> {
  return runTarget({
    project: params.project,
    target,
    noCache: params.noCache,
    args: params.files,
    worktreePath: params.worktreePath,
  });
}

/** The report fields `mergeFanoutResults` rolls up across fanned-out targets. */
interface PerTargetReportFields {
  numTotalTests?: unknown;
  numPassedTests?: unknown;
  numFailedTests?: unknown;
  numFailedTestSuites?: unknown;
  failures?: unknown;
}

function sumField(
  parsedResults: unknown[],
  field: keyof PerTargetReportFields,
): number {
  return parsedResults.reduce<number>((total, parsed) => {
    const value = (parsed as PerTargetReportFields | null)?.[field];
    return total + (typeof value === 'number' ? value : 0);
  }, 0);
}

/**
 * Roll the per-target structured reports up into one top-level failure list
 * (LS-10092). Without this, a fanned-out run in report mode would make the
 * caller walk N nested per-target objects to assemble the very list the mode
 * exists to hand them. Returns null when no target produced a parsed report
 * (e.g. every one was an Nx cache replay), so the caller omits the fields
 * rather than reporting a fabricated zero-failure roll-up.
 */
function aggregateFanoutReport(
  parsedResults: unknown[],
): Record<string, unknown> | null {
  const withReport = parsedResults.filter(
    (parsed) =>
      parsed != null &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as PerTargetReportFields).failures),
  );
  if (withReport.length === 0) return null;

  const failures = withReport.flatMap(
    (parsed) => (parsed as { failures: unknown[] }).failures,
  );
  const omitted = Math.max(0, failures.length - MAX_FAILURES);

  return {
    numTotalTests: sumField(withReport, 'numTotalTests'),
    numPassedTests: sumField(withReport, 'numPassedTests'),
    numFailedTests: sumField(withReport, 'numFailedTests'),
    numFailedTestSuites: sumField(withReport, 'numFailedTestSuites'),
    failures: failures.slice(0, MAX_FAILURES),
    ...(omitted > 0 ? { omittedFailures: omitted } : {}),
  };
}

/** Merges one `runTarget` result per fanned-out jest target into one ToolResult. */
function mergeFanoutResults(
  project: string,
  perTarget: Array<{ target: string; result: ToolResult }>,
  skipped: string[],
  report: JestReportMode | undefined,
): ToolResult {
  const results: Record<string, unknown> = {};
  const parsedResults: unknown[] = [];
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
    parsedResults.push(parsed);
    if (result.isError) passed = false;
  }

  const aggregate = report ? aggregateFanoutReport(parsedResults) : null;
  if (aggregate) {
    // The failure lists are rolled up top-level and every failure names its
    // own suite, so leaving the per-target copies in place would bill the
    // same content twice.
    for (const [target, parsed] of Object.entries(results)) {
      if (parsed != null && typeof parsed === 'object') {
        const { failures: _rolledUp, ...rest } = parsed as {
          failures?: unknown;
        };
        results[target] = rest;
      }
    }
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
          ...(aggregate ?? {}),
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
 *
 * Some projects' "test" target isn't Jest at all — an `nx:run-commands`
 * target running `node --test ...` (e.g. ci-reviewer) — where
 * `testPathPatterns`/`testNamePattern` have nothing to bind to (LS-10159).
 * That case is detected the same way and routed to `files: string[]`
 * instead, appended as positional args, with an explicit error rather than
 * a silent full-suite run when `files` is missing.
 */
export async function runTest(params: RunTestParams): Promise<ToolResult> {
  const validationError =
    (params.testPathPatterns != null
      ? validatePattern('testPathPatterns', params.testPathPatterns)
      : null) ??
    (params.testNamePattern != null
      ? validatePattern('testNamePattern', params.testNamePattern)
      : null);
  if (validationError != null) {
    return {
      content: [{ type: 'text', text: validationError }],
      isError: true,
    };
  }

  const cwd = params.worktreePath || getRepoRoot();

  if (params.config) {
    if (!params.testPathPatterns) {
      return {
        content: [
          {
            type: 'text',
            text: 'testPathPatterns is required when config is set (config targets a Jest variant).',
          },
        ],
        isError: true,
      };
    }
    const target = `test:${params.config}`;
    // The executor lookup costs an `nx show project --json` spawn, which on a
    // cold project graph is seconds the caller's sync budget has to absorb.
    // Only a value with whitespace in it can be split by a shell-joining
    // executor, so single-word patterns — the common case — skip the lookup
    // and keep this path as fast as it was before LS-10153.
    const shellJoinsArgs =
      hasWhitespaceValue(params) &&
      (await targetShellJoinsArgs(params.project, target, cwd));
    return runJestTarget(params, target, shellJoinsArgs);
  }

  const plan = await resolveTestTargetPlan(params.project, cwd);

  if (plan.kind === 'error') {
    return {
      content: [{ type: 'text', text: plan.message }],
      isError: true,
    };
  }

  if (plan.kind === 'nodeTest') {
    if (!params.files || params.files.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `"${params.project}"'s "test" target runs via Node's own test runner (node --test), not Jest — testPathPatterns/testNamePattern don't apply. Pass files: string[] (paths relative to the project root, e.g. ["lib/__tests__/retry.test.mjs"]) to select which files run.`,
          },
        ],
        isError: true,
      };
    }
    return runNodeTestTarget(params, plan.target);
  }

  if (plan.kind === 'single') {
    if (!params.testPathPatterns) {
      return {
        content: [
          {
            type: 'text',
            text: 'testPathPatterns is required for a Jest target.',
          },
        ],
        isError: true,
      };
    }
    return runJestTarget(params, plan.target, plan.shellJoinsArgs);
  }

  if (!params.testPathPatterns) {
    return {
      content: [
        {
          type: 'text',
          text: 'testPathPatterns is required for a Jest target.',
        },
      ],
      isError: true,
    };
  }

  const perTarget = await Promise.all(
    plan.targets.map(async (target) => ({
      target,
      // Fan-out targets are jest-executor deps only — argv is forwarded
      // untouched, so no shell-join quoting applies.
      result: await runJestTarget(params, target, false),
    })),
  );

  return mergeFanoutResults(
    params.project,
    perTarget,
    plan.skipped,
    params.report,
  );
}
