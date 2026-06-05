import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import net from 'node:net';
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
// Tool implementation
// ---------------------------------------------------------------------------

export interface RunE2ESpecsParams {
  specs: string[];
  project?: string;
  grep?: string;
  worktreePath?: string;
}

export async function runE2ESpecs(
  params: RunE2ESpecsParams,
): Promise<ToolResult> {
  const cwd = params.worktreePath ?? getRepoRoot();
  const e2eAppDir = path.join(cwd, 'apps', 'web-e2e');
  const configPath = path.join(e2eAppDir, 'playwright.config.ts');
  const distDir = path.join(cwd, 'dist', 'apps', 'web');
  // playwright.config.ts declares outputFile: 'test-results/results.json',
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

  // --- Precondition: dist/apps/web must exist ---

  if (!existsSync(distDir)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: false,
              error:
                'dist/apps/web not found — the web app must be built first',
              hint: 'Run: nx_run({ project: "web", target: "build" })',
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }

  // --- Free port ---

  let port: number;
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

  // Remove stale results from a prior run so we can detect if playwright
  // failed to start (no new file written) vs. tests ran and failed.
  await rm(resultsFile, { force: true });

  // Resolve spec paths relative to apps/web-e2e when not absolute
  const resolvedSpecs = params.specs.map((spec) =>
    path.isAbsolute(spec) ? spec : path.join(e2eAppDir, spec),
  );

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

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    E2E_AUTH_MODE: 'ci',
    CI: 'true',
    E2E_PORT: String(port),
  };

  // --- Run Playwright (capture output even on non-zero exit) ---

  // Use pnpm.cmd on Windows to avoid shell:true (which would expose cmd.exe
  // injection vectors like ^ and %). On non-Windows, pnpm is a plain binary.
  const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

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
        timeout: E2E_TIMEOUT_MS,
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
          text: `Playwright timed out after ${E2E_TIMEOUT_MS / 1000}s.\n\n${truncateOutput(
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
    return {
      content: [
        {
          type: 'text',
          text: `Playwright did not produce a results file (E2E_AUTH_MODE=ci, E2E_PORT=${port}).\n\n${combinedOutput}`,
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

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: failed === 0 && flaky === 0,
            port,
            stats: {
              total: passed + failed + flaky + skipped,
              passed,
              failed,
              flaky,
              skipped,
              durationMs: stats.duration ?? null,
            },
            failingTests: extractFailingTests(report),
            output: combinedOutput,
          },
          null,
          2,
        ),
      },
    ],
  };
}
