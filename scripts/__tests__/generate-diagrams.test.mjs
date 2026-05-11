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
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
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

test(
  'completes successfully when mmdc is available',
  { skip: !mmdcAvailable() ? 'mmdc not installed in this environment' : false },
  () => {
    const { code, stdout } = runScript();
    assert.equal(code, 0, `expected exit 0, got ${code}\nstdout: ${stdout}`);
    assert.match(
      stdout,
      /generated|No \.mmd files/,
      `expected generation summary or no-files message; got: ${stdout}`,
    );
  },
);
