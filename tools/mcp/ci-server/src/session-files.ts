/**
 * Helpers for locating Claude Code session JSONL files on disk.
 *
 * Mirrors the logic in scripts/audit-session-bash.py — see that file for the
 * canonical project-slug rules. Kept in TypeScript so MCP tools that need to
 * scan transcripts can do so without shelling out to Python.
 */

import { homedir } from 'node:os';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

/** Locate the ~/.claude/projects directory; throws if it does not exist. */
export function findClaudeProjectsDir(): string {
  const dir = join(homedir(), '.claude', 'projects');
  if (!existsSync(dir)) {
    throw new Error(`Could not find Claude projects directory: ${dir}`);
  }
  return dir;
}

/**
 * Convert a CWD to the slug format Claude Code uses for project directories.
 *
 *   D:\code\legacy-sports  -> D--code-legacy-sports
 *   /home/user/foo         -> -home-user-foo
 */
export function cwdToProjectSlug(cwd: string = process.cwd()): string {
  const resolved = resolve(cwd);
  if (resolved.length >= 2 && resolved[1] === ':') {
    const drive = resolved[0];
    const rest = resolved
      .slice(2)
      .replace(/\\/g, '-')
      .replace(/\//g, '-')
      .replace(/^-+/, '');
    return `${drive}--${rest}`;
  }
  return resolved.replace(/[\\/]/g, '-');
}

/**
 * Strict allow-list for project slug basenames. Claude Code slugs are
 * composed of letters, digits, dashes, underscores, and dots — nothing else.
 * Rejecting anything outside this set (and in particular `..`, `/`, `\`)
 * prevents caller-supplied values from escaping the projects directory.
 */
const SAFE_SLUG_RE = /^[A-Za-z0-9._-]+$/;

function assertSafeSlug(slug: string): string {
  if (!slug || slug === '.' || slug === '..') {
    throw new Error(`Invalid project slug: ${JSON.stringify(slug)}`);
  }
  if (slug.includes('/') || slug.includes('\\') || slug.includes('..')) {
    throw new Error(
      `Invalid project slug (must not contain path separators or ".."): ${JSON.stringify(slug)}`,
    );
  }
  if (!SAFE_SLUG_RE.test(slug)) {
    throw new Error(
      `Invalid project slug (must match /^[A-Za-z0-9._-]+$/): ${JSON.stringify(slug)}`,
    );
  }
  return slug;
}

/**
 * Resolve a project slug, falling back to a partial-name match against
 * directories under ~/.claude/projects/.
 *
 * When `explicit` is provided it is validated against a strict allow-list
 * (letters, digits, dots, dashes, underscores — no path separators, no `..`)
 * and reduced to its basename before being used, so caller input can never
 * escape the projects directory.
 */
export function resolveProjectSlug(
  projectsDir: string,
  explicit?: string,
): string {
  if (explicit) {
    // basename() strips any directory components a caller may have slipped
    // in (e.g. "../foo" -> "foo"), and the strict regex rejects the rest.
    const safe = assertSafeSlug(basename(explicit));
    const safeDir = join(projectsDir, safe);
    if (!existsSync(safeDir) || !statSync(safeDir).isDirectory()) {
      throw new Error(
        `Project directory for slug "${safe}" does not exist under ${projectsDir}`,
      );
    }
    return safe;
  }
  const slug = cwdToProjectSlug();
  const slugDir = join(projectsDir, slug);
  if (existsSync(slugDir) && statSync(slugDir).isDirectory()) {
    return slug;
  }
  // Fallback: match on the first ten characters of the slug
  const prefix = slug.slice(0, 10);
  for (const entry of readdirSync(projectsDir).sort()) {
    const entryDir = join(projectsDir, entry);
    if (entry.startsWith(prefix) && statSync(entryDir).isDirectory()) {
      return entry;
    }
  }
  throw new Error(
    `Could not find project directory for CWD ${process.cwd()} (expected slug "${slug}")`,
  );
}

export interface SessionJsonl {
  /** Session UUID (filename without extension). */
  sessionId: string;
  /** Absolute path to the JSONL file. */
  jsonlPath: string;
  /** True for files under <sessionId>/subagents/, false for parent sessions. */
  isSubagent: boolean;
  /** Last modified time as an ISO 8601 string. */
  lastModified: string;
}

/**
 * Enumerate all parent + subagent JSONL files under a project directory.
 * Subagent files live in `<projectDir>/<sessionId>/subagents/*.jsonl`.
 */
export function listSessionJsonls(
  projectDir: string,
  options: { includeSubagents?: boolean } = {},
): SessionJsonl[] {
  const includeSubagents = options.includeSubagents ?? true;
  const out: SessionJsonl[] = [];

  if (!existsSync(projectDir)) {
    return out;
  }
  let projectStat;
  try {
    projectStat = statSync(projectDir);
  } catch {
    return out;
  }
  if (!projectStat.isDirectory()) {
    return out;
  }

  for (const entry of readdirSync(projectDir)) {
    const entryPath = join(projectDir, entry);
    let stat;
    try {
      stat = statSync(entryPath);
    } catch {
      continue;
    }

    if (stat.isFile() && entry.endsWith('.jsonl')) {
      out.push({
        sessionId: entry.replace(/\.jsonl$/, ''),
        jsonlPath: entryPath,
        isSubagent: false,
        lastModified: stat.mtime.toISOString(),
      });
      continue;
    }

    if (includeSubagents && stat.isDirectory()) {
      const subagentDir = join(entryPath, 'subagents');
      if (!existsSync(subagentDir)) {
        continue;
      }
      let subagentDirStat;
      try {
        subagentDirStat = statSync(subagentDir);
      } catch {
        continue;
      }
      if (!subagentDirStat.isDirectory()) {
        continue;
      }
      for (const sa of readdirSync(subagentDir)) {
        if (!sa.endsWith('.jsonl')) continue;
        const saPath = join(subagentDir, sa);
        let saStat;
        try {
          saStat = statSync(saPath);
        } catch {
          continue;
        }
        out.push({
          sessionId: sa.replace(/\.jsonl$/, ''),
          jsonlPath: saPath,
          isSubagent: true,
          lastModified: saStat.mtime.toISOString(),
        });
      }
    }
  }

  return out;
}
