#!/usr/bin/env node
// LS-4328 lint-touch-map: advisory CI check for documentation freshness.
//
// Reads the touch-map table from .agents/skills/dev-process/gates/documentation-freshness.md,
// identifies which code-area rows match files changed in this PR, and verifies that at least
// one of the corresponding required-doc files is also touched.
//
// On gaps: upserts a PR comment + applies label "docs: touch-map gap". Always exits 0 (advisory).
//
// Usage:
//   node scripts/lint-touch-map.js           # diff vs origin/main (local)
//   node scripts/lint-touch-map.js --dry-run  # skip GitHub API calls
//   BASE_SHA=abc HEAD_SHA=def node scripts/lint-touch-map.js  # explicit SHAs (CI)

const { execFileSync } = require('child_process');
const { readFileSync, existsSync } = require('fs');
const { resolve, dirname, join } = require('path');
const minimatch = require('minimatch');

const root = resolve(__dirname, '..');
const TOUCH_MAP_REL =
  '.agents/skills/dev-process/gates/documentation-freshness.md';
const TOUCH_MAP_ABS = join(root, TOUCH_MAP_REL);
const GAP_LABEL = 'docs: touch-map gap';
// Hidden marker used to find and update the existing advisory comment instead of creating a new one.
const COMMENT_MARKER = '<!-- lint-touch-map-advisory -->';

const DRY_RUN = process.argv.includes('--dry-run');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY;
const PR_NUMBER = process.env.PR_NUMBER
  ? parseInt(process.env.PR_NUMBER, 10)
  : null;

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function git(...args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      cwd: root,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    console.error(
      `lint-touch-map: git ${args.join(' ')} failed: ${err.message}`,
    );
    return '';
  }
}

function getChangedFiles() {
  const baseSha = process.env.BASE_SHA;
  const headSha = process.env.HEAD_SHA;

  if (baseSha && headSha) {
    const out = git(
      'diff',
      '--name-only',
      '--diff-filter=ACMRD',
      `${baseSha}...${headSha}`,
    );
    return out ? out.split('\n').filter(Boolean) : [];
  }

  const baseRef = process.env.GITHUB_BASE_REF;
  if (baseRef) {
    const out = git(
      'diff',
      '--name-only',
      '--diff-filter=ACMRD',
      `origin/${baseRef}...HEAD`,
    );
    return out ? out.split('\n').filter(Boolean) : [];
  }

  // Local fallback
  const out = git(
    'diff',
    '--name-only',
    '--diff-filter=ACMRD',
    'origin/main...HEAD',
  );
  return out ? out.split('\n').filter(Boolean) : [];
}

// ---------------------------------------------------------------------------
// Touch-map parser
// ---------------------------------------------------------------------------

/**
 * Extract a matchable file-path pattern from a raw code-area cell string.
 * Returns null when no mechanical pattern can be derived (e.g. "Any new MCP tool").
 */
function extractCodePattern(raw) {
  let text = raw.replace(/`/g, '').trim();

  if (text.startsWith('Any ')) return null;

  // "GraphQL schema (*.graphql)" → extract glob from parens
  const parenMatch = text.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const inner = parenMatch[1].replace(/`/g, '').trim();
    if (looksLikeFilePattern(inner)) {
      return inner;
    }
  }

  // Replace <placeholder> with glob wildcard
  text = text.replace(/<[^>]+>/g, '*');

  // If text contains spaces it's likely "package.json engines / pnpm version" — take the first token
  const firstToken = text.split(/\s+/)[0];
  if (looksLikeFilePattern(firstToken)) return firstToken;
  if (looksLikeFilePattern(text)) return text;

  return null;
}

function looksLikeFilePattern(token) {
  return (
    /\//.test(token) ||
    /^\*\.[a-z]+$/.test(token) ||
    /^[\w.-]+\.[a-zA-Z0-9]+$/.test(token)
  );
}

/**
 * Extract concrete file paths from the required-doc cell.
 * Only markdown link hrefs are extractable; plain-text doc names are skipped.
 */
function extractDocPaths(docText, touchMapDir) {
  const paths = [];
  const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
  let m;
  while ((m = linkRe.exec(docText)) !== null) {
    const href = m[1].trim();
    if (href.startsWith('http')) continue;
    const abs = resolve(touchMapDir, href);
    const rel = abs
      .replace(root, '')
      .replace(/^[\\/]/, '')
      .replace(/\\/g, '/');
    paths.push(rel);
  }
  return paths;
}

function parseTouchMap() {
  const content = readFileSync(TOUCH_MAP_ABS, 'utf8');
  const touchMapDir = dirname(TOUCH_MAP_ABS);

  const rules = [];
  let inTable = false;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      inTable = false;
      continue;
    }

    const cells = trimmed
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 2) continue;

    // Skip header and separator rows
    if (cells[0] === 'Code area' || /^[-:]+$/.test(cells[0])) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;

    const pattern = extractCodePattern(cells[0]);
    if (!pattern) continue;

    const docPaths = extractDocPaths(cells[1], touchMapDir);
    if (docPaths.length === 0) continue; // no verifiable path — skip

    rules.push({ raw: cells[0], pattern, docPaths });
  }

  return rules;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

