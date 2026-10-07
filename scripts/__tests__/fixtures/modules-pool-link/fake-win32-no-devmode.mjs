/**
 * Preload (`node --import <this file> link.mjs …`) that makes any host behave
 * like a Windows machine WITHOUT Developer Mode, so the real mklink-failure
 * path in scripts/modules-pool/link.mjs is exercised in CI (LS-10941):
 *
 *   - process.platform reports 'win32', routing ensureDirSymlink to mklink;
 *   - `cmd /c mklink …` fails with the exact privilege error Windows prints.
 *
 * Every other execFileSync call (git, etc.) passes through untouched.
 * syncBuiltinESMExports() propagates the patch to link.mjs's named ESM import.
 */
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

Object.defineProperty(process, 'platform', { value: 'win32' });

const realExecFileSync = childProcess.execFileSync;
childProcess.execFileSync = function fakeExecFileSync(file, args, options) {
  if (file === 'cmd' && Array.isArray(args) && args.includes('mklink')) {
    const err = new Error(
      `Command failed: cmd ${args.join(' ')}\n` +
        'You do not have sufficient privilege to perform this operation.\r\n',
    );
    err.status = 1;
    throw err;
  }
  return realExecFileSync.call(this, file, args, options);
};
syncBuiltinESMExports();
