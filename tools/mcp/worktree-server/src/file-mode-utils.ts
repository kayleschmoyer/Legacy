// ---------------------------------------------------------------------------
// Pure helpers for the worktree_file_mode and worktree_set_executable tools.
//
// Extracted from the request handlers in index.ts so path validation, output
// parsing, and result-shaping logic can be unit-tested without spawning git.
// ---------------------------------------------------------------------------

import { minifiedJson } from '@legacy-sports/mcp-format';
import { isAbsolute } from 'node:path';
import { pathModuleFor } from './path-platform-utils';

/** MCP tool response envelope (subset used by these tools). */
export interface ToolResponse {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
  [key: string]: unknown;
}

/** Arguments accepted by the worktree_file_mode tool. */
export interface FileModeArgs {
  paths: string[];
  worktree?: string;
}

/** Arguments accepted by the worktree_set_executable tool. */
export interface SetExecutableArgs {
  path: string;
  executable: boolean;
  worktree?: string;
}

/**
 * Collaborators the handlers need from index.ts. Injected so the handler flow
 * (target resolution, git execution, error shaping) can be unit-tested without
 * spawning git or touching the filesystem.
 */
export interface FileModeDeps {
  resolveTargetDir: (
    worktreeKey?: string,
  ) => { path: string } | { error: string };
  runGit: (args: string[], cwd: string, opts?: { timeout?: number }) => string;
}

/** A single path's tracked-mode result. */
export interface FileModeResult {
  path: string;
  tracked: boolean;
  mode?: string;
  executable: boolean;
}

/**
 * Validate a batch of user-supplied relative paths: non-empty strings, no
 * control characters, no leading '-' (would be parsed as a git flag), no
 * absolute paths, and no '..' segments that could escape the worktree root
 * (checked both lexically and, once resolved against `cwd`, physically —
 * catching symlink-induced escapes or OS-specific normalisation quirks).
 * Mirrors the validation already used by worktree_is_tracked.
 *
 * Returns an error string, or null if every path is valid.
 */
export function validateTrackedPaths(
  paths: unknown,
  cwd: string,
): string | null {
  if (!Array.isArray(paths) || paths.length === 0) {
    return '`paths` must be a non-empty array of strings.';
  }
  if (paths.length > 100) {
    return `Too many paths: ${paths.length}. Max 100 per call.`;
  }
  for (const p of paths) {
    if (typeof p !== 'string' || !p || /[\r\n\0]/.test(p)) {
      return `Invalid path: ${JSON.stringify(p)}`;
    }
    if (p.startsWith('-')) {
      return `Invalid path: "${p}". Paths must not start with '-'.`;
    }
    if (isAbsolute(p)) {
      return `Invalid path: "${p}". Paths must be relative to the worktree root (no absolute paths).`;
    }
    const pNorm = p.replace(/\\/g, '/');
    if (
      pNorm.split('/').some((seg) => seg === '..') ||
      pNorm.startsWith('../')
    ) {
      return `Invalid path: "${p}". Paths must not escape the worktree root (no '..' segments).`;
    }
    // `cwd` may be a POSIX-style path (e.g. a test fixture) even when this
    // process runs on Windows, so pick the path module by `cwd`'s shape
    // rather than the host OS — otherwise `resolve`/`sep` mismatch it and
    // every path is wrongly flagged as escaping the worktree root.
    const pathModule = pathModuleFor(cwd);
    const resolved = pathModule.resolve(cwd, pNorm);
    if (!resolved.startsWith(cwd + pathModule.sep) && resolved !== cwd) {
      return `Invalid path: "${p}". Path escapes worktree root.`;
    }
  }
  return null;
}

/** Normalize a path for map lookups: backslashes to forward slashes, strip leading './'. */
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Parse `git ls-files -s` output into a map of normalized path -> mode.
 *
 * Each line has the form `<mode> <sha> <stage>\t<path>`; untracked paths
 * produce no line at all.
 */
