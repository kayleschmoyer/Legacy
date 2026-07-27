import { readdirSync, existsSync } from 'node:fs';
import { join, isAbsolute, resolve, relative } from 'node:path';
import { minifiedJson } from '@legacy-sports/mcp-format';
import { runCommand, getRepoRoot } from '../run-command.js';
import { truncateOutput } from './run-target-utils.js';
import type { ToolResult } from '../types.js';

interface RunCustomChecksParams {
  /** Repo or worktree root (default: repo root). */
  worktreePath?: string;
  /** Named subset of check scripts to run (basename, with or without .sh). Omit to run all. */
  scripts?: string[];
  /** Per-script timeout in milliseconds (default: 120000). */
  timeoutMs?: number;
}

interface CheckResult {
  script: string;
  passed: boolean;
  durationMs: number;
  output: string;
}

/** Directory holding the repo's custom CI check scripts, relative to repo/worktree root. */
const CHECKS_DIR = '.github/checks';

/** Same discovery shape as ci-pipeline.yml's "Run Custom Check Scripts" step: `.github/checks/*.sh`. */
const CHECK_SCRIPT_RE = /^[A-Za-z0-9_.-]+\.sh$/;

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_SCRIPT_OUTPUT_CHARS = 5_000;

function err(message: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

/** List discoverable check script basenames (e.g. "ci-failure-capture-tests.sh"), sorted. */
function discoverCheckScripts(checksDir: string): string[] {
  if (!existsSync(checksDir)) return [];
  return readdirSync(checksDir)
    .filter((f) => CHECK_SCRIPT_RE.test(f))
    .sort((a, b) => a.localeCompare(b));
}

/** Normalize a caller-supplied script name to its basename with a .sh extension. */
function normalizeScriptName(name: string): string {
  const base = name.includes('/')
    ? name.slice(name.lastIndexOf('/') + 1)
    : name;
  return base.endsWith('.sh') ? base : `${base}.sh`;
}

/**
 * Discover and run the repo's own `.github/checks/*.sh` custom-check scripts —
 * the same scripts CI's "custom-checks" job runs (ci-pipeline.yml, "Run Custom
 * Check Scripts" step). Each script is a cheap, self-contained `node --test`
 * runner with no external deps. Unlike the CI step (which runs under `bash -e`
 * and aborts at the first failing script), every discovered/requested script
 * is run and reported individually so a caller sees the full pass/fail picture
 * in one call rather than stopping at the first failure.
 */
export async function runCustomChecks(
  params: RunCustomChecksParams,
): Promise<ToolResult> {
  const repoRoot = getRepoRoot();
  let workDir = repoRoot;

  if (params.worktreePath) {
    if (!isAbsolute(params.worktreePath)) {
      return err(
        `worktreePath must be an absolute path, got: "${params.worktreePath}"`,
      );
    }
    const resolved = resolve(params.worktreePath);
    if (!existsSync(resolved)) {
      return err(`worktreePath does not exist: "${resolved}"`);
    }
    const rel = relative(repoRoot, resolved);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      return err(
        `worktreePath "${resolved}" is outside the repository root "${repoRoot}". Only paths within the repository are allowed.`,
      );
    }
    workDir = resolved;
  }

  const available = discoverCheckScripts(join(workDir, CHECKS_DIR));

  if (available.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            total: 0,
            passed: 0,
            failed: 0,
            allPassed: true,
            results: [],
            message: `No check scripts found under ${CHECKS_DIR}/*.sh`,
          }),
        },
      ],
    };
  }

  let toRun = available;
  if (params.scripts && params.scripts.length > 0) {
    const requested = params.scripts.map(normalizeScriptName);
    const unknown = requested.filter((name) => !available.includes(name));
    if (unknown.length > 0) {
      return err(
        `Unknown check script(s): ${unknown.join(', ')}. Available: ${available.join(', ')}`,
      );
    }
    // Run in discovery order (not caller order), de-duplicated.
    const requestedSet = new Set(requested);
    toRun = available.filter((name) => requestedSet.has(name));
  }

  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const results: CheckResult[] = [];

  for (const script of toRun) {
    // Relative path — these scripts internally reference paths (e.g.
    // ".github/scripts/...") relative to the repo/worktree root, so both the
    // script path and cwd must agree on that root.
    const scriptPath = join(CHECKS_DIR, script);
    const start = Date.now();
    try {
      const output = await runCommand('bash', [scriptPath], workDir, timeoutMs);
      results.push({
        script,
        passed: true,
        durationMs: Date.now() - start,
        output: truncateOutput(output, MAX_SCRIPT_OUTPUT_CHARS),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({
        script,
        passed: false,
        durationMs: Date.now() - start,
        output: truncateOutput(msg, MAX_SCRIPT_OUTPUT_CHARS),
      });
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;

  return {
    isError: failed > 0,
    content: [
      {
        type: 'text',
        text: minifiedJson({
          total: results.length,
          passed,
          failed,
          allPassed: failed === 0,
          results,
        }),
      },
    ],
  };
}
