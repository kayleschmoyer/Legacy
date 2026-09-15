import { minifiedJson } from '@legacy-sports/mcp-format';
import { existsSync } from 'node:fs';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { registerJobFormatter } from '../job-formatters.js';
import type { FormattedJobResult } from '../job-formatters.js';
import { runJobWithBudget } from '../jobs.js';
import type { JobSnapshot } from '../jobs.js';
import { binJobSpec, SYNC_BUDGET_MS } from '../nx-job.js';
import { getRepoRoot } from '../run-command.js';
import { MAX_OUTPUT_CHARS, truncateOutput } from '../truncate-output.js';
import type { ToolResult } from '../types.js';

/** Characters that must not appear in spec paths (no legitimate use case there). */
const UNSAFE_SPEC_CHARS = /[;&`$(){}|<>'"\r\n]/;

/**
 * Characters that must not appear in grep patterns.
 *
 * Standard regex metacharacters (`|`, `(`, `)`, `[`, `]`, `+`, `?`, `.`, `*`,
 * `^`, `$`) are allowed — Playwright's own `--grep` flag accepts arbitrary JS
 * regex, and grep is passed as a single argv element with no shell string
 * interpolation: on POSIX, `pnpmJobSpec` runs with `shell: false`; on Windows
 * it runs through cmd.exe but `escapeCmdShellArg` (cmd-escape.ts) quotes any
 * arg containing `|`, `(`, `)`, `<`, `>`, or whitespace, and `$`/`[`/`]`/`+`/
 * `?`/`.`/`*`/`^` are not cmd.exe metacharacters. True shell metacharacters
 * that could still corrupt the command line (command separators, backticks,
 * braces, redirects, quotes, newlines) remain blocked.
 */
const UNSAFE_GREP_CHARS = /[;&`{}<>'"\r\n]/;

const ALLOWED_PROJECTS = new Set([
  'chromium',
  'firefox',
  'webkit',
  'Mobile Chrome',
  'Mobile Safari',
]);

/**
 * 30 minutes — matches the other nx-server long-running job tools
 * (NX_RUN_TIMEOUT_MS, AFFECTED_TIMEOUT_MS, PC_CHUNK_TIMEOUT_MS). The prior
 * 180s value was sized for "a few specs" but is a hard kill on the
 * underlying Playwright process regardless of batch size — it fired even on
 * 10-spec batches, forcing manual chunking of large spec lists (LS-8743).
 * This is independent of the ~45s single-call sync budget that nx_job_wait
 * polls past; large batches still finish in the background across multiple
 * nx_job_wait calls, they just aren't killed at 3 minutes anymore.
 */
const E2E_TIMEOUT_MS = 30 * 60 * 1000;
/** 8 minutes — integration specs hit the live backend and each can take up to 2 min. */
const INTEGRATION_TIMEOUT_MS = 480_000;

async function findFreePort(start: number): Promise<number> {
  for (let port = start; port <= start + 100; port++) {
    const free = await new Promise<boolean>((resolve) => {
      const srv = net.createServer();
      srv.once('error', () => resolve(false));
      srv.once('listening', () => {
        srv.close();
        resolve(true);
      });
      srv.listen(port, '127.0.0.1');
    });
    if (free) return port;
  }
  throw new Error(`No free port found in range ${start}–${start + 100}`);
}

// ---------------------------------------------------------------------------
// Minimal types for Playwright JSON reporter output (v1.44+)
// ---------------------------------------------------------------------------

interface PWStats {
  startTime?: string;
  duration?: number;
  expected?: number;
  unexpected?: number;
  flaky?: number;
  skipped?: number;
}

interface PWError {
  message?: string;
  value?: string;
  snippet?: string;
  location?: { file?: string; line?: number; column?: number };
}

interface PWTestResult {
  status: string;
  duration?: number;
  startTime?: string;
  errors?: PWError[];
  retry?: number;
}

interface PWTest {
  projectId?: string;
  projectName?: string;
  results?: PWTestResult[];
  /** 'expected' | 'unexpected' | 'flaky' | 'skipped' */
  status: string;
}

interface PWSpec {
  title: string;
  ok?: boolean;
  tests?: PWTest[];
  file?: string;
  line?: number;
}

interface PWSuite {
  title: string;
  file?: string;
  suites?: PWSuite[];
  specs?: PWSpec[];
}

interface PWReport {
  suites?: PWSuite[];
  stats?: PWStats;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FailingTest {
  title: string;
  file: string;
  projectName: string | null;
  error: string | null;
  location: string | null;
}

function extractFailingTests(report: PWReport): FailingTest[] {
  const results: FailingTest[] = [];

  function walkSuite(suite: PWSuite, inheritedFile: string): void {
    const file = suite.file ?? inheritedFile;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        if (test.status === 'unexpected' || test.status === 'flaky') {
          const firstResult = test.results?.[0];
          const firstError = firstResult?.errors?.find(
            (e) => e.message ?? e.value,
          );
          const loc = firstError?.location;
          results.push({
            title: spec.title,
            file,
            projectName: test.projectName ?? test.projectId ?? null,
            error: firstError?.message ?? firstError?.value ?? null,
            location:
              loc?.file != null
                ? `${loc.file}${loc.line != null ? `:${loc.line}` : ''}`
                : null,
          });
        }
      }
    }
    for (const child of suite.suites ?? []) {
      walkSuite(child, file);
    }
  }

  for (const suite of report.suites ?? []) {
    walkSuite(suite, suite.file ?? suite.title ?? '');
  }
  return results;
}

