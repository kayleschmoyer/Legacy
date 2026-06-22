// Token-efficient response formatting for the nx MCP server, built on the
// shared `@legacy-sports/mcp-format` helpers (epic LS-8018 / standard LS-8019).
// The standard and rationale live in
// `.agents/skills/create/references/mcp-response-format.md`.
//
// nx responses fall into two shapes:
//   1. Flat lists of project names (nx_show_projects, nx_affected, nx_dep_graph)
//      → a compact list: a one-line minified-JSON summary (counts + any active
//      filters) followed by the bare names, one per line. Newline-delimited
//      names spend no tokens on the per-element quotes, commas, brackets, and
//      indentation a pretty-printed JSON array repeats for every project.
//   2. Single objects / nested project detail (nx_show_project, health scan,
//      command runs) → minified JSON. A table doesn't apply to nested/
//      heterogeneous data; minifying drops the structural whitespace tax.

import { minifiedJson } from '@legacy-sports/mcp-format';

/**
 * Render a flat list of project names as a compact block: a one-line
 * minified-JSON summary object (with `count` filled in from the list length)
 * followed by the bare project names, one per line.
 *
 * The summary line stays machine-parseable (counts + active filters) and the
 * names split trivially on newlines — both far cheaper than a pretty-printed
 * `{ ..., "projects": [ ... ] }` array. An empty list returns just the summary
 * line (with `count: 0`) so the caller never hands the agent a blank string.
 */
export function projectListText(
  summary: Record<string, unknown>,
  projects: readonly string[],
): string {
  const header = minifiedJson({ ...summary, count: projects.length });
  return projects.length === 0 ? header : `${header}\n${projects.join('\n')}`;
}
