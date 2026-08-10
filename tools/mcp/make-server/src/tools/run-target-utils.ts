/**
 * Shared utilities for make run-target parsing.
 * Used by both run-target.ts (sync) and make-run-bg.ts (background/async).
 */

export interface StepResult {
  name: string;
  status: 'passed' | 'failed' | 'unknown';
}

/**
 * Maximum output size in characters before truncation kicks in.
 * Set conservatively to account for JSON escaping overhead (~2x in worst case).
 */
export const MAX_OUTPUT_CHARS = 30_000;

/** Targets whose output should be parsed into structured step results. */
export const STRUCTURED_TARGETS = new Set(['pc', 'pre-commit', 'full-check']);

/**
 * Unambiguous failure signals shared by parseSteps (status verdict) and
 * truncateStepErrors (tail-bias decision) so the two never disagree about
 * which step section actually failed.
 */
function isFailedSection(section: string): boolean {
  return (
    /NX\s+Failed tasks/i.test(section) ||
    /^FAIL\s+\S/m.test(section) ||
    /error TS\d/i.test(section) ||
    /exit code [1-9]/.test(section) ||
    /✗/.test(section) ||
    /^make.*Error/im.test(section)
  );
}

/**
 * Parse the output of multi-step targets like `make pc` into structured step results.
 * Matches the actual Makefile format: "1/9 Migration immutability check..."
 */
export function parseSteps(output: string): StepResult[] {
  const steps: StepResult[] = [];

  // Match the actual make pc step format: "N/M Step name..."
  const stepPattern = /^(\d+)\/(\d+)\s+(.+?)\.{3}\s*$/gm;
  let match;
  const stepEntries: Array<{ index: number; name: string }> = [];

  while ((match = stepPattern.exec(output)) !== null) {
    stepEntries.push({
      index: match.index,
      name: match[3].trim(),
    });
  }

  // For each step, check the text between it and the next step for pass/fail
  for (let i = 0; i < stepEntries.length; i++) {
    const start = stepEntries[i].index;
    const end =
      i + 1 < stepEntries.length ? stepEntries[i + 1].index : output.length;
    const section = output.slice(start, end);

    // NX's structured verdict is the authoritative signal — check it first.
    if (/NX\s+Successfully ran target/i.test(section)) {
      steps.push({ name: stepEntries[i].name, status: 'passed' });
      continue;
    }

    const failed = isFailedSection(section);
    const passed = /(?:✓|passed|succeeded|SUCCESS)/im.test(section);

    steps.push({
      name: stepEntries[i].name,
      status: failed ? 'failed' : passed ? 'passed' : 'unknown',
    });
  }

  return steps;
}

/**
 * Matches prettier per-file output lines: `apps/web/Foo.tsx 123ms (unchanged)` or `lib/Bar.ts 45ms`
 * Requires at least one path separator so plain single-word lines don't match.
 */
const PRETTIER_FILE_LINE_RE = /^(\S+\/\S+)\s+\d+ms(?:\s+\(unchanged\))?$/;

/**
 * Extract error lines from output — lines containing error indicators.
 *
 * Prettier per-file progress lines (e.g. `components/ErrorBoundary.tsx 12ms
 * (unchanged)`) can contain the substring "error" in a filename and would
 * otherwise false-positive match as an anchor; they're excluded both as
 * anchors and as trailing context so a run of thousands of them never
 * populates this array (see LS-8822).
 */
export function extractErrors(output: string): string[] {
  const errorLines: string[] = [];
  const lines = output.split('\n');
  const isNoise = (line: string) => PRETTIER_FILE_LINE_RE.test(line.trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      /(?:ERROR|FAIL|error\b|failed\b|✗)/i.test(line) &&
      !/node_modules/.test(line) &&
      !/^[\s]*at\s/.test(line) &&
      !isNoise(line)
    ) {
      errorLines.push(line.trim());
      for (const next of [lines[i + 1], lines[i + 2]]) {
        if (next && next.trim() && !isNoise(next)) {
          errorLines.push(next.trim());
        }
      }
    }
  }

  return [...new Set(errorLines)].slice(0, 50);
}

/**
 * KEY=VALUE pattern for make variables. The value charset deliberately excludes
 * every character make or a shell would need for command substitution or
 * chaining ($, (, ), backtick, ;, &, |, <, >, space) so that a `variables`
 * string can never inject a command — even though the process is now spawned
 * without `shell: true`. Keys: alphanumeric + underscore. Values: alphanumeric,
 * hyphens, underscores, dots, forward/back slashes, and colons (for paths like
 * D:\foo).
 */
const VARIABLE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=[A-Za-z0-9_.\/\\:\-]*$/;

export type VariableValidation =
  | { ok: true; parts: string[] }
  | { ok: false; invalid: string };

/**
 * Split a whitespace-separated `variables` string into KEY=VALUE tokens and
 * validate each against VARIABLE_PATTERN. Returns the parsed parts on success,
 * or the first offending token on failure. This is the single security gate that
 * prevents command injection through the `variables` parameter; it runs before
 * any token reaches the make process (sync or background).
 */