// ---------------------------------------------------------------------------
// Integration-mode helpers
// ---------------------------------------------------------------------------

/** Cap for graphqlErrors summary field to keep response token-lean. */
const GRAPHQL_ERRORS_MAX_CHARS = 5_000;

/** Walk test-results/ and collect all trace.zip paths (relative to e2eAppDir). */
async function findTraceZips(e2eAppDir: string): Promise<string[]> {
  const resultsDir = path.join(e2eAppDir, 'test-results');
  const zips: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = path.join(dir, name);
      if (name === 'trace.zip') {
        zips.push(full);
        continue;
      }
      try {
        const s = await stat(full);
        if (s.isDirectory()) await walk(full);
      } catch {
        // ignore unreadable entries
      }
    }
  }
  await walk(resultsDir);
  return zips;
}

/** Extract GraphQL error objects from raw Playwright output (stdout+stderr). */
function extractGraphqlErrors(output: string): string {
  const lines = output.split('\n');
  const errorParts: string[] = [];
  let totalChars = 0;
  for (const line of lines) {
    if (!line.includes('"errors"') && !line.includes("'errors'")) continue;
    const trimmed = line.trim();
    if (totalChars + trimmed.length > GRAPHQL_ERRORS_MAX_CHARS) break;
    errorParts.push(trimmed);
    totalChars += trimmed.length + 1;
  }
  return errorParts.join('\n');
}

