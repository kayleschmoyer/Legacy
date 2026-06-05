/**
 * Escape cmd.exe shell metacharacters in a single argument.
 *
 * When `shell: true` is used on Windows, Node.js joins all args into a single
 * string passed to `cmd.exe /d /s /c "..."`. In that context `|`, `<`, and `>`
 * are interpreted as pipe/redirect operators. Wrapping the arg in double-quotes
 * makes them literal: inside `"..."` cmd.exe does not treat `|` as a pipe.
 *
 * Note: the `^`-escape approach (`^|`) does NOT work here because cmd.exe
 * tokenizes `|` as a pipe at a higher priority than `^`-escape processing,
 * so `expo-public-env^|statsApiUrl` still splits the command into two.
 *
 * Only applied when `needsShell` is true (Windows + npm wrapper commands).
 */
export function escapeCmdShellArg(arg: string): string {
  if (/[|<>]/.test(arg)) {
    return `"${arg}"`;
  }
  return arg;
}
