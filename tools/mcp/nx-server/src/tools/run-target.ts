import { minifiedJson } from '@legacy-sports/mcp-format';
import {
  buildJestReportResult,
  JEST_REPORT_JOB_KIND,
} from './jest-report-result.js';
import type { JestReportRequest } from './jest-report-result.js';
import { stripAnsiCodes } from '../ansi.js';
import { DAEMON_FAILURE_HINT, isDaemonFailure } from '../daemon-failure.js';
import { nxJobSpec, SYNC_BUDGET_MS } from '../nx-job.js';
import {
  PLUGIN_WORKER_RETRY_EXHAUSTED_HINT,
  PLUGIN_WORKER_TIMEOUT_HINT,
} from '../plugin-worker-failure.js';
import { runJobWithPluginWorkerRetry } from '../plugin-worker-retry.js';
import { buildProjectNotFoundHint } from '../project-resolution.js';
import { getRepoRoot } from '../run-command.js';
import { MAX_OUTPUT_CHARS, truncateOutput } from '../truncate-output.js';
import type { ToolResult } from '../types.js';

// 30-minute process timeout — a runaway backstop only, NOT a transport guard
// (that is the sync budget + bounded nx_job_wait calls). Generous on purpose:
// a cold Nx cache can push a single build/test run well past 5 minutes, and
// killing legitimate work forces a retry loop that never converges (LS-8353).
const NX_RUN_TIMEOUT_MS = 30 * 60 * 1000;

const ALLOWED_TARGETS = new Set([
  'build',
  'test',
  'lint',
  'typecheck',
  'codegen',
  'serve',
  'dev',
  'print-schema',
  'deploy:plan',
  'e2e',
  'integration',
  'storybook',
  'format',
]);

/**
 * A target is allowed if it exactly matches an entry in ALLOWED_TARGETS
 * (e.g. "deploy:plan"), or if it is a colon-suffixed sub-variant of an
 * allowed base target (e.g. "test:web" is a variant of the allowed "test").
 * Exported for unit testing.
 */
export function isTargetAllowed(target: string): boolean {
  if (ALLOWED_TARGETS.has(target)) return true;
  return target.includes(':') && ALLOWED_TARGETS.has(target.split(':')[0]);
}

/**
 * Shell metacharacters that must not appear in passthrough args.
 *
 * On Windows, pnpm is a `.cmd` batch script that requires `shell: true`
 * (cmd.exe). `runCommand` in run-command.ts wraps args containing `|`, `<`,
 * `>`, and now `(`/`)` in double-quotes via `escapeCmdShellArg` so cmd.exe
 * treats them as literals. The remaining characters below are blocked
 * entirely because they have no legitimate use in nx target args and cannot
 * be safely escaped.
 *
 * Pipe `|` is intentionally NOT blocked — it is a valid Jest
 * `--testPathPatterns` alternation operator and is double-quote-wrapped by
 * `escapeCmdShellArg` before the command reaches cmd.exe.
 *
 * Parens `(`/`)` are intentionally NOT blocked — Expo Router route-group
 * path segments (e.g. `(app)/(tabs)/`) are valid, common Jest
 * `--testPathPatterns` characters. Like `|`, they are double-quote-wrapped
 * by `escapeCmdShellArg` before the command reaches cmd.exe, so a bare
 * unquoted `(app)` token is not itself an injection vector.
 */
