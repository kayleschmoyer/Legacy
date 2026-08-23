#!/usr/bin/env node
/**
 * jira-link-check.mjs
 *
 * Validates — and, where the intent is unambiguous, repairs — the declared
 * jira-link marker on a PR (LS-7896, phase 3 of RFC
 * docs/rfcs/draft-declared-ticket-linkage.md). The marker is the single
 * source of truth for "which ticket is this PR for?" and is emitted by
 * github_open_pr / the PR-creation skills (LS-7895, phase 2):
 *
 *   <!-- jira-link
 *   primary: LS-1234
 *   related: LS-5678, LS-9012
 *   -->
 *
 * Assertions:
 *  1. Exactly one jira-link marker block is present and parseable.
 *  2. The block declares exactly one `primary:` — an LS-#### key or `none`.
 *  3. `primary: none` requires the `no-jira` label (deliberate, visible
 *     opt-out for dependabot/bot PRs).
 *  4. A primary key must appear in the PR title (keeps Jira's native scanner
 *     and human scanning working).
 *  5. The primary ticket exists in Jira (single GET — eliminates the
 *     404-after-merge failure class, e.g. LS-7778 run 27070091990).
 *  6. `related:` keys, when present, are well-formed LS-#### keys.
 *
 * Self-repair (LS-9463 class): the marker is an HTML comment, and every
 * GitHub MCP tool that returns a PR body strips HTML comments on the way out
 * — `pull_request_read` and `list_pull_requests` alike. An agent therefore
 * cannot see the marker it is asked to maintain, and any read-modify-write
 * body edit silently drops it. So when validation fails on structure alone
 * and the PR title carries exactly one ticket key, this check rewrites the
 * body with a well-formed marker and passes, instead of failing a PR whose
 * linkage was never actually in doubt. It never overrules a declaration that
 * disagrees with the title, and never invents a key the PR does not already
 * assert — see planRepair in ./jira-link-marker.mjs.
 *
 * Inputs (environment):
 *   PR_TITLE         — PR title
 *   PR_BODY          — PR body (may be empty)
 *   PR_LABELS        — JSON array of label names on the PR
 *   PR_NUMBER        — PR number; required for self-repair
 *   GITHUB_TOKEN     — token with `pull-requests: write`; required for
 *                      self-repair (read-only on fork PRs, which then fail
 *                      with the fix-it block as before)
 *   GITHUB_REPOSITORY, GITHUB_API_URL — standard Actions values
 *   JIRA_CREDENTIALS — optional JSON {client_id, client_secret, cloud_id};
 *                      when absent (e.g. fork PRs have no secrets) the Jira
 *                      existence check is skipped with a warning.
 *
 * On failure, prints every violation plus a copy-pasteable marker block and
 * exits 1. Validation failures are actionable by editing the PR body/title;
 * Jira API outages (after retries) also exit 1 but are labeled as
 * infrastructure errors.
 */

import { appendFileSync } from 'fs';
import {
  NO_JIRA_LABEL,
  extractKeys,
  parseMarker,
  planRepair,
} from './jira-link-marker.mjs';

const title = process.env.PR_TITLE ?? '';
const eventBody = process.env.PR_BODY ?? '';

/** Problems with the check's own inputs — always reported, never repairable. */
const setupErrors = [];

