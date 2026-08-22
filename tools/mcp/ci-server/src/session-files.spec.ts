import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { findClaudeProjectsDir, resolveProjectSlug } from './session-files.js';

// Wraps the real implementation by default so every existing assertion keeps
// exercising real homedir() behavior; only the LS-9458 test below overrides
// it, to deterministically neutralize the "real homedir()/.claude/projects
// exists" fallback (true whenever this suite itself runs inside a live
// Claude Code session) without touching every other test's environment.
jest.mock('node:os', () => {
  const actual: typeof import('node:os') = jest.requireActual('node:os');
  return { ...actual, homedir: jest.fn(actual.homedir) };
});

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
      HOME: process.env['HOME'],
    };
    delete process.env['CLAUDE_PROJECTS_DIR'];
    delete process.env['APPDATA'];
    delete process.env['HOME'];
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

  it('returns the explicit param override, taking priority over everything', () => {
    process.env['CLAUDE_PROJECTS_DIR'] = '/nonexistent-env-override-xyz';
    expect(findClaudeProjectsDir(tmpDir)).toBe(tmpDir);
  });

  it('resolves ~/.claude/projects from $HOME when it differs from the OS user home (LS-8867)', () => {
    // Simulates a CCR-style environment where the process's OS user-database
    // home (what node:os homedir() falls back to) is stale/mismatched, but
    // $HOME correctly points at the real session directory.
    const homeProjects = join(tmpDir, '.claude', 'projects');
    mkdirSync(homeProjects, { recursive: true });
    try {
      process.env['HOME'] = tmpDir;
      expect(findClaudeProjectsDir()).toBe(homeProjects);
    } finally {
      rmSync(homeProjects, { recursive: true, force: true });
    }
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

  it('resolves ~/.claude/projects for the CCR path shape (/root/.claude/projects/-home-user-<repo>/) via $HOME (LS-9458)', () => {
    // Regression coverage for the LS-9458 recurrence report: a CCR container
    // whose real home is /root, holding a project dir slugged from
    // /home/user/<repo>. As long as $HOME is inherited correctly, resolution
    // must not require any sbx_user1051-style literal.
    const rootHome = join(tmpDir, 'root-home');
    const ccrProjects = join(rootHome, '.claude', 'projects');
    const ccrProjectDir = join(ccrProjects, '-home-user-legacy-sports');
    mkdirSync(ccrProjectDir, { recursive: true });
    try {
      process.env['HOME'] = rootHome;
      expect(findClaudeProjectsDir()).toBe(ccrProjects);
    } finally {
      rmSync(rootHome, { recursive: true, force: true });
    }
  });

  it('gives an actionable error — not the generic message — when an explicit projectsDir override is not readable (LS-9458)', () => {
    // Simulates the second LS-9458 defect: the caller supplies projectsDir
    // (e.g. confirmed present via their own Bash tool), but the MCP server
    // process still can't see it — the failure must name that as the likely
    // cause instead of repeating the bare "Could not find" message, so the
    // caller doesn't retry the same override expecting a different result.
    (homedir as jest.Mock).mockReturnValueOnce(join(tmpDir, 'no-such-homedir'));
    const unreadable = join(tmpDir, 'not-visible-to-server');
    let thrown: Error | undefined;
    try {
      findClaudeProjectsDir(unreadable);
    } catch (err) {
      thrown = err as Error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown?.message).toMatch(
      /not readable \*from the MCP server process\*/,
    );
    expect(thrown?.message).toContain('LS-9458');
    expect(thrown?.message).toContain(
      "manual review of the session's Bash history",
    );
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
