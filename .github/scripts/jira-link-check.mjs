#!/usr/bin/env node
/**
 * jira-link-check.mjs
 *
 * Validates the declared jira-link marker on a PR (LS-7896, phase 3 of RFC
 * docs/rfcs/draft-declared-ticket-linkage.md). The marker is the single
 * source of truth for "which ticket is this PR for?" and is emitted by
 * github_create_pr / the PR-creation skills (LS-7895, phase 2):
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
 * Inputs (environment):
 *   PR_TITLE         — PR title
 *   PR_BODY          — PR body (may be empty)
 *   PR_LABELS        — JSON array of label names on the PR
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

const KEY_RE = /^LS-\d+$/;
const NO_JIRA_LABEL = 'no-jira';

const title = process.env.PR_TITLE ?? '';
const body = process.env.PR_BODY ?? '';

/** @type {string[]} */
const errors = [];

/** @type {string[]} */
let labels = [];
try {
  const parsed = JSON.parse(process.env.PR_LABELS || '[]');
  if (Array.isArray(parsed)) {
    labels = parsed;
  } else {
    errors.push('PR_LABELS environment variable is not a JSON array.');
  }
} catch (error) {
  errors.push(
    `Failed to parse PR_LABELS environment variable: ${error.message}`,
  );
}

// ── 1. Locate the marker block ───────────────────────────────────────────────

// Markers quoted in fenced code blocks or inline code spans are documentation,
// not declarations — strip them before scanning. (Observed live on PR #5093:
// the body's prose mentioned `<!-- jira-link -->` in backticks and the bare
// regex counted it as the marker.)
const scannableBody = body
  .replace(/```[\s\S]*?```/g, '')
  .replace(/`[^`\n]*`/g, '');

const markerBlocks = [
  ...scannableBody.matchAll(/<!--\s*jira-link\b([\s\S]*?)-->/gi),
];

let primary = null;

if (markerBlocks.length === 0) {
  errors.push(
    'PR body has no `<!-- jira-link -->` marker. Every PR must declare its ' +
      'Jira ticket linkage in the body (emitted automatically by ' +
      '`github_create_pr` and the PR-creation skills).',
  );
} else if (markerBlocks.length > 1) {
  errors.push(
    `PR body has ${markerBlocks.length} jira-link markers — exactly one is ` +
      'allowed. Remove the duplicates.',
  );
} else {
  const content = markerBlocks[0][1];

  // ── 2. Exactly one primary ────────────────────────────────────────────────
  const primaryLines = [...content.matchAll(/^[ \t]*primary:[ \t]*(.*)$/gim)];
  if (primaryLines.length === 0) {
    errors.push(
      'jira-link marker has no `primary:` line. Declare exactly one primary ' +
        'key (LS-####) or `primary: none`.',
    );
  } else if (primaryLines.length > 1) {
    errors.push(
      `jira-link marker has ${primaryLines.length} \`primary:\` lines — ` +
        'exactly one is allowed. One ticket = one PR; move extra keys to ' +
        '`related:`.',
    );
  } else {
    const value = primaryLines[0][1].trim();
    if (value === 'none' || KEY_RE.test(value)) {
      primary = value;
    } else {
      errors.push(
        `jira-link \`primary: ${value}\` is not a valid value — expected an ` +
          'uppercase LS-#### key or `none`.',
      );
    }
  }

  // ── 6. Related keys are well-formed ───────────────────────────────────────
  const relatedLines = [...content.matchAll(/^[ \t]*related:[ \t]*(.*)$/gim)];
  for (const line of relatedLines) {
    const tokens = line[1].split(/[,\s]+/).filter(Boolean);
    for (const token of tokens) {
      if (!KEY_RE.test(token)) {
        errors.push(
          `jira-link \`related:\` contains "${token}" — expected ` +
            'comma/space-separated uppercase LS-#### keys.',
        );
      }
    }
  }
}

// ── 3. primary: none requires the no-jira label ──────────────────────────────

if (primary === 'none' && !labels.includes(NO_JIRA_LABEL)) {
  errors.push(
    `jira-link declares \`primary: none\` but the PR does not have the ` +
      `\`${NO_JIRA_LABEL}\` label. Opting out of Jira linkage must be ` +
      'deliberate and visible — add the label or declare a real ticket key.',
  );
}

// ── 4. Primary key appears in the PR title ───────────────────────────────────

if (primary && primary !== 'none') {
  const titleKeys = title.match(/\bLS-\d+\b/g) ?? [];
  if (!titleKeys.includes(primary)) {
    errors.push(
      `PR title does not contain the primary key ${primary}. Prefix the ` +
        `title with it, e.g. "${primary} type(scope): description".`,
    );
  }
}

// ── 5. Primary ticket exists in Jira ─────────────────────────────────────────

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

async function checkTicketExists(key) {
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

// ── Report ────────────────────────────────────────────────────────────────────

function buildFixitBlock() {
  const suggestedKey = title.match(/\bLS-\d+\b/)?.[0] ?? 'LS-XXXX';
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

try {
  if (primary && primary !== 'none') {
    await checkTicketExists(primary);
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

if (errors.length > 0) {
  const fixit = buildFixitBlock();
  console.error('❌ Jira Link Check failed:\n');
  for (const error of errors) console.error(`  ✗ ${error}`);
  console.error(`\n${fixit}`);
  writeStepSummary(
    `## ❌ Jira Link Check failed\n\n${errors.map((e) => `- ${e}`).join('\n')}\n\n${fixit}`,
  );
  process.exit(1);
}

console.log(`✅ Jira Link Check passed (primary: ${primary})`);
