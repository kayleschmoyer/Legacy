import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readGitRemoteUrl } from './git-config.js';

describe('readGitRemoteUrl', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'ls4599-git-'));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('reads origin URL from a standard `.git/` directory', () => {
    const gitDir = join(tmpRoot, '.git');
    mkdirSync(gitDir);
    writeFileSync(
      join(gitDir, 'config'),
      '[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = git@github.com:foo/bar.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n',
    );

    expect(readGitRemoteUrl(tmpRoot)).toBe('git@github.com:foo/bar.git');
  });

  it('follows the gitdir + commondir chain for a linked worktree', () => {
    // Simulate a main repo gitdir under <tmpRoot>/main/.git
    const mainRoot = join(tmpRoot, 'main');
    const mainGitDir = join(mainRoot, '.git');
    mkdirSync(mainGitDir, { recursive: true });
    writeFileSync(
      join(mainGitDir, 'config'),
      '[remote "origin"]\n\turl = https://github.com/foo/bar\n',
    );

    // Worktree at <tmpRoot>/wt with .git file pointing at the per-worktree gitdir.
    const wtRoot = join(tmpRoot, 'wt');
    mkdirSync(wtRoot);
    const wtGitDir = join(mainGitDir, 'worktrees', 'wt');
    mkdirSync(wtGitDir, { recursive: true });
    writeFileSync(join(wtRoot, '.git'), `gitdir: ${wtGitDir}\n`);
    // commondir points back up to the main gitdir (relative path, like real git)
    writeFileSync(join(wtGitDir, 'commondir'), '../..\n');

    expect(readGitRemoteUrl(wtRoot)).toBe('https://github.com/foo/bar');
  });

  it('reads config from the per-target gitdir for a submodule (no commondir)', () => {
    // Submodule layout: working tree's `.git` is a file pointing at a bare
    // gitdir that itself owns `config` (no `commondir` indirection).
    const submoduleRoot = join(tmpRoot, 'submodule');
    mkdirSync(submoduleRoot);
    const subGitDir = join(tmpRoot, 'modules', 'submodule');
    mkdirSync(subGitDir, { recursive: true });
    writeFileSync(join(submoduleRoot, '.git'), `gitdir: ${subGitDir}\n`);
    writeFileSync(
      join(subGitDir, 'config'),
      '[remote "origin"]\n\turl = git@github.com:sub/module.git\n',
    );

    expect(readGitRemoteUrl(submoduleRoot)).toBe(
      'git@github.com:sub/module.git',
    );
  });

  it('returns null when `.git` is missing', () => {
    expect(readGitRemoteUrl(tmpRoot)).toBeNull();
  });

  it('returns null when the requested remote is absent', () => {
    const gitDir = join(tmpRoot, '.git');
    mkdirSync(gitDir);
    writeFileSync(
      join(gitDir, 'config'),
      '[remote "upstream"]\n\turl = git@github.com:foo/bar.git\n',
    );

    expect(readGitRemoteUrl(tmpRoot)).toBeNull();
    expect(readGitRemoteUrl(tmpRoot, 'upstream')).toBe(
      'git@github.com:foo/bar.git',
    );
  });

  it('ignores comments and inline comments in config', () => {
    const gitDir = join(tmpRoot, '.git');
    mkdirSync(gitDir);
    writeFileSync(
      join(gitDir, 'config'),
      '# top-level comment\n; another comment\n[remote "origin"]\n\turl = https://github.com/foo/bar ; trailing\n',
    );

    expect(readGitRemoteUrl(tmpRoot)).toBe('https://github.com/foo/bar');
  });
});