export function parseLsFilesModeOutput(output: string): Map<string, string> {
  const modeByPath = new Map<string, string>();
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const tabIdx = trimmed.indexOf('\t');
    if (tabIdx === -1) continue;
    const fields = trimmed.slice(0, tabIdx).split(/\s+/);
    const mode = fields[0];
    const filePath = trimmed.slice(tabIdx + 1);
    modeByPath.set(normalizePath(filePath), mode);
  }
  return modeByPath;
}

/**
 * Execute the worktree_file_mode tool: resolve the target worktree, validate
 * paths, run `git ls-files -s`, and shape the per-path tracked/mode/executable
 * result (or error) into an MCP tool response.
 */
export function executeWorktreeFileMode(
  args: FileModeArgs,
  deps: FileModeDeps,
): ToolResponse {
  const { paths, worktree: wtKey } = args;

  const target = deps.resolveTargetDir(wtKey);
  if ('error' in target) {
    return { content: [{ type: 'text', text: target.error }], isError: true };
  }
  const cwd = target.path;

  const validationError = validateTrackedPaths(paths, cwd);
  if (validationError) {
    return {
      content: [{ type: 'text', text: validationError }],
      isError: true,
    };
  }

  const normalizedPaths = paths.map((p) => normalizePath(p));
  let modeByPath: Map<string, string>;
  try {
    const output = deps.runGit(
      ['ls-files', '-s', '--', ...normalizedPaths],
      cwd,
      { timeout: 15_000 },
    );
    modeByPath = parseLsFilesModeOutput(output);
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    return {
      content: [
        {
          type: 'text',
          text: `git ls-files -s failed: ${(e.stderr || e.message || String(err)).trim()}`,
        },
      ],
      isError: true,
    };
  }

  const results: FileModeResult[] = paths.map((p) => {
    const mode = modeByPath.get(normalizePath(p));
    return {
      path: p,
      tracked: mode !== undefined,
      mode,
      executable: mode === '100755',
    };
  });

  return {
    content: [{ type: 'text', text: minifiedJson({ results }) }],
  };
}

/**
 * Execute the worktree_set_executable tool: resolve the target worktree,
 * validate the path, run `git update-index --chmod=+x|-x`, then read back the
 * resulting mode for confirmation.
 */
export function executeWorktreeSetExecutable(
  args: SetExecutableArgs,
  deps: FileModeDeps,
): ToolResponse {
  const { path: filePath, executable, worktree: wtKey } = args;

  if (typeof executable !== 'boolean') {
    return {
      content: [{ type: 'text', text: '`executable` must be a boolean.' }],
      isError: true,
    };
  }

  const target = deps.resolveTargetDir(wtKey);
  if ('error' in target) {
    return { content: [{ type: 'text', text: target.error }], isError: true };
  }
  const cwd = target.path;

  const validationError = validateTrackedPaths([filePath], cwd);
  if (validationError) {
    return {
      content: [{ type: 'text', text: validationError }],
      isError: true,
    };
  }

  const normalizedPath = normalizePath(filePath);
  try {
    deps.runGit(
      [
        'update-index',
        executable ? '--chmod=+x' : '--chmod=-x',
        '--',
        normalizedPath,
      ],
      cwd,
      { timeout: 15_000 },
    );
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    return {
      content: [
        {
          type: 'text',
          text: `git update-index --chmod failed: ${(e.stderr || e.message || String(err)).trim()}`,
        },
      ],
      isError: true,
    };
  }

  let mode: string | undefined;
  try {
    const output = deps.runGit(['ls-files', '-s', '--', normalizedPath], cwd, {
      timeout: 15_000,
    });
    const trimmed = output.split('\n')[0]?.trim();
    if (trimmed) {
      mode = trimmed.split(/\s+/)[0];
    }
  } catch {
    // best effort — the chmod already succeeded above.
  }

  return {
    content: [
      {
        type: 'text',
        text: minifiedJson({ path: filePath, executable, mode }),
      },
    ],
  };
}