function matchesPattern(file, pattern) {
  const p = pattern.trim();

  // Exact directory prefix — no globs, ends with slash (e.g. "lib/db-client/migrations/")
  if (p.endsWith('/') && !p.includes('*') && !p.includes('?')) {
    return file.startsWith(p);
  }

  // Glob pattern — file glob vs directory glob
  if (p.includes('*') || p.includes('?')) {
    if (p.endsWith('/') || p.endsWith('/*')) {
      // Directory glob (e.g. "tools/mcp/*/") — match the subtree
      const base = p.endsWith('/') ? p.slice(0, -1) : p;
      return (
        minimatch(file, base, { dot: true }) ||
        minimatch(file, `${base}/**`, { dot: true })
      );
    }
    // File glob (e.g. "lambdas/*/src/handler.ts", "*.graphql") — exact minimatch only
    return minimatch(file, p, { dot: true });
  }

  // Exact file match (e.g. "package.json")
  return file === p;
}

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

function ghHeaders() {
  return {
    Authorization: `token ${GITHUB_TOKEN}`,
    'Content-Type': 'application/json',
    Accept: 'application/vnd.github.v3+json',
  };
}

async function ghFetch(method, path, body) {
  if (DRY_RUN || !GITHUB_TOKEN || !GITHUB_REPOSITORY) return null;
  const url = `https://api.github.com/repos/${GITHUB_REPOSITORY}${path}`;
  const res = await fetch(url, {
    method,
    headers: ghHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.warn(
      `GitHub API ${method} ${path} → ${res.status}: ${text.slice(0, 500)}`,
    );
  }
  return res;
}

/**
 * Ensure the "docs: touch-map gap" label exists in the repo.
 * POSTing the label returns 201 on create or 422 if it already exists — both are fine.
 */
async function ensureLabel() {
  await ghFetch('POST', '/labels', {
    name: GAP_LABEL,
    color: 'fbca04',
    description:
      'Advisory: code changed without updating a linked required doc',
  });
}

async function addLabel(prNumber) {
  await ghFetch('POST', `/issues/${prNumber}/labels`, { labels: [GAP_LABEL] });
}

/**
 * Upsert the advisory comment: find an existing comment with COMMENT_MARKER
 * and update it, or create a new one. Prevents duplicate comments on re-runs.
 */
async function upsertComment(prNumber, body) {
  if (DRY_RUN || !GITHUB_TOKEN || !GITHUB_REPOSITORY) return;

  // Search existing comments for the marker (up to 100 per page; PR comments rarely exceed this)
  const listRes = await fetch(
    `https://api.github.com/repos/${GITHUB_REPOSITORY}/issues/${prNumber}/comments?per_page=100`,
    { headers: ghHeaders() },
  );
  if (listRes.ok) {
    const comments = await listRes.json();
    const existing = comments.find(
      (c) => c.body && c.body.includes(COMMENT_MARKER),
    );
    if (existing) {
      await ghFetch('PATCH', `/issues/comments/${existing.id}`, { body });
      return;
    }
  }

  await ghFetch('POST', `/issues/${prNumber}/comments`, { body });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!existsSync(TOUCH_MAP_ABS)) {
    console.log(`lint-touch-map: ${TOUCH_MAP_REL} not found — skipping`);
    process.exit(0);
  }

  const rules = parseTouchMap();
  const changedFiles = getChangedFiles();

  console.log(
    `lint-touch-map: ${changedFiles.length} changed file(s), ${rules.length} verifiable rule(s)`,
  );

  const gaps = [];

  for (const rule of rules) {
    const hits = changedFiles.filter((f) => matchesPattern(f, rule.pattern));
    if (hits.length === 0) continue;

    const docTouched = rule.docPaths.some((doc) =>
      changedFiles.some((f) => f === doc || f.startsWith(doc + '/')),
    );

    if (!docTouched) {
      gaps.push({ rule, hits: hits.slice(0, 3) });
    }
  }

  if (gaps.length === 0) {
    console.log('lint-touch-map: ✓ no documentation gaps');
    process.exit(0);
  }

  console.log(
    `\nlint-touch-map: ⚠ ${gaps.length} gap(s) found (advisory — not blocking)\n`,
  );

  for (const { rule, hits } of gaps) {
    console.log(`  Code area : ${rule.raw}`);
    console.log(`  Matched   : ${hits.join(', ')}`);
    console.log(`  Needs one : ${rule.docPaths.join(' | ')}\n`);
  }

  const prNumber = PR_NUMBER;
  if (prNumber && GITHUB_TOKEN && !DRY_RUN) {
    // Build an absolute URL to the touch-map so the PR comment link always resolves correctly
    const commitRef = process.env.HEAD_SHA || process.env.GITHUB_SHA || 'main';
    const touchMapUrl = `https://github.com/${GITHUB_REPOSITORY}/blob/${commitRef}/${TOUCH_MAP_REL}`;

    const tableRows = gaps
      .map(
        ({ rule, hits }) =>
          `| \`${rule.pattern}\` | ${hits.map((f) => `\`${f}\``).join('<br>')} | ${rule.docPaths.map((d) => `\`${d}\``).join(' or ')} |`,
      )
      .join('\n');

    const body = `${COMMENT_MARKER}
## ⚠️ Documentation Touch-Map Gap (advisory)

This PR changed code in areas that require a doc update per [\`${TOUCH_MAP_REL}\`](${touchMapUrl}).

> **Advisory only — does not block merge.**

| Code area | Sample changed files | Update at least one of |
|-----------|----------------------|------------------------|
${tableRows}

If an entry is wrong, extend or correct the touch-map in the same PR.`;

    await ensureLabel();
    await upsertComment(prNumber, body);
    await addLabel(prNumber);
    console.log(`lint-touch-map: upserted comment + label on PR #${prNumber}`);
  } else if (DRY_RUN) {
    console.log('lint-touch-map: dry-run — skipped GitHub API calls');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(`lint-touch-map error: ${err.message}`);
  process.exit(0); // advisory — never block CI on script errors
});
