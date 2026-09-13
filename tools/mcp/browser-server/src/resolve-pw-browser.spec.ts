import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolvePwBrowser } from './resolve-pw-browser.js';

function makeExecutable(
  base: string,
  revisionDir: string,
  layout: readonly string[],
): void {
  const dirPath = join(base, revisionDir, ...layout.slice(0, -1));
  mkdirSync(dirPath, { recursive: true });
  writeFileSync(join(dirPath, layout[layout.length - 1]), '');
}

describe('resolvePwBrowser', () => {
  let base: string;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'pw-browsers-'));
  });
  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it('resolves the pinned-version build when present (new CFT layout)', () => {
    makeExecutable(base, 'chromium_headless_shell-1217', [
      'chrome-headless-shell-linux64',
      'chrome-headless-shell',
    ]);
    const result = resolvePwBrowser(base);
    expect(result.executablePath).toBe(
      join(
        base,
        'chromium_headless_shell-1217',
        'chrome-headless-shell-linux64',
        'chrome-headless-shell',
      ),
    );
    expect(result.foundRevision).toBe('1217');
  });

  it('resolves an older baked build via the old layout (LS-10124 repro)', () => {
    makeExecutable(base, 'chromium_headless_shell-1194', [
      'chrome-linux',
      'headless_shell',
    ]);
    const result = resolvePwBrowser(base);
    expect(result.executablePath).toBe(
      join(
        base,
        'chromium_headless_shell-1194',
        'chrome-linux',
        'headless_shell',
      ),
    );
    expect(result.foundRevision).toBe('1194');
  });

  it('leaves executablePath undefined when the directory is missing entirely', () => {
    const result = resolvePwBrowser(join(base, 'does-not-exist'));
    expect(result.executablePath).toBeUndefined();
  });

  it('leaves executablePath undefined when a revision dir exists but has no known executable layout', () => {
    mkdirSync(join(base, 'chromium_headless_shell-1217', 'some-other-dir'), {
      recursive: true,
    });
    const result = resolvePwBrowser(base);
    expect(result.executablePath).toBeUndefined();
    expect(result.foundRevision).toBe('1217');
  });

  it('leaves executablePath undefined when no chromium_headless_shell-* dir exists', () => {
    mkdirSync(join(base, 'chromium-1194'), { recursive: true });
    const result = resolvePwBrowser(base);
    expect(result.executablePath).toBeUndefined();
    expect(result.foundRevision).toBeUndefined();
  });

  it('always reports a pinned revision read from playwright-core/browsers.json', () => {
    const result = resolvePwBrowser(join(base, 'does-not-exist'));
    expect(result.pinnedRevision).toMatch(/^\d+$/);
  });
});
