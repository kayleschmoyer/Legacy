/**
 * Fabricated-evidence guard for the code reviewer bot (LS-9729).
 *
 * On PR #7387 the bot flagged `LOGGER.error` misuse at four specific line
 * numbers in `commissioner-tools.ts` that had nothing to do with `LOGGER.error`
 * — the real (and only) `LOGGER.error` call in that file was at a different
 * line entirely — and cited commit `a1b2c3d`, a stock placeholder SHA that
 * does not exist in this repo's history. The same byte-identical file had
 * gotten an LGTM from an earlier review cycle, so the fabrication was not a
 * stable misreading of the code — it was invented fresh on a later pass.
 *
 * The existing post-LLM validators (head-artifacts.mjs, cycle-protocol.mjs)
 * check whether a *claimed-missing* artifact exists and whether a finding's
 * *title* was already addressed. Neither checks whether a finding that cites
 * a concrete `file:line` for a concrete code pattern is actually describing
 * that line's real content, and neither checks whether a cited commit SHA is
 * real. This module adds both checks and runs unconditionally on every
 * finding, every cycle — unlike the cycle-specific validators, fabrication is
 * not a cycle-2/cycle-3-only concern.
 *
 * Both checks are deliberately conservative and fail open: a finding is only
 * stripped when there is a positive, concrete signal that it is fabricated
 * (a quoted code pattern absent from the line it cites, a line number outside
 * the file, or a cited SHA that git cannot resolve). A finding with no quoted
 * code pattern, no line number, or no SHA citation passes through untouched —
 * this module makes no attempt to adjudicate a finding's substantive
 * correctness, only whether its concrete, checkable citations are real.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Backtick-quoted spans from a finding's title/body that look like *code*
// rather than a file path (paths are already handled by head-artifacts.mjs's
// existence check) — no slash, and not a bare dotted extension like `foo.ts`.
const CODE_SNIPPET_RE = /`([^`\n]{2,80})`/g;

// A candidate commit SHA: 7-40 hex chars containing at least one a-f letter
// (a pure-digit run is ambiguous with a line number or count, mirroring the
// same disambiguation in evidence-resolver.mjs's extractShaCitations).
const SHA_CANDIDATE_RE = /\b[0-9a-fA-F]{7,40}\b/g;

const MAX_SHAS_PER_FINDING = 5;

/**
 * @typedef {import('./findings.mjs').Finding & { strip_reason: string }} FabricatedFinding
 */

/**
 * Extract backtick-quoted code-like snippets from a finding's title and body,
 * excluding spans that look like file paths (those are verified separately by
 * head-artifacts.mjs's existence check, which operates on a different failure
 * mode — a missing file, not wrong line content).
 *
 * @param {import('./findings.mjs').Finding} finding
 * @returns {string[]}  Deduplicated candidate code snippets, order-stable
 */
export function extractCodeSnippets(finding) {
  const text = `${finding.title ?? ''}\n${finding.body ?? ''}`;
  const seen = new Set();
  CODE_SNIPPET_RE.lastIndex = 0;
  let m;
  while ((m = CODE_SNIPPET_RE.exec(text)) !== null) {
    const candidate = m[1].trim();
    if (!candidate) continue;
    if (candidate.includes('/')) continue; // looks like a path, not code
    seen.add(candidate);
  }
  return [...seen];
}

/**
 * Extract candidate commit-SHA citations from a finding's title and body.
 *
 * @param {import('./findings.mjs').Finding} finding
 * @returns {string[]}  Deduplicated, lowercased candidate SHAs (capped)
 */
export function extractFindingShaCitations(finding) {
  const text = `${finding.title ?? ''}\n${finding.body ?? ''}`;
  const found = new Set();
  SHA_CANDIDATE_RE.lastIndex = 0;
  let m;
  while ((m = SHA_CANDIDATE_RE.exec(text)) !== null) {
    const candidate = m[0];
    if (!/[a-fA-F]/.test(candidate)) continue;
    found.add(candidate.toLowerCase());
    if (found.size >= MAX_SHAS_PER_FINDING) break;
  }
  return [...found];
}

