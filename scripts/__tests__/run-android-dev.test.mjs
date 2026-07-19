/**
 * Tests for the pure helpers in scripts/run-android-dev.mjs (LS-8495).
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/run-android-dev.test.mjs
 *
 * The security-relevant behavior pinned here: expo is launched as
 * `node <resolved expo/bin/cli>` with args as pure argv data (no shell, no
 * npx), so forwarded CLI args and env-derived values cannot be interpreted
 * as shell syntax. The full emulator boot path is exercised manually /
 * via the mobile-qa Maestro sweep, not in CI (runners have no emulator).
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  buildExpoCommand,
  parseAvdList,
  parseOnlineDevices,
  sdkCandidates,
  splitArgs,
} from '../run-android-dev.mjs';

// --- splitArgs ---------------------------------------------------------------

test('splitArgs: --check is consumed, everything else forwards in order', () => {
  const { checkMode, expoArgs } = splitArgs(['--check', '--variant', 'debug']);
  assert.equal(checkMode, true);
  assert.deepEqual(expoArgs, ['--variant', 'debug']);
});

test('splitArgs: no --check means a real run with untouched args', () => {
  const { checkMode, expoArgs } = splitArgs(['--device', 'Pixel_8']);
  assert.equal(checkMode, false);
  assert.deepEqual(expoArgs, ['--device', 'Pixel_8']);
});

test('splitArgs: empty argv', () => {
  assert.deepEqual(splitArgs([]), { checkMode: false, expoArgs: [] });
});

// --- sdkCandidates -----------------------------------------------------------

test('sdkCandidates: env vars take priority over the OS default', () => {
  const candidates = sdkCandidates(
    { ANDROID_HOME: '/env/home', ANDROID_SDK_ROOT: '/env/root' },
    'linux',
    '/home/u',
  );
  assert.deepEqual(candidates, [
    '/env/home',
    '/env/root',
    path.join('/home/u', 'Android', 'Sdk'),
  ]);
});

test('sdkCandidates: unset env vars are dropped, default remains', () => {
  const candidates = sdkCandidates({}, 'win32', 'C:\\Users\\u');
  assert.deepEqual(candidates, [
    path.join('C:\\Users\\u', 'AppData', 'Local', 'Android', 'Sdk'),
  ]);
});

test('sdkCandidates: darwin default path', () => {
  const candidates = sdkCandidates({}, 'darwin', '/Users/u');
  assert.deepEqual(candidates, [
    path.join('/Users/u', 'Library', 'Android', 'sdk'),
  ]);
});

// --- parseOnlineDevices ------------------------------------------------------

test('parseOnlineDevices: online devices only, offline/unauthorized excluded', () => {
  const output = [
    'List of devices attached',
    'emulator-5554\tdevice',
    'emulator-5556\toffline',
    'RFCT80XXXX\tunauthorized',
    'RFCT80YYYY\tdevice',
    '',
  ].join('\n');
  assert.deepEqual(parseOnlineDevices(output), ['emulator-5554', 'RFCT80YYYY']);
});

test('parseOnlineDevices: daemon startup noise and empty list', () => {
  const output = [
    'List of devices attached',
    '', // adb prints a trailing blank line
  ].join('\n');
  assert.deepEqual(parseOnlineDevices(output), []);
});

// --- parseAvdList ------------------------------------------------------------

test('parseAvdList: names kept, INFO noise and blanks dropped', () => {
  const output = [
    'INFO    | Storing crashdata in: /tmp/android-u/emu-crash.db',
    'Pixel_8_API_36',
    'Medium_Phone_API_35',
    '',
  ].join('\n');
  assert.deepEqual(parseAvdList(output), [
    'Pixel_8_API_36',
    'Medium_Phone_API_35',
  ]);
});

test('parseAvdList: empty output yields no AVDs', () => {
  assert.deepEqual(parseAvdList(''), []);
});

// --- buildExpoCommand (command-injection hardening) --------------------------

test('buildExpoCommand: launches node + resolved expo CLI, no shell, args as data', () => {
  const appDir = path.resolve(import.meta.dirname, '..', '..', 'apps', 'app');
  const hostile = 'debug"; rm -rf / #';
  const { file, args } = buildExpoCommand(appDir, ['--variant', hostile]);

  // Executed binary is the current node, never npx/cmd.exe
  assert.equal(file, process.execPath);

  // First arg is a real file inside the expo package (bin/cli)
  assert.ok(existsSync(args[0]), `expo CLI entry should exist: ${args[0]}`);
  assert.match(args[0].replaceAll('\\', '/'), /expo\/bin\/cli$/);

  // Forwarded args are passed through verbatim as discrete argv entries —
  // no quoting, joining, or shell string is ever built from them.
  assert.deepEqual(args.slice(1), ['run:android', '--variant', hostile]);
});
