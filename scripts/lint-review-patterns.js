#!/usr/bin/env node
// Automated self-review: checks changed files against mechanical review patterns.
// Runs 13 regex checks against the git diff — 7 from common-review-patterns.md
// (#5, #6, #11, #12, #14, #19, #20) plus 6 project-standard rules (console.*,
// @ts-ignore, eslint-disable, any type, inline gql, hardcoded localhost).
//
// Usage:
//   node scripts/lint-review-patterns.js                    # diff vs origin/main
//   node scripts/lint-review-patterns.js --base=HEAD~1      # diff vs last commit
//   node scripts/lint-review-patterns.js --json              # JSON output for agents
//
// Returns exit code 0 if no violations, 1 if violations found.

const { execFileSync } = require('child_process');
const { readFileSync, existsSync } = require('fs');
const { resolve, extname } = require('path');

const root = resolve(__dirname, '..');

// --- CLI args ---
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const baseArg = args.find((a) => a.startsWith('--base='));
const base = baseArg ? baseArg.split('=')[1] : 'origin/main';

// --- Files exempt from console.* checks ---
const CONSOLE_EXEMPT_PATTERNS = [
  /^lib\/logging\//,
  /^apps\/cli\//,
  /^scripts\//,
  /^tools\//,
  /migrations?\//,
  /\.config\.(js|ts|mjs|cjs)$/,
  /jest\.(config|preset|helpers)\./,
  /babel\.config\./,
  /postcss\.config\./,
  /tailwind\.config\./,
  /\.eslintrc/,
  /playwright\.config\./,
  /codegen\.(ts|js)$/,
];

function isConsoleExempt(filePath) {
  return CONSOLE_EXEMPT_PATTERNS.some((p) => p.test(filePath));
}

