import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readGitRemoteUrl } from './git-config.js';

describe('readGitRemoteUrl', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'ls4599-ci-git-'));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('reads origin URL from a standard `.git/` directory', () => {
    const gitDir = join(tmpRoot, '.git');
    mkdirSync(gitDir);
    writeFileSync(
      join(gitDir, 'config'),
      '[remote "origin"]\n\turl = git@github.com:foo/bar.git\n',
    );

    expect(readGitRemoteUrl(tmpRoot)).toBe('git@github.com:foo/bar.git');
  });

  it('follows the gitdir + commondir chain for a linked worktree', () => {
    const mainRoot = join(tmpRoot, 'main');
    const mainGitDir = join(mainRoot, '.git');
    mkdirSync(mainGitDir, { recursive: true });
    writeFileSync(
      join(mainGitDir, 'config'),
      '[remote "origin"]\n\turl = https://github.com/foo/bar\n',
    );

    const wtRoot = join(tmpRoot, 'wt');
    mkdirSync(wtRoot);
    const wtGitDir = join(mainGitDir, 'worktrees', 'wt');
    mkdirSync(wtGitDir, { recursive: true });
    writeFileSync(join(wtRoot, '.git'), `gitdir: ${wtGitDir}\n`);
    writeFileSync(join(wtGitDir, 'commondir'), '../..\n');

    expect(readGitRemoteUrl(wtRoot)).toBe('https://github.com/foo/bar');
  });

  it('reads config from the per-target gitdir for a submodule (no commondir)', () => {
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
  });
});
