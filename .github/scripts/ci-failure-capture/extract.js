/**
 * CI failure log distiller.
 *
 * Turns the raw stdout/stderr of a failed CI step into a short, human-readable,
 * secret-redacted excerpt that is safe to post in a PR comment. The goal is to
 * give a cloud coding agent (which cannot read Actions logs directly) just the
 * lines that explain *why* a check failed — not the entire build transcript.
 *
 * Used two ways:
 *   - As a CLI from CI jobs:
 *       node extract.js --tool lint --log /tmp/a.log,/tmp/b.log \
 *         --run-url https://… --max-lines 60 --out excerpt.md
 *   - As a required module (`distill`, `redact`) from github-script steps and
 *     unit tests.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Match an ANSI CSI escape sequence (ESC '[' params letter) without writing a
// backslash-escaped control char in source. `[[]` is a char class for a literal
// '['; String.fromCharCode(27) is the ESC byte.
const ANSI_RE = new RegExp(
  String.fromCharCode(27) + '[[][0-9;?]*[A-Za-z]',
  'g',
);
// GitHub raw-log line prefix: "2026-05-24T12:34:56.7890123Z ".
const LOG_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s/;
const MAX_LINE_LENGTH = 500;
const TAIL_LINES = 12;

// Secret-shaped patterns. `tee` captures raw stdout *before* GitHub's log
// masking, so anything a test or build accidentally prints would otherwise be
// echoed into a public PR comment. Redact defensively.
const REDACTIONS = [
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, '«aws-key»'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '«gh-token»'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '«jwt»'],
  // Credentials embedded in a URL: scheme://user:pass@host
  [/(\/\/[^\s:@/]+):[^\s@/]+@/g, '$1:«redacted»@'],
  // key=value / key: value for sensitive-looking keys.
  [
    /\b((?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|authorization)["']?\s*[:=]\s*["']?)([^\s"',}]+)/gi,
    '$1«redacted»',
  ],
];

function stripAnsi(text) {
  return text.replace(ANSI_RE, '');
}

function clean(text) {
  return stripAnsi(text)
    .split('\n')
    .map((line) => line.replace(LOG_TIMESTAMP_RE, ''))
    .join('\n');
}

function redact(text) {
  let out = text;
  for (const [pattern, replacement] of REDACTIONS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function truncateLine(line) {
  if (line.length <= MAX_LINE_LENGTH) return line;
  return line.slice(0, MAX_LINE_LENGTH) + ' …';
}

// --- per-tool signal matchers ------------------------------------------------
//
// Each tool maps to a set of regexes that mark a line as "interesting". Lines
// are collected in original order, so file headers, the violations beneath
// them, and the trailing summary all survive together. Matchers are additive:
// "test" runs the tsc + jest + nx sets because `nx affected -t typecheck test`
// interleaves all three.

const NX_SIGNALS = [
  /^>\s*nx run \S+/,
  /^\s*(?:✖|✕|×|✗)\s+\d+\/\d+/,
  /\bNX\b.*\b(?:failed|error)/i,
  /^\s*-\s+\S+:\S+/, // failed-project bullet list under the NX summary
];

const ESLINT_SIGNALS = [
  /^\s*\d+:\d+\s+(?:error|warning)\b/,
  /^\S.*\.(?:ts|tsx|js|jsx|cjs|mjs|vue|graphql|json|css|scss|md)$/,
  /^\s*(?:✖|✗)\s+\d+\s+problems?\b/,
];

const TSC_SIGNALS = [/error TS\d+:/, /^\s*\d+\s+error TS\d+/];

const JEST_SIGNALS = [
  /^\s*●/,
  /^\s*(?:✕|✗)\s/,
  /^(?:FAIL|PASS)\s/,
  /^\s*(?:Expected|Received):/,
  /^\s*Tests:\s/,
  /^\s*Test Suites:\s/,
  /Summary of all failing tests/,
];

const PRETTIER_SIGNALS = [
  /^\[warn\]/,
  /Code style issues found/,
  /Forgot to run Prettier/,
];

const GENERIC_SIGNALS = [
  /\b(?:error|fatal|failed|failure|cannot|not found|unexpected|exit code|ENOENT|EACCES)\b/i,
  /^\s*(?:✖|✕|×|✗)\s/,
  /Error:/,
];

const TOOL_SIGNALS = {
  lint: [...ESLINT_SIGNALS, ...NX_SIGNALS],
  format: [...PRETTIER_SIGNALS],
  test: [...TSC_SIGNALS, ...JEST_SIGNALS, ...NX_SIGNALS],
  build: [...TSC_SIGNALS, ...GENERIC_SIGNALS, ...NX_SIGNALS],
  'custom-checks': [...GENERIC_SIGNALS],
  generic: [...GENERIC_SIGNALS],
};

function countMatches(lines, pattern) {
  let n = 0;
  for (const line of lines) if (pattern.test(line)) n++;
  return n;
}

// Produce a one-line human summary like "3 type errors" when we can recognise
// the failure shape; otherwise return null and let the caller omit it.
function summarize(tool, lines) {
  const joined = lines.join('\n');

  const tsErrors = countMatches(lines, /error TS\d+:/);
  if (tsErrors > 0)
    return `${tsErrors} TypeScript error${tsErrors === 1 ? '' : 's'}`;

  const jestMatch = joined.match(/Tests:[^\n]*?(\d+)\s+failed/);
  if (jestMatch) {
    const n = Number(jestMatch[1]);
    return `${n} test${n === 1 ? '' : 's'} failed`;
  }

  if (tool === 'lint') {
    const eslintMatch = joined.match(/(\d+)\s+problems?\s*\((\d+)\s+error/);
    if (eslintMatch) {
      const errors = Number(eslintMatch[2]);
      return `${errors} ESLint error${errors === 1 ? '' : 's'}`;
    }
    const violations = countMatches(lines, /^\s*\d+:\d+\s+error\b/);
    if (violations > 0)
      return `${violations} ESLint error${violations === 1 ? '' : 's'}`;
  }

  if (tool === 'format') {
    const files = countMatches(lines, /^\[warn\]\s+\S+\.\w+$/);
    if (files > 0)
      return `${files} file${files === 1 ? '' : 's'} need formatting`;
  }

  const failedProjects = joined.match(
    /(\d+)\/(\d+)\s+(?:failed|targets failed)/,
  );
  if (failedProjects)
    return `${failedProjects[1]} of ${failedProjects[2]} projects failed`;

  return null;
}

/**
 * Distil raw log text into a capped, redacted excerpt.
 *
 * @param {object} opts
 * @param {string} opts.tool   one of TOOL_SIGNALS keys (falls back to generic)
 * @param {string} opts.text   raw captured log text
 * @param {number} [opts.maxLines=60]
 * @param {string} [opts.runUrl]  workflow run URL, shown in the truncation note
 * @returns {{ summary: string|null, excerpt: string, truncated: boolean }}
 */
