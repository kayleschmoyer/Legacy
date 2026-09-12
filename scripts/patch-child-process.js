/**
 * Monkey-patch child_process to always use windowsHide on Windows.
 * Prevents console windows from spawning when Nx runs tasks.
 *
 * Load via NODE_OPTIONS: --require ./scripts/patch-child-process.js
 *
 * Patches: spawn, spawnSync, fork, exec, execSync, execFile, execFileSync
 * Nx uses fork() for all task execution (forked-process-task-runner),
 * spawn() for daemon/cache, and exec/execSync for formatting/utilities.
 *
 * Why a monkey-patch?
 * Nx hardcodes windowsHide: false in several places (running-tasks.js,
 * exec.js, run.js, nx.js). A custom executor can't cover all of them,
 * but patching child_process at the module level catches every call
 * regardless of which Nx code path spawns the process.
 *
 * Environment propagation:
 * - Makefile exports NODE_OPTIONS with an absolute path (Windows only)
 * - nx.json tasksRunnerOptions.env passes it to forked task workers
 * - .env provides a fallback for non-Makefile contexts
 */

// Suppress MaxListenersExceededWarning: Nx spawns many forked workers, each
// inheriting this --require and adding listeners. Setting a higher default
// avoids noisy warnings. Done here (not via NODE_OPTIONS --max-listeners)
// because --max-listeners is not a valid Node.js CLI flag.
require('events').setMaxListeners(20);

// No-op on non-Windows — the file is still --required but exits immediately.
// Uses top-level return which is valid in CommonJS modules loaded via --require.
if (process.platform !== 'win32') return;

const cp = require('child_process');
const { promisify } = require('util');

// Ensure an options object exists and has windowsHide: true.
// Mutates in place so callers like Nx that inspect the object after
// passing it to exec() will see the overridden value.
function hide(opts) {
  if (!opts) return { windowsHide: true };
  opts.windowsHide = true;
  return opts;
}

// --- spawn / spawnSync / fork / execFile / execFileSync ---
// All share the Node.js signature: (command/file[, args][, options][, callback?])
// The second argument is ambiguous — Array means args, Object means options.
// We detect which form the caller used and inject windowsHide into the
// correct position so the original function's argument parsing is preserved.

// Return a copy of `rest` (the arguments after the command) with windowsHide
// injected into the options slot at `optIndex`, forwarding exactly what the
// caller passed. Never pads with a trailing `undefined`: Node's
// util.promisify.custom implementations for exec/execFile append their own
// callback after the forwarded arguments, so a padded slot shifts that callback
// out of position and the returned promise never settles (LS-10120).
function injectHiddenOptions(rest, optIndex) {
  const out = rest.slice();
  if (optIndex >= out.length) {
    out.push({ windowsHide: true });
    return out;
  }
  const opt = out[optIndex];
  if (typeof opt === 'function') {
    // A callback sits where options would go — insert options before it.
    out.splice(optIndex, 0, { windowsHide: true });
  } else if (opt == null) {
    out[optIndex] = { windowsHide: true };
  } else if (typeof opt === 'object') {
    out[optIndex] = hide(opt);
  }
  // Any other value is invalid input — leave it for Node's own validation.
  return out;
}

function patchArgsOpts(original) {
  const patched = function (cmd, ...rest) {
    // (cmd, args, ...) or (cmd, null/undefined, options, ...) → options at 1.
    const hasArgsSlot =
      Array.isArray(rest[0]) || (rest[0] == null && rest.length > 1);
    return original.call(
      this,
      cmd,
      ...injectHiddenOptions(rest, hasArgsSlot ? 1 : 0),
    );
  };
  preservePromisifyCustom(original, patched, patchArgsOpts);
  return patched;
}

// execFile and exec carry a util.promisify.custom implementation that resolves
// { stdout, stderr }. A bare wrapper drops it, so util.promisify(execFile)
// would fall back to resolving only the first callback value (the stdout
// string) — breaking every `const { stdout } = await execFileAsync(...)` that
// runs under a Makefile target on Windows (LS-10120). Re-attach a patched copy.
function preservePromisifyCustom(original, patched, patchFn) {
  const custom = original[promisify.custom];
  if (typeof custom !== 'function') return;
  Object.defineProperty(patched, promisify.custom, {
    value: patchFn(custom),
    enumerable: false,
    writable: false,
    configurable: true,
  });
}

cp.spawn = patchArgsOpts(cp.spawn);
cp.spawnSync = patchArgsOpts(cp.spawnSync);
cp.fork = patchArgsOpts(cp.fork);
cp.execFile = patchArgsOpts(cp.execFile);
cp.execFileSync = patchArgsOpts(cp.execFileSync);

// --- exec / execSync ---
// Signature: (command[, options][, callback])
function patchExec(original) {
  const patched = function (cmd, ...rest) {
    return original.call(this, cmd, ...injectHiddenOptions(rest, 0));
  };
  preservePromisifyCustom(original, patched, patchExec);
  return patched;
}
cp.exec = patchExec(cp.exec);

const _execSync = cp.execSync;
cp.execSync = function (cmd, options) {
  return _execSync.call(this, cmd, hide(options));
};
