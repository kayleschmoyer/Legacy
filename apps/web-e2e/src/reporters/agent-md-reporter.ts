import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
} from '@playwright/test/reporter';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

/**
 * Token-efficient Playwright reporter for agent consumption (LS-7838).
 *
 * Emits a single compact Markdown file with **asymmetric detail**: passing
 * tests collapse to a count while failures, flaky tests, and skips get full
 * detail (location, error, snippet, skip reason). The output is ~20-50x smaller
 * than Playwright's HTML SPA and is readable with a plain file read — no zip
 * extraction.
 *
 * The layout is kept identical to `renderReportAsMarkdown` in the CI MCP server
 * (tools/mcp/ci-server/src/playwright-report.ts) so a fetched `summary.md` and a
 * server-rendered fallback read the same.
 */

interface Options {
  /** Destination path, relative to the Playwright config dir. */
  outputFile?: string;
  /**
   * Optional machine-readable flaky-test output (LS-9659). When set, the
   * reporter also writes a JSON file listing every test whose outcome was
   * 'flaky' (passed only after retries) so a workflow step can consume the
   * signal — the nightly runs at retries=2, which keeps the run green while
   * the same spec later blocks PR CI at retries=0. The file is written even
   * when the list is empty, so "no flaky tests" is distinguishable from
   * "reporter never ran". Filing/notification logic deliberately lives in
   * the workflow, not here.
   */
  flakyJsonFile?: string;
}

interface FlakyEntry {
  /** Spec path relative to the Playwright rootDir (forward slashes). */
  file: string;
  /** Describe-path + test title, matching the Markdown flaky list. */
  title: string;
}

interface Failure {
  title: string;
  file: string;
  line?: number;
  error: string | null;
  snippet: string | null;
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;

/** Backslash-escape the Markdown metacharacters that could let untrusted test
 * error/snippet text inject structure (fake `##` headings, `**emphasis**`,
 * links, or a stray ``` fence) when the report is rendered. (LS-7838 review:
 * Markdown-injection hardening.) */
function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]()#>|]/g, '\\$&');
}

/** Strip ANSI codes, cap length so the Markdown stays token-cheap, then escape
 * Markdown metacharacters in the (untrusted) result. */
function clean(text: string, max = 1500): string {
  const trimmed = text.replace(ANSI, '').trim();
  const capped =
    trimmed.length > max
      ? `${trimmed.slice(0, max)}\n… (${trimmed.length - max} more chars truncated)`
      : trimmed;
  return escapeMarkdown(capped);
}

/** Join enclosing describe-block titles with the test title (skips the
 * synthetic root/project/file suites so output matches report.json `path`). */
function describeTitle(test: TestCase): string {
  const parts: string[] = [];
  let suite: Suite | undefined = test.parent;
  while (suite) {
    if (suite.type === 'describe' && suite.title) parts.unshift(suite.title);
    suite = suite.parent;
  }
  parts.push(test.title);
  return parts.join(' › ');
}

export default class AgentMarkdownReporter implements Reporter {
  private readonly outputFile: string;
  private readonly flakyJsonFile?: string;
  private rootDir = process.cwd();
  private suiteRoot?: Suite;

  constructor(options: Options = {}) {
    this.outputFile = options.outputFile ?? 'test-results/summary.md';
    this.flakyJsonFile = options.flakyJsonFile;
  }

  onBegin(config: FullConfig, suite: Suite): void {
    this.rootDir = config.rootDir;
    this.suiteRoot = suite;
  }

