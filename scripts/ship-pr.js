#!/usr/bin/env node
// PR shipping automation: automates the 5-step PR shipping pipeline.
//
// Steps:
//   1. Create draft PR with Jira-linked title
//   2. Add 'agent-in-progress' label (while draft)
//   3. Mark PR ready for review
//   4. Request Copilot review
//   5. Transition Jira ticket to "In Review"
//
// Usage:
//   node scripts/ship-pr.js --title="LS-1234 feat(scope): description"
//   node scripts/ship-pr.js --title="LS-1234 feat(scope): desc" --body-file=.github/tmp-pr-body.md
//   node scripts/ship-pr.js --title="LS-1234 feat(scope): desc" --ticket=LS-1234 --dry-run
//   node scripts/ship-pr.js --json --title="LS-1234 feat(scope): desc"
//   make ship-pr TITLE="LS-1234 feat(scope): desc"
//
// Flags:
//   --title=<str>       PR title (required; should contain LS-#### for Jira linking)
//   --body-file=<path>  Path to PR body markdown file (auto-detects .github/tmp-pr-body.md)
//   --ticket=<LS-####>  Jira key (auto-detected from title or branch if omitted)
//   --base=<branch>     Base branch (default: main)
//   --no-jira           Skip Jira transition
//   --dry-run           Show what would run without executing
//   --json              Machine-readable JSON output on stdout
//
// Environment variables (required for Jira step):
//   JIRA_API_TOKEN — Atlassian API token
//   JIRA_EMAIL     — Atlassian account email (e.g. user@example.com)
//   JIRA_SITE_URL  — Jira site base URL (default: https://bkrupa.atlassian.net)
//   JIRA_BASE_URL  — alias for JIRA_SITE_URL
//
// Exit codes: 0 = all steps passed, 1 = one or more steps failed, 2 = usage error

'use strict';

const { execFileSync } = require('child_process');
const { existsSync, writeFileSync, unlinkSync } = require('fs');
const { resolve } = require('path');
const https = require('https');

const root = resolve(__dirname, '..');
const args = process.argv.slice(2);

// --- Jira site configuration (configurable via env) ---
const _jiraSiteRaw =
  process.env.JIRA_SITE_URL ||
  process.env.JIRA_BASE_URL ||
  'https://bkrupa.atlassian.net';
const _jiraSiteUrl = new URL(
  _jiraSiteRaw.includes('://') ? _jiraSiteRaw : `https://${_jiraSiteRaw}`,
);
const jiraHostname = _jiraSiteUrl.hostname;
const jiraBasePath =
  _jiraSiteUrl.pathname && _jiraSiteUrl.pathname !== '/'
    ? _jiraSiteUrl.pathname.replace(/\/$/, '')
    : '';
const jiraBrowseBase = `${_jiraSiteUrl.origin}/browse`;

// --- CLI arg parsing ---
const dryRun = args.includes('--dry-run');
const jsonMode = args.includes('--json');
const noJira = args.includes('--no-jira');

const titleArg = args.find((a) => a.startsWith('--title='));
const bodyFileArg = args.find((a) => a.startsWith('--body-file='));
const ticketArg = args.find((a) => a.startsWith('--ticket='));
const baseArg = args.find((a) => a.startsWith('--base='));

const title = titleArg ? titleArg.slice(8) : null;
const bodyFilePath = bodyFileArg ? resolve(root, bodyFileArg.slice(12)) : null;
const base = baseArg ? baseArg.slice(7) : 'main';

if (!title) {
  process.stderr.write(
    'Error: --title is required\n' +
      'Usage: node scripts/ship-pr.js --title="LS-#### type(scope): description"\n',
  );
  process.exit(2);
}

// --- Module-level state (accessible from finish()) ---
const steps = [];
let prNumber = null;

// --- Logging ---
function log(msg) {
  if (!jsonMode) process.stdout.write(msg + '\n');
}

