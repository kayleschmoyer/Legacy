import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveProjectSlug } from './session-files.js';

describe('resolveProjectSlug path-traversal protection', () => {
  let projectsDir: string;

  beforeAll(() => {
    projectsDir = mkdtempSync(join(tmpdir(), 'ci-projects-'));
    mkdirSync(join(projectsDir, 'legacy-sports'));
  });

  afterAll(() => {
    rmSync(projectsDir, { recursive: true, force: true });
  });

  it('resolves a valid explicit slug to an existing project directory', () => {
    expect(resolveProjectSlug(projectsDir, 'legacy-sports')).toBe(
      'legacy-sports',
    );
  });

  it('rejects a raw ".." slug', () => {
    expect(() => resolveProjectSlug(projectsDir, '..')).toThrow(
      /Invalid project slug/,
    );
  });

  it('neutralizes path-separator traversal by reducing to the basename', () => {
    // basename("foo/../../etc/passwd") -> "passwd"; the strict allow-list keeps
    // it inside projectsDir, so the lookup fails as "does not exist" rather than
    // escaping the directory.
    expect(() =>
      resolveProjectSlug(projectsDir, 'foo/../../etc/passwd'),
    ).toThrow(/does not exist under/);
  });

  it('rejects a backslash-separated traversal attempt', () => {
    expect(() => resolveProjectSlug(projectsDir, '..\\..\\windows')).toThrow();
  });
});
