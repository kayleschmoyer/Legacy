import { join } from 'node:path';
import {
  isSafeFilePath,
  isSafeGitRef,
  parseTestPlanCases,
  resolveChecked,
} from './utils';

const ROOT = '/repo';

describe('resolveChecked', () => {
  it('returns absolute path for a valid relative path within allowed dir', () => {
    const result = resolveChecked('docs/rfcs/draft-foo.md', ROOT, 'docs/rfcs');
    expect(result).not.toBeNull();
    // Verify the result contains the expected path segments (normalise separators)
    expect(result!.replace(/\\/g, '/')).toContain('docs/rfcs/draft-foo.md');
  });

  it('returns null for a path traversal attempt', () => {
    expect(
      resolveChecked('docs/rfcs/../../etc/passwd', ROOT, 'docs/rfcs'),
    ).toBeNull();
  });

  it('returns null for an absolute path', () => {
    expect(resolveChecked('/etc/passwd', ROOT, 'docs/rfcs')).toBeNull();
  });

  it('returns null for a Windows absolute path', () => {
    expect(
      resolveChecked('C:\\Windows\\System32\\evil.md', ROOT, 'docs/rfcs'),
    ).toBeNull();
  });

  it('allows a file directly in the allowed dir', () => {
    const result = resolveChecked(
      'docs/rfcs/draft-my-rfc.md',
      ROOT,
      'docs/rfcs',
    );
    expect(result).not.toBeNull();
  });

  it('returns null for path escaping with double-dot at different nesting', () => {
    expect(
      resolveChecked('docs/rfcs/../../../secret.md', ROOT, 'docs/rfcs'),
    ).toBeNull();
  });
});

describe('isSafeGitRef', () => {
  it('accepts a branch name', () => {
    expect(isSafeGitRef('main')).toBe(true);
  });

  it('accepts a SHA', () => {
    expect(isSafeGitRef('abc1234def5678')).toBe(true);
  });

  it('accepts HEAD~1', () => {
    expect(isSafeGitRef('HEAD~1')).toBe(true);
  });

  it('accepts origin/main', () => {
    expect(isSafeGitRef('origin/main')).toBe(true);
  });

  it('rejects a leading dash (option injection)', () => {
    expect(isSafeGitRef('-evil')).toBe(false);
  });

  it('rejects shell metacharacters', () => {
    expect(isSafeGitRef('main; rm -rf /')).toBe(false);
  });

  it('rejects a backtick', () => {
    expect(isSafeGitRef('`evil`')).toBe(false);
  });
});

describe('isSafeFilePath', () => {
  it('accepts a normal relative path', () => {
    expect(isSafeFilePath('docs/test-plans/LS-1234.md')).toBe(true);
  });

  it('rejects a path with .. traversal', () => {
    expect(isSafeFilePath('docs/../../../etc/passwd')).toBe(false);
  });

  it('rejects a path starting with -', () => {
    expect(isSafeFilePath('-option')).toBe(false);
  });

  it('rejects an absolute path', () => {
    expect(isSafeFilePath('/etc/passwd')).toBe(false);
  });

  it('accepts nested paths without traversal', () => {
    expect(isSafeFilePath('a/b/c/d.md')).toBe(true);
  });
});

describe('parseTestPlanCases', () => {
  it('extracts checkbox items from a Test Plan section', () => {
    const content = `
## Test Plan

- [ ] User can log in
- [x] User sees error on bad password
`;
    const cases = parseTestPlanCases(content);
    expect(cases).toHaveLength(2);
    expect(cases[0]!.text).toBe('User can log in');
    expect(cases[0]!.completed).toBe(false);
    expect(cases[1]!.completed).toBe(true);
  });

  it('marks a case as automated when a test file reference is present', () => {
    const content = `
## Test Plan

- [ ] Login flow works — apps/web-e2e/src/tests/login.spec.ts
`;
    const cases = parseTestPlanCases(content);
    expect(cases[0]!.isAutomated).toBe(true);
    expect(cases[0]!.isManual).toBe(false);
    expect(cases[0]!.testFile).toBe('apps/web-e2e/src/tests/login.spec.ts');
  });

  it('marks a case as manual when the test file reference contains "manual"', () => {
    const content = `
## Test Plan

- [ ] Visual layout looks correct — manual
`;
    const cases = parseTestPlanCases(content);
    expect(cases[0]!.isManual).toBe(true);
    expect(cases[0]!.isAutomated).toBe(false);
  });

  it('does not exit the Test Plan section on intermediate sub-headings', () => {
    const content = `
## Test Plan

### Setup

Some setup notes.

### Cases

- [ ] Case A
- [ ] Case B

## Implementation
`;
    const cases = parseTestPlanCases(content);
    expect(cases).toHaveLength(2);
    expect(cases[0]!.text).toBe('Case A');
    expect(cases[1]!.text).toBe('Case B');
  });

  it('exits the Test Plan section when a sibling heading is encountered', () => {
    const content = `
## Test Plan

- [ ] Inside test plan

## Other Section

- [ ] Outside test plan
`;
    const cases = parseTestPlanCases(content);
    expect(cases).toHaveLength(1);
    expect(cases[0]!.text).toBe('Inside test plan');
  });

  it('returns empty array when no Test Plan section exists', () => {
    const content = `# PR Description\n\nSome text without a test plan.`;
    expect(parseTestPlanCases(content)).toHaveLength(0);
  });

  it('handles case-insensitive Test Plan heading', () => {
    const content = `
## test plan

- [ ] A case
`;
    const cases = parseTestPlanCases(content);
    expect(cases).toHaveLength(1);
  });

  it('extracts cases directly under Test Plan (no Cases sub-heading)', () => {
    const content = `
## Test Plan

- [ ] Direct case without a Cases sub-section
`;
    const cases = parseTestPlanCases(content);
    expect(cases).toHaveLength(1);
    expect(cases[0]!.text).toBe('Direct case without a Cases sub-section');
  });
});
