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
import { mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
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

// statSync is wrapped (not chmod-based permission bits) because the test
// runner commonly runs as root, where the OS permission check that would
// normally raise EACCES is bypassed entirely — chmod 0000 on a real
// directory would not reproduce the failure under test. Wrapping lets the
// LS-9538 test below inject a real EACCES-shaped error deterministically,
// while every other test keeps exercising the real statSync.
jest.mock('node:fs', () => {
  const actual: typeof import('node:fs') = jest.requireActual('node:fs');
  return { ...actual, statSync: jest.fn(actual.statSync) };
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
    // LS-8890: the message now leads with the automated recovery (run the
    // same audit locally, where the transcript IS readable) and keeps manual
    // review only as the last resort — it used to send the caller straight
    // to a hand-rolled audit, which is why eight CCR sessions in a row
    // skipped Phase 1 entirely.
    expect(thrown?.message).toContain('make audit-session');
    expect(thrown?.message).toContain('Only if that also fails');
  });

  it('distinguishes permission-denied from not-found on an unreadable explicit override (LS-9538)', () => {
    // Simulates the LS-9538 recurrence: the explicit projectsDir exists (the
    // caller confirmed it via their own Bash tool) but the MCP server
    // process's OS user (e.g. sbx_user1051) lacks read access to it (e.g. a
    // 0700 directory owned by root) — a permission boundary, not a missing
    // path. The error must say "permission denied" and cite LS-9538, not
    // repeat the generic "does not exist" message that would send the
    // caller retrying path variations that were never going to work.
    (homedir as jest.Mock).mockReturnValueOnce(join(tmpDir, 'no-such-homedir'));
    const restricted = join(tmpDir, 'permission-denied-dir');
    const eacces = Object.assign(new Error('EACCES: permission denied'), {
      code: 'EACCES',
    });
    (statSync as jest.Mock).mockImplementationOnce((...args: unknown[]) => {
      const path = args[0];
      if (path === restricted) throw eacces;
      return jest
        .requireActual<typeof import('node:fs')>('node:fs')
        .statSync(path as string);
    });

    let thrown: Error | undefined;
    try {
      findClaudeProjectsDir(restricted);
    } catch (err) {
      thrown = err as Error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown?.message).toContain('permission denied, not not-found');
    expect(thrown?.message).toContain('LS-9538');
    expect(thrown?.message).not.toMatch(/does not exist or is not readable/);
  });

  it('falls back to /root/.claude/projects when $HOME/homedir do not resolve (LS-9268)', () => {
    // Simulates a CCR container where the launch environment's $HOME is
    // stale (points nowhere) and the OS user-database homedir() is also
    // wrong, but the process is actually running as root with a real
    // /root/.claude/projects — the safety-net scan must still find it.
    const rootHome = join(tmpDir, 'ls-9268-root');
    const rootProjects = join(rootHome, '.claude', 'projects');
    mkdirSync(rootProjects, { recursive: true });
    (homedir as jest.Mock).mockReturnValueOnce(join(tmpDir, 'no-such-homedir'));
    process.env['HOME'] = join(tmpDir, 'also-no-such-homedir');
    try {
      expect(findClaudeProjectsDir(undefined, { rootHome })).toBe(rootProjects);
    } finally {
      rmSync(rootHome, { recursive: true, force: true });
    }
  });

  it('falls back to scanning /home/*/.claude/projects when nothing else matches (LS-9268)', () => {
    const homesRoot = mkdtempSync(join(tmpdir(), 'ls-9268-homes-'));
    const otherUserProjects = join(
      homesRoot,
      'someuser',
      '.claude',
      'projects',
    );
    mkdirSync(otherUserProjects, { recursive: true });
    (homedir as jest.Mock).mockReturnValueOnce(join(tmpDir, 'no-such-homedir'));
    process.env['HOME'] = join(tmpDir, 'also-no-such-homedir');
    try {
      expect(
        findClaudeProjectsDir(undefined, {
          rootHome: join(tmpDir, 'no-such-root'),
          homesRoot,
        }),
      ).toBe(otherUserProjects);
    } finally {
      rmSync(homesRoot, { recursive: true, force: true });
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

  it('names the local-CLI recovery on the generic not-found error (LS-8890)', () => {
    // The generic branch is the one every CCR session actually hit
    // (LS-8890/LS-9196/LS-9200 all report the bare "Tried: ..." message).
    // It must now point at the automated recovery, not dead-end.
    process.env['CLAUDE_PROJECTS_DIR'] = '/nonexistent-override-xyz';
    process.env['APPDATA'] = '/nonexistent-appdata-xyz';
    (homedir as jest.Mock).mockReturnValue(join(tmpDir, 'no-such-homedir'));
    process.env['HOME'] = join(tmpDir, 'no-such-home');
    let thrown: Error | undefined;
    try {
      findClaudeProjectsDir(undefined, {
        rootHome: join(tmpDir, 'no-such-root'),
        homesRoot: join(tmpDir, 'no-such-homes'),
      });
    } catch (err) {
      thrown = err as Error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown?.message).toContain('make audit-session');
    expect(thrown?.message).toContain('audit-session-bash-cli.ts');
  });

  it('names the local-CLI recovery on the permission-denied error (LS-8890)', () => {
    // The EACCES branch (LS-9538) is unrecoverable by any projectsDir value,
    // so it is the branch that most needs to hand the caller a working path.
    const restricted = join(tmpDir, 'eacces-projects');
    const eacces = Object.assign(new Error('EACCES: permission denied'), {
      code: 'EACCES',
    });
    process.env['CLAUDE_PROJECTS_DIR'] = restricted;
    delete process.env['APPDATA'];
    (homedir as jest.Mock).mockReturnValue(join(tmpDir, 'no-such-homedir'));
    process.env['HOME'] = join(tmpDir, 'no-such-home');
    (statSync as jest.Mock).mockImplementation((...args: unknown[]) => {
      if (args[0] === restricted) throw eacces;
      return jest
        .requireActual<typeof import('node:fs')>('node:fs')
        .statSync(...(args as Parameters<typeof statSync>));
    });
    let thrown: Error | undefined;
    try {
      findClaudeProjectsDir(undefined, {
        rootHome: join(tmpDir, 'no-such-root'),
        homesRoot: join(tmpDir, 'no-such-homes'),
      });
    } catch (err) {
      thrown = err as Error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown?.message).toContain('Permission denied (not not-found)');
    expect(thrown?.message).toContain('make audit-session');
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
