#!/usr/bin/env node
/**
 * Read a Playwright JSON report and emit a PR comment body containing one
 * `<integration-results>` block per spec (LS-4617). The reviewer bot parses
 * these blocks to confirm a touched integration spec has structured evidence
 * before flagging it as missing.
 *
 * Usage:
 *   node .github/scripts/integration-results/format-comment.mjs \
 *     --report path/to/test-results.json \
 *     --report-url https://example.com/playwright-report/integration-42/ \
 *     [--specs apps/web-e2e/src/integration/tests/foo.integration.spec.ts,...]
 *
 * --specs (optional, comma-separated) filters output to the touched specs so a
 *   re-run on a PR doesn't post stale entries for unrelated specs. When omitted
 *   every spec from the report is emitted.
 *
 * Writes the comment body to stdout. Non-zero exit on missing report file or
 * unparseable JSON; emits an empty body (just a header) when no specs match.
 */

import { readFileSync, existsSync } from 'node:fs';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!flag.startsWith('--')) continue;
    const key = flag.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = value;
      i++;
    }
  }
  return args;
}

/**
 * Recursively collect every leaf `spec` entry from a Playwright JSON report.
 * The report's shape is `{ suites: [{ suites?: [...], specs?: [{ file, title, tests: [...] }] }] }`.
 * Each spec has one or more tests; we collapse to a single status per spec by
 * taking the worst status (failed > timedout > flaky > skipped > passed).
 *
 * @param {object} report
 * @returns {Array<{ file: string, title: string, status: string, durationMs: number }>}
 */
function collectSpecs(report) {
  /** @type {Array<{ file: string, title: string, status: string, durationMs: number }>} */
  const out = [];
  const visit = (suite, inheritedFile) => {
    const file = suite.file ?? inheritedFile ?? '';
    for (const spec of suite.specs ?? []) {
      const specFile = spec.file ?? file;
      let worst = 'passed';
      let duration = 0;
      for (const test of spec.tests ?? []) {
        for (const result of test.results ?? []) {
          const status = result.status ?? 'unknown';
          duration += result.duration ?? 0;
          if (statusRank(status) > statusRank(worst)) worst = status;
        }
      }
      out.push({
        file: specFile,
        title: spec.title ?? '',
        status: worst,
        durationMs: Math.round(duration),
      });
    }
    for (const child of suite.suites ?? []) visit(child, file);
  };
  for (const suite of report.suites ?? []) visit(suite, undefined);
  return out;
}

function statusRank(status) {
  switch (status) {
    case 'failed':
      return 4;
    case 'timedout':
      return 3;
    case 'flaky':
      return 2;
    case 'skipped':
      return 1;
    case 'passed':
      return 0;
    default:
      return 0;
  }
}

/**
 * Collapse multiple test results within the same spec file to a single block,
 * picking the worst status and summing duration. Playwright JSON reports can
 * list a single file across multiple top-level suites when shards merge; this
 * normalisation matches the `<integration-results>` schema's one-block-per-spec
 * contract.
 *
 * @param {Array<{ file: string, title: string, status: string, durationMs: number }>} specs
 * @returns {Array<{ file: string, status: string, durationMs: number }>}
 */
function collapseByFile(specs) {
  /** @type {Map<string, { file: string, status: string, durationMs: number }>} */
  const byFile = new Map();
  for (const s of specs) {
    if (!s.file) continue;
    const prev = byFile.get(s.file);
    if (!prev) {
      byFile.set(s.file, {
        file: s.file,
        status: s.status,
        durationMs: s.durationMs,
      });
      continue;
    }
    prev.durationMs += s.durationMs;
    if (statusRank(s.status) > statusRank(prev.status)) prev.status = s.status;
  }
  return [...byFile.values()];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const reportPath = args.report;
  if (!reportPath || typeof reportPath !== 'string') {
    process.stderr.write(
      '[format-comment] --report <path-to-test-results.json> is required\n',
    );
    process.exit(2);
  }
  if (!existsSync(reportPath)) {
    process.stderr.write(`[format-comment] Report not found: ${reportPath}\n`);
    process.exit(2);
  }

  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch (err) {
    process.stderr.write(
      `[format-comment] Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(2);
  }

  const reportUrl =
    typeof args['report-url'] === 'string' ? args['report-url'] : '';
  const specFilter =
    typeof args.specs === 'string'
      ? new Set(
          args.specs
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        )
      : null;

  const allSpecs = collapseByFile(collectSpecs(report));
  const specs = specFilter
    ? allSpecs.filter((s) => specFilter.has(s.file))
    : allSpecs;

  const lines = ['## Integration Test Results', ''];
  if (specs.length === 0) {
    lines.push(
      '_No integration spec results matched. If you expected a touched spec to appear here, check that the file is under `apps/web-e2e/src/integration/tests/**` and that the workflow ran with the correct spec filter._',
    );
  } else {
    lines.push(
      'Posted by `.github/workflows/run-integration-tests.yml`. The reviewer bot parses the `<integration-results>` blocks below to confirm each touched integration spec has structured evidence.',
      '',
    );
    for (const spec of specs) {
      lines.push('<integration-results>');
      lines.push(`spec: ${spec.file}`);
      lines.push(`status: ${spec.status}`);
      lines.push(`duration_ms: ${spec.durationMs}`);
      if (reportUrl) lines.push(`report: ${reportUrl}`);
      lines.push('</integration-results>');
      lines.push('');
    }
  }

  process.stdout.write(lines.join('\n'));
}

main();