  onEnd(result: FullResult): void {
    const tests: TestCase[] = this.suiteRoot?.allTests() ?? [];

    let passed = 0;
    let failed = 0;
    let flaky = 0;
    let skipped = 0;
    const failures: Failure[] = [];
    const flakyTitles: string[] = [];
    const flakyEntries: FlakyEntry[] = [];
    const skips: Array<{ title: string; reason: string | null }> = [];

    for (const test of tests) {
      const outcome = test.outcome();
      const file = this.relFile(test);
      // describe-path + test title, excluding project/file suites, to match
      // report.json's `path` (the MCP renderReportAsMarkdown layout).
      const title = describeTitle(test);
      if (outcome === 'expected') {
        passed++;
      } else if (outcome === 'unexpected') {
        failed++;
        const errored = [...test.results]
          .reverse()
          .find((r) => r.errors.length > 0);
        const err = errored?.errors[0];
        failures.push({
          title,
          file,
          line: test.location.line,
          error: err?.message ?? null,
          snippet: err?.snippet ?? null,
        });
      } else if (outcome === 'flaky') {
        flaky++;
        flakyTitles.push(`${file} › ${title}`);
        flakyEntries.push({ file, title });
      } else {
        skipped++;
        const ann = test.annotations.find(
          (a) => a.type === 'skip' || a.type === 'fixme',
        );
        skips.push({
          title: `${file} › ${title}`,
          reason: ann?.description
            ? `${ann.type}: ${ann.description}`
            : (ann?.type ?? null),
        });
      }
    }

    const total = tests.length;
    const ok = result.status === 'passed' && total > 0;
    const lines: string[] = [];

    lines.push(`# E2E Report — ${ok ? '✅ PASSED' : '❌ FAILED'}`);
    lines.push('');
    lines.push(
      `**${failed} failed** · ${passed} passed · ${flaky} flaky · ` +
        `${skipped} skipped · **${total} total**`,
    );
    lines.push('');

    if (total === 0) {
      lines.push(
        '> ⚠️ **Zero tests ran.** This is NOT a passing result — the run was ' +
          'likely misconfigured (wrong testDir, grep matched nothing, or build ' +
          'failed before tests started).',
      );
      lines.push('');
    }

    if (failures.length > 0) {
      lines.push(`## ❌ Failures (${failures.length})`);
      lines.push('');
      for (const f of failures) {
        const loc = f.line ? `${f.file}:${f.line}` : f.file;
        lines.push(`### ${f.title}`);
        lines.push(`- **Location**: ${loc}`);
        if (f.error) {
          lines.push(`- **Error**: ${clean(f.error).split('\n').join('\n  ')}`);
        }
        if (f.snippet) {
          lines.push(
            `- **Snippet**: ${clean(f.snippet, 800).split('\n').join('\n  ')}`,
          );
        }
        lines.push('');
      }
    }

    if (flakyTitles.length > 0) {
      lines.push(`## ⚠️ Flaky (${flakyTitles.length})`);
      lines.push('');
      for (const t of flakyTitles) lines.push(`- ${t}`);
      lines.push('');
    }

    if (skips.length > 0) {
      lines.push(`## ⏭️ Skipped (${skips.length})`);
      lines.push('');
      for (const s of skips) {
        lines.push(`- ${s.title}${s.reason ? ` — ${s.reason}` : ''}`);
      }
      lines.push('');
    }

    lines.push(`## ✅ Passed: ${passed}`);
    lines.push('');

    const dest = isAbsolute(this.outputFile)
      ? this.outputFile
      : resolve(this.rootDir, this.outputFile);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, lines.join('\n'), 'utf-8');

    if (this.flakyJsonFile) {
      // Raw (unescaped) file/title values: this output is machine-read by the
      // nightly flaky-ticket step, not rendered as Markdown.
      const flakyDest = isAbsolute(this.flakyJsonFile)
        ? this.flakyJsonFile
        : resolve(this.rootDir, this.flakyJsonFile);
      mkdirSync(dirname(flakyDest), { recursive: true });
      writeFileSync(
        flakyDest,
        `${JSON.stringify({ total, flaky: flakyEntries }, null, 2)}\n`,
        'utf-8',
      );
    }
  }

  private relFile(test: TestCase): string {
    const file = test.location.file;
    const rel = relative(this.rootDir, file);
    return rel && !rel.startsWith('..') ? rel.replace(/\\/g, '/') : file;
  }
}
