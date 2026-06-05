/**
 * Tests for scripts/generate-diagrams.mjs.
 *
 * Run via: node --test scripts/__tests__/generate-diagrams.test.mjs
 *
 * Uses node:test (built-in, no extra deps). The script is invoked as a child
 * process — we exercise the CLI surface (exit codes, stderr) rather than
 * importing internals. Tests focus on the user-visible failure paths because
 * the success path is dominated by `mmdc` (an external tool); a green run
 * locally proves the integration, but the failure-handling is what we own.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, '..', 'generate-diagrams.mjs');

function runScript({ env = {} } = {}) {
  const result = spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return {
    code: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function mmdcAvailable() {
  // Mirror the resolution order in generate-diagrams.mjs: local first, then global.
  const localMmdcJs = resolve(
    __dirname,
    '..',
    '..',
    'node_modules',
    '@mermaid-js',
    'mermaid-cli',
    'src',
    'cli.js',
  );
  if (existsSync(localMmdcJs)) return true;
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', ['mmdc'], {
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

test('script file exists and is a valid module', () => {
  assert.ok(existsSync(SCRIPT), `expected ${SCRIPT} to exist`);
});

test(
  'exits with helpful error when mmdc is not installed',
  { skip: mmdcAvailable() },
  () => {
    // PATH is forced to a directory that does not contain mmdc.
    const { code, stderr } = runScript({
      env: { PATH: __dirname },
    });
    assert.equal(code, 1, `expected exit 1 when mmdc missing, got ${code}`);
    assert.match(
      stderr,
      /mmdc not found/i,
      `expected stderr to mention mmdc; got: ${stderr}`,
    );
    assert.match(
      stderr,
      /@mermaid-js\/mermaid-cli/,
      `expected stderr to suggest install command; got: ${stderr}`,
    );
  },
);

// Hermetic happy-path: point the scan at an empty directory via the
// DIAGRAMS_SKILLS_DIR seam so the script exercises its CLI surface (exit code,
// no-files output) without invoking `mmdc` — which needs a Puppeteer-managed
// Chromium that is not present on CI runners. The real render integration is
// covered by `make diagrams` locally where a browser is available; this test
// owns the deterministic exit-0 contract.
test('exits 0 with a no-files message when the source dir has no .mmd files', () => {
  const emptyDir = mkdtempSync(join(tmpdir(), 'gen-diagrams-empty-'));
  try {
    const { code, stdout } = runScript({
      env: { DIAGRAMS_SKILLS_DIR: emptyDir },
    });
    assert.equal(code, 0, `expected exit 0, got ${code}\nstdout: ${stdout}`);
    assert.match(
      stdout,
      /No \.mmd files found/,
      `expected no-files message; got: ${stdout}`,
    );
  } finally {
    rmSync(emptyDir, { recursive: true, force: true });
  }
});
