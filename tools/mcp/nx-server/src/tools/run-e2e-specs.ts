import { minifiedJson } from '@legacy-sports/mcp-format';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, readdir, rm, stat } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { getRepoRoot } from '../run-command.js';
import { MAX_OUTPUT_CHARS, truncateOutput } from '../truncate-output.js';
import type { ToolResult } from '../types.js';

/** Characters that must not appear in spec paths or grep patterns. */
const UNSAFE_CHARS = /[;&`$(){}|<>'"\r\n]/;

const ALLOWED_PROJECTS = new Set([
  'chromium',
  'firefox',
  'webkit',
  'Mobile Chrome',
  'Mobile Safari',
]);

/** 3 minutes — generous for a few hermetic specs, tight enough to surface hangs. */
const E2E_TIMEOUT_MS = 180_000;
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
}

export async function runE2ESpecs(
  params: RunE2ESpecsParams,
): Promise<ToolResult> {
  const integration = params.integration ?? false;
  const withTracing = params.withTracing ?? false;
  const cwd = params.worktreePath ?? getRepoRoot();
  const e2eAppDir = path.join(cwd, 'apps', 'web-e2e');
  const configPath = path.join(
    e2eAppDir,
    integration ? 'playwright.integration.config.ts' : 'playwright.config.ts',
  );
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
    if (UNSAFE_CHARS.test(spec)) {
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

  if (params.grep != null && UNSAFE_CHARS.test(params.grep)) {
    return {
      content: [{ type: 'text', text: 'grep contains disallowed characters.' }],
      isError: true,
    };
  }

  // --- Integration-mode preconditions ---

  let preconditionWarnings: string[] = [];
  if (integration) {
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
    resolvedSpecs.push(normalized);
  }

  const args = [
    'exec',
    'playwright',
    'test',
    `--config=${configPath}`,
    `--project=${project}`,
    ...resolvedSpecs,
  ];
  if (params.grep != null) {
    args.push(`--grep=${params.grep}`);
  }
  if (integration) {
    // Enforce single-worker serialization even if config changes.
    args.push('--workers=1');
    if (withTracing) {
      args.push('--trace=on');
    }
  }

  const env: NodeJS.ProcessEnv = { ...process.env };
  if (!integration) {
    env['E2E_AUTH_MODE'] = 'ci';
    env['CI'] = 'true';
    env['E2E_PORT'] = String(port);
  }

  // --- Run Playwright (capture output even on non-zero exit) ---

  // Use pnpm.cmd on Windows to avoid shell:true (which would expose cmd.exe
  // injection vectors like ^ and %). On non-Windows, pnpm is a plain binary.
  const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const timeoutMs = integration ? INTEGRATION_TIMEOUT_MS : E2E_TIMEOUT_MS;

  const runResult = await new Promise<{
    stdout: string;
    stderr: string;
    timedOut: boolean;
  }>((resolve) => {
    execFile(
      executable,
      args,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        env,
        windowsHide: true,
      },
      (err, stdout, stderr) => {
        const timedOut =
          (err as (NodeJS.ErrnoException & { killed?: boolean }) | null)
            ?.killed ?? false;
        resolve({
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          timedOut,
        });
      },
    );
  });

  if (runResult.timedOut) {
    return {
      content: [
        {
          type: 'text',
          text: `Playwright timed out after ${timeoutMs / 1000}s.\n\n${truncateOutput(
            [runResult.stderr, runResult.stdout].filter(Boolean).join('\n'),
            MAX_OUTPUT_CHARS,
          )}`,
        },
      ],
      isError: true,
    };
  }

  // --- Parse results ---

  let report: PWReport | null = null;
  try {
    const raw = await readFile(resultsFile, 'utf-8');
    report = JSON.parse(raw) as PWReport;
  } catch {
    // File not written — playwright couldn't start (bad config, missing binary, etc.)
  }

  const combinedOutput = truncateOutput(
    [runResult.stderr, runResult.stdout].filter(Boolean).join('\n'),
    MAX_OUTPUT_CHARS,
  );

  if (report == null) {
    const modeInfo = integration
      ? 'integration mode (live backend)'
      : `E2E_AUTH_MODE=ci, E2E_PORT=${port}`;
    return {
      content: [
        {
          type: 'text',
          text: `Playwright did not produce a results file (${modeInfo}).\n\n${combinedOutput}`,
        },
      ],
      isError: true,
    };
  }

  const stats = report.stats ?? {};
  const passed = stats.expected ?? 0;
  const failed = stats.unexpected ?? 0;
  const flaky = stats.flaky ?? 0;
  const skipped = stats.skipped ?? 0;

  // Integration-mode extras: trace artifacts and GraphQL error summary.
  const traceZips =
    integration && withTracing ? await findTraceZips(e2eAppDir) : [];
  const graphqlErrors = integration
    ? extractGraphqlErrors(combinedOutput)
    : undefined;

  return {
    content: [
      {
        type: 'text',
        text: minifiedJson({
          success: failed === 0 && flaky === 0,
          mode: integration ? 'integration' : 'hermetic',
          ...(port != null ? { port } : {}),
          ...(preconditionWarnings.length > 0 ? { preconditionWarnings } : {}),
          stats: {
            total: passed + failed + flaky + skipped,
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
        }),
      },
    ],
  };
}
