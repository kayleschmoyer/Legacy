/**
 * Preload (`node --import <this file> link.mjs …`) that makes any host behave
 * like a Windows machine WITHOUT Developer Mode, so the real mklink paths in
 * scripts/modules-pool/link.mjs are exercised in CI (LS-10941, LS-11021):
 *
 *   - process.platform reports 'win32', routing ensureDirSymlink to mklink;
 *   - `cmd /c mklink /D …` fails with the exact privilege error Windows prints;
 *   - `cmd /c mklink /J …` (junction — no privilege needed) succeeds, emulated
 *     with a directory symlink; set FAKE_MKLINK_JUNCTION_FAILS=1 to make it
 *     fail too.
 *
 * Every other execFileSync call (git, etc.) passes through untouched.
 * syncBuiltinESMExports() propagates the patch to link.mjs's named ESM import.
 */
import childProcess from 'node:child_process';
import { symlinkSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

Object.defineProperty(process, 'platform', { value: 'win32' });

const realExecFileSync = childProcess.execFileSync;
childProcess.execFileSync = function fakeExecFileSync(file, args, options) {
  if (file === 'cmd' && Array.isArray(args) && args.includes('mklink')) {
    const [flag, linkPath, target] = args.slice(args.indexOf('mklink') + 1);
    if (flag === '/J' && process.env.FAKE_MKLINK_JUNCTION_FAILS !== '1') {
      symlinkSync(target, linkPath, 'junction');
      return `Junction created for ${linkPath} <<===>> ${target}\r\n`;
    }
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
