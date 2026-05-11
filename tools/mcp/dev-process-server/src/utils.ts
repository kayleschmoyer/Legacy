import { isAbsolute, relative, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Path-safety helpers
// ---------------------------------------------------------------------------

/**
 * Resolve inputPath relative to root, then assert it stays within allowedSubdir.
 * Returns the absolute path, or null if the path escapes the allowed directory.
 */
export function resolveChecked(
  inputPath: string,
  root: string,
  allowedSubdir: string,
): string | null {
  if (isAbsolute(inputPath)) return null;
  const allowedBase = resolve(root, allowedSubdir);
  const resolved = resolve(root, inputPath);
  const rel = relative(allowedBase, resolved);
  if (rel.startsWith('..') || isAbsolute(rel)) return null;
  return resolved;
}

/** Validate a git ref to prevent argument injection (no leading dash, safe chars only). */
const SAFE_GIT_REF_RE = /^[a-zA-Z0-9._~^@{}/\-]+$/;
export function isSafeGitRef(ref: string): boolean {
  return SAFE_GIT_REF_RE.test(ref) && !ref.startsWith('-');
}

/** Validate a relative file path for git show (no traversal sequences, no leading dash). */
export function isSafeFilePath(filePath: string): boolean {
  if (isAbsolute(filePath) || filePath.startsWith('-')) return false;
  return !filePath.split(/[\\/]/).some((seg) => seg === '..');
}

// ---------------------------------------------------------------------------
// Test plan parsing
// ---------------------------------------------------------------------------

export interface TestCase {
  text: string;
  completed: boolean;
  isAutomated: boolean;
  isManual: boolean;
  testFile: string | null;
}

/**
 * Extract test cases from markdown content.
 * Handles a "## Test Plan" section with optional intermediate sub-headings
 * before the "### Cases" sub-section.  Only headings at the same or higher
 * level than "Test Plan" close the section.
 */
export function parseTestPlanCases(content: string): TestCase[] {
  const lines = content.split('\n');
  const cases: TestCase[] = [];
  // Heading level of the enclosing Test Plan section (0 = not inside one).
  let testPlanLevel = 0;
  let inCases = false;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const title = headingMatch[2]!.trim();

      if (/^test plan$/i.test(title)) {
        testPlanLevel = level;
        inCases = false;
        continue;
      }

      if (testPlanLevel > 0) {
        if (level <= testPlanLevel) {
          // Sibling or ancestor heading — exit the Test Plan section entirely
          testPlanLevel = 0;
          inCases = false;
        } else if (/^cases$/i.test(title)) {
          inCases = true;
        } else if (inCases) {
          // A heading inside Cases closes the Cases subsection
          inCases = false;
        }
        // Intermediate sub-headings before Cases (e.g. "### Setup") are left
        // alone — they don't exit the Test Plan scope.
      }
      continue;
    }

    if (testPlanLevel > 0 && /^\s*-\s*\[[ xX]\]/.test(line)) {
      const completed = /^\s*-\s*\[[xX]\]/.test(line);
      const text = line.replace(/^\s*-\s*\[[ xX]\]\s*/, '').trim();
      const testFileMatch = text.match(/—\s*(.+)$/);
      const testFile = testFileMatch ? testFileMatch[1]!.trim() : null;
      const isManual = testFile != null && /manual/i.test(testFile);
      const isAutomated = testFile != null && !isManual && testFile.length > 0;
      cases.push({ text, completed, isAutomated, isManual, testFile });
    }
  }
  return cases;
}
