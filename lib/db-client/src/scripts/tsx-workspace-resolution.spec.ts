import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

/**
 * LS-8664: db-client's npm scripts invoke `tsx` directly on TypeScript entry
 * files (no Nx/Vite/Jest bundler in front of them), so `@legacy-sports/*`
 * workspace imports only resolve via tsx's implicit tsconfig-paths detection.
 * That detection was found to fail in modules-pool-symlinked worktrees
 * ("Cannot find module '@legacy-sports/env-utilities'"), so every raw `tsx`
 * script must pin an explicit `tsconfig-paths/register` require hook instead
 * of relying on tsx to find it on its own.
 */

const packageDir = join(__dirname, '..', '..');
const repoRoot = join(packageDir, '..', '..');
const tsx = join(repoRoot, 'node_modules', '.bin', 'tsx');

describe('db-client raw tsx scripts', () => {
  const manifest = JSON.parse(
    readFileSync(join(packageDir, 'package.json'), 'utf-8'),
  ) as { scripts: Record<string, string> };

  const rawTsxScripts = Object.entries(manifest.scripts).filter(([, cmd]) =>
    cmd.startsWith('tsx '),
  );

  it('has at least one raw tsx script to guard', () => {
    expect(rawTsxScripts.length).toBeGreaterThan(0);
  });

  it.each(rawTsxScripts)(
    '%s pins --require tsconfig-paths/register',
    (_name, cmd) => {
      expect(cmd).toContain('tsx --require tsconfig-paths/register ');
    },
  );

  it('resolves a workspace import the same way the pinned scripts do', () => {
    const output = execFileSync(
      tsx,
      [
        '--require',
        'tsconfig-paths/register',
        '-e',
        "require('@legacy-sports/env-utilities'); console.log('resolved')",
      ],
      { cwd: packageDir, encoding: 'utf-8' },
    );
    expect(output.trim()).toBe('resolved');
  });
});
