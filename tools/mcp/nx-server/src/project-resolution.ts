import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runNx } from './run-command.js';

/** Cap on how many candidate names are ever surfaced in a hint. */
const MAX_SUGGESTIONS = 5;

/** Directories (relative to the repo root) that commonly hold nx projects
 * one level down from a bare directory name, e.g. "ci-server" -> "tools/mcp/ci-server". */
const CANDIDATE_ROOTS = ['tools/mcp', 'apps', 'lib', 'lambdas', 'tools'];

interface ProjectJsonShape {
  name?: unknown;
}

/**
 * Parse `nx show projects`' stdout into project names. In this repo's Nx
 * version the command prints a single JSON array line (e.g.
 * `["mcp-ci-server","shared-components",...]`), not one name per line —
 * parse that shape first, falling back to newline-per-project splitting for
 * forward/backward compatibility with Nx versions that print it that way.
 */
export function parseProjectNames(output: string): string[] {
  const trimmed = output.trim();
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.filter((p): p is string => typeof p === 'string');
    }
  } catch {
    // Not a JSON array — fall through to newline-per-project parsing.
  }
  return trimmed
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Read `<cwd>/<relativePath>/project.json`'s `name` field, if the file exists and parses. */
function readProjectJsonName(cwd: string, relativePath: string): string | null {
  const projectJsonPath = join(cwd, relativePath, 'project.json');
  if (!existsSync(projectJsonPath)) return null;
  try {
    const config = JSON.parse(
      readFileSync(projectJsonPath, 'utf-8'),
    ) as ProjectJsonShape;
    return typeof config.name === 'string' ? config.name : null;
  } catch {
    return null;
  }
}

/**
 * Fuzzy-resolve an nx project name that `nx run`/`nx show project` rejected
 * with "Cannot find project", so the tool's error message can suggest the
 * likely correct name(s) instead of returning it bare (LS-9880).
 *
 * Mirrors `resolveWorkflowId`'s zero-match fallback in ci-server's
 * `list-runs.ts` (a partial/substring match against the known-name list,
 * surfaced as a "Did you mean...?" suggestion) — same pattern, applied to nx
 * project names instead of GitHub workflow names.
 *
 * Two independent strategies, combined:
 * 1. Directory-shaped input resolution: the caller's `project` value is
 *    often actually a directory name or path (e.g. "ci-server", copied from
 *    `tools/mcp/ci-server/`) that differs from the project's declared nx
 *    name. Look for a `project.json` at that literal path, and at that
 *    basename under the repo's common project roots (tools/mcp, apps, lib,
 *    lambdas, tools), and read its real `name` field.
 * 2. Substring fuzzy match against the full list of known project names
 *    from `nx show projects`.
 */
export async function suggestProjectNames(
  projectName: string,
  cwd: string,
): Promise<string[]> {
  const suggestions = new Set<string>();

  const candidatePaths = [
    projectName,
    ...CANDIDATE_ROOTS.map((root) => `${root}/${projectName}`),
  ];
  for (const candidatePath of candidatePaths) {
    const name = readProjectJsonName(cwd, candidatePath);
    if (name && name !== projectName) suggestions.add(name);
  }

  try {
    const output = await runNx(['show', 'projects'], cwd);
    const known = parseProjectNames(output);
    const needle = projectName.toLowerCase();
    for (const name of known) {
      if (name === projectName) continue;
      const haystack = name.toLowerCase();
      if (haystack.includes(needle) || needle.includes(haystack)) {
        suggestions.add(name);
      }
    }
  } catch {
    // `nx show projects` failing shouldn't mask the original "Cannot find
    // project" error — fall back to whatever strategy 1 already found.
  }

  return [...suggestions].slice(0, MAX_SUGGESTIONS);
}

/** Matches nx's `Cannot find project '<name>'` error box title (run-one.js). */
const CANNOT_FIND_PROJECT_RE = /Cannot find project '([^']+)'/;

/**
 * When `output` contains nx's "Cannot find project" failure, resolve
 * suggestions for the unresolved name and return a hint string in the same
 * "Did you mean...?" style `ci_list_runs` uses for a zero-result workflow
 * filter. Returns `undefined` when the output doesn't match that failure, or
 * no suggestions were found.
 */
export async function buildProjectNotFoundHint(
  output: string,
  cwd: string,
): Promise<string | undefined> {
  const match = CANNOT_FIND_PROJECT_RE.exec(output);
  if (!match) return undefined;

  const suggestions = await suggestProjectNames(match[1], cwd);
  if (suggestions.length === 0) return undefined;

  const names = suggestions.map((n) => `"${n}"`).join(', ');
  return `No nx project named "${match[1]}" exists. Did you mean one of these? ${names}`;
}
