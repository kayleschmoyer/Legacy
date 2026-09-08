// ---------------------------------------------------------------------------
// Platform-aware path module selection.
//
// `node:path`'s default export is bound to the host OS at process start, so
// `resolve`/`sep`/`dirname` behave differently depending on whether the
// *process* runs on POSIX or Windows — not on the *shape* of the path string
// being operated on. That mismatch is harmless for real absolute cwds (which
// always match the host OS), but it breaks any code path that compares a
// resolved path against a POSIX-style literal (e.g. a test fixture like
// `/wt`) while running on a Windows host: `path.resolve('/wt', 'foo')` on
// Windows resolves `/wt` as drive-relative rather than as a POSIX root,
// producing something like `C:\wt\foo` that no longer starts with `/wt`.
//
// Selecting the path module by inspecting the string itself keeps behavior
// deterministic regardless of host OS, for both POSIX-style and Windows-style
// absolute paths.
// ---------------------------------------------------------------------------

import { type PlatformPath, posix, win32 } from 'node:path';

const WINDOWS_ABSOLUTE_RE = /^[A-Za-z]:[\\/]|^\\\\/;

/** Returns the `path.win32` or `path.posix` module matching the shape of `p`. */
export function pathModuleFor(p: string): PlatformPath {
  return WINDOWS_ABSOLUTE_RE.test(p) ? win32 : posix;
}
