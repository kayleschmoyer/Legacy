// ---------------------------------------------------------------------------
// Pure helpers for the worktree_mv tool.
//
// Extracted from the request handler in index.ts so path validation and
// result-shaping logic can be unit-tested without spawning git.
// ---------------------------------------------------------------------------

import { minifiedJson } from '@legacy-sports/mcp-format';
import { validateTrackedPaths } from './file-mode-utils';
import { pathModuleFor } from './path-platform-utils';

/** MCP tool response envelope (subset used by this tool). */
export interface ToolResponse {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
  [key: string]: unknown;
}

/** A single move/rename pair. */
export interface MoveEntry {
  from: string;
  to: string;
}

/** Arguments accepted by the worktree_mv tool. */
export interface MvArgs {
  moves: MoveEntry[];
  worktree?: string;
}

/**
 * Collaborators the handler needs from index.ts. Injected so the handler flow
 * (target resolution, directory creation, git execution) can be unit-tested
 * without spawning git or touching the filesystem.
 */
export interface MvDeps {
  resolveTargetDir: (
    worktreeKey?: string,
  ) => { path: string } | { error: string };
  runGit: (args: string[], cwd: string, opts?: { timeout?: number }) => string;
  mkdirSync: (path: string, opts?: { recursive?: boolean }) => unknown;
}

/** Result of a single move: the git status code it registered as (e.g. R100). */
export interface MvResult {
  from: string;
  to: string;
  status: string;
}

const MAX_MOVES = 50;

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Execute the worktree_mv tool: resolve the target worktree, validate every
 * from/to path, then run `git mv` per pair (creating the destination's parent
 * directory first, since git mv does not). Reads back `git diff --cached
 * --name-status` for each destination so the caller can confirm the move
 * registered as a rename (R) rather than a delete+add pair.
 *
 * Stops at the first failing pair and reports which pairs already succeeded,
 * rather than attempting to roll back completed moves.
 */
export function executeWorktreeMv(args: MvArgs, deps: MvDeps): ToolResponse {
  const { moves, worktree: wtKey } = args;

  if (!Array.isArray(moves) || moves.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: '`moves` must be a non-empty array of { from, to } pairs.',
        },
      ],
      isError: true,
    };
  }
  if (moves.length > MAX_MOVES) {
    return {
      content: [
        {
          type: 'text',
          text: `Too many moves: ${moves.length}. Max ${MAX_MOVES} per call.`,
        },
      ],
      isError: true,
    };
  }
  for (const m of moves) {
    if (!m || typeof m.from !== 'string' || typeof m.to !== 'string') {
      return {
        content: [
          {
            type: 'text',
            text: `Invalid move entry: ${JSON.stringify(m)}. Each entry needs a string "from" and "to".`,
          },
        ],
        isError: true,
      };
    }
  }

  const target = deps.resolveTargetDir(wtKey);
  if ('error' in target) {
    return { content: [{ type: 'text', text: target.error }], isError: true };
  }
  const cwd = target.path;

  const allPaths = moves.flatMap((m) => [m.from, m.to]);
  const validationError = validateTrackedPaths(allPaths, cwd);
  if (validationError) {
    return {
      content: [{ type: 'text', text: validationError }],
      isError: true,
    };
  }

  const results: MvResult[] = [];
  for (const { from, to } of moves) {
    const fromNorm = normalizePath(from);
    const toNorm = normalizePath(to);

    try {
      // Pick the path module by `cwd`'s shape (see path-platform-utils) so
      // this matches the destination directory `validateTrackedPaths` above
      // already validated against, regardless of host OS.
      const pathModule = pathModuleFor(cwd);
      deps.mkdirSync(pathModule.dirname(pathModule.resolve(cwd, toNorm)), {
        recursive: true,
      });
      deps.runGit(['mv', '--', fromNorm, toNorm], cwd, { timeout: 15_000 });
    } catch (err: unknown) {
      const e = err as { stderr?: string; message?: string };
      const reason = (e.stderr || e.message || String(err)).trim();
      const progress = results.length
        ? ` Completed before this failure: ${JSON.stringify(results)}.`
        : '';
      return {
        content: [
          {
            type: 'text',
            text: `git mv "${from}" -> "${to}" failed: ${reason}.${progress}`,
          },
        ],
        isError: true,
      };
    }

    let status = 'R100';
    try {
      const diffOutput = deps.runGit(
        ['diff', '--cached', '--name-status', '--', toNorm],
        cwd,
        { timeout: 15_000 },
      );
      const line = diffOutput.trim().split('\n').filter(Boolean).pop();
      const code = line?.split(/\s+/)[0];
      if (code) status = code;
    } catch {
      // best effort — the move already succeeded above.
    }

    results.push({ from, to, status });
  }

  return {
    content: [
      {
        type: 'text',
        text: minifiedJson({ moved: results.length, results }),
      },
    ],
  };
}
