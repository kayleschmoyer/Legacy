import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** True when the error is a spawn-time ENOENT (the lookup binary isn't installed). */
function isEnoent(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'ENOENT'
  );
}

function parsePidList(stdout: string): number[] {
  return Array.from(
    new Set(
      stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  );
}

/** Windows: parse `netstat -ano` for LISTENING rows matching the port's local address. */
async function findPidsOnPortWindows(port: number): Promise<number[]> {
  const { stdout } = await execFileAsync('netstat', ['-ano']);
  const pids = new Set<number>();
  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('TCP') || !/LISTENING/i.test(line)) continue;
    const parts = line.split(/\s+/);
    const localAddress = parts[1] ?? '';
    const portMatch = /:(\d+)$/.exec(localAddress);
    if (!portMatch || Number(portMatch[1]) !== port) continue;
    const pid = Number(parts[parts.length - 1]);
    if (Number.isFinite(pid) && pid > 0) pids.add(pid);
  }
  return Array.from(pids);
}

/** Linux/macOS fallback when `lsof` isn't installed: parse `ss -ltnp`. */
async function findPidsOnPortWithSs(port: number): Promise<number[]> {
  const { stdout } = await execFileAsync('ss', ['-ltnp']);
  const pids = new Set<number>();
  for (const line of stdout.split('\n')) {
    if (!new RegExp(`[:.]${port}\\s`).test(line)) continue;
    for (const match of line.matchAll(/pid=(\d+)/g)) {
      pids.add(Number(match[1]));
    }
  }
  return Array.from(pids);
}

/** Linux/macOS: `lsof -t -i:<port> -sTCP:LISTEN` lists just the PIDs, one per line. */
async function findPidsOnPortPosix(port: number): Promise<number[]> {
  try {
    const { stdout } = await execFileAsync('lsof', [
      '-t',
      `-i:${port}`,
      '-sTCP:LISTEN',
    ]);
    return parsePidList(stdout);
  } catch (err) {
    if (isEnoent(err)) return findPidsOnPortWithSs(port);
    // lsof exits non-zero with empty stdout when nothing matches the port —
    // that is "no listener", not a failure.
    return [];
  }
}

/** Look up the PID(s) LISTENing on a TCP port, cross-platform. */
export async function findPidsOnPort(port: number): Promise<number[]> {
  return process.platform === 'win32'
    ? findPidsOnPortWindows(port)
    : findPidsOnPortPosix(port);
}

/**
 * Kill an arbitrary PID at the OS level. Unlike `browser_dev_stop`'s
 * killProcess, this PID was not necessarily spawned by this MCP session (it
 * may be a stale process left over from an earlier, unrelated invocation), so
 * there is no process group to target on POSIX — SIGTERM the PID directly,
 * then SIGKILL if it's still alive after a short grace period.
 */
export async function killPidByOs(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    // shell: true intentional: `pid` is always a validated positive integer
    // (see findPidsOnPort's parsing), never raw/untrusted input, so there is
    // no shell-injection surface here — mirrors browser_dev_stop's own
    // killProcess, which uses the same pattern for its own tracked PIDs.
    await execFileAsync('taskkill', ['/pid', String(pid), '/t', '/f'], {
      shell: true,
    }).catch(() => {
      // Ignore — process may already be dead.
    });
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return; // Already dead.
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  try {
    process.kill(pid, 0); // Throws if the process is gone.
    process.kill(pid, 'SIGKILL');
  } catch {
    // Already exited.
  }
}