// --- Pattern definitions ---
// Each pattern: { id, name, regex, fileFilter, severity, description }
const PATTERNS = [
  {
    id: 'console-usage',
    name: 'console.* usage (use LOGGER)',
    regex: /\bconsole\.(log|error|warn|info|debug|trace)\b/,
    fileFilter: (f) => /\.(ts|tsx|js|jsx)$/.test(f) && !isConsoleExempt(f),
    severity: 'error',
    description: 'Use LOGGER from @legacy-sports/logging instead of console.*',
  },
  {
    id: 'ts-ignore',
    name: '@ts-ignore (use @ts-expect-error)',
    regex: /\/\/\s*@ts-ignore/,
    fileFilter: (f) => /\.(ts|tsx)$/.test(f),
    severity: 'error',
    description:
      'Use @ts-expect-error instead of @ts-ignore (fails when the error is fixed)',
  },
  {
    id: 'eslint-disable-no-desc',
    name: 'eslint-disable without description',
    regex:
      /eslint-disable(?:-next-line)?(?:\s+[\w\/@-]+(?:,\s*[\w\/@-]+)*)?\s*$/,
    fileFilter: (f) => /\.(ts|tsx|js|jsx)$/.test(f),
    severity: 'error',
    description:
      'Every eslint-disable MUST have a -- description explaining why',
  },
  {
    id: 'route-continue',
    name: 'route.continue() in E2E tests',
    regex: /route\.continue\s*\(/,
    fileFilter: (f) =>
      /\.(ts|tsx)$/.test(f) &&
      (f.includes('e2e') || f.includes('spec') || f.includes('test')),
    severity: 'error',
    description:
      'E2E tests must be hermetic — use route.fulfill() instead of route.continue()',
  },
  {
    id: 'shell-true',
    name: 'shell: true in child_process',
    regex: /shell\s*:\s*true/,
    fileFilter: (f) =>
      /\.(ts|tsx|js|jsx)$/.test(f) && !f.startsWith('scripts/'),
    severity: 'warning',
    description:
      'shell: true enables injection — use array args with shell: false',
  },
  {
    id: 'hardcoded-localhost',
    name: 'Hardcoded localhost URL',
    regex: /['"`]https?:\/\/localhost:\d+/,
    fileFilter: (f) =>
      /\.(ts|tsx|js|jsx)$/.test(f) &&
      !f.includes('.config.') &&
      !f.includes('spec') &&
      !f.includes('test') &&
      !f.includes('e2e') &&
      !f.includes('fixture') &&
      !f.includes('mock'),
    severity: 'warning',
    description:
      'Use environment variables for URLs instead of hardcoded localhost',
  },
  {
    id: 'empty-catch',
    name: 'Empty catch block',
    regex: /catch\s*\([^)]*\)\s*\{\s*\}/,
    fileFilter: (f) => /\.(ts|tsx|js|jsx)$/.test(f),
    severity: 'error',
    description:
      'Never swallow errors — re-throw, return error with context, or log',
  },
  {
    id: 'any-type',
    name: 'Explicit any type',
    regex: /:\s*any\b(?!\s*\/[/*]\s*(eslint|--))/, // skip if already has an inline comment
    fileFilter: (f) =>
      /\.(ts|tsx)$/.test(f) &&
      !f.includes('.generated.') &&
      !f.includes('migrations'),
    severity: 'warning',
    description: 'Avoid explicit any — create a proper type or interface',
  },
  {
    id: 'logger-error-wrap',
    name: 'LOGGER.error({ error }) wrapping',
    regex: /LOGGER\.error\([^)]*\{\s*error\s*\}/,
    fileFilter: (f) => /\.(ts|tsx|js|jsx)$/.test(f),
    severity: 'error',
    description:
      'Rollbar needs Error as direct arg: LOGGER.error("msg", error) not LOGGER.error("msg", { error })',
  },
  {
    id: 'git-ref-injection',
    name: 'Unsanitized git ref argument',
    regex:
      /\['(checkout|branch|merge|rebase|log|show|diff)',\s*(ref|branch|sha|tag)\b/,
    fileFilter: (f) => /\.(ts|tsx|js|jsx)$/.test(f) && f.includes('tools/'),
    severity: 'warning',
    description:
      'Validate git refs don\'t start with "-" before passing to git commands',
  },
  {
    id: 'inline-gql',
    name: 'Inline gql template literal',
    regex: /\bgql\s*`/,
    fileFilter: (f) =>
      /\.(ts|tsx)$/.test(f) &&
      (f.startsWith('apps/web/') || f.startsWith('lib/shared-components/')),
    severity: 'warning',
    description:
      'Prefer .graphql files + codegen over inline gql template literals',
  },
  {
    id: 'dev-prod-ternary',
    name: 'Dev/prod ternary (forgets staging)',
    regex:
      /['"](?:prod(?:uction)?|dev(?:elopment)?)['"].*\?[^;{]*['"](?:prod(?:uction)?|dev(?:elopment)?)['"]/,
    fileFilter: (f) =>
      /\.(ts|tsx|js|jsx)$/.test(f) &&
      !f.includes('spec') &&
      !f.includes('test'),
    severity: 'warning',
    description:
      'Use { dev: X, staging: Y, prod: Z }[env] instead of dev/prod ternary',
  },
  {
    id: 'unbounded-output',
    name: 'Unbounded array/output without truncation',
    regex:
      /JSON\.stringify\(\s*(?:results|items|rows|logs|entries|lines|files)\s*\)/,
    fileFilter: (f) => /\.(ts|tsx|js|jsx)$/.test(f) && f.includes('tools/mcp/'),
    severity: 'warning',
    description:
      'Cap unbounded output: { lines: [...].slice(0, N), truncated: true, totalLines }',
  },
];

// --- Get changed files from git diff ---
function getChangedFiles() {
  try {
    const output = execFileSync(
      'git',
      ['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`],
      { cwd: root, encoding: 'utf8' },
    );
    return output
      .trim()
      .split('\n')
      .filter((f) => f.length > 0);
  } catch {
    // Fallback: diff against base directly (not merge-base)
    try {
      const output = execFileSync(
        'git',
        ['diff', '--name-only', '--diff-filter=ACMR', base],
        { cwd: root, encoding: 'utf8' },
      );
      return output
        .trim()
        .split('\n')
        .filter((f) => f.length > 0);
    } catch {
      return [];
    }
  }
}

// --- Get changed lines (added/modified only) for a file ---
function getChangedLines(filePath) {
  try {
    const diff = execFileSync(
      'git',
      ['diff', '-U0', `${base}...HEAD`, '--', filePath],
      { cwd: root, encoding: 'utf8' },
    );
    const lines = [];
    let lineNum = 0;
    for (const line of diff.split('\n')) {
      const hunkMatch = line.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)/);
      if (hunkMatch) {
        lineNum = parseInt(hunkMatch[1], 10);
        continue;
      }
      if (line.startsWith('+') && !line.startsWith('+++')) {
        lines.push({ num: lineNum, text: line.slice(1) });
        lineNum++;
      } else if (!line.startsWith('-')) {
        lineNum++;
      }
    }
    return lines;
  } catch {
    // If diff fails, read the whole file as new
    if (!existsSync(resolve(root, filePath))) return [];
    const content = readFileSync(resolve(root, filePath), 'utf8');
    return content.split('\n').map((text, i) => ({ num: i + 1, text }));
  }
}

// --- Main ---
function main() {
  const changedFiles = getChangedFiles();
  if (changedFiles.length === 0) {
    if (jsonMode) {
      console.log(
        JSON.stringify({
          violations: [],
          fileCount: 0,
          patternCount: PATTERNS.length,
        }),
      );
    } else {
      console.log('✓ No changed files to check');
    }
    process.exit(0);
  }

  const violations = [];

  for (const file of changedFiles) {
    const ext = extname(file);
    if (!/\.(ts|tsx|js|jsx)$/.test(ext)) continue;

    const changedLines = getChangedLines(file);
    if (changedLines.length === 0) continue;

    for (const pattern of PATTERNS) {
      if (!pattern.fileFilter(file)) continue;

      for (const line of changedLines) {
        if (pattern.regex.test(line.text)) {
          violations.push({
            file,
            line: line.num,
            text: line.text.trim(),
            pattern: pattern.id,
            name: pattern.name,
            severity: pattern.severity,
            description: pattern.description,
          });
        }
      }
    }
  }

  if (jsonMode) {
    const summary = {
      violations,
      fileCount: changedFiles.length,
      patternCount: PATTERNS.length,
      errors: violations.filter((v) => v.severity === 'error').length,
      warnings: violations.filter((v) => v.severity === 'warning').length,
    };
    console.log(JSON.stringify(summary, null, 2));
  } else {
    if (violations.length === 0) {
      console.log(
        `✓ No mechanical review violations found (${changedFiles.length} files, ${PATTERNS.length} patterns)`,
      );
    } else {
      const errors = violations.filter((v) => v.severity === 'error');
      const warnings = violations.filter((v) => v.severity === 'warning');
      console.log(
        `Found ${violations.length} violation(s) in ${changedFiles.length} files:\n`,
      );

      for (const v of violations) {
        const icon = v.severity === 'error' ? '❌' : '⚠️';
        console.log(`${icon} ${v.file}:${v.line}`);
        console.log(`   ${v.name}`);
        console.log(`   ${v.text}`);
        console.log(`   → ${v.description}\n`);
      }

      console.log(
        `\nSummary: ${errors.length} error(s), ${warnings.length} warning(s)`,
      );
      console.log(
        '\nNote: Some patterns still require manual review: section header overclaims, missing auth/permissions,',
      );
      console.log(
        '  mock structure accuracy, wrong fields in seed data, test name mismatches, and unbounded output.',
      );
    }
  }

  const hasErrors = violations.some((v) => v.severity === 'error');
  process.exit(hasErrors ? 1 : 0);
}

main();