/**
 * Read a single 1-indexed line from a file. Returns `null` if the file can't
 * be read or the line number is out of range — both are treated as "cannot
 * confirm the citation", which callers use as a fabrication signal since a
 * genuine finding can only cite a line that actually exists.
 *
 * @param {string} path
 * @param {number} lineNumber  1-indexed
 * @returns {string|null}
 */
export function readLineAtHead(path, lineNumber) {
  let content;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  const lines = content.split('\n');
  if (lineNumber < 1 || lineNumber > lines.length) return null;
  return lines[lineNumber - 1];
}

/**
 * Whether a finding's cited `file:line` actually contains at least one of the
 * code snippets quoted in its own title/body.
 *
 * Only makes a determination when there's something concrete to check: a
 * file, a line number, AND at least one non-path backtick snippet in the
 * finding text. Absent any of those, returns `true` (nothing to disprove).
 *
 * @param {import('./findings.mjs').Finding} finding
 * @param {(path: string, line: number) => string|null} [getLine]  Injected for testing
 * @returns {boolean}  false only when the citation is concretely wrong
 */
export function findingLineContentMatches(finding, getLine = readLineAtHead) {
  if (!finding.file || finding.line == null) return true;
  const snippets = extractCodeSnippets(finding);
  if (snippets.length === 0) return true;

  const actualLine = getLine(finding.file, finding.line);
  if (actualLine == null) return false; // line doesn't exist — can't be real

  const normalizedActual = actualLine.replace(/\s+/g, ' ').trim();
  return snippets.some((s) => {
    const normalizedSnippet = s.replace(/\s+/g, ' ').trim();
    return normalizedSnippet && normalizedActual.includes(normalizedSnippet);
  });
}

/**
 * Whether every commit SHA cited in a finding's title/body actually exists in
 * the repository's git history. A finding with no SHA citation trivially
 * passes.
 *
 * @param {import('./findings.mjs').Finding} finding
 * @param {(sha: string) => boolean} [commitExists]  Injected for testing
 * @returns {boolean}
 */
export function findingShaCitationsExist(
  finding,
  commitExists = commitExistsInRepo,
) {
  const shas = extractFindingShaCitations(finding);
  if (shas.length === 0) return true;
  return shas.every((sha) => commitExists(sha));
}

/**
 * Check whether a commit SHA resolves to a real commit object in the local
 * repository. Uses `git cat-file -e <sha>^{commit}`, the same cheap
 * existence-check pattern ref-verifier.mjs uses for file paths — it never
 * fetches object content and exits non-zero for anything that isn't a commit
 * (including a SHA that merely looks plausible but was never a real object).
 * Requires the workflow's `fetch-depth: 0` checkout (already relied on by
 * ref-verifier.mjs) so history is actually available to check against.
 *
 * @param {string} sha
 * @param {typeof execFileSync} [exec]  Injected for testing
 * @returns {boolean}
 */
export function commitExistsInRepo(sha, exec = execFileSync) {
  try {
    exec('git', ['cat-file', '-e', `${sha}^{commit}`], {
      stdio: 'ignore',
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Strip findings whose concrete, checkable citations are fabricated: a quoted
 * code pattern that doesn't appear on the cited line (or a cited line that
 * doesn't exist), or a cited commit SHA that doesn't resolve in git history.
 *
 * Runs unconditionally, every cycle — fabrication is not specific to any one
 * review cycle, so unlike filterFindingsCycle2/3 this isn't gated on `cycle`.
 *
 * @param {import('./findings.mjs').Finding[]} findings
 * @param {object} [deps]
 * @param {(path: string, line: number) => string|null} [deps.getLine]
 * @param {(sha: string) => boolean} [deps.commitExists]
 * @returns {{ kept: import('./findings.mjs').Finding[], stripped: FabricatedFinding[] }}
 */
export function filterFabricatedFindings(
  findings,
  { getLine = readLineAtHead, commitExists = commitExistsInRepo } = {},
) {
  const kept = [];
  const stripped = [];

  for (const f of findings) {
    if (!findingLineContentMatches(f, getLine)) {
      stripped.push({ ...f, strip_reason: 'fabricated_line_content' });
      continue;
    }
    if (!findingShaCitationsExist(f, commitExists)) {
      stripped.push({ ...f, strip_reason: 'fabricated_commit_sha' });
      continue;
    }
    kept.push(f);
  }

  return { kept, stripped };
}