/** @type {string[]} */
let labels = [];
try {
  const parsed = JSON.parse(process.env.PR_LABELS || '[]');
  if (Array.isArray(parsed)) {
    labels = parsed;
  } else {
    setupErrors.push('PR_LABELS environment variable is not a JSON array.');
  }
} catch (error) {
  setupErrors.push(
    `Failed to parse PR_LABELS environment variable: ${error.message}`,
  );
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Assertions 1, 2, 3, 4 and 6 against a candidate body. Assertion 5 (the Jira
 * existence GET) runs once, later, against whichever body ends up standing.
 *
 * @returns {{ primary: string | null, related: string[], errors: string[] }}
 */
function validate(body) {
  const marker = parseMarker(body);
  const errors = [...marker.errors];

  // ── 3. primary: none requires the no-jira label ──────────────────────────
  if (marker.primary === 'none' && !labels.includes(NO_JIRA_LABEL)) {
    errors.push(
      `jira-link declares \`primary: none\` but the PR does not have the ` +
        `\`${NO_JIRA_LABEL}\` label. Opting out of Jira linkage must be ` +
        'deliberate and visible — add the label or declare a real ticket key.',
    );
  }

  // ── 4. Primary key appears in the PR title ───────────────────────────────
  if (marker.primary && marker.primary !== 'none') {
    if (!extractKeys(title).includes(marker.primary)) {
      errors.push(
        `PR title does not contain the primary key ${marker.primary}. ` +
          `Prefix the title with it, e.g. "${marker.primary} ` +
          `type(scope): description".`,
      );
    }
  }

  return { primary: marker.primary, related: marker.related, errors };
}

// ── GitHub API (self-repair) ─────────────────────────────────────────────────

const repo = process.env.GITHUB_REPOSITORY ?? '';
const prNumber = process.env.PR_NUMBER ?? '';
const githubToken = process.env.GITHUB_TOKEN ?? '';
const githubApi = process.env.GITHUB_API_URL ?? 'https://api.github.com';

const repairEnabled = Boolean(repo && prNumber && githubToken);

/**
 * fetch() with up to 3 attempts; retries on 429/5xx and network errors with
 * exponential backoff (2s, 4s). 4xx responses other than 429 return
 * immediately — they are definitive.
 */
async function fetchWithRetry(url, options) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status !== 429 && response.status < 500) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
    }
  }
  throw lastError;
}

