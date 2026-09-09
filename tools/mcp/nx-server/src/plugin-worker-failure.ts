/**
 * Detects the Nx isolated-plugin-worker IPC handshake failure (LS-9282):
 * under host/process contention (many concurrent node processes across
 * parallel worktree sessions), a plugin worker's socket connection to its
 * parent process doesn't complete within Nx's 10-second handshake window,
 * so Nx kills the worker before it registers and the whole command fails —
 * even though the underlying task itself is fine. Plugin worker isolation
 * exists for crash containment, not correctness, so retrying the identical
 * command with `NX_ISOLATE_PLUGINS=false` in the child env (skipping the
 * isolated-worker handshake entirely) is a safe fallback; this was verified
 * live to succeed on the very next attempt with no other change.
 */
export const PLUGIN_WORKER_TIMEOUT_HINT =
  'An isolated Nx plugin worker failed its IPC handshake in time, likely due to host/process contention rather than a real task failure. Retrying automatically with NX_ISOLATE_PLUGINS=false.';

/** Surfaced when the NX_ISOLATE_PLUGINS=false retry itself still fails. */
export const PLUGIN_WORKER_RETRY_EXHAUSTED_HINT =
  'Still failing after an automatic retry with NX_ISOLATE_PLUGINS=false — this is likely a genuine failure rather than the plugin-worker contention issue. If the output below still shows a plugin-worker timeout, host contention may be severe enough that even the non-isolated path is starved; consider reducing concurrent sessions/processes before retrying manually.';

const PLUGIN_WORKER_TIMEOUT_MARKERS = [
  /Plugin Worker for .* is exiting as it did not receive a load message/,
  /Failed to load \d+ default Nx plugin\(s\)/,
];

/**
 * True when the output shows the isolated-plugin-worker handshake timeout
 * signature described above.
 */
export function isPluginWorkerTimeoutFailure(output: string): boolean {
  return PLUGIN_WORKER_TIMEOUT_MARKERS.some((marker) => marker.test(output));
}
