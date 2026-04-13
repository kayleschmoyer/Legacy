#!/usr/bin/env node
// CI failure classifier: matches CI log output against known failure patterns.
// Returns a diagnosis with severity and recommended fix command.
//
// Usage:
//   node scripts/ci-classify-failure.js --log="Error acquiring the state lock"
//   node scripts/ci-classify-failure.js --file=scratch/ci-log.txt
//   node scripts/ci-classify-failure.js --json --log="..."
//
// Patterns sourced from: .agents/skills/debugging/references/ci-troubleshooting-advanced.md

const { readFileSync } = require('fs');
const { resolve } = require('path');

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const logArg = args.find((a) => a.startsWith('--log='));
const fileArg = args.find((a) => a.startsWith('--file='));

let logText = '';
if (logArg) {
  logText = logArg.slice(6);
} else if (fileArg) {
  logText = readFileSync(resolve(fileArg.slice(7)), 'utf8');
} else {
  // Read from stdin
  try {
    logText = readFileSync(0, 'utf8');
  } catch {
    console.error(
      'Usage: node scripts/ci-classify-failure.js --log="..." or --file=path or pipe stdin',
    );
    process.exit(2);
  }
}

// --- Known CI failure patterns ---
const FAILURE_PATTERNS = [
  {
    id: 'concurrency_cancellation',
    pattern:
      /The run was canceled because a more recent commit was pushed|The operation was canceled/i,
    severity: 'info',
    autoFixable: true,
    diagnosis: 'Concurrency cancellation — not a real failure',
    fix: 'No fix needed. A newer commit superseded this run.',
    fixCommand: null,
  },
  {
    id: 'skills_lint',
    pattern: /skill.*failed validation|✖\s+\S+-/i,
    severity: 'error',
    autoFixable: true,
    diagnosis: 'Agent skills lint validation failure',
    fix: 'Fix skill SKILL.md frontmatter or structure',
    fixCommand: 'node scripts/lint-skills.js',
  },
  {
    id: 'e2e_server_start',
    pattern:
      /Development server failed to start within \d+ seconds|Development server process died/i,
    severity: 'error',
    autoFixable: true,
    diagnosis: 'E2E dev server failed to start',
    fix: 'Rebuild the web app before running E2E tests',
    fixCommand: 'pnpm exec nx build web',
  },
  {
    id: 'workspace_detection',
    pattern:
      /Nx CLI not available|node_modules not found|workspace invalid|nx binary not functional/i,
    severity: 'warning',
    autoFixable: true,
    diagnosis: 'Workspace/Nx detection failure (usually transient)',
    fix: 'Rerun the job, or bust the CI cache',
    fixCommand:
      'pnpm exec nx reset && git commit --allow-empty -m "chore: bust CI cache" && git push',
  },
  {
    id: 'terraform_state_lock',
    pattern: /Error acquiring the state lock/i,
    severity: 'error',
    autoFixable: true,
    diagnosis: 'Terraform state lock conflict',
    fix: 'Force-unlock the state. CI auto-cleans locks >30 min old.',
    fixCommand: 'cd terraform && terraform force-unlock <lock-id>',
    extractLockId: /ID:\s*([a-f0-9-]+)/i,
  },
  {
    id: 'merge_queue_permission',
    pattern: /HttpError: Resource not accessible by integration/i,
    severity: 'error',
    autoFixable: false,
    diagnosis: 'Merge queue permission error',
    fix: 'Ensure GitHub App has correct permissions. Remove and re-add merge-when-ready label.',
    fixCommand: null,
  },
  {
    id: 'merge_queue_no_checks',
    pattern: /No check runs found|Branch is already up to date/i,
    severity: 'warning',
    autoFixable: true,
    diagnosis: 'Merge queue — no check runs registered yet',
    fix: 'Remove and re-add merge-when-ready label to re-trigger',
    fixCommand: null,
  },
  {
    id: 'artifact_download',
    pattern:
      /Unable to find artifact|Artifact not found|download-artifact.*failed/i,
    severity: 'error',
    autoFixable: false,
    diagnosis: 'Build artifact download failure',
    fix: 'Check if build-validation job succeeded. E2E may run against stale content.',
    fixCommand: null,
  },
  {
    id: 'type_error',
    pattern:
      /error TS\d+:|Type .+ is not assignable|Cannot find module|Property .+ does not exist on type/i,
    severity: 'error',
    autoFixable: false,
    diagnosis: 'TypeScript compilation error',
    fix: 'Fix type errors in the reported files',
    fixCommand: 'pnpm exec nx affected -t typecheck --base=origin/main',
  },
  {
    id: 'lint_error',
    pattern: /✖ \d+ problems? \(\d+ errors?, \d+ warnings?\)|ESLint found/i,
    severity: 'error',
    autoFixable: true,
    diagnosis: 'ESLint error',
    fix: 'Run lint with auto-fix',
    fixCommand: 'pnpm exec nx affected -t lint --fix --base=origin/main',
  },
  {
    id: 'test_failure',
    pattern: /Tests?:\s+\d+ failed|FAIL\s+\S+\.spec\.(ts|js)|● .+ › .+/i,
    severity: 'error',
    autoFixable: false,
    diagnosis: 'Jest test failure',
    fix: 'Fix the failing test(s). Check if snapshot updates are needed.',
    fixCommand: 'pnpm exec nx affected -t test --base=origin/main',
  },
  {
    id: 'e2e_test_failure',
    pattern:
      /\d+ failed.*playwright|playwright.*\d+ failed|Error: expect\(locator\)/i,
    severity: 'error',
    autoFixable: false,
    diagnosis: 'Playwright E2E test failure',
    fix: 'Check the Playwright report for details. May need mock updates.',
    fixCommand: 'pnpm exec nx run web-e2e:e2e',
  },
  {
    id: 'oom',
    pattern: /FATAL ERROR: .* out of memory|JavaScript heap out of memory/i,
    severity: 'error',
    autoFixable: true,
    diagnosis: 'Out of memory during build/test',
    fix: 'Increase Node memory limit',
    fixCommand:
      'NODE_OPTIONS="--max-old-space-size=8192" pnpm exec nx affected -t build',
  },
  {
    id: 'pnpm_lockfile',
    pattern: /ERR_PNPM_OUTDATED_LOCKFILE|lockfile is not up to date/i,
    severity: 'error',
    autoFixable: true,
    diagnosis: 'pnpm lockfile out of sync',
    fix: 'Regenerate the lockfile',
    fixCommand: 'pnpm install && git add pnpm-lock.yaml',
  },
  {
    id: 'nx_cache_corruption',
    pattern:
      /Cannot read properties of undefined|ENOENT.*\.nx|Nx daemon.*crash/i,
    severity: 'warning',
    autoFixable: true,
    diagnosis: 'Nx cache corruption',
    fix: 'Reset Nx cache and retry',
    fixCommand: 'pnpm exec nx reset',
  },
];

