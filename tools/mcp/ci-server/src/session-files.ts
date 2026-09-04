/**
 * Helpers for locating Claude Code session JSONL files on disk.
 *
 * This module is the canonical home of the project-slug rules (formerly
 * mirrored in the retired scripts/audit-session-bash.py — ported to
 * TypeScript in LS-8316 so MCP tools that scan transcripts never shell out
 * to Python). Parsing/classification lives in tools/audit-session-bash-parse.ts.
 *
 * Cross-platform: works on Linux/macOS (homedir path) and Windows (APPDATA path).
 */

import { homedir } from 'node:os';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';

/**
 * Result of probing one projects-directory candidate: either it resolved to
 * a readable directory, or it failed with a specific reason.
 *
 * `stat` throwing EACCES (candidate exists but this process's uid/gid can't
 * traverse it — the CCR cross-user-boundary case, LS-9538) is a materially
 * different failure than ENOENT (candidate genuinely absent) — one is
 * unrecoverable by retrying paths, the other means "wrong path". `existsSync`
 * collapses both to `false`, so probing must call `statSync` directly and
 * inspect `err.code` to tell them apart.
 */
interface ProbeResult {
  dir: string;
  ok: boolean;
  /** 'EACCES' | 'ENOENT' | other errno code | undefined when ok is true. */
  code?: string;
}

function probeDir(dir: string): ProbeResult {
  try {
    if (statSync(dir).isDirectory()) {
      return { dir, ok: true };
    }
    return { dir, ok: false, code: 'ENOTDIR' };
  } catch (err) {
    const code =
      err instanceof Error && 'code' in err
        ? String((err as NodeJS.ErrnoException).code)
        : 'UNKNOWN';
    return { dir, ok: false, code };
  }
}

/**
 * Locate the Claude Code projects directory, probing platform-appropriate
 * paths so the tool works in both local Windows sessions and Linux/macOS/cloud
 * environments.
 *
 * Search order:
 *   1. `explicit` param (caller-supplied override, e.g. a tool-call `projectsDir` arg)
 *   2. $CLAUDE_PROJECTS_DIR env-var override (useful for custom installs / tests)
 *   3. ~/.claude/projects, resolved from $HOME directly (POSIX) — falls back to
 *      the OS user-database home (via node:os homedir()) only if $HOME is unset.
 *      Some hosted/CCR server processes run with a stale or sandbox-default
 *      $HOME baked into their launch environment (e.g. /home/sbx_user1051) that
 *      no longer matches the container's actual home (e.g. /root) — preferring
 *      $HOME explicitly, plus the explicit/env-var overrides above, gives callers
 *      a way around a mismatched value (LS-8867).
 *   4. %APPDATA%\Claude\projects  (native Windows Claude Code install)
 */
export function findClaudeProjectsDir(explicit?: string): string {
  const candidates: string[] = [];

  if (explicit) {
    candidates.push(explicit);
  }

  const envOverride = process.env['CLAUDE_PROJECTS_DIR'];
  if (envOverride) {
    candidates.push(envOverride);
  }

  const homeEnv = process.env['HOME'];
  if (homeEnv) {
    candidates.push(join(homeEnv, '.claude', 'projects'));
  }
  candidates.push(join(homedir(), '.claude', 'projects'));

  const appData = process.env['APPDATA'];
  if (appData) {
    candidates.push(join(appData, 'Claude', 'projects'));
  }

  const probes: ProbeResult[] = [];
  for (const dir of candidates) {
    const probe = probeDir(dir);
    if (probe.ok) {
      return dir;
    }
    probes.push(probe);
  }

  // An explicit override that still can't be read is a distinct failure mode
  // from "nothing was configured": the caller (often a human, quoting the
  // path from their own Bash tool) has confirmed the directory exists and is
  // readable from their side. Two root causes surface identically to
  // `existsSync` (both just report "not found") but call for different next
  // steps, so probe with `statSync` and branch on the errno (LS-9538):
  //
  //   - EACCES: the directory exists but this process's uid/gid can't read
  //     it — a permission boundary, not a path problem (e.g. the MCP server
  //     runs as a sandboxed user like sbx_user1051 while the agent's Bash
  //     tool runs as root against a 0700 directory). No projectsDir value
  //     will ever fix this; retrying path variations wastes turns.
  //   - anything else (ENOENT, ENOTDIR, ...): the path genuinely isn't there
  //     from the server's point of view, which *can* be fixed by supplying a
  //     different path, or points at the cross-container/mount-namespace
  //     mismatch documented for LS-9458.
  if (explicit) {
    const explicitProbe = probes.find((p) => p.dir === explicit);
    if (explicitProbe?.code === 'EACCES') {
      throw new Error(
        `Could not find Claude projects directory. The explicit override ` +
          `"${explicit}" exists but is not readable *from the MCP server process* ` +
          `(permission denied, not not-found — the server is running as a different ` +
          `OS user than your Bash tool and lacks read access to this directory, a known ` +
          `CCR limitation, LS-9538/LS-9458). No projectsDir value can work around this; ` +
          `retrying path variations will not help. ` +
          `Fall back to a manual review of the session's Bash history for the gap audit ` +
          `(see .agents/skills/mcp-first/references/audit-workflow.md#manual-fallback-when-the-server-cannot-see-the-transcript). ` +
          `All candidates tried: ${candidates.join(', ')}`,
      );
    }
    throw new Error(
      `Could not find Claude projects directory. The explicit override ` +
        `"${explicit}" does not exist or is not readable *from the MCP server process* ` +
        `(it may be visible from your Bash tool but not from the server, if they run in ` +
        `different containers/mount namespaces — a known CCR limitation, LS-9458). ` +
        `Fall back to a manual review of the session's Bash history for the gap audit ` +
        `(see .agents/skills/mcp-first/references/audit-workflow.md#manual-fallback-when-the-server-cannot-see-the-transcript). ` +
        `All candidates tried: ${candidates.join(', ')}`,
    );
  }

  const permissionDenied = probes.filter((p) => p.code === 'EACCES');
  if (permissionDenied.length > 0) {
    throw new Error(
      `Could not find Claude projects directory. Tried: ${candidates.join(', ')}. ` +
        `Permission denied (not not-found) on: ${permissionDenied.map((p) => p.dir).join(', ')} ` +
        `— the MCP server process's OS user lacks read access to this directory, a known ` +
        `CCR limitation (LS-9538). Pass an explicit projectsDir override only if it points ` +
        `to a directory the server process itself can read; otherwise no override will help.`,
    );
  }

  throw new Error(
    `Could not find Claude projects directory. Tried: ${candidates.join(', ')}`,
  );
}

