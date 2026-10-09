/**
 * Pull the actionable failure lines out of a raw pc-chunk log (LS-10354).
 *
 * A failed chunk's `output` is truncated to its tail, but the lines a caller
 * needs — TAP `not ok` names, jest `FAIL`/`●` headers, `error TS` diagnostics,
 * eslint errors, prettier `[warn]` files — can sit anywhere in a log of
 * thousands of lines. Scanning the full log first keeps them regardless of
 * truncation.
 */
export const MAX_EXTRACTED_FAILURES = 100;

const TAP_NOT_OK_RE = /^\s*not ok \d+\b/;
const TAP_CONTEXT_RE = /^\s+(?:#|error:|message:|code:|---|\.\.\.)/;
const TAP_CONTEXT_MAX_LINES = 4;
const JEST_FAIL_RE = /^\s*FAIL\s+\S+/;
const JEST_BULLET_RE = /^\s*● (?!Console\b).+/;
const TS_ERROR_RE = /error TS\d+:/;
const ESLINT_FILE_RE = /^(?:\/|[A-Za-z]:|\.{0,2}\/)?[^\s:]+\.[cm]?[jt]sx?$/;
const ESLINT_ERROR_RE = /^\s+\d+:\d+\s+error\s+/;
const PRETTIER_WARN_RE = /^\[warn\]\s+(?!Code style issues)\S.*$/;
const NX_FAILED_TASKS_RE = /^\s*Failed tasks:\s*$/;
const NX_FAILED_TASK_ITEM_RE = /^\s*-\s+\S+:\S+/;

export interface ExtractedFailures {
  failures: string[];
  omittedFailures?: number;
}

export function extractFailures(log: string): ExtractedFailures {
  const lines = log.split('\n');
  const seen = new Set<string>();
  const found: string[] = [];
  const add = (entry: string) => {
    const trimmed = entry.trimEnd();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    found.push(trimmed);
  };

  let eslintFile: string | null = null;
  let inNxFailedTasks = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (inNxFailedTasks) {
      if (NX_FAILED_TASK_ITEM_RE.test(line)) {
        add(trimmed);
        continue;
      }
      inNxFailedTasks = false;
    }

    if (TAP_NOT_OK_RE.test(line)) {
      const context: string[] = [trimmed];
      for (
        let j = i + 1;
        j < lines.length && context.length <= TAP_CONTEXT_MAX_LINES;
        j++
      ) {
        if (!TAP_CONTEXT_RE.test(lines[j])) break;
        context.push(lines[j].trim());
      }
      add(context.join(' | '));
    } else if (JEST_FAIL_RE.test(line) || JEST_BULLET_RE.test(line)) {
      add(trimmed);
    } else if (TS_ERROR_RE.test(line)) {
      add(trimmed);
    } else if (PRETTIER_WARN_RE.test(trimmed)) {
      add(trimmed);
    } else if (NX_FAILED_TASKS_RE.test(line)) {
      inNxFailedTasks = true;
    } else if (ESLINT_FILE_RE.test(trimmed) && !/^\s/.test(line)) {
      eslintFile = trimmed;
    } else if (ESLINT_ERROR_RE.test(line)) {
      add(eslintFile ? `${eslintFile} ${trimmed}` : trimmed);
    }
  }

  if (found.length <= MAX_EXTRACTED_FAILURES) return { failures: found };
  return {
    failures: found.slice(0, MAX_EXTRACTED_FAILURES),
    omittedFailures: found.length - MAX_EXTRACTED_FAILURES,
  };
}