/** Check integration-mode preconditions. Returns an array of warning strings. */
async function checkIntegrationPreconditions(): Promise<string[]> {
  const warnings: string[] = [];

  // Check JWT freshness: token cached at ~/.legacy-sports/e2e-token.json
  const tokenPath = path.join(os.homedir(), '.legacy-sports', 'e2e-token.json');
  if (!existsSync(tokenPath)) {
    warnings.push(
      'e2e JWT not found — run `make e2e-auth` to mint a fresh token before running integration specs.',
    );
  } else {
    try {
      const raw = await readFile(tokenPath, 'utf-8');
      const parsed = JSON.parse(raw) as { expiresAt?: string | number };
      const expiresAt = parsed.expiresAt;
      if (expiresAt != null) {
        const expMs =
          typeof expiresAt === 'number' ? expiresAt : Date.parse(expiresAt);
        if (!Number.isNaN(expMs) && expMs < Date.now()) {
          warnings.push(
            'e2e JWT has expired — run `make e2e-auth` to refresh it.',
          );
        }
      }
    } catch {
      // Unreadable/malformed — treat as stale
      warnings.push(
        'e2e JWT file is unreadable — run `make e2e-auth` to mint a fresh token.',
      );
    }
  }

  // Check E2EPOOLPASSWORD for premium-seat personas (seat 3+)
  if (!process.env['E2EPOOLPASSWORD']) {
    warnings.push(
      'E2EPOOLPASSWORD is not set — premium-seat personas (seat 3+) will fail. Only commissioner + manager1 (seats 1–2) are available.',
    );
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Tool implementation
// ---------------------------------------------------------------------------

export interface RunE2ESpecsParams {
  specs: string[];
  project?: string;
  grep?: string;
  worktreePath?: string;
  integration?: boolean;
  withTracing?: boolean;
  skipGlobalSetup?: boolean;
}

export async function runE2ESpecs(
  params: RunE2ESpecsParams,
): Promise<ToolResult> {
  const integration = params.integration ?? false;
  const withTracing = params.withTracing ?? false;
  const skipGlobalSetup = params.skipGlobalSetup ?? false;
  const cwd = params.worktreePath ?? getRepoRoot();
  const e2eAppDir = path.join(cwd, 'apps', 'web-e2e');
  // Config filename only — passed with cwd: e2eAppDir below (not cwd: cwd) so
  // this is the exact `--config=playwright.config.ts` invocation used by the
  // known-working manual repro (`npx playwright test <spec> --config=playwright.config.ts`
  // run directly from apps/web-e2e/, LS-9955). Playwright resolves both the
  // config file and its relative `testDir` from the process's cwd when the
  // config arg itself is relative, so spawning from repo root while pointing
  // at an absolute/differently-cased config path was the actual cwd
  // mismatch — not just the spec-arg separator LS-9330 already fixed.
  //
  // skipGlobalSetup (LS-10155) swaps in playwright.integration-hermetic.config.ts
  // — the same testDir/reporter/browser-resolution as playwright.integration.config.ts,
  // minus globalSetup/globalTeardown — for the hermetic *.contract.spec.ts files
  // that live under src/integration/tests/ alongside the live-backend specs but
  // touch no network, so they need neither the live-backend setup nor the
  // JWT/E2EPOOLPASSWORD preflight below.
  const configFile = integration
    ? skipGlobalSetup
      ? 'playwright.integration-hermetic.config.ts'
      : 'playwright.integration.config.ts'
    : 'playwright.config.ts';
  const distDir = path.join(cwd, 'dist', 'apps', 'web');
  // Both configs declare outputFile: 'test-results/results.json',
  // which Playwright resolves relative to the config file's directory.
  const resultsFile = path.join(e2eAppDir, 'test-results', 'results.json');

  // --- Input validation ---

  if (!params.specs || params.specs.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: 'specs must be a non-empty array of spec file paths (e.g. ["src/tests/roster-management.spec.ts"]).',
        },
      ],
      isError: true,
    };
  }
  for (const spec of params.specs) {
    if (UNSAFE_SPEC_CHARS.test(spec)) {
      return {
        content: [
          {
            type: 'text',
            text: `Spec path "${spec}" contains disallowed characters.`,
          },
        ],
        isError: true,
      };
    }
  }

  // Strict allowlist, not a blocklist: project must exactly match one of the
  // five known Playwright project names below, so no shell metacharacter can
  // ever reach the spawned args via this parameter regardless of the (also
  // shell:false, see binJobSpec) spawn mode.
  const project = params.project ?? 'chromium';
  if (!ALLOWED_PROJECTS.has(project)) {
    return {
      content: [
        {
          type: 'text',
          text: `project "${project}" is not allowed. Allowed: ${[...ALLOWED_PROJECTS].join(', ')}.`,
        },
      ],
      isError: true,
    };
  }

  if (params.grep != null && UNSAFE_GREP_CHARS.test(params.grep)) {
    return {
      content: [{ type: 'text', text: 'grep contains disallowed characters.' }],
      isError: true,
    };
  }

  if (skipGlobalSetup && !integration) {
    return {
      content: [
        {
          type: 'text',
          text:
            'skipGlobalSetup only applies when integration: true — hermetic mode ' +
            '(the default) already runs without globalSetup.',
        },
      ],
      isError: true,
    };
  }

  // --- Integration-mode preconditions ---
  // Skipped when skipGlobalSetup is set: neither the JWT nor E2EPOOLPASSWORD
  // is needed by a config with no globalSetup/live backend to authenticate
  // against (LS-10155).

  let preconditionWarnings: string[] = [];
  if (integration && !skipGlobalSetup) {
    preconditionWarnings = await checkIntegrationPreconditions();
  }

  // --- Hermetic-mode precondition: dist/apps/web must exist ---

  if (!integration && !existsSync(distDir)) {
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            error: 'dist/apps/web not found — the web app must be built first',
            hint: 'Run: nx_run({ project: "web", target: "build" })',
          }),
        },
      ],
      isError: true,
    };
  }

  // --- Free port (hermetic only) ---

  let port: number | null = null;
  if (!integration) {
    try {
      port = await findFreePort(4280);
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to find a free port: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }

  // Remove stale results from a prior run so we can detect if playwright
  // failed to start (no new file written) vs. tests ran and failed.
  await rm(resultsFile, { force: true });

  // Resolve spec paths relative to apps/web-e2e and guard against path traversal.
  //
  // Playwright turns each positional spec argument into `new RegExp(arg, 'gi')`
  // (see createFileFiltersFromArguments/forceRegExp in playwright/lib/util.js)
  // with no escaping. On Windows, path.join/path.normalize produce backslash
  // separators, and backslashes in a regex are escape sequences (`\s`, `\t`,
  // ...) rather than literal path separators — the resulting pattern is
  // silently corrupted and matches zero files, which is why this tool
  // returned "No tests found" / stats.total === 0 despite valid, existing
  // spec paths (LS-9330). Forward slashes are not regex metacharacters, so
  // converting them fixes the pattern corruption — but it isn't the whole
  // story: Playwright's file matcher tests the pattern against the
  // discovered test file's *native* absolute path first (backslash-separated
  // on Windows, so a forward-slash-only pattern still won't match that form)
  // and only falls back to a forward-slash `file://` URL form as a second
  // attempt. Passing specs *relative to e2eAppDir* (below) instead of
  // absolute, combined with spawning the process with cwd: e2eAppDir (see
  // runJobWithBudget call), reproduces the exact
  // `playwright test src/tests/<name>.spec.ts --config=playwright.config.ts`
  // invocation known to work when run manually from apps/web-e2e/ (LS-9955) —
  // both the config's relative testDir and the relative spec filter resolve
  // against the same cwd Playwright itself is running from, rather than
  // depending on the native-vs-URL matcher fallback at all.
  const resolvedSpecs: string[] = [];
  for (const spec of params.specs) {
    const fullPath = path.isAbsolute(spec) ? spec : path.join(e2eAppDir, spec);
    const normalized = path.normalize(fullPath);
    if (
      !normalized.startsWith(e2eAppDir + path.sep) &&
      normalized !== e2eAppDir
    ) {
      return {
        content: [
          {
            type: 'text',
            text: `Spec path "${spec}" must be within the e2e directory.`,
          },
        ],
        isError: true,
      };
    }
    // Relative to e2eAppDir (the process's cwd, set below) and forward-slash
    // only. Use a literal backslash replace rather than path.sep — path.sep
    // is '/' on the CI/dev machines that run this server, but a
    // caller-supplied absolute Windows path (e.g. "D:\\code\\...\\spec.ts")
    // still carries literal backslashes that need converting regardless of
    // the current platform's separator. path.relative itself already
    // normalizes to the platform separator, so this also strips any
    // backslashes it introduces on win32.
    const relative = path.relative(e2eAppDir, normalized) || '.';
    resolvedSpecs.push(relative.replace(/\\/g, '/'));
  }

  const args = [
    'test',
    `--config=${configFile}`,
    `--project=${project}`,
    ...resolvedSpecs,
  ];
  if (params.grep != null) {
    args.push(`--grep=${params.grep}`);
  }
  if (integration) {
    // Enforce single-worker serialization even if config changes.
    args.push('--workers=1');
  }
  if (withTracing) {
    args.push('--trace=on');
  }

  const env: Record<string, string> = {};
  if (!integration) {
    env['E2E_AUTH_MODE'] = 'ci';
    env['CI'] = 'true';
    env['E2E_PORT'] = String(port);
  }

  // --- Run Playwright as a background job with a bounded sync wait ---
  // Fast spec runs return their parsed report in one call; slower runs return
  // a jobId whose completion (observed via nx_job_wait) is formatted by the
  // 'e2e-specs' job formatter into the same structured report. Invoked via
  // the playwright binary directly (binJobSpec), not `pnpm exec playwright`
  // (LS-10022): `pnpm exec` resolves the package scope of the directory it's
  // spawned from before running anything, and apps/web-e2e has no
  // package.json of its own — so pnpm silently ran the command from the
  // *workspace root* instead of e2eAppDir, discarding the cwd option below
  // entirely and breaking every cwd-relative arg (--config=, resolvedSpecs)
  // built against e2eAppDir. Direct binary invocation bypasses pnpm's
  // package-scope resolution so cwd is honored regardless. Same Windows
  // `.cmd` + shell:true handling as the old pnpm path fixes the historical
  // EINVAL from spawning a .cmd wrapper without a shell; inputs are
  // pre-validated against UNSAFE_SPEC_CHARS / UNSAFE_GREP_CHARS above, and
  // shell-relevant args are quoted (cmd-escape.ts).
  const timeoutMs = integration ? INTEGRATION_TIMEOUT_MS : E2E_TIMEOUT_MS;
  const jobSpec = binJobSpec(cwd, 'playwright', args);
  const snapshot = await runJobWithBudget(
    {
      command: jobSpec.command,
      args: jobSpec.args,
      shell: jobSpec.shell,
      // Spawned from e2eAppDir, not repo root, to match the manually-verified
      // working invocation (`playwright test <spec> --config=playwright.config.ts`
      // run from apps/web-e2e/) exactly — see the resolvedSpecs/configFile
      // comments above (LS-9955).
      cwd: e2eAppDir,
      label: `playwright ${integration ? 'integration' : 'e2e'} (${resolvedSpecs.length} spec${resolvedSpecs.length === 1 ? '' : 's'})`,
      timeoutMs,
      idempotencyKey: `e2e-specs:${e2eAppDir}:${args.join(' ')}`,
      env,
      meta: {
        kind: 'e2e-specs',
        resultsFile,
        e2eAppDir,
        integration,
        withTracing,
        skipGlobalSetup,
        port,
        preconditionWarnings,
        timeoutMs,
      },
    },
    SYNC_BUDGET_MS,
  );

  if (snapshot.status === 'running' || snapshot.status === 'orphaned') {
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            mode: integration ? 'integration' : 'hermetic',
            status: snapshot.status,
            jobId: snapshot.jobId,
            elapsedSec: snapshot.elapsedSec,
            ...(skipGlobalSetup ? { skipGlobalSetup: true } : {}),
            ...(preconditionWarnings.length > 0
              ? { preconditionWarnings }
              : {}),
            logTail: truncateOutput(snapshot.logTail ?? '', MAX_OUTPUT_CHARS),
            hint: snapshot.hint,
          }),
        },
      ],
      ...(snapshot.status === 'orphaned' ? { isError: true } : {}),
    };
  }

  const formatted = await buildE2eResult(snapshot);
  return {
    content: [{ type: 'text', text: minifiedJson(formatted.body) }],
    ...(formatted.isError ? { isError: true } : {}),
  };
}

