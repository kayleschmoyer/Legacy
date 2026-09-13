/**
 * Quote a single `--` passthrough arg so it survives being joined into a
 * shell command string and re-split by the shell.
 *
 * Nx's `nx:run-script` executor does exactly that: it builds the child
 * command as `pm.run(script, options.__unparsed__.join(' '))` and spawns it
 * with `shell: true` (node_modules/nx/dist/src/executors/run-script/
 * run-script.impl.js). Every argv boundary inside a value is lost, so a
 * multi-word `--testNamePattern "keeper entitlement gate"` re-splits into
 * four shell words: Jest reads `keeper` as the name pattern and takes the
 * bare `entitlement` / `gate` positionals as *additional* test path
 * patterns, silently widening the suite (LS-10153).
 *
 * The other two executors nx_run_test can land on need no help and must NOT
 * be pre-quoted — the quote characters would end up inside the Jest regex:
 * `@nx/jest:jest` receives the argv array untouched, and `nx:run-commands`
 * already wraps each fragment itself via its own
 * `wrapArgIntoQuotesIfNeeded`. Hence this is applied only for run-script
 * targets (see `targetShellJoinsArgs` in tools/resolve-test-target.ts).
 *
 * Quoting style is platform-specific because the shell differs: `shell: true`
 * runs `/bin/sh -c` on POSIX and `cmd.exe /d /s /c` on Windows, where single
 * quotes are not quoting characters at all.
 */
export function quoteForShellJoin(arg: string): string {
  // Only whitespace splits a shell word here. Regex metacharacters common in
  // Jest patterns (`|`, `(`, `)`) are left alone deliberately: quoting them
  // unconditionally would change nothing for the split and only widen the
  // set of values whose quoting has to round-trip.
  if (!/\s/.test(arg)) return arg;

  if (process.platform === 'win32') {
    // The quotes have to survive one more layer than on POSIX. `pnpmJobSpec`
    // maps `escapeCmdShellArg` over every arg of the outer `pnpm exec nx`
    // invocation, and that wraps anything containing whitespace in double
    // quotes — so a bare `"value"` here would arrive as `""value""`, whose
    // leading `""` the CRT reads as an empty quoted section, splitting the
    // value apart again. Backslash-escaping makes the inner pair literal:
    // `"\"value\""` unwraps to `"value"`, which is what nx's joined command
    // string needs for cmd.exe to keep it one word.
    return `\\"${arg}\\"`;
  }
  // POSIX single quotes make everything literal; the only character that
  // cannot appear inside them is `'` itself, spliced in as `'\''`.
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}
