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
function patchArgsOpts(original) {
  return function (cmd, args, options, ...rest) {
    if (Array.isArray(args)) {
      return original.call(this, cmd, args, hide(options), ...rest);
    }
    if (
      args != null &&
      typeof args === 'object' &&
      typeof args !== 'function'
    ) {
      return original.call(this, cmd, hide(args), options, ...rest);
    }
    if (typeof args === 'function') {
      // (cmd, callback) — no args or options
      return original.call(this, cmd, { windowsHide: true }, args, ...rest);
    }
    return original.call(this, cmd, [], { windowsHide: true }, ...rest);
  };
}

cp.spawn = patchArgsOpts(cp.spawn);
cp.spawnSync = patchArgsOpts(cp.spawnSync);
cp.fork = patchArgsOpts(cp.fork);
cp.execFile = patchArgsOpts(cp.execFile);
cp.execFileSync = patchArgsOpts(cp.execFileSync);

// --- exec / execSync ---
// Signature: (command[, options][, callback])
const _exec = cp.exec;
cp.exec = function (cmd, options, cb) {
  if (typeof options === 'function')
    return _exec.call(this, cmd, { windowsHide: true }, options);
  return _exec.call(this, cmd, hide(options), cb);
};

const _execSync = cp.execSync;
cp.execSync = function (cmd, options) {
  return _execSync.call(this, cmd, hide(options));
};
