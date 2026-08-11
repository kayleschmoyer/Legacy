import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolvePwBrowserExecutable,
  resolvePwFirefoxExecutable,
  resolvePwWebkitExecutable,
} from './resolve-pw-browser';

function makeExecutable(
  base: string,
  revisionDir: string,
  layout: readonly string[],
): void {
  const dirPath = join(base, revisionDir, ...layout.slice(0, -1));
  mkdirSync(dirPath, { recursive: true });
  writeFileSync(join(dirPath, layout[layout.length - 1]), '');
}

void test('resolvePwBrowserExecutable', async (t) => {
  let base: string;

  t.beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'pw-browsers-'));
  });
  t.afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  await t.test(
    'returns the path when the pinned-version build is present (new layout)',
    () => {
      makeExecutable(base, 'chromium_headless_shell-1217', [
        'chrome-headless-shell-linux64',
        'chrome-headless-shell',
      ]);
      assert.equal(
        resolvePwBrowserExecutable(base),
        join(
          base,
          'chromium_headless_shell-1217',
          'chrome-headless-shell-linux64',
          'chrome-headless-shell',
        ),
      );
    },
  );

  await t.test(
    'returns the older build path when only an older build is present (old layout)',
    () => {
      makeExecutable(base, 'chromium_headless_shell-1194', [
        'chrome-linux',
        'headless_shell',
      ]);
      assert.equal(
        resolvePwBrowserExecutable(base),
        join(
          base,
          'chromium_headless_shell-1194',
          'chrome-linux',
          'headless_shell',
        ),
      );
    },
  );

  await t.test(
    'returns undefined when the directory is missing entirely',
    () => {
      assert.equal(
        resolvePwBrowserExecutable(join(base, 'does-not-exist')),
        undefined,
      );
    },
  );

  await t.test(
    'returns undefined when a chromium_headless_shell-* dir exists but has no known executable layout',
    () => {
      mkdirSync(join(base, 'chromium_headless_shell-1217', 'some-other-dir'), {
        recursive: true,
      });
      assert.equal(resolvePwBrowserExecutable(base), undefined);
    },
  );

  await t.test(
    'returns undefined when base dir has no matching subdirectory',
    () => {
      mkdirSync(join(base, 'chromium-1194'), { recursive: true });
      assert.equal(resolvePwBrowserExecutable(base), undefined);
    },
  );
});

void test('resolvePwFirefoxExecutable', async (t) => {
  let base: string;

  t.beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'pw-browsers-'));
  });
  t.afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  await t.test('returns the path when a firefox-* build is present', () => {
    makeExecutable(base, 'firefox-1490', ['firefox', 'firefox']);
    assert.equal(
      resolvePwFirefoxExecutable(base),
      join(base, 'firefox-1490', 'firefox', 'firefox'),
    );
  });

  await t.test('returns undefined when no firefox-* dir exists', () => {
    mkdirSync(join(base, 'chromium_headless_shell-1217'), {
      recursive: true,
    });
    assert.equal(resolvePwFirefoxExecutable(base), undefined);
  });

  await t.test(
    'returns undefined when the directory is missing entirely',
    () => {
      assert.equal(
        resolvePwFirefoxExecutable(join(base, 'does-not-exist')),
        undefined,
      );
    },
  );
});

void test('resolvePwWebkitExecutable', async (t) => {
  let base: string;

  t.beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'pw-browsers-'));
  });
  t.afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  await t.test('returns the path when a webkit-* build is present', () => {
    makeExecutable(base, 'webkit-2203', ['pw_run.sh']);
    assert.equal(
      resolvePwWebkitExecutable(base),
      join(base, 'webkit-2203', 'pw_run.sh'),
    );
  });

  await t.test('returns undefined when no webkit-* dir exists', () => {
    mkdirSync(join(base, 'firefox-1490'), { recursive: true });
    assert.equal(resolvePwWebkitExecutable(base), undefined);
  });

  await t.test(
    'returns undefined when the directory is missing entirely',
    () => {
      assert.equal(
        resolvePwWebkitExecutable(join(base, 'does-not-exist')),
        undefined,
      );
    },
  );
});