/** Shape of the job metadata written by runE2ESpecs for deferred formatting. */
interface E2eJobMeta {
  resultsFile?: unknown;
  e2eAppDir?: unknown;
  integration?: unknown;
  withTracing?: unknown;
  skipGlobalSetup?: unknown;
  port?: unknown;
  preconditionWarnings?: unknown;
  timeoutMs?: unknown;
}

/**
 * Build the structured e2e result body from a terminal job snapshot. Shared
 * between the inline (within sync budget) path and the deferred nx_job_wait
 * formatter so callers get the same report either way.
 */
async function buildE2eResult(
  snapshot: JobSnapshot,
): Promise<FormattedJobResult> {
  const meta = (snapshot.meta ?? {}) as E2eJobMeta;
  const integration = meta.integration === true;
  const withTracing = meta.withTracing === true;
  const skipGlobalSetup = meta.skipGlobalSetup === true;
  const resultsFile =
    typeof meta.resultsFile === 'string' ? meta.resultsFile : null;
  const e2eAppDir = typeof meta.e2eAppDir === 'string' ? meta.e2eAppDir : null;
  const port = typeof meta.port === 'number' ? meta.port : null;
  const preconditionWarnings = Array.isArray(meta.preconditionWarnings)
    ? (meta.preconditionWarnings as string[])
    : [];
  const timeoutMs = typeof meta.timeoutMs === 'number' ? meta.timeoutMs : null;

  const combinedOutput = truncateOutput(snapshot.log ?? '', MAX_OUTPUT_CHARS);

  // Process killed by the job runner's runaway backstop.
  if (snapshot.error && /internal timeout/i.test(snapshot.error)) {
    return {
      body: {
        error: `Playwright timed out${timeoutMs != null ? ` after ${timeoutMs / 1000}s` : ''}.`,
        output: combinedOutput,
      },
      isError: true,
    };
  }

  let report: PWReport | null = null;
  if (resultsFile) {
    try {
      const raw = await readFile(resultsFile, 'utf-8');
      report = JSON.parse(raw) as PWReport;
    } catch {
      // File not written — playwright couldn't start (bad config, missing binary, etc.)
    }
  }

  if (report == null) {
    const modeInfo = integration
      ? 'integration mode (live backend)'
      : `E2E_AUTH_MODE=ci, E2E_PORT=${port}`;
    const browserMissing = /Executable doesn't exist/.test(combinedOutput);
    return {
      body: {
        error: `Playwright did not produce a results file (${modeInfo}).`,
        output: combinedOutput,
        ...(browserMissing
          ? {
              hint: "No usable browser build found (LS-8319): /opt/pw-browsers has no chromium_headless_shell-* build the resolver in apps/web-e2e/src/resolve-pw-browser.ts recognizes. Check that the cloud image's /opt/pw-browsers directory exists and contains a chromium_headless_shell-* build.",
            }
          : {}),
      },
      isError: true,
    };
  }

  const stats = report.stats ?? {};
  const passed = stats.expected ?? 0;
  const failed = stats.unexpected ?? 0;
  const flaky = stats.flaky ?? 0;
  const skipped = stats.skipped ?? 0;
  const total = passed + failed + flaky + skipped;

  // Trace artifacts (either mode, when withTracing was set) and, for
  // integration mode, a GraphQL error summary.
  const traceZips =
    withTracing && e2eAppDir ? await findTraceZips(e2eAppDir) : [];
  const graphqlErrors = integration
    ? extractGraphqlErrors(combinedOutput)
    : undefined;

  // Specs are a required, non-empty param (min 1), so a matched-and-ran
  // Playwright process that reports zero total tests means the requested
  // spec/project/grep combination matched nothing — almost always a caller
  // or tool-side arg bug, not "nothing to test". Reporting success:true here
  // (as this tool used to) is the dangerous case: a caller that trusts the
  // return value concludes the suite passed when it never actually ran
  // (LS-9330).
  const zeroTestsRequested = total === 0;

  // Mirrors the LS-8819 daemon-failure principle (isDaemonFailure in
  // daemon-failure.ts) for this tool's own failure shape: Playwright spawns
  // through pnpm rather than `nx run`, so the markers are webServer-specific
  // rather than Nx-specific (LS-9936). A results.json with an empty suite
  // set can be written either because the requested spec/project/grep
  // matched nothing (a caller/arg bug) or because the webServer never came
  // up (e.g. a port collision with a foreign process) — those need
  // distinct reasons so a caller doesn't chase the wrong cause.
  const webServerFailed =
    combinedOutput.includes('[WebServer]') &&
    (combinedOutput.includes('error when starting') ||
      combinedOutput.includes('is already in use') ||
      combinedOutput.includes('EADDRINUSE'));

  // The job runner marks a job 'failed' when the child process exits
  // non-zero or errors out (lib/mcp-jobs/src/index.ts). A non-zero exit
  // with tests recorded as failed/flaky is Playwright's ordinary "some
  // tests failed" contract and is already reflected in `success` below via
  // stats — only an exit failure the stats don't explain (e.g. a teardown
  // crash after all recorded tests passed) needs its own reason so it
  // isn't silently reported as a pass.
  const unexplainedProcessFailure =
    snapshot.status === 'failed' &&
    !webServerFailed &&
    !zeroTestsRequested &&
    failed === 0 &&
    flaky === 0;

  const reason = webServerFailed
    ? 'webserver-failed'
    : zeroTestsRequested
      ? 'no-tests-matched'
      : unexplainedProcessFailure
        ? 'process-exit-nonzero'
        : undefined;

  const success = reason == null && failed === 0 && flaky === 0;

  const reasonMessages: Record<string, string> = {
    'webserver-failed':
      'The Playwright webServer failed to start (see output) — this run ' +
      'never reached the browser and its stats (if any) are not trustworthy. ' +
      "Common cause: another process (e.g. a foreign worktree's `vite preview`) " +
      'is already holding the port.',
    'no-tests-matched':
      'Playwright ran but matched 0 tests for the given specs/project/grep — ' +
      'this almost always means the spec path, project, or grep filter did not ' +
      'match anything, not that the suite passed. Check the spec paths exist ' +
      'under apps/web-e2e/ and that project/grep are correct.',
    'process-exit-nonzero':
      `Playwright's process exited non-zero (exitCode ${String(snapshot.exitCode)}) ` +
      'even though recorded stats show no failed or flaky tests — treat this run ' +
      'as not trustworthy rather than a pass.',
  };

  return {
    body: {
      success,
      mode: integration ? 'integration' : 'hermetic',
      ...(port != null ? { port } : {}),
      ...(skipGlobalSetup ? { skipGlobalSetup: true } : {}),
      ...(preconditionWarnings.length > 0 ? { preconditionWarnings } : {}),
      ...(reason != null ? { reason, error: reasonMessages[reason] } : {}),
      stats: {
        total,
        passed,
        failed,
        flaky,
        skipped,
        durationMs: stats.duration ?? null,
      },
      failingTests: extractFailingTests(report),
      ...(traceZips.length > 0 ? { traceArtifacts: traceZips } : {}),
      ...(graphqlErrors ? { graphqlErrors } : {}),
      output: combinedOutput,
    },
    // Failing tests are reported via success:false in the body, not as a
    // tool error — matches the pre-conversion contract. Any of the
    // false-green shapes above (zero tests matched, webServer never came
    // up, or an unexplained non-zero exit) is promoted to a tool error
    // since it means the run itself can't be trusted, not just that tests
    // failed.
    isError: reason != null,
  };
}

// Deferred-completion formatter: a slow spec run whose completion is observed
// via nx_job_wait gets the same structured report as the inline path.
registerJobFormatter('e2e-specs', (snapshot) => buildE2eResult(snapshot));