// --- Ticket key extraction ---
function extractTicketKey(str) {
  const match = str && str.match(/\bLS-\d+\b/);
  return match ? match[0] : null;
}

let ticketKey = ticketArg ? ticketArg.slice(9) : null;
if (ticketKey && !/^[A-Z]+-\d+$/.test(ticketKey)) {
  process.stderr.write(
    `Error: --ticket value "${ticketKey}" does not match expected format (e.g. LS-1234)\n`,
  );
  process.exit(2);
}
if (!ticketKey) ticketKey = extractTicketKey(title);
if (!ticketKey) {
  try {
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();
    ticketKey = extractTicketKey(branch);
  } catch {
    // ignore — ticket key is optional (Jira step will be skipped)
  }
}

// --- Step runner ---
async function runStep(name, fn, opts = {}) {
  const step = { name, status: 'pending', output: '' };

  if (dryRun) {
    step.status = 'dry-run';
    log(`  [DRY-RUN] ${name}`);
    steps.push(step);
    return { ok: true };
  }

  log(`  [->] ${name}...`);
  try {
    const output = await fn();
    step.status = 'ok';
    step.output = typeof output === 'string' ? output.slice(-500) : '';
    log(`  [OK] ${name}`);
    steps.push(step);
    return { ok: true };
  } catch (e) {
    step.status = opts.optional ? 'warn' : 'fail';
    const raw =
      (e.stderr instanceof Buffer ? e.stderr.toString() : e.stderr) ||
      (Array.isArray(e.output)
        ? e.output
            .filter(Boolean)
            .map((b) => (b instanceof Buffer ? b.toString() : b))
            .join('')
        : '') ||
      e.message ||
      String(e);
    step.output = raw.slice(-1000);
    const prefix = opts.optional ? '[WARN]' : '[FAIL]';
    log(`  ${prefix} ${name}: ${step.output.split('\n')[0]}`);
    steps.push(step);
    return { ok: false };
  }
}

// --- GitHub helpers ---
function ghRun(ghArgs, timeout) {
  return execFileSync('gh', ghArgs, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: timeout || 30000,
  }).trim();
}

function ghJSON(ghArgs) {
  return JSON.parse(ghRun(ghArgs));
}

// --- Jira helpers ---
function jiraRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const token = process.env.JIRA_API_TOKEN;
    const email = process.env.JIRA_EMAIL;
    if (!token || !email) {
      reject(
        new Error(
          'JIRA_API_TOKEN and JIRA_EMAIL env vars are required for Jira transition. ' +
            'Set them or use --no-jira to skip.',
        ),
      );
      return;
    }

    const auth = Buffer.from(`${email}:${token}`).toString('base64');
    const bodyStr = body ? JSON.stringify(body) : null;

    const reqOptions = {
      hostname: jiraHostname,
      path: `${jiraBasePath}/rest/api/3${path}`,
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        ...(bodyStr
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(bodyStr),
            }
          : {}),
      },
      timeout: 20000,
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (!data) {
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(
              new Error(
                `Jira API returned non-JSON (${res.statusCode}): ${data.slice(0, 200)}`,
              ),
            );
          }
        } else {
          reject(
            new Error(`Jira API ${res.statusCode}: ${data.slice(0, 300)}`),
          );
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Jira API request timed out after 20s'));
    });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function transitionJiraToInReview(key) {
  const safeKey = encodeURIComponent(key);
  const { transitions } = await jiraRequest(
    'GET',
    `/issue/${safeKey}/transitions`,
  );
  const target = transitions.find((t) => {
    const tName = typeof t.name === 'string' ? t.name.toLowerCase() : '';
    const destName =
      t.to && typeof t.to.name === 'string' ? t.to.name.toLowerCase() : '';
    return tName === 'in review' || destName === 'in review';
  });
  if (!target) {
    const available = transitions
      .map((t) => {
        const destName = t.to && typeof t.to.name === 'string' ? t.to.name : '';
        return destName ? `${t.name} -> ${destName}` : t.name;
      })
      .join(', ');
    throw new Error(
      `No "In Review" transition found for ${key}. Available: ${available}`,
    );
  }
  await jiraRequest('POST', `/issue/${safeKey}/transitions`, {
    transition: { id: target.id },
  });
}

