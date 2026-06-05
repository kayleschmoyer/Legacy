import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';

const SOURCE_EXT_RE = /\.(ts|tsx|js|jsx|mjs|mts|cts)$/;
const BUILD_TYPE_EXTS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.mjs',
  '.json',
]);
const CONFIG_FILES = [
  'tsconfig.json',
  'tsconfig.base.json',
  'nx.json',
  'package.json',
  'project.json',
  '.eslintrc.js',
  '.eslintrc.json',
  '.eslintrc.cjs',
];

// ESLint override filenames searched for in each changed source file's directory
// ancestry (LS-7768) so the reviewer can detect local `no-console: off` overrides.
const ESLINTRC_FILES = ['.eslintrc.json', '.eslintrc.cjs', '.eslintrc.js'];

// Matches static import/export/require with relative specifiers
const IMPORT_RE = /(?:^|\s)(?:import|export)\s[^'"]*['"](\.[^'"]+)['"]/gm;
const REQUIRE_RE = /require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/gm;

// Jira ticket key pattern (e.g. LS-1234, PROJ-99)
const JIRA_KEY_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/;

/**
 * @typedef {object} ReviewContext
 * @property {Record<string, string>} fullFiles   - Full content of changed files, keyed by path
 * @property {Record<string, string>} importFiles - Full content of imported modules, keyed by path
 * @property {Record<string, string>} testFiles   - Full content of test counterparts, keyed by path
 * @property {Record<string, string>} configFiles - Relevant config files, keyed by path
 * @property {string|null}            jiraTicket  - Jira ticket description, or null
 */

/**
 * Fetch extended context for a PR review beyond the raw diff.
 *
 * @param {object}   params
 * @param {string[]} params.changedFiles    - Relative paths of files changed in the PR
 * @param {string}   [params.prBody]        - PR description (used for Jira ticket extraction)
 * @param {string[]} [params.commitMessages] - Commit messages (used for Jira ticket extraction)
 * @returns {Promise<ReviewContext>}
 */
export async function fetchContext({
  changedFiles,
  prBody = '',
  commitMessages = [],
}) {
  const fullFiles = await fetchFullFiles(changedFiles);

  const [importFiles, testFiles, configFiles, jiraTicket] = await Promise.all([
    fetchImportedModules(changedFiles, fullFiles),
    fetchTestFiles(changedFiles),
    fetchConfigFiles(changedFiles),
    fetchJiraTicket(prBody, commitMessages),
  ]);

  return { fullFiles, importFiles, testFiles, configFiles, jiraTicket };
}

// Matches the `diff --git a/<old> b/<new>` header line git emits per file.
const DIFF_FILE_RE = /^diff --git a\/(.+?) b\/(.+)$/gm;

/**
 * Extract the repo-relative paths of files changed in a unified diff.
 *
 * Returns the post-image (`b/`) path for each file so renames and edits resolve
 * to the current HEAD path. Deletions (whose post-image is `/dev/null`) are
 * skipped — there is no current content to fetch.
 *
 * @param {string} diff  Unified diff from `gh pr diff`
 * @returns {string[]}    Deduplicated current-HEAD file paths
 */
export function parseChangedFilePaths(diff) {
  if (!diff) return [];
  const files = new Set();
  for (const m of diff.matchAll(DIFF_FILE_RE)) {
    const newPath = m[2];
    if (newPath && newPath !== 'dev/null' && newPath !== '/dev/null') {
      files.add(newPath);
    }
  }
  return [...files];
}

/**
 * Format a ReviewContext into a string suitable for inclusion in an LLM prompt.
 *
 * Sections are emitted in priority order (full files → imports → tests → config
 * → Jira). When `maxBytes` is provided, files are added until the budget would
 * be exceeded; the remainder is dropped with a truncation note so a large PR
 * cannot blow the prompt size (LS-7768).
 *
 * @param {ReviewContext} ctx
 * @param {{ maxBytes?: number }} [opts]
 * @returns {string}
 */
export function formatContextForPrompt(ctx, { maxBytes = Infinity } = {}) {
  const sections = [];
  let used = 0;
  let truncated = false;

  const formatSection = (label, files) => {
    if (truncated) return;
    const entries = Object.entries(files);
    if (entries.length === 0) return;
    let headerAdded = false;
    for (const [path, content] of entries) {
      const block = `### ${path}\n\`\`\`\n${content}\n\`\`\`\n`;
      const header = headerAdded ? '' : `## ${label}\n`;
      if (used + header.length + block.length > maxBytes) {
        truncated = true;
        break;
      }
      if (!headerAdded) {
        sections.push(`## ${label}\n`);
        used += header.length;
        headerAdded = true;
      }
      sections.push(block);
      used += block.length;
    }
  };

  formatSection('Full file contents', ctx.fullFiles);
  formatSection('Imported modules', ctx.importFiles);
  formatSection('Test files', ctx.testFiles);
  formatSection('Configuration files', ctx.configFiles);

  if (!truncated && ctx.jiraTicket) {
    const block = `## Linked Jira ticket\n\n${ctx.jiraTicket}\n`;
    if (used + block.length <= maxBytes) {
      sections.push(block);
      used += block.length;
    } else {
      truncated = true;
    }
  }

  if (truncated) {
    sections.push(
      '_Additional file context omitted to stay within the size budget._\n',
    );
  }

  return sections.join('\n');
}

/**
 * Read full content of each changed file.
 * @param {string[]} files
 * @returns {Promise<Record<string, string>>}
 */
async function fetchFullFiles(files) {
  const results = {};
  await Promise.all(
    files.map(async (file) => {
      try {
        results[file] = await readFile(file, 'utf8');
      } catch {
        // File deleted or binary — skip
      }
    }),
  );
  return results;
}

/**
 * Find and read imported modules referenced by changed source files.
 * Follows one level of static relative imports/requires.
 *
 * @param {string[]} changedFiles
 * @param {Record<string, string>} fullFiles - Already-read contents
 * @returns {Promise<Record<string, string>>}
 */
async function fetchImportedModules(changedFiles, fullFiles) {
  const results = {};
  const seen = new Set(Object.keys(fullFiles));

  await Promise.all(
    changedFiles.map(async (file) => {
      if (!SOURCE_EXT_RE.test(file)) return;
      const content = fullFiles[file];
      if (!content) return;

      const dir = dirname(file);
      const specifiers = extractRelativeSpecifiers(content);

      await Promise.all(
        specifiers.map(async (spec) => {
          const base = resolve(dir, spec);
          const candidates = SOURCE_EXT_RE.test(base)
            ? [base]
            : ['.ts', '.tsx', '.js', '.mjs', '.cjs'].map((ext) => base + ext);

          for (const candidate of candidates) {
            if (seen.has(candidate)) break;
            try {
              const content = await readFile(candidate, 'utf8');
              seen.add(candidate);
              results[candidate] = content;
              break;
            } catch {
              // Not found with this extension
            }
          }
        }),
      );
    }),
  );

  return results;
}

/**
 * Extract relative import/require specifiers from source content.
 * @param {string} content
 * @returns {string[]}
 */
function extractRelativeSpecifiers(content) {
  const specifiers = new Set();
  for (const [, spec] of content.matchAll(IMPORT_RE)) specifiers.add(spec);
  for (const [, spec] of content.matchAll(REQUIRE_RE)) specifiers.add(spec);
  return [...specifiers];
}

/**
 * Find and read test files corresponding to changed source files.
 * @param {string[]} files
 * @returns {Promise<Record<string, string>>}
 */
async function fetchTestFiles(files) {
  const results = {};

  await Promise.all(
    files.map(async (file) => {
      if (!SOURCE_EXT_RE.test(file)) return;

      const ext = extname(file);
      const base = file.slice(0, -ext.length);
      const dir = dirname(file);
      const stem = base.slice(dir.length + 1);

      const candidates = [
        `${base}.test${ext}`,
        `${base}.spec${ext}`,
        join(dir, '__tests__', `${stem}${ext}`),
        join(dir, '__tests__', `${stem}.test${ext}`),
        join(dir, '__tests__', `${stem}.spec${ext}`),
      ];

      for (const candidate of candidates) {
        try {
          results[candidate] = await readFile(candidate, 'utf8');
          break; // First match per source file is enough
        } catch {
          // Not found
        }
      }
    }),
  );

  return results;
}

/**
 * Fetch relevant config files for the review.
 *
 * Two sources are merged:
 *   1. Per-directory ESLint overrides — for every changed *source* file, walk
 *      its directory chain to the repo root and collect any `.eslintrc*` found.
 *      This surfaces local `no-console: off` (and similar) overrides — e.g. the
 *      `apps/web-e2e` integration suite, `apps/cli`, and `lib/db-client` CLI
 *      packages — so the reviewer can confirm a `console.*` usage is sanctioned
 *      rather than flagging it as a false positive (LS-7768).
 *   2. Root build/type config files (tsconfig, nx.json, etc.) — only when the
 *      PR touches build/type-relevant extensions.
 *
 * @param {string[]} files
 * @returns {Promise<Record<string, string>>}
 */
async function fetchConfigFiles(files) {
  const results = {};

  // 1. Per-directory ESLint overrides along each source file's ancestry.
  const eslintDirs = new Set();
  for (const file of files) {
    if (!SOURCE_EXT_RE.test(file)) continue;
    let dir = dirname(file);
    while (dir && dir !== '.' && dir !== '/' && !eslintDirs.has(dir)) {
      eslintDirs.add(dir);
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  await Promise.all(
    [...eslintDirs].map(async (dir) => {
      for (const name of ESLINTRC_FILES) {
        const path = join(dir, name);
        try {
          results[path] = await readFile(path, 'utf8');
          break; // one eslintrc per directory is enough
        } catch {
          // No eslintrc of this name in this directory
        }
      }
    }),
  );

  // 2. Root build/type config files, only for build/type-touching changes.
  const hasBuildChanges = files.some((f) => BUILD_TYPE_EXTS.has(extname(f)));
  if (hasBuildChanges) {
    await Promise.all(
      CONFIG_FILES.map(async (cfg) => {
        try {
          results[cfg] = await readFile(cfg, 'utf8');
        } catch {
          // Config file absent
        }
      }),
    );
  }
  return results;
}

/**
 * Extract Jira ticket key from PR body/commits and fetch its description via REST API.
 * Returns null when no ticket is referenced or the Jira API is unreachable.
 *
 * Requires env vars: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN
 *
 * @param {string}   prBody
 * @param {string[]} commitMessages
 * @returns {Promise<string|null>}
 */
async function fetchJiraTicket(prBody, commitMessages) {
  const jiraBaseUrl = process.env.JIRA_BASE_URL;
  const jiraEmail = process.env.JIRA_EMAIL;
  const jiraToken = process.env.JIRA_API_TOKEN;
  if (!jiraBaseUrl || !jiraEmail || !jiraToken) return null;

  const text = [prBody, ...commitMessages].join('\n');
  const match = text.match(JIRA_KEY_RE);
  if (!match) return null;

  const ticketKey = match[1];
  try {
    const url = `${jiraBaseUrl}/rest/api/3/issue/${encodeURIComponent(ticketKey)}?fields=summary,description`;
    const resp = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${jiraEmail}:${jiraToken}`).toString('base64')}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return null;

    const data = await resp.json();
    const summary = data.fields?.summary ?? '';
    const description = data.fields?.description
      ? extractAdfText(data.fields.description)
      : '';

    return `Jira ${ticketKey}: ${summary}\n\n${description}`.trim();
  } catch {
    return null;
  }
}

/**
 * Extract plain text from an Atlassian Document Format (ADF) node.
 * @param {unknown} node
 * @returns {string}
 */
function extractAdfText(node) {
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'text') return String(node.text ?? '');
  if (!Array.isArray(node.content)) return '';
  return node.content.map(extractAdfText).join('');
}