const SHELL_METACHAR_REGEX = /[;&`${}]/;

interface RunTargetParams {
  project?: string;
  target: string;
  configuration?: string;
  noCache?: boolean;
  updateSnapshot?: boolean;
  args?: string | string[];
  env?: Record<string, string>;
  worktreePath?: string;
  /**
   * Structured Jest failure reporting (LS-10092). Set by nx_run_test's
   * `report` param: appends `--json --outputFile=<temp>` and returns the
   * server-parsed failure list instead of the raw log. Ignored for non-test
   * targets, where the shape would be meaningless.
   */
  jestReport?: JestReportRequest;
}

/**
 * project omitted, or the literal "all", means "every project that declares
 * this target" — equivalent to `nx run-many -t <target>`. Exported for unit
 * testing.
 */
export function isRunMany(project: string | undefined): boolean {
  return project == null || project === 'all';
}

/**
 * On Windows, multiple space-separated values after --testPathPatterns break
 * the cmd.exe invocation because each token becomes a separate shell word and
 * the pipe used for Jest regex alternation is interpreted by cmd.exe before
 * `escapeCmdShellArg` can wrap it. Coalesce trailing non-flag values into a
 * single pipe-separated token so the whole value is double-quoted as one unit.
 *
 * e.g. ["--testPathPatterns", "FileA", "FileB"] → ["--testPathPatterns", "FileA|FileB"]
 * e.g. ["--testPathPatterns=FileA", "FileB"]    → ["--testPathPatterns=FileA|FileB"]
 *
 * A value that already arrives as a single pre-joined pipe-separated token
 * (e.g. ["--testPathPatterns", "FileA|FileB"]) needs no coalescing here — it
 * is already one token — but it still gets quoted correctly downstream:
 * `pnpmJobSpec` (nx-job.ts) maps `escapeCmdShellArg` over *every* arg in the
 * final pnpm/nx invocation on Windows, coalesced or not (see LS-8498, which
 * verified this end-to-end rather than assuming quoting only happens here).
 *
 * Exported for unit testing.
 */
export function coalesceWindowsTestPathPatterns(tokens: string[]): string[] {
  const result = [...tokens];

  // Bare form: --testPathPatterns value1 value2 ...
  const patternsIdx = result.findIndex((t) => t === '--testPathPatterns');
  if (patternsIdx !== -1 && patternsIdx + 2 < result.length) {
    const valueTokens: string[] = [];
    let i = patternsIdx + 1;
    while (i < result.length && !result[i].startsWith('-')) {
      valueTokens.push(result[i]);
      i++;
    }
    if (valueTokens.length > 1) {
      result.splice(patternsIdx + 1, valueTokens.length, valueTokens.join('|'));
    }
  }

  // Equals form: --testPathPatterns=value1 value2 ...
  const eqIdx = result.findIndex((t) => t.startsWith('--testPathPatterns='));
  if (eqIdx !== -1) {
    const valueTokens: string[] = [];
    let i = eqIdx + 1;
    while (i < result.length && !result[i].startsWith('-')) {
      valueTokens.push(result[i]);
      i++;
    }
    if (valueTokens.length > 0) {
      const base = result[eqIdx];
      result.splice(
        eqIdx,
        1 + valueTokens.length,
        `${base}|${valueTokens.join('|')}`,
      );
    }
  }

  return result;
}

// Allows an optional npm-style scope prefix (e.g. "@legacy-sports/video")
// in addition to a bare project name, since Nx projects declared with a
// scoped package.json `name` resolve under their full scoped name (LS-10119).
const NX_NAME_REGEX = /^(@[a-z0-9-._]+\/)?[a-z0-9-._]+$/i;

export async function runTarget(params: RunTargetParams): Promise<ToolResult> {
  const cwd = params.worktreePath || getRepoRoot();

  const runMany = isRunMany(params.project);

  if (!runMany && !NX_NAME_REGEX.test(params.project as string)) {
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
  if (
    params.configuration != null &&
    !NX_NAME_REGEX.test(params.configuration)
  ) {
    return {
      content: [
        {
          type: 'text',
          text: `Invalid configuration name: "${params.configuration}". Only alphanumeric characters, hyphens, underscores, and dots are allowed.`,
        },
      ],
      isError: true,
    };
  }

  if (!isTargetAllowed(params.target)) {
    return {
      content: [
        {
          type: 'text',
          text: `Target "${params.target}" is not in the allowed list. Allowed: ${[...ALLOWED_TARGETS].join(', ')}. Use the terminal for other targets.`,
        },
      ],
      isError: true,
    };
  }

  try {
    const runSpec = params.configuration
      ? `${params.project}:${params.target}:${params.configuration}`
      : `${params.project}:${params.target}`;

    // Jest-specific arg handling (--all injection, --updateSnapshot) applies
    // equally to colon-suffixed test variants (test:web, test:mobile,
    // test:stories) since they are @nx/jest:jest executors too.
    const isTestTarget =
      params.target === 'test' || params.target.startsWith('test:');

    // The structured report is a Jest-specific output shape — meaningless for
    // build/lint/codegen, so it is dropped rather than honoured on those.
    const jestReport = isTestTarget ? params.jestReport : undefined;

    // run-many fans the target out across every project that declares it
    // (equivalent to `nx run-many -t <target>`) instead of targeting one
    // project:target pair — the -t/--configuration flag shapes differ from
    // the single-project `run <project>:<target>` invocation.
    const nxArgs = runMany
      ? ['run-many', '-t', params.target]
      : ['run', runSpec];
    if (runMany && params.configuration) {
      nxArgs.push(`--configuration=${params.configuration}`);
    }
    if (params.noCache) nxArgs.push('--skip-nx-cache');
    if (params.args) {
      const tokens = Array.isArray(params.args)
        ? params.args
        : params.args.split(/\s+/).filter(Boolean);

      for (const token of tokens) {
        if (SHELL_METACHAR_REGEX.test(token)) {
          return {
            content: [
              {
                type: 'text',
                text: `Arg "${token}" contains shell metacharacters (;&\`\${}) which are not allowed. Pass each flag as a separate array element.`,
              },
            ],
            isError: true,
          };
        }
      }

      // Translate deprecated Jest flags to current equivalents
      let translated = tokens.map((t) =>
        t.startsWith('--testPathPattern=')
          ? t.replace('--testPathPattern=', '--testPathPatterns=')
          : t === '--testPathPattern'
            ? '--testPathPatterns'
            : t,
      );

      // On Windows, coalesce multiple --testPathPatterns values into a single
      // pipe-separated token before escapeCmdShellArg double-quotes the value.
      if (process.platform === 'win32') {
        translated = coalesceWindowsTestPathPatterns(translated);
      }

      // When running specific tests via --testPathPatterns, automatically add
      // --all to override --onlyChanged baked into package.json test scripts.
      // Without this, jest's --onlyChanged filters out files that haven't been
      // modified in git, causing "0 tests found" even with an explicit pattern.
      if (
        isTestTarget &&
        translated.some((t) => t.startsWith('--testPathPatterns'))
      ) {
        if (!translated.some((t) => t === '--all' || t === '--onlyChanged')) {
          translated.push('--all');
        }
      }

      nxArgs.push('--', ...translated);
    } else if ((params.updateSnapshot && isTestTarget) || jestReport) {
      // No extra args provided — still need the -- separator for the Jest
      // flags appended below.
      nxArgs.push('--');
    }

    // Append --updateSnapshot after all other Jest flags when requested.
    if (params.updateSnapshot && isTestTarget) {
      nxArgs.push('--updateSnapshot');
    }

    // Jest writes the machine-readable report to a temp file rather than
    // stdout so nx's own wrapper lines can't corrupt the JSON (LS-10092).
    if (jestReport) {
      nxArgs.push('--json', `--outputFile=${jestReport.outputFile}`);
    }

    // Run as a background job with a bounded sync wait: fast targets return
    // their result in one call, slow ones return a jobId to poll via
    // nx_job_wait — never blocking into the ~60s cloud MCP transport timeout.
    // The job log captures stdout and stderr interleaved, so Jest's
    // stderr-written test summary is always included.
    const spec = nxJobSpec(nxArgs);
    const { snapshot, pluginWorkerRetried } = await runJobWithPluginWorkerRetry(
      {
        command: spec.command,
        args: spec.args,
        shell: spec.shell,
        cwd,
        label: runMany
          ? `nx run-many -t ${params.target}`
          : `nx run ${runSpec}`,
        timeoutMs: NX_RUN_TIMEOUT_MS,
        // Blind retries (e.g. after a lost transport) join the in-flight run
        // instead of spawning a duplicate nx process. In report mode the key
        // includes the run's unique --outputFile, so two concurrent report
        // calls deliberately do NOT join: each needs its own report file, and
        // sharing one would have the second run overwrite the first's results
        // mid-read.
        idempotencyKey: `nx-run:${cwd}:${nxArgs.join(' ')}`,
        env: params.env,
        // Only report-mode runs get a meta.kind: without one, job-tools.ts
        // renders the generic passed/output snapshot exactly as before.
        ...(jestReport
          ? {
              meta: {
                kind: JEST_REPORT_JOB_KIND,
                mode: jestReport.mode,
                outputFile: jestReport.outputFile,
                project: params.project ?? 'all',
                target: params.target,
                cwd,
              },
            }
          : {}),
      },
      SYNC_BUDGET_MS,
    );

    if (snapshot.status === 'running' || snapshot.status === 'orphaned') {
      return {
        content: [
          {
            type: 'text',
            text: minifiedJson({
              project: params.project ?? 'all',
              target: params.target,
              status: snapshot.status,
              jobId: snapshot.jobId,
              elapsedSec: snapshot.elapsedSec,
              ...(pluginWorkerRetried ? { pluginWorkerRetried: true } : {}),
              logTail: truncateOutput(
                stripAnsiCodes(snapshot.logTail ?? ''),
                MAX_OUTPUT_CHARS,
              ),
              hint: snapshot.hint,
            }),
          },
        ],
        ...(snapshot.status === 'orphaned' ? { isError: true } : {}),
      };
    }

    if (jestReport) {
      const formatted = await buildJestReportResult(snapshot);
      return {
        content: [
          {
            type: 'text',
            text: minifiedJson({
              ...formatted.body,
              ...(pluginWorkerRetried ? { pluginWorkerRetried: true } : {}),
            }),
          },
        ],
        ...(formatted.isError ? { isError: true } : {}),
      };
    }

    // ANSI escapes inflate the character budget by 40-80% and sit between
    // semantically adjacent characters, breaking the pattern matching the
    // daemon / plugin-worker / project-not-found checks below do on this same
    // text (LS-10092 — the same root cause LS-9557 fixed for ci_get_logs).
    const rawOutput = stripAnsiCodes(snapshot.log ?? '');
    // A daemon that fails to compute the project graph still exits 0 (LS-8819)
    // — deriving `passed` from status alone reports a false green on zero
    // tasks run. Only checked on an otherwise-"done" status; an exit-code
    // failure is already correctly reported without this override.
    const daemonFailed =
      snapshot.status === 'done' && isDaemonFailure(rawOutput);
    const passed = snapshot.status === 'done' && !daemonFailed;
    // runJobWithPluginWorkerRetry already retried once with
    // NX_ISOLATE_PLUGINS=false if the first attempt failed with the isolated
    // plugin-worker IPC handshake timeout signature (LS-9282) — surface why.
    const pluginWorkerHint = pluginWorkerRetried
      ? passed
        ? PLUGIN_WORKER_TIMEOUT_HINT
        : PLUGIN_WORKER_RETRY_EXHAUSTED_HINT
      : undefined;
    // A failed run whose `project` param didn't resolve to a real nx project
    // gets a bare "Cannot find project '<name>'" from the nx CLI with no
    // suggestion (LS-9880) — fuzzy-resolve the likely correct name(s) so the
    // caller doesn't have to grep project.json files by hand.
    const projectNotFoundHint =
      !passed && !daemonFailed
        ? await buildProjectNotFoundHint(rawOutput, cwd)
        : undefined;
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            project: params.project ?? 'all',
            target: params.target,
            passed,
            ...(pluginWorkerRetried ? { pluginWorkerRetried: true } : {}),
            ...(daemonFailed
              ? { daemonError: true, hint: DAEMON_FAILURE_HINT }
              : {}),
            ...(snapshot.error ? { error: snapshot.error } : {}),
            ...(pluginWorkerHint && !daemonFailed
              ? { hint: pluginWorkerHint }
              : projectNotFoundHint
                ? { hint: projectNotFoundHint }
                : {}),
            output: truncateOutput(rawOutput, MAX_OUTPUT_CHARS),
          }),
        },
      ],
      ...(passed ? {} : { isError: true }),
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: truncateOutput(
            `Failed to run ${params.project ?? 'all'}:${params.target}: ${error instanceof Error ? error.message : String(error)}`,
            MAX_OUTPUT_CHARS,
          ),
        },
      ],
      isError: true,
    };
  }
}
