/**
 * HEAD repo-state / file-existence awareness for the code reviewer (LS-8312, AC2).
 *
 * The reviewer sees only the PR diff, so it routinely raises "missing X" findings
 * (missing test, missing file, missing handler) for artifacts that already exist
 * at HEAD outside the diff — e.g. the Apple OAuth handler + tests that merged via
 * a sibling PR, leaving the current PR as only the Jest mock (observed live on
 * PR #4807). Because the bot can't see files outside the diff, the author's only
 * recourse is a JUSTIFY the bot cannot verify, and the PR false-escalates.
 *
 * This module runs as a post-LLM validator: for any finding that asserts an
 * artifact is *missing*, it resolves the path(s) the finding cites and checks
 * whether they exist at HEAD. When a cited path resolves to a real file at HEAD,
 * the finding is stale — the reviewer runs on the PR-head checkout, so a file
 * present in the working tree is present at HEAD by definition — and is stripped.
 *
 * Deliberately conservative: only findings whose language clearly asserts absence
 * ("missing", "does not exist", "add a test", "no test") AND that cite a concrete
 * path which exists are stripped. A finding that argues about the *content* of an
 * existing file is untouched.
 */

import { existsSync } from 'node:fs';

// Language that asserts an artifact is absent. Kept tight to avoid stripping
// findings that merely mention a file while making a different point.
const MISSING_ASSERTION_RE =
  /\b(missing|does\s*n['’o]?t\s+exist|doesn't\s+exist|not\s+found|no\s+(?:corresponding\s+)?(?:unit\s+|integration\s+)?tests?\b|lacks?\s+(?:a\s+)?tests?|absent|add\s+(?:a\s+|unit\s+|integration\s+)?tests?|needs?\s+(?:a\s+)?tests?|should\s+(?:have|add|include)\s+(?:a\s+)?tests?|untested|create\s+(?:a\s+)?(?:test|file))\b/i;

// Backtick-quoted path containing a slash or a known code/test extension:
//   `path/to/file.ts`  `foo.spec.ts`
const BACKTICK_PATH_RE =
  /`([^`\s]*?(?:\/[^`\s]*|\.(?:tsx?|jsx?|mjs|cjs|mts|cts|graphql|json))[^`\s]*)`/g;

// Bare (un-quoted) path token with a directory separator and a source-ish
// extension: src/foo/bar.test.ts  — anchored on the extension to avoid matching
// prose. No leading backtick required.
const BARE_PATH_RE =
  /(?<![`\w/.-])((?:[\w.-]+\/)+[\w.-]+\.(?:tsx?|jsx?|mjs|cjs|mts|cts|graphql|json))\b/g;

const MAX_PATHS_PER_FINDING = 10;

/**
 * @typedef {import('./findings.mjs').Finding & { strip_reason: 'artifact_exists_at_head' }} StaleArtifactFinding
 */

/**
 * Extract concrete file paths cited in a finding's title and body.
 *
 * @param {import('./findings.mjs').Finding} finding
 * @returns {string[]}  Deduplicated candidate paths (order-stable)
 */
export function extractCitedPaths(finding) {
  const text = `${finding.title ?? ''}\n${finding.body ?? ''}`;
  const seen = new Set();
  for (const re of [BACKTICK_PATH_RE, BARE_PATH_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      let p = m[1];
      // Normalize a leading ./ and strip a trailing anchor/line-suffix.
      p = p.replace(/^\.\//, '').replace(/[#:].*$/, '');
      // Reject URLs and package specifiers — they are never repo file paths.
      if (p.includes('://') || p.startsWith('@')) continue;
      if (p.length >= 3 && p.includes('.')) {
        seen.add(p);
        if (seen.size >= MAX_PATHS_PER_FINDING) return [...seen];
      }
    }
  }
  return [...seen];
}

/**
 * True when a finding's language asserts that an artifact is missing/absent.
 *
 * @param {import('./findings.mjs').Finding} finding
 * @returns {boolean}
 */
export function isMissingArtifactFinding(finding) {
  const text = `${finding.title ?? ''} ${finding.body ?? ''}`;
  return MISSING_ASSERTION_RE.test(text);
}

/**
 * Strip "missing tests/file" findings whose cited artifact already exists at
 * HEAD. The reviewer runs on the PR-head checkout, so working-tree existence is
 * HEAD existence — checked with `existsSync` (injected for tests).
 *
 * A finding is stripped only when BOTH hold:
 *   1. its language asserts an artifact is missing (`isMissingArtifactFinding`), and
 *   2. it cites at least one concrete path that exists at HEAD.
 *
 * Stripped findings are annotated `strip_reason: 'artifact_exists_at_head'` for
 * telemetry, mirroring the cycle-validator strip annotations.
 *
 * @param {import('./findings.mjs').Finding[]} findings
 * @param {(path: string) => boolean} [exists]  Existence probe (injected for tests)
 * @returns {{ kept: import('./findings.mjs').Finding[], stripped: StaleArtifactFinding[] }}
 */
export function filterStaleMissingArtifactFindings(
  findings,
  exists = existsSync,
) {
  const kept = [];
  const stripped = [];

  for (const f of findings) {
    if (!isMissingArtifactFinding(f)) {
      kept.push(f);
      continue;
    }
    const paths = extractCitedPaths(f);
    let existingPath = null;
    for (const p of paths) {
      let present = false;
      try {
        present = exists(p);
      } catch {
        present = false;
      }
      if (present) {
        existingPath = p;
        break;
      }
    }
    if (existingPath) {
      stripped.push({ ...f, strip_reason: 'artifact_exists_at_head' });
    } else {
      kept.push(f);
    }
  }

  return { kept, stripped };
}