function distill({ tool, text, maxLines = 60, runUrl = '' }) {
  const allLines = clean(text || '')
    .split('\n')
    .map(truncateLine);

  // Drop trailing blank lines so the tail is meaningful.
  while (allLines.length && allLines[allLines.length - 1].trim() === '')
    allLines.pop();

  if (allLines.length === 0) {
    return {
      summary: null,
      excerpt: 'No output was captured for this step.',
      truncated: false,
    };
  }

  const signals = TOOL_SIGNALS[tool] || TOOL_SIGNALS.generic;
  const selected = new Set();
  allLines.forEach((line, i) => {
    if (signals.some((re) => re.test(line))) selected.add(i);
  });

  // Always include the tail — the summary line ("N problems", "Tests: …") and
  // the final nx verdict usually live there.
  for (
    let i = Math.max(0, allLines.length - TAIL_LINES);
    i < allLines.length;
    i++
  )
    selected.add(i);

  let indices = [...selected].sort((a, b) => a - b);

  // No signal lines and a tiny log: just show the tail we have.
  if (indices.length === 0) {
    indices = allLines.map((_, i) => i).slice(-maxLines);
  }

  let truncated = false;
  let excerptLines;
  if (indices.length > maxLines) {
    truncated = true;
    const headCount = Math.max(1, maxLines - TAIL_LINES);
    const head = indices.slice(0, headCount);
    const tail = indices.slice(-TAIL_LINES);
    const omitted = indices.length - head.length - tail.length;
    excerptLines = [
      ...head.map((i) => allLines[i]),
      `… (${omitted} more line${omitted === 1 ? '' : 's'} omitted${
        runUrl ? ` — full log: ${runUrl}` : ''
      })`,
      ...tail.map((i) => allLines[i]),
    ];
  } else {
    excerptLines = indices.map((i) => allLines[i]);
  }

  const summary = summarize(
    tool,
    indices.map((i) => allLines[i]),
  );
  const excerpt = redact(excerptLines.join('\n')).trim();
  return { summary, excerpt, truncated };
}

