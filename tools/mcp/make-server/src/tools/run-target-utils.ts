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

    // Use unambiguous failure signals only.
    const failed =
      /NX\s+Failed tasks/i.test(section) ||
      /^FAIL\s+\S/m.test(section) ||
      /error TS\d/i.test(section) ||
      /exit code [1-9]/.test(section) ||
      /✗/.test(section) ||
      /^make.*Error/im.test(section);

    const passed = /(?:✓|passed|succeeded|SUCCESS)/im.test(section);

    steps.push({
      name: stepEntries[i].name,
      status: failed ? 'failed' : passed ? 'passed' : 'unknown',
    });
  }

  return steps;
}

/**
 * Extract error lines from output — lines containing error indicators.
 */
export function extractErrors(output: string): string[] {
  const errorLines: string[] = [];
  const lines = output.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      /(?:ERROR|FAIL|error\b|failed\b|✗)/i.test(line) &&
      !/node_modules/.test(line) &&
      !/^[\s]*at\s/.test(line)
    ) {
      errorLines.push(line.trim());
      if (i + 1 < lines.length && lines[i + 1].trim()) {
        errorLines.push(lines[i + 1].trim());
      }
      if (i + 2 < lines.length && lines[i + 2].trim()) {
        errorLines.push(lines[i + 2].trim());
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
