export const MAX_OUTPUT_CHARS = 30_000;

/** Head share of the budget for the default (balanced) truncation. */
const DEFAULT_HEAD_RATIO = 0.3;
/**
 * Head share of the budget for tail-biased truncation (LS-10092). Small but
 * non-zero: the head still carries the nx/make invocation banner that says
 * what ran, while the failure summary — always written last — keeps 90% of
 * the budget instead of 70%.
 */
const TAIL_BIASED_HEAD_RATIO = 0.1;

function truncateWithRatio(
  output: string,
  maxChars: number,
  headRatio: number,
): string {
  if (output.length <= maxChars) return output;
  const headSize = Math.floor(maxChars * headRatio);
  const tailSize = Math.floor(maxChars * (1 - headRatio));
  const head = output.slice(0, headSize);
  const tail = output.slice(-tailSize);
  const omitted = output.length - headSize - tailSize;
  const result = `${head}\n\n... [${omitted.toLocaleString()} characters omitted] ...\n\n${tail}`;
  return result.length > maxChars ? result.slice(0, maxChars) : result;
}

export function truncateOutput(
  output: string,
  maxChars: number = MAX_OUTPUT_CHARS,
): string {
  return truncateWithRatio(output, maxChars, DEFAULT_HEAD_RATIO);
}

/**
 * Truncate while preferring the tail (LS-10092, the LS-8822 lesson for
 * make_run). Jest and nx print the failure summary — the part an agent is
 * reading the output for — at the very end, after the per-suite progress
 * chatter. Use this for output whose value is concentrated at the end;
 * `truncateOutput` stays the default everywhere else.
 */
export function truncateOutputPreferTail(
  output: string,
  maxChars: number = MAX_OUTPUT_CHARS,
): string {
  return truncateWithRatio(output, maxChars, TAIL_BIASED_HEAD_RATIO);
}

/**
 * Matches prettier per-file output lines: `apps/web/Foo.tsx 123ms (unchanged)` or `lib/Bar.ts 45ms`
 * Requires at least one path separator so plain single-word lines don't match.
 *
 * Ported from tools/mcp/make-server/src/tools/run-target-utils.ts (LS-7944) — kept
 * in sync manually since the two MCP servers are separate packages with no shared
 * dependency between them (LS-8423).
 */
const PRETTIER_FILE_LINE_RE = /^(\S+\/\S+)\s+\d+ms(?:\s+\(unchanged\))?$/;

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
 * For each make-pc step section (e.g. the "6/9 Linting..." header a pc-lint
 * chunk prints before its eslint output), truncate the body to
 * MAX_STEP_BODY_LINES lines. Appends "[N more lines — run step directly for
 * full output]" when truncated. Content-agnostic — this is what caps a
 * pc-lint chunk's eslint per-file dump, since compressFormatterOutput only
 * recognizes prettier's specific line shape.
 *
 * `preferTail` keeps the LAST MAX_STEP_BODY_LINES of each over-long body
 * instead of the first (LS-10092). Callers pass it for a FAILED chunk: both
 * eslint and jest print per-project/per-file progress first and the actual
 * error list last, so head-truncating a failed chunk reliably drops exactly
 * the lines the caller needs — the reported symptom was a pc-lint result
 * ending in "[390 more lines — run step directly for full output]" with all
 * 51 eslint errors inside the elided region.
 */
export function truncateStepErrors(output: string, preferTail = false): string {
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
      bodyLines[bodyLines.length - 1] === ''
        ? bodyLines.slice(0, -1)
        : bodyLines;
    const contentLineCount = trimmed.length - 1; // subtract leading ''
    if (contentLineCount > MAX_STEP_BODY_LINES) {
      const remaining = contentLineCount - MAX_STEP_BODY_LINES;
      if (preferTail) {
        // The step header was pushed without its trailing newline, so the
        // note needs its own leading '\n' to land on the line below it.
        parts.push(
          `\n[${remaining} earlier lines omitted — run step directly for full output]`,
        );
        parts.push(`\n${trimmed.slice(-MAX_STEP_BODY_LINES).join('\n')}`);
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
 *
 * `preferTail` (LS-10092) flips both truncation stages to keep the end of the
 * output — the per-step bodies and the overall budget — for callers rendering
 * a failed run, where the error list is always last.
 */
export function buildCompactOutput(
  output: string,
  maxChars: number,
  preferTail = false,
): string {
  const compacted = truncateStepErrors(
    compressFormatterOutput(output),
    preferTail,
  );
  return preferTail
    ? truncateOutputPreferTail(compacted, maxChars)
    : truncateOutput(compacted, maxChars);
}

/**
 * scripts/lint-fix-changed.js's scoped `eslint --fix` pre-step (LS-8777) can
 * crash with ESLint's own fatal-looking CLI banner — e.g. when a changed
 * file's relative pattern doesn't resolve from the per-config-dir invocation
 * cwd — but that script's try/catch swallows the non-zero exit, and the
 * unscoped `nx affected -t lint` check that follows still reports real
 * violations. The raw banner is visually indistinguishable from an actual
 * failure once it lands in a pc-lint chunk's output, so label it as the
 * known non-fatal pre-fix step instead of leaving it looking like a crash
 * (LS-9950).
 */
const ESLINT_PRE_FIX_CRASH_RE =
  /Oops! Something went wrong! :\(\n\nESLint: [^\n]*\n\nNo files matching the pattern "[^\n]*\n[^\n]*\n?/g;

export function labelBenignEslintPreFixCrash(output: string): string {
  return output.replace(
    ESLINT_PRE_FIX_CRASH_RE,
    (match) =>
      `[non-fatal, pre-fix step — scripts/lint-fix-changed.js's scoped eslint --fix hit an unresolved pattern and was ignored; the unscoped lint check below is authoritative]\n${match}`,
  );
}