export function parseAndValidateVariables(
  variables: string,
): VariableValidation {
  const parts = variables.split(/\s+/).filter(Boolean);
  for (const part of parts) {
    if (!VARIABLE_PATTERN.test(part)) {
      return { ok: false, invalid: part };
    }
  }
  return { ok: true, parts };
}

/**
 * Truncate output intelligently: keep the head and tail (where pass/fail lives).
 */
export function truncateOutput(output: string, maxChars: number): string {
  if (output.length <= maxChars) return output;

  const headSize = Math.floor(maxChars * 0.3);
  const tailSize = Math.floor(maxChars * 0.7);
  const head = output.slice(0, headSize);
  const tail = output.slice(-tailSize);
  const omitted = output.length - headSize - tailSize;

  return `${head}\n\n... [${omitted.toLocaleString()} characters omitted] ...\n\n${tail}`;
}

/**
 * Collapse prettier per-file listings in output.
 * Consecutive prettier file lines are replaced with a single summary:
 *   [Formatting: 1180 files checked, 2 changed — lib/foo.ts, lib/bar.ts]
 * Changed files (those lacking "(unchanged)") are listed by name so the agent
 * can see what was actually reformatted without wading through the full dump.
 */
export function compressFormatterOutput(output: string): string {
  const lines = output.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed && PRETTIER_FILE_LINE_RE.test(trimmed)) {
      let total = 0;
      const changed: string[] = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (!t || !PRETTIER_FILE_LINE_RE.test(t)) break;
        total++;
        if (!/\(unchanged\)/.test(t)) {
          changed.push(t.replace(/\s+\d+ms(?:\s+\(unchanged\))?$/, ''));
        }
        i++;
      }
      const changedSuffix =
        changed.length > 0
          ? ` — ${changed.slice(0, 10).join(', ')}${changed.length > 10 ? ` (+${changed.length - 10} more)` : ''}`
          : '';
      result.push(
        `[Formatting: ${total} files checked, ${changed.length} changed${changedSuffix}]`,
      );
    } else {
      result.push(lines[i]);
      i++;
    }
  }

  return result.join('\n');
}

const STEP_HEADER_GLOBAL_RE = /^(\d+\/\d+\s+.+?\.{3})\s*$/gm;
const MAX_STEP_BODY_LINES = 20;

/**
 * For each make-pc step section, truncate the body to MAX_STEP_BODY_LINES lines.
 * Appends "[N more lines — run step directly for full output]" when truncated.
 *
 * Passing/unknown steps keep the head — that's where nx prints the target
 * being run, useful context. Failed steps keep the tail instead: non-zero-exit
 * tooling (prettier, eslint, tsc) prints its actionable reason as the LAST
 * thing before returning, so head-first truncation reliably discarded it
 * behind thousands of earlier progress lines (LS-8822).
 */
export function truncateStepErrors(output: string): string {
  const headers: Array<{ index: number; length: number }> = [];
  STEP_HEADER_GLOBAL_RE.lastIndex = 0;
  let m;
  while ((m = STEP_HEADER_GLOBAL_RE.exec(output)) !== null) {
    headers.push({ index: m.index, length: m[0].length });
  }
  if (headers.length === 0) return output;

  const parts: string[] = [];
  parts.push(output.slice(0, headers[0].index));

  for (let i = 0; i < headers.length; i++) {
    const { index, length } = headers[i];
    const nextStart =
      i + 1 < headers.length ? headers[i + 1].index : output.length;
    parts.push(output.slice(index, index + length));
    const body = output.slice(index + length, nextStart);
    const bodyLines = body.split('\n');
    // body starts with '\n' (the newline separating the step header from its
    // content), so bodyLines[0] is always ''. Strip a trailing '' as well so
    // the content count is the same regardless of whether the section ends
    // with a newline.
    const trimmed =
      bodyLines.at(-1) === '' ? bodyLines.slice(0, -1) : bodyLines;
    const contentLineCount = trimmed.length - 1; // subtract leading ''
    if (contentLineCount > MAX_STEP_BODY_LINES) {
      const remaining = contentLineCount - MAX_STEP_BODY_LINES;
      if (isFailedSection(body)) {
        const tailLines = trimmed.slice(-MAX_STEP_BODY_LINES);
        parts.push(
          `\n[${remaining} earlier lines omitted — run step directly for full output]`,
        );
        parts.push('\n' + tailLines.join('\n'));
      } else {
        parts.push(trimmed.slice(0, MAX_STEP_BODY_LINES + 1).join('\n'));
        parts.push(
          `\n[${remaining} more lines — run step directly for full output]`,
        );
      }
    } else {
      parts.push(body);
    }
  }

  return parts.join('');
}

/**
 * Build a compact output string suitable for MCP responses (default mode).
 * Suppresses prettier per-file listings and truncates per-step bodies to 20 lines.
 * For the full raw output, callers should use truncateOutput directly.
 */
export function buildCompactOutput(output: string, maxChars: number): string {
  return truncateOutput(
    truncateStepErrors(compressFormatterOutput(output)),
    maxChars,
  );
}
