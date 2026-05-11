/**
 * Reference verifier for the code reviewer bot (LS-4330).
 *
 * Scans the unified diff for file path references in changed `.md` lines,
 * then checks whether each path exists in the base branch (`origin/<base>`).
 * Verified paths are injected into the user prompt so the LLM doesn't flag
 * documented cross-references as "missing implementation."
 *
 * Why git cat-file -e: the workflow uses fetch-depth: 0, so origin/<base> is
 * always available. cat-file -e exits 0 if the object exists, non-zero if not,
 * and never fetches file content — it's the cheapest existence check in git.
 */

import { execFileSync } from 'node:child_process';

// Matches backtick-quoted strings containing at least one slash:  `path/to/file`
const BACKTICK_PATH_RE = /`([^`\s]{2,}\/[^`\s]*)`/g;
// Matches markdown link hrefs containing at least one slash but no scheme:  [text](path/to/file)
const MD_LINK_PATH_RE = /\]\(([^)\s:]{2,}\/[^)\s]*)\)/g;

const MAX_PATHS_TO_CHECK = 30; // guard against pathological diffs with thousands of refs

/**
 * Extract lines added or changed in `.md` files from a unified diff.
 *
 * @param {string} diff
 * @returns {string[]}
 */
function extractAddedMdLines(diff) {
  const lines = [];
  let inMdFile = false;
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      inMdFile = /\.md(\s|$)/.test(line);
      continue;
    }
    if (inMdFile && line.startsWith('+') && !line.startsWith('+++')) {
      lines.push(line.slice(1));
    }
  }
  return lines;
}

/**
 * Extract candidate file paths from lines of markdown text.
 *
 * @param {string[]} lines
 * @returns {string[]}  Deduplicated, filtered candidate paths
 */
function extractCandidatePaths(lines) {
  const seen = new Set();
  for (const line of lines) {
    for (const re of [BACKTICK_PATH_RE, MD_LINK_PATH_RE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        const raw = m[1];
        // Reject: URL schemes, package scopes, anchors-only, and paths starting
        // with a dot-dot (relative parent traversal)
        if (
          raw.includes('://') ||
          raw.startsWith('@') ||
          raw.startsWith('..')
        ) {
          continue;
        }
        // Strip a leading `./ ` so `./scripts/foo` and `scripts/foo` both resolve
        const cleaned = raw.replace(/^\.\//, '').replace(/#.*$/, '');
        if (cleaned.includes('/') && cleaned.length >= 3) {
          seen.add(cleaned);
        }
        if (seen.size >= MAX_PATHS_TO_CHECK) return [...seen];
      }
    }
  }
  return [...seen];
}

/**
 * Verify which of the given paths exist in `origin/<baseRefName>` by running
 * `git cat-file -e origin/<base>:<path>` for each candidate.
 *
 * @param {string} diff               Unified diff string from `gh pr diff`
 * @param {string} baseRefName        Base branch name (e.g. `"main"`)
 * @param {typeof execFileSync} exec  Injected for testing
 * @returns {string[]}  Paths that exist in the base branch, in stable order
 */
export function verifyReferencedPaths(diff, baseRefName, exec = execFileSync) {
  if (!diff || typeof diff !== 'string') return [];
  if (!baseRefName || typeof baseRefName !== 'string') return [];

  const addedLines = extractAddedMdLines(diff);
  if (addedLines.length === 0) return [];

  const candidates = extractCandidatePaths(addedLines);
  if (candidates.length === 0) return [];

  const baseRef = `origin/${baseRefName}`;
  const verified = [];

  for (const path of candidates) {
    try {
      exec('git', ['cat-file', '-e', `${baseRef}:${path}`], {
        stdio: 'ignore',
        timeout: 5000,
      });
      verified.push(path);
    } catch {
      // Path doesn't exist in base branch or git command failed — skip silently
    }
  }

  return verified;
}
