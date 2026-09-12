// Tests for scripts/patch-child-process.js — the Windows-only windowsHide
// monkey-patch the Makefile preloads via NODE_OPTIONS (LS-102).
//
// The patch mutates the process-global child_process module and is a no-op
// off win32, so each check runs in a fresh node process that fakes
// process.platform = 'win32' while requiring it, then restores the real value.
// That exercises the real wrapping logic on every CI platform. The restore
// matters: Node's exec picks its shell from process.platform at call time, so
// a still-faked win32 on Linux would try to spawn cmd.exe and fail.
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const PATCH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'patch-child-process.js',
);

/** Run `body` in a child node with the patch applied as if on Windows; return its JSON stdout. */
function runPatched(body) {
  const script = `
    const realPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const cp = require('child_process');
    const { promisify } = require('util');
    const originals = {
      execFile: cp.execFile[promisify.custom],
      exec: cp.exec[promisify.custom],
    };
    require(${JSON.stringify(PATCH)});
    // The patch only checks the platform at load time; restore it so exec
    // uses the host's real shell (cmd.exe vs /bin/sh) when called.
    Object.defineProperty(process, 'platform', { value: realPlatform });
    (async () => { ${body} })().then(
      (out) => process.stdout.write(JSON.stringify(out)),
      (err) => { process.stderr.write(String(err && err.stack || err)); process.exit(1); },
    );
  `;
  const stdout = execFileSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
  });
  return JSON.parse(stdout);
}

test('promisify(execFile) still resolves { stdout, stderr } after patching (LS-10120)', () => {
  const out = runPatched(`
    const result = await promisify(cp.execFile)(process.execPath, ['-e', 'process.stdout.write("hi")']);
    return {
      hasCustom: typeof cp.execFile[promisify.custom] === 'function',
      replacedCustom: cp.execFile[promisify.custom] !== originals.execFile,
      type: typeof result,
      stdout: result && result.stdout,
    };
  `);
  assert.equal(out.hasCustom, true);
  // The custom implementation must itself be wrapped, or promisified calls
  // would bypass windowsHide.
  assert.equal(out.replacedCustom, true);
  assert.equal(out.type, 'object');
  assert.equal(out.stdout, 'hi');
});

test('promisify(exec) still resolves { stdout, stderr } after patching', () => {
  const out = runPatched(`
    const result = await promisify(cp.exec)(JSON.stringify(process.execPath) + ' --version');
    return {
      hasCustom: typeof cp.exec[promisify.custom] === 'function',
      replacedCustom: cp.exec[promisify.custom] !== originals.exec,
      type: typeof result,
      stdout: result && result.stdout,
    };
  `);
  assert.equal(out.hasCustom, true);
  assert.equal(out.replacedCustom, true);
  assert.equal(out.type, 'object');
  assert.match(out.stdout, /^v\d+/);
});

test('callback-style execFile keeps working after patching', () => {
  const out = runPatched(`
    return await new Promise((resolve, reject) =>
      cp.execFile(process.execPath, ['-e', 'process.stdout.write("cb")'], (err, stdout) =>
        err ? reject(err) : resolve({ stdout }),
      ),
    );
  `);
  assert.equal(out.stdout, 'cb');
});

// Node's promisify.custom appends its callback after the forwarded arguments,
// so the wrappers must never pad missing slots with `undefined` — that shifted
// the callback out of position and left the promise pending forever.
test('promisify(exec) with an explicit options object settles', () => {
  const out = runPatched(`
    const result = await promisify(cp.exec)(JSON.stringify(process.execPath) + ' --version', { encoding: 'utf8' });
    return { stdout: result && result.stdout };
  `);
  assert.match(out.stdout, /^v\d+/);
});

test('callback-style exec(cmd, callback) keeps working after patching', () => {
  const out = runPatched(`
    return await new Promise((resolve, reject) =>
      cp.exec(JSON.stringify(process.execPath) + ' --version', (err, stdout) =>
        err ? reject(err) : resolve({ stdout }),
      ),
    );
  `);
  assert.match(out.stdout, /^v\d+/);
});