/**
 * Convert a CWD to the slug format Claude Code uses for project directories.
 *
 *   D:\code\legacy-sports                              -> D--code-legacy-sports
 *   D:\code\legacy-sports\.claude\worktrees\name       -> D--code-legacy-sports--claude-worktrees-name
 *   /home/user/foo                                     -> -home-user-foo
 *   /home/user/.claude/worktrees/name                  -> -home-user--claude-worktrees-name
 *
 * Claude Code replaces path separators and dots with '-'. On Windows the drive
 * colon produces an extra '-', giving the 'D--' prefix.
 */
export function cwdToProjectSlug(cwd: string = process.cwd()): string {
  const resolved = resolve(cwd);
  if (resolved.length >= 2 && resolved[1] === ':') {
    const drive = resolved[0];
    const rest = resolved
      .slice(2)
      .replace(/\\/g, '-')
      .replace(/\//g, '-')
      .replace(/\./g, '-')
      .replace(/^-+/, '');
    return `${drive}--${rest}`;
  }
  return resolved.replace(/[\\/]/g, '-').replace(/\./g, '-');
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
    // Defence in depth: canonicalise both paths and confirm the resolved
    // directory is still contained within projectsDir. assertSafeSlug already
    // makes traversal impossible; this guard ensures that holds even if the
    // allow-list is ever loosened, and makes the containment invariant explicit
    // at the path sink.
    const baseDir = resolve(projectsDir);
    const resolvedDir = resolve(safeDir);
    if (resolvedDir !== baseDir && !resolvedDir.startsWith(baseDir + sep)) {
      throw new Error(
        `Resolved project path escapes the projects directory: ${JSON.stringify(resolvedDir)}`,
      );
    }
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
  // Fallback: scan all sibling directories whose name starts with the same
  // prefix and pick the one with the most recently modified JSONL file.
  // This avoids the old alphabetical tie-break that always returned the main
  // project dir instead of the active worktree session directory.
  const prefix = slug.slice(0, 10);
  let bestMtime = -1;
  let bestEntry: string | null = null;
  for (const entry of readdirSync(projectsDir)) {
    if (!entry.startsWith(prefix)) continue;
    const entryDir = join(projectsDir, entry);
    let entryStat;
    try {
      entryStat = statSync(entryDir);
    } catch {
      continue;
    }
    if (!entryStat.isDirectory()) continue;
    // Find the most recently modified JSONL in this candidate directory.
    let maxMtime = -1;
    try {
      for (const f of readdirSync(entryDir)) {
        if (!f.endsWith('.jsonl')) continue;
        try {
          const mtime = statSync(join(entryDir, f)).mtimeMs;
          if (mtime > maxMtime) maxMtime = mtime;
        } catch {
          // skip unreadable files
        }
      }
    } catch {
      continue;
    }
    if (maxMtime > bestMtime) {
      bestMtime = maxMtime;
      bestEntry = entry;
    }
  }
  if (bestEntry) return bestEntry;
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
