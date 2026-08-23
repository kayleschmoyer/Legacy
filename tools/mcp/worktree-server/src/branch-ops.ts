// ---------------------------------------------------------------------------
// Pure(ish) helpers for the worktree_branch_create / worktree_branch_switch
// tools.
//
// Extracted from the request handlers in index.ts so the create/switch flow
// (branch-name validation, main-repo-root guard, git invocation sequencing)
// can be unit-tested without spawning git — see worktree-branch-tools.spec.ts.
// ---------------------------------------------------------------------------

import { resolve } from 'node:path';

/** MCP tool response envelope (subset used by these tools). */
export interface ToolResponse {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
  [key: string]: unknown;
}

/** Arguments accepted by the worktree_branch_create tool. */
export interface BranchCreateArgs {
  branch: string;
  from?: string;
  worktree?: string;
}

/** Arguments accepted by the worktree_branch_switch tool. */
export interface BranchSwitchArgs {
  branch: string;
  worktree?: string;
}

/**
 * Collaborators the handlers need from index.ts. Injected so the handler
 * flow can be unit-tested without spawning git or resolving real worktree
 * paths.
 */
export interface BranchOpsDeps {
  resolveTargetDir: (
    worktreeKey?: string,
  ) => { path: string } | { error: string };
  runGit: (
    args: string[],
    cwd: string,
    opts?: { timeout?: number; env?: Record<string, string> },
  ) => string;
  mainRepo: string;
}

function gitErrorText(err: unknown): string {
  const e = err as { stdout?: string; stderr?: string; message?: string };
  return (
    [e.stdout, e.stderr].filter(Boolean).join('\n') || e.message || String(err)
  );
}

function isMainRoot(cwd: string, mainRepo: string): boolean {
  return resolve(cwd) === resolve(mainRepo);
}

/**
 * Execute the worktree_branch_create tool: validate the branch name, resolve
 * an optional `from` ref, then `git checkout -b` within the active worktree.
 */
export function executeWorktreeBranchCreate(
  args: BranchCreateArgs,
  deps: BranchOpsDeps,
): ToolResponse {
  const { branch, from, worktree: wtKey } = args;

  const normalized = branch.replace(/^origin\//, '');
  if (normalized === 'main') {
    return {
      content: [
        {
          type: 'text',
          text: 'Refused: cannot create a branch named "main" or "origin/main".',
        },
      ],
      isError: true,
    };
  }

  const target = deps.resolveTargetDir(wtKey);
  if ('error' in target) {
    return { content: [{ type: 'text', text: target.error }], isError: true };
  }
  const cwd = target.path;

  if (isMainRoot(cwd, deps.mainRepo)) {
    return {
      content: [
        {
          type: 'text',
          text: 'Refused: active worktree resolves to the main repository root. Use worktree_set to select the correct worktree first.',
        },
      ],
      isError: true,
    };
  }

  let previousBranch: string;
  try {
    previousBranch = deps.runGit(['branch', '--show-current'], cwd).trim();
  } catch (err) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to determine current branch: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }
  if (!previousBranch) {
    return {
      content: [
        {
          type: 'text',
          text: 'Refused: HEAD is detached (no branch checked out). Cannot create a branch from here.',
        },
      ],
      isError: true,
    };
  }

  try {
    deps.runGit(['check-ref-format', '--branch', branch], cwd);
  } catch (err: unknown) {
    return {
      content: [
        {
          type: 'text',
          text: `Refused: invalid branch name "${branch}".\n${gitErrorText(err)}`,
        },
      ],
      isError: true,
    };
  }

  if (from) {
    try {
      deps.runGit(['rev-parse', '--verify', `${from}^{commit}`], cwd);
    } catch {
      return {
        content: [
          {
            type: 'text',
            text: `Cannot resolve "from" ref: "${from}". Commit not found in repository.`,
          },
        ],
        isError: true,
      };
    }
  }

  try {
    const checkoutArgs = from
      ? ['checkout', '-b', branch, from]
      : ['checkout', '-b', branch];
    deps.runGit(checkoutArgs, cwd);
    const actualBranch = deps.runGit(['branch', '--show-current'], cwd).trim();
    if (actualBranch !== branch) {
      return {
        content: [
          {
            type: 'text',
            text: `Branch create failed: current branch is "${actualBranch}", expected "${branch}".`,
          },
        ],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              branch,
              from: from ?? previousBranch,
              previousBranch,
              worktree: cwd,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (err: unknown) {
    const e = err as { status?: number };
    return {
      content: [
        {
          type: 'text',
          text: `Failed to create branch (exit code ${e.status ?? 'unknown'}):\n${gitErrorText(err)}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute the worktree_branch_switch tool: validate the branch name, confirm
 * it exists locally, then `git checkout` it within the active worktree.
 */
export function executeWorktreeBranchSwitch(
  args: BranchSwitchArgs,
  deps: BranchOpsDeps,
): ToolResponse {
  const { branch, worktree: wtKey } = args;

  const target = deps.resolveTargetDir(wtKey);
  if ('error' in target) {
    return { content: [{ type: 'text', text: target.error }], isError: true };
  }
  const cwd = target.path;

  if (isMainRoot(cwd, deps.mainRepo)) {
    return {
      content: [
        {
          type: 'text',
          text: 'Refused: active worktree resolves to the main repository root. Use worktree_set to select the correct worktree first.',
        },
      ],
      isError: true,
    };
  }

  try {
    deps.runGit(['check-ref-format', '--branch', branch], cwd);
  } catch (err: unknown) {
    return {
      content: [
        {
          type: 'text',
          text: `Refused: invalid branch name "${branch}".\n${gitErrorText(err)}`,
        },
      ],
      isError: true,
    };
  }

  let previousBranch: string;
  try {
    previousBranch = deps.runGit(['branch', '--show-current'], cwd).trim();
  } catch (err) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to determine current branch: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }

  try {
    deps.runGit(['rev-parse', '--verify', `refs/heads/${branch}`], cwd);
  } catch {
    return {
      content: [
        {
          type: 'text',
          text: `Branch "${branch}" does not exist locally. Use worktree_branch_create to create it, or worktree_fetch + a plain checkout for a remote-only branch.`,
        },
      ],
      isError: true,
    };
  }

  try {
    deps.runGit(['checkout', branch], cwd);
    const actualBranch = deps.runGit(['branch', '--show-current'], cwd).trim();
    if (actualBranch !== branch) {
      return {
        content: [
          {
            type: 'text',
            text: `Branch switch failed: current branch is still "${actualBranch}" after switch attempt.`,
          },
        ],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { success: true, branch, previousBranch, worktree: cwd },
            null,
            2,
          ),
        },
      ],
    };
  } catch (err: unknown) {
    const e = err as { status?: number };
    return {
      content: [
        {
          type: 'text',
          text: `Failed to switch branch (exit code ${e.status ?? 'unknown'}):\n${gitErrorText(err)}`,
        },
      ],
      isError: true,
    };
  }
}
