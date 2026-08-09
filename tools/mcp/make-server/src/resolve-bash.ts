import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

let cachedBashExecutable: string | undefined;

/**
 * Resolve a working `bash` executable on Windows.
 *
 * `execFile('bash', ..., { shell: true })` spawns via `cmd.exe /c bash …`,
 * whose PATH does not reliably include Git for Windows' `bin/` directory
 * (unlike an interactive Git Bash shell), so plain `bash` fails to resolve
 * with "'bash' is not recognized" even when Git Bash is installed (LS-9021).
 * Same Git-Bash-candidate search as `worktree_run`'s `resolveWindowsShell`
 * (tools/mcp/worktree-server/src/index.ts).
 *
 * No-op on non-Windows platforms, where `bash` resolves normally via PATH.
 */
export function resolveBashExecutable(): string {
  if (process.platform !== 'win32') return 'bash';
  if (cachedBashExecutable !== undefined) return cachedBashExecutable;

  const programFiles = process.env['ProgramFiles'];
  const programFilesX86 = process.env['ProgramFiles(x86)'];
  const localAppData = process.env['LOCALAPPDATA'];

  const gitBashCandidates: string[] = [
    ...(programFiles ? [join(programFiles, 'Git', 'bin', 'bash.exe')] : []),
    ...(programFilesX86
      ? [join(programFilesX86, 'Git', 'bin', 'bash.exe')]
      : []),
    ...(localAppData
      ? [join(localAppData, 'Programs', 'Git', 'bin', 'bash.exe')]
      : []),
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  ];

  for (const candidate of gitBashCandidates) {
    if (existsSync(candidate)) return (cachedBashExecutable = candidate);
  }

  // Fallback: locate bash.exe on PATH via where.exe, skipping the WSL
  // launcher (C:\Windows\System32\bash.exe), which doesn't accept Windows
  // paths the way Git Bash does.
  try {
    const whereOutput = execSync('where bash', {
      encoding: 'utf-8',
      timeout: 3_000,
      windowsHide: true,
    });
    const lines = whereOutput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    for (const line of lines) {
      if (line.toLowerCase().includes('\\windows\\system32\\bash.exe')) {
        continue;
      }
      if (existsSync(line)) return (cachedBashExecutable = line);
    }
  } catch {
    // Ignore and fall through to the last-resort default below.
  }

  // Last resort: keep the bare command so the original PATH-based error
  // surfaces if no Git Bash install can be found.
  return (cachedBashExecutable = 'bash');
}

/** Test-only: clear the memoized executable path between platform scenarios. */
export function __resetBashExecutableCacheForTests(): void {
  cachedBashExecutable = undefined;
}