// --- Classify ---
function classify(text) {
  const matches = [];

  for (const pattern of FAILURE_PATTERNS) {
    if (pattern.pattern.test(text)) {
      const match = {
        id: pattern.id,
        severity: pattern.severity,
        autoFixable: pattern.autoFixable,
        diagnosis: pattern.diagnosis,
        fix: pattern.fix,
        fixCommand: pattern.fixCommand,
      };

      // Extract lock ID for terraform
      if (pattern.extractLockId) {
        const lockMatch = text.match(pattern.extractLockId);
        if (lockMatch) {
          match.fixCommand = match.fixCommand.replace(
            '<lock-id>',
            lockMatch[1],
          );
          match.lockId = lockMatch[1];
        }
      }

      matches.push(match);
    }
  }

  return matches;
}

// --- Main ---
const matches = classify(logText);

if (jsonMode) {
  console.log(
    JSON.stringify(
      {
        matchCount: matches.length,
        matches,
        unclassified: matches.length === 0,
      },
      null,
      2,
    ),
  );
} else {
  if (matches.length === 0) {
    console.log(
      '⚠️  No known CI failure pattern matched. Manual investigation required.',
    );
    process.exit(1);
  }

  for (const m of matches) {
    const icon =
      m.severity === 'error' ? '❌' : m.severity === 'warning' ? '⚠️' : 'ℹ️';
    console.log(`${icon} ${m.diagnosis}`);
    console.log(`   Fix: ${m.fix}`);
    if (m.fixCommand) {
      console.log(`   Command: ${m.fixCommand}`);
    }
    console.log(`   Auto-fixable: ${m.autoFixable ? 'Yes' : 'No'}\n`);
  }
}

const hasMatches = matches.length > 0;
process.exit(hasMatches ? 0 : 1);