function githubHeaders() {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${githubToken}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/**
 * The PR body as stored right now, which can differ from the event payload's
 * copy when an author edits during the run (the concurrency group cancels the
 * older run, but a body edit that lands mid-run does not). Returns null when
 * the read fails — the caller then works from the event payload.
 */
async function readCurrentBody() {
  const response = await fetchWithRetry(
    `${githubApi}/repos/${repo}/pulls/${prNumber}`,
    { headers: githubHeaders() },
  );
  if (!response.ok) {
    throw new Error(`GET /pulls/${prNumber} failed (HTTP ${response.status}).`);
  }
  const pull = await response.json();
  return pull.body ?? '';
}

async function writeBody(body) {
  const response = await fetchWithRetry(
    `${githubApi}/repos/${repo}/pulls/${prNumber}`,
    {
      method: 'PATCH',
      headers: { ...githubHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `PATCH /pulls/${prNumber} failed (HTTP ${response.status}).`,
    );
  }
}

// ── Jira existence check (assertion 5) ───────────────────────────────────────

async function checkTicketExists(key, errors) {
  const rawCredentials = process.env.JIRA_CREDENTIALS;
  if (!rawCredentials) {
    console.warn(
      `⚠️  JIRA_CREDENTIALS not available (fork PR?) — skipping the Jira ` +
        `existence check for ${key}. Structural validation still applies.`,
    );
    return;
  }

  let credentials;
  try {
    credentials = JSON.parse(rawCredentials);
  } catch {
    throw new Error('JIRA_CREDENTIALS is not valid JSON.');
  }
  const { client_id, client_secret, cloud_id } = credentials;
  if (!client_id || !client_secret || !cloud_id) {
    throw new Error(
      'JIRA_CREDENTIALS is missing required fields (client_id, ' +
        'client_secret, cloud_id).',
    );
  }

  const tokenResponse = await fetchWithRetry(
    'https://auth.atlassian.com/oauth/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id,
        client_secret,
      }),
    },
  );
  if (!tokenResponse.ok) {
    throw new Error(
      `Atlassian OAuth token request failed (HTTP ${tokenResponse.status}).`,
    );
  }
  const { access_token: accessToken } = await tokenResponse.json();
  if (!accessToken) {
    throw new Error(
      'Atlassian OAuth response did not contain an access_token.',
    );
  }

  const issueResponse = await fetchWithRetry(
    `https://api.atlassian.com/ex/jira/${cloud_id}/rest/api/3/issue/${key}?fields=status`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (issueResponse.status === 404) {
    errors.push(
      `Primary ticket ${key} does not exist in Jira. Fix the key in the ` +
        'jira-link marker and the PR title (a mistyped key fails the branch ' +
        'sync after merge, when the author is gone).',
    );
  } else if (!issueResponse.ok) {
    throw new Error(
      `Jira GET /issue/${key} failed (HTTP ${issueResponse.status}).`,
    );
  } else {
    console.log(`✓ Primary ticket ${key} exists in Jira`);
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

function buildFixitBlock() {
  const suggestedKey = extractKeys(title)[0] ?? 'LS-XXXX';
  return [
    'To fix, edit the PR body (no push needed) so it starts with:',
    '',
    '```',
    '<!-- jira-link',
    `primary: ${suggestedKey}`,
    '-->',
    '```',
    '',
    `…where the key is the ticket this PR works on (also required in the PR ` +
      `title). For PRs with no Jira ticket (e.g. dependabot), declare ` +
      `\`primary: none\` and add the \`${NO_JIRA_LABEL}\` label.`,
  ].join('\n');
}

function writeStepSummary(text) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

/** Notes about the repair attempt — printed and echoed into the summary. */
const notes = [];

let body = eventBody;
let result = validate(body);

if (result.errors.length > 0) {
  if (!repairEnabled) {
    notes.push(
      'Self-repair is unavailable (no PR number or write token in the ' +
        'environment) — fix the marker by editing the PR body.',
    );
  } else {
    // Work from the stored body, not the event payload's copy: an edit that
    // landed after this run started would otherwise be clobbered by the PATCH.
    try {
      const current = await readCurrentBody();
      if (current !== body) {
        body = current;
        result = validate(body);
        if (result.errors.length === 0) {
          notes.push(
            'The PR body was edited after this check was triggered; the ' +
              'stored body declares a valid marker.',
          );
        }
      }
    } catch (error) {
      notes.push(`Could not re-read the PR body: ${error.message}`);
    }
  }

  if (result.errors.length > 0 && repairEnabled) {
    const plan = planRepair(body, title);
    if (!plan.repairable) {
      notes.push(`Could not repair the marker automatically — ${plan.reason}`);
    } else {
      try {
        await writeBody(plan.body);
        body = plan.body;
        result = validate(body);
        notes.push(
          `🔧 Repaired the jira-link marker in the PR body — ${plan.reason}`,
        );
      } catch (error) {
        notes.push(`Could not write the repaired PR body: ${error.message}`);
      }
    }
  }
}

const errors = [...setupErrors, ...result.errors];

try {
  if (errors.length === 0 && result.primary && result.primary !== 'none') {
    await checkTicketExists(result.primary, errors);
  }
} catch (error) {
  // Infrastructure failure, not a linkage problem — distinct message so the
  // author doesn't chase a phantom marker error.
  console.error(`❌ Jira Link Check could not reach Jira: ${error.message}`);
  console.error('   This is an infrastructure error — re-run the check.');
  writeStepSummary(
    `## ❌ Jira Link Check — infrastructure error\n\n${error.message}\n\nRe-run the check; the PR's linkage was not judged invalid.`,
  );
  process.exit(1);
}

for (const note of notes) console.log(`ℹ️  ${note}`);

if (errors.length > 0) {
  const fixit = buildFixitBlock();
  console.error('❌ Jira Link Check failed:\n');
  for (const error of errors) console.error(`  ✗ ${error}`);
  console.error(`\n${fixit}`);
  writeStepSummary(
    `## ❌ Jira Link Check failed\n\n${errors.map((e) => `- ${e}`).join('\n')}\n\n${notes.map((n) => `> ${n}`).join('\n>\n')}\n\n${fixit}`,
  );
  process.exit(1);
}

// The success line is the marker's only agent-readable channel: every GitHub
// MCP read path strips the HTML comment out of the body, but this job log is
// fetchable verbatim (get_job_logs / ci_get_logs). Keep the shape stable —
// `.agents/skills/pr-lifecycle/references/create-pr.md` tells agents to grep
// for it.
const relatedSuffix =
  result.related.length > 0 ? `, related: ${result.related.join(', ')}` : '';
console.log(
  `✅ Jira Link Check passed (primary: ${result.primary}${relatedSuffix})`,
);
writeStepSummary(
  `## ✅ Jira Link Check passed\n\n- primary: \`${result.primary}\`` +
    (result.related.length > 0
      ? `\n- related: ${result.related.map((k) => `\`${k}\``).join(', ')}`
      : '') +
    (notes.length > 0 ? `\n\n${notes.map((n) => `> ${n}`).join('\n>\n')}` : ''),
);