// --- CLI ---------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!flag.startsWith('--')) continue;
    const key = flag.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

// Match a filename against a '*'-only glob (no '?', no '**'). Pure string ops —
// no RegExp construction from the pattern, no shell expansion.
function matchesGlob(name, pattern) {
  const parts = pattern.split('*');
  if (!name.startsWith(parts[0])) return false;
  let pos = parts[0].length;
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (i === parts.length - 1) return name.slice(pos).endsWith(part);
    const idx = name.indexOf(part, pos);
    if (idx === -1) return false;
    pos = idx + part.length;
  }
  return true;
}

// Resolve a single path-or-glob to concrete file paths. Globbing is done in
// Node (readdir + matchesGlob) rather than the shell, so log patterns are never
// word-split or command-expanded by bash.
function expandPattern(pattern) {
  if (!pattern.includes('*')) return [pattern];
  const dir = path.dirname(pattern);
  const base = path.basename(pattern);
  if (dir.includes('*')) return []; // directory globbing unsupported (unused)
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((e) => matchesGlob(e, base))
    .map((e) => path.join(dir, e));
}

function readLogs(logArg) {
  if (!logArg || logArg === true) return { text: '', fileCount: 0 };
  const patterns = String(logArg)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const files = new Set();
  for (const pattern of patterns) {
    for (const f of expandPattern(pattern)) files.add(f);
  }
  const chunks = [];
  let fileCount = 0;
  for (const p of files) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        chunks.push(fs.readFileSync(p, 'utf8'));
        fileCount++;
      }
    } catch {
      // ignore unreadable logs — a partial excerpt beats failing the reporter
    }
  }
  return { text: chunks.join('\n'), fileCount };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const tool = typeof args.tool === 'string' ? args.tool : 'generic';
  const { text, fileCount } = readLogs(args.log);
  const maxLinesArg = args['max-lines'] ? Number(args['max-lines']) : 60;
  const maxLines = Number.isFinite(maxLinesArg) ? maxLinesArg : 60;
  const runUrl = typeof args['run-url'] === 'string' ? args['run-url'] : '';

  // A --log was requested but matched no readable file: emit the sentinel the
  // summarize step filters on, rather than a misleading distilled excerpt.
  if (args.log && fileCount === 0) {
    const msg = `No log file was captured for the ${tool} step.\n`;
    if (typeof args.out === 'string') fs.writeFileSync(args.out, msg, 'utf8');
    else process.stdout.write(msg);
    return;
  }

  const { summary, excerpt, truncated } = distill({
    tool,
    text,
    maxLines,
    runUrl,
  });

  const header = summary ? `${summary}\n\n` : '';
  const output = `${header}${excerpt}\n`;

  if (typeof args.out === 'string') {
    fs.writeFileSync(args.out, output, 'utf8');
  } else {
    process.stdout.write(output);
  }
  if (typeof args['summary-out'] === 'string') {
    fs.writeFileSync(args['summary-out'], (summary || '') + '\n', 'utf8');
  }
  if (truncated && process.env.GITHUB_OUTPUT) {
    try {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, 'truncated=true\n');
    } catch {
      /* best effort */
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = { distill, redact, stripAnsi, summarize, matchesGlob };
