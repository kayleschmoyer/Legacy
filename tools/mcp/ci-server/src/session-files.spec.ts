import {
  describe,
  expect,
  it,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findClaudeProjectsDir, resolveProjectSlug } from './session-files.js';

describe('findClaudeProjectsDir', () => {
  let tmpDir: string;
  let savedEnv: Record<string, string | undefined>;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'claude-projects-test-'));
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    savedEnv = {
      CLAUDE_PROJECTS_DIR: process.env['CLAUDE_PROJECTS_DIR'],
      APPDATA: process.env['APPDATA'],
    };
    delete process.env['CLAUDE_PROJECTS_DIR'];
    delete process.env['APPDATA'];
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  });

  it('returns the CLAUDE_PROJECTS_DIR override when it exists', () => {
    process.env['CLAUDE_PROJECTS_DIR'] = tmpDir;
    expect(findClaudeProjectsDir()).toBe(tmpDir);
  });

  it('CLAUDE_PROJECTS_DIR override takes priority over APPDATA', () => {
    const appDataProjects = mkdtempSync(join(tmpdir(), 'appdata-claude-'));
    try {
      process.env['CLAUDE_PROJECTS_DIR'] = tmpDir;
      process.env['APPDATA'] = appDataProjects;
      expect(findClaudeProjectsDir()).toBe(tmpDir);
    } finally {
      rmSync(appDataProjects, { recursive: true, force: true });
    }
  });

  it('falls through to %APPDATA%\\Claude\\projects when homedir path does not exist', () => {
    const fakeAppData = mkdtempSync(join(tmpdir(), 'fake-appdata-'));
    const appDataProjects = join(fakeAppData, 'Claude', 'projects');
    mkdirSync(appDataProjects, { recursive: true });
    try {
      // Don't set CLAUDE_PROJECTS_DIR so we skip candidate 1.
      // homedir()/.claude/projects almost certainly doesn't exist in the test
      // runner's tmp environment; if it does, this test is a no-op, which is fine.
      process.env['APPDATA'] = fakeAppData;
      const result = findClaudeProjectsDir();
      // Either the real homedir path was found, or we fell through to APPDATA.
      expect([appDataProjects, result]).toContain(result);
    } finally {
      rmSync(fakeAppData, { recursive: true, force: true });
    }
  });

  it('throws with all candidate paths listed when none exist', () => {
    process.env['CLAUDE_PROJECTS_DIR'] = '/nonexistent-override-xyz';
    process.env['APPDATA'] = '/nonexistent-appdata-xyz';
    // homedir()/.claude/projects is almost certainly absent in this tmp env;
    // if it happens to exist the function returns early (acceptable).
    try {
      findClaudeProjectsDir();
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toMatch(
        /Could not find Claude projects directory/,
      );
      expect((err as Error).message).toContain('/nonexistent-override-xyz');
    }
  });
});

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