// --- Summary and exit ---
function finish(exitCode) {
  const icons = {
    ok: '✓',
    fail: '✗',
    warn: '⚠',
    skipped: '—',
    'dry-run': '~',
    pending: '?',
  };
  const failed = steps.filter((s) => s.status === 'fail');
  const warned = steps.filter((s) => s.status === 'warn');

  log('\n--- Summary ---');
  for (const s of steps) {
    log(`  ${icons[s.status] || '?'} ${s.name}`);
    if ((s.status === 'fail' || s.status === 'warn') && s.output) {
      log(`      ${s.output.split('\n')[0].slice(0, 120)}`);
    }
  }

  if (failed.length) {
    log(`\n  ${failed.length} step(s) failed`);
  } else if (warned.length) {
    log(`\n  Done with ${warned.length} warning(s)`);
  } else {
    log('\n  All steps passed!');
  }

  if (jsonMode) {
    process.stdout.write(
      JSON.stringify({ prNumber, steps, exitCode }, null, 2) + '\n',
    );
  }

  process.exit(exitCode);
}

// --- Main ---
async function main() {
  log('🚀 ship-pr: PR shipping pipeline\n');

  if (ticketKey) {
    log(`  Jira ticket : ${ticketKey}`);
  } else {
    log(
      '  [WARN] No Jira ticket key found in title or branch — Jira step will be skipped',
    );
  }
  log(`  Base branch : ${base}`);
  log('');

  // --- Resolve PR body file ---
  let prBodyFile = bodyFilePath;
  let tempBodyCreated = false;

  if (!prBodyFile) {
    const standardTemp = resolve(root, '.github', 'tmp-pr-body.md');
    if (existsSync(standardTemp)) {
      prBodyFile = standardTemp;
      log('  Using body : .github/tmp-pr-body.md\n');
    }
  }

  if (!prBodyFile && !dryRun) {
    const jiraLink = ticketKey
      ? `[${ticketKey}](${jiraBrowseBase}/${ticketKey})`
      : '_No ticket linked_';
    const defaultBody = [
      '## Context',
      '',
      `**Jira:** ${jiraLink}`,
      '',
      '_Describe the problem this PR solves and why the change is needed._',
      '',
      '## Summary',
      '',
      '- _Summarise what changed and why._',
      '',
      '## Test plan',
      '',
      '- [ ] _Describe how to verify the change._',
      '',
      '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
    ].join('\n');
    const tempPath = resolve(root, '.github', 'tmp-pr-body.md');
    writeFileSync(tempPath, defaultBody, 'utf8');
    prBodyFile = tempPath;
    tempBodyCreated = true;
    log('  Created default PR body at .github/tmp-pr-body.md\n');
  }

  // --- Step 1: Create draft PR (idempotent — skip if PR already exists) ---
  if (!dryRun) {
    try {
      const existing = ghJSON(['pr', 'view', '--json', 'number,state,isDraft']);
      prNumber = existing.number;
      log(
        `  Found existing PR #${prNumber} (${existing.state}${existing.isDraft ? ', draft' : ''})`,
      );
    } catch {
      // No PR yet — will be created below
    }
  }

  await runStep('Create draft PR', () => {
    if (prNumber) {
      return `skipped — PR #${prNumber} already exists`;
    }
    const output = ghRun(
      [
        'pr',
        'create',
        '--draft',
        '--title',
        title,
        '--base',
        base,
        '--body-file',
        prBodyFile,
      ],
      60000,
    );
    const match = output.match(/\/pull\/(\d+)/);
    if (match) {
      prNumber = parseInt(match[1], 10);
    }
    return output;
  });

  // Resolve PR number if creation step ran but number wasn't in output
  if (!prNumber && !dryRun) {
    try {
      prNumber = ghJSON(['pr', 'view', '--json', 'number']).number;
    } catch {
      // ignore
    }
  }

  if (!dryRun && !prNumber) {
    log('\n  Could not determine PR number — aborting early.\n');
    if (
      tempBodyCreated &&
      existsSync(resolve(root, '.github', 'tmp-pr-body.md'))
    ) {
      try {
        unlinkSync(resolve(root, '.github', 'tmp-pr-body.md'));
      } catch {
        /* ignore */
      }
    }
    finish(1);
    return;
  }

  if (prNumber) log(`  PR : #${prNumber}\n`);

  // --- Step 2: Add agent-in-progress label (while still draft) ---
  await runStep('Add agent-in-progress label', () => {
    try {
      const info = ghJSON([
        'pr',
        'view',
        String(prNumber),
        '--json',
        'isDraft',
      ]);
      if (!info.isDraft) {
        return 'skipped — PR is already ready (not a draft)';
      }
    } catch {
      // ignore — attempt label add anyway
    }
    return ghRun([
      'pr',
      'edit',
      String(prNumber),
      '--add-label',
      'agent-in-progress',
    ]);
  });

  // --- Step 3: Mark ready for review ---
  await runStep('Mark PR ready for review', () => {
    try {
      const info = ghJSON([
        'pr',
        'view',
        String(prNumber),
        '--json',
        'isDraft',
      ]);
      if (!info.isDraft) return 'skipped — PR is already ready (not a draft)';
    } catch {
      // ignore — attempt mark-ready anyway
    }
    return ghRun(['pr', 'ready', String(prNumber)]);
  });

  // --- Step 4: Request Copilot review ---
  await runStep(
    'Request Copilot review',
    () => {
      const { owner, name: repo } = ghJSON([
        'repo',
        'view',
        '--json',
        'owner,name',
      ]);
      return ghRun(
        [
          'api',
          `repos/${owner.login}/${repo}/pulls/${prNumber}/requested_reviewers`,
          '--method',
          'POST',
          '-f',
          'reviewers[]=copilot-pull-request-reviewer[bot]',
        ],
        15000,
      );
    },
    { optional: true },
  );

  // --- Step 5: Transition Jira to In Review ---
  if (noJira) {
    log('  [SKIP] Jira transition (--no-jira)');
    steps.push({
      name: `Transition ${ticketKey || 'ticket'} → In Review`,
      status: 'skipped',
      output: '--no-jira flag',
    });
  } else if (!ticketKey) {
    log('  [SKIP] Jira transition (no ticket key detected)');
    steps.push({
      name: 'Jira transition',
      status: 'skipped',
      output: 'no ticket key in title or branch',
    });
  } else {
    await runStep(`Transition ${ticketKey} → In Review`, () =>
      transitionJiraToInReview(ticketKey),
    );
  }

  // --- Cleanup generated body file ---
  if (tempBodyCreated) {
    try {
      const tempPath = resolve(root, '.github', 'tmp-pr-body.md');
      if (existsSync(tempPath)) unlinkSync(tempPath);
    } catch {
      // non-fatal
    }
  }

  // --- Print PR URL ---
  if (!dryRun && prNumber) {
    try {
      const { url } = ghJSON(['repo', 'view', '--json', 'url']);
      log(`\n  PR URL: ${url}/pull/${prNumber}`);
    } catch {
      log(`\n  PR: #${prNumber}`);
    }
  }

  finish(steps.some((s) => s.status === 'fail') ? 1 : 0);
}

main().catch((e) => {
  process.stderr.write(`\nUnexpected error: ${e.message || e}\n`);
  process.exit(1);
});
