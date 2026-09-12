// Built from String.fromCharCode rather than a \x1b regex literal: a literal
// ESC control character trips no-control-regex even though it is the exact,
// intentional byte jest/nx emit for these escape sequences.
const ESC = String.fromCharCode(27);

/**
 * Matches ANSI CSI escape sequences — colour/style codes (ending in `m`, e.g.
 * `\x1b[31m`) and the cursor-movement sequences progress renderers emit
 * (ending in another letter, e.g. `\x1b[2K`). Broader than an SGR-only
 * `[0-9;]*m` match so both classes are stripped.
 */
const ANSI_ESCAPE_SEQUENCE = new RegExp(`${ESC}\\[[0-9;]*[A-Za-z]`, 'g');

/**
 * Strip ANSI escape sequences from command output (LS-10092).
 *
 * Nx and Jest colourise heavily: escape codes routinely add 40-80% to a
 * line's character length, which both spends the MAX_OUTPUT_CHARS budget on
 * non-content bytes (so genuine failure text gets truncated away sooner) and
 * breaks literal pattern matching on the text that does survive — the codes
 * sit between semantically adjacent characters, e.g. splitting
 * "● FootballLeagueId" into "●" + escapes + "FootballLeagueId". That matters
 * here beyond readability: `isDaemonFailure`, `isPluginWorkerTimeoutFailure`
 * and `buildProjectNotFoundHint` all regex the raw log.
 *
 * Ported from `tools/mcp/ci-server/src/logs.ts` (LS-9557), which fixed the
 * identical problem for `ci_get_logs`. Kept in sync manually: the two MCP
 * servers are separate packages with no shared dependency between them, the
 * same convention `truncate-output.ts`'s prettier line regex documents
 * (LS-8423).
 */
export function stripAnsiCodes(text: string): string {
  return text.replace(ANSI_ESCAPE_SEQUENCE, '');
}
