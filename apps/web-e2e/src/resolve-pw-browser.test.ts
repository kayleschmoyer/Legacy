import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolvePwBrowserExecutable } from './resolve-pw-browser';

function makeShell(
  base: string,
  revision: string,
  layout: readonly [string, string],
): void {
  const [dir, executable] = layout;
  const shellDir = join(base, `chromium_headless_shell-${revision}`, dir);
  mkdirSync(shellDir, { recursive: true });
  writeFileSync(join(shellDir, executable), '');
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
      makeShell(base, '1217', [
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
      makeShell(base, '1194', ['chrome-linux', 'headless_shell']);
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
