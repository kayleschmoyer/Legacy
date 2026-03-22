import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { execFileSync, execSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Constants & state
// ---------------------------------------------------------------------------

/** Resolve the main repo root (works from both main repo and worktrees). */
function getMainRepoPath(): string {
  const gitCommonDir = execSync('git rev-parse --git-common-dir', {
    encoding: 'utf-8',
    timeout: 5_000,
  }).trim();
  // In the main repo this returns ".git"; in a worktree it returns the absolute
  // path to the main repo's .git directory.
  if (gitCommonDir === '.git') {
    return process.cwd();
  }
  return resolve(gitCommonDir, '..');
}

const MAIN_REPO = getMainRepoPath();

/** Session-scoped active worktree (set via worktree_set). */
let activeWorktree: string | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface WorktreeInfo {
  key: string;
  path: string;
  branch: string | null;
  hasJunctionedNodeModules: boolean;
  nodeModulesTarget: string | null;
}

function isJunction(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function getJunctionTarget(p: string): string | null {
  try {
    return readlinkSync(p);
  } catch {
    return null;
  }
}

/** Enumerate all git worktrees (excluding the main repo itself). */
function getWorktrees(): WorktreeInfo[] {
  const output = execSync('git worktree list --porcelain', {
    cwd: MAIN_REPO,
    encoding: 'utf-8',
    timeout: 10_000,
  });

  const worktrees: WorktreeInfo[] = [];
  const blocks = output.trim().split('\n\n');

  for (const block of blocks) {
    const lines = block.split('\n');
    let wtPath = '';
    let branch: string | null = null;

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        wtPath = line.slice('worktree '.length);
      } else if (line.startsWith('branch refs/heads/')) {
        branch = line.slice('branch refs/heads/'.length);
      }
    }

    // Skip the main repo entry
    if (!wtPath || resolve(wtPath) === resolve(MAIN_REPO)) continue;

    // Extract Jira key from branch name (e.g. "LS-1136/mcp-worktree-server")
    const keyMatch = branch?.match(/^(LS-\d+)/);
    const key = keyMatch?.[1] ?? wtPath.split(/[\\/]/).pop() ?? wtPath;

    const nmPath = join(wtPath, 'node_modules');
    const junctioned = isJunction(nmPath);
    const target = junctioned ? getJunctionTarget(nmPath) : null;

    worktrees.push({
      key,
      path: wtPath,
      branch,
      hasJunctionedNodeModules: junctioned,
      nodeModulesTarget: target,
    });
  }

  return worktrees;
}

/**
 * Look up a worktree by key, branch name, or directory name.
 *
 * Resolution order:
 * 1. Exact branch name match (e.g. "LS-1508/worktree-commit-secrets-tf")
 * 2. Exact directory name match (e.g. "LS-1508-worktree-commit-secrets-tf")
 * 3. Ticket key prefix match (e.g. "LS-1508" or "1508")
 *    - If multiple worktrees share the same key, returns an error listing options
 */
function resolveWorktreePath(
  key: string,
): { path: string } | { error: string } {
  const worktrees = getWorktrees();

  // 1. Exact branch name match
  const branchMatch = worktrees.find((w) => w.branch === key);
  if (branchMatch) return { path: branchMatch.path };

  // 2. Exact directory name match (last segment of path)
  const dirMatch = worktrees.find((w) => w.path.split(/[\\/]/).pop() === key);
  if (dirMatch) return { path: dirMatch.path };

  // 3. Ticket key prefix match
  const normalised = key.startsWith('LS-') ? key : `LS-${key}`;
  const keyMatches = worktrees.filter((w) => w.key === normalised);

  if (keyMatches.length === 0) {
    return { error: `No worktree found for key '${key}'.` };
  }

  if (keyMatches.length === 1) {
    return { path: keyMatches[0].path };
  }

  // Multiple matches — return error with disambiguation options
  const options = keyMatches
    .map((w) => `  - branch: ${w.branch ?? '(detached)'}  path: ${w.path}`)
    .join('\n');
  return {
    error:
      `Ambiguous: ${keyMatches.length} worktrees match key '${normalised}'.\n` +
      `Specify the full branch name or directory name instead:\n${options}`,
  };
}

/**
 * Resolve the target worktree directory from an optional key, the active
 * worktree, or return an error message.
 */
function resolveTargetDir(
  worktreeKey?: string,
): { path: string } | { error: string } {
  if (worktreeKey) {
    return resolveWorktreePath(worktreeKey);
  }
  if (activeWorktree) return { path: activeWorktree };
  return {
    error:
      'No active worktree set. Use worktree_set first or pass the worktree parameter.',
  };
}

/** Run git with arguments array (no shell interpolation). Safe for user-provided values. */
function runGit(
  args: string[],
  cwd: string,
  opts?: { timeout?: number; env?: Record<string, string> },
): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    timeout: opts?.timeout ?? 120_000,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, ...opts?.env },
  });
}

/**
 * Perform a single rebase-continue step: stage files, run `git rebase --continue`,
 * and return structured state. Shared by `worktree_rebase` (auto-continue loop)
 * and `worktree_rebase_continue` tool.
 */
function rebaseContinueStep(
  cwd: string,
  files?: string[],
): {
  completed: boolean;
  conflicted: string[];
  error?: string;
} {
  const agentEnv = {
    GIT_EDITOR: 'true',
    GIT_SEQUENCE_EDITOR: 'true',
  };

  const getConflictedFiles = (): string[] => {
    try {
      return run('git diff --name-only --diff-filter=U', cwd)
        .trim()
        .split('\n')
        .filter(Boolean);
    } catch {
      return [];
    }
  };

  // Stage resolved files
  if (files && files.length > 0) {
    runGit(['add', '--', ...files], cwd);
  } else {
    runGit(['add', '-A'], cwd);
  }

  // Continue rebase — may throw if new conflicts arise
  run('git rebase --continue', cwd, {
    timeout: 120_000,
    env: agentEnv,
  });

  // Check if rebase is still in progress
  const gitDir = run('git rev-parse --absolute-git-dir', cwd).trim();
  const stillRebasing =
    existsSync(join(gitDir, 'rebase-merge')) ||
    existsSync(join(gitDir, 'rebase-apply'));

  if (!stillRebasing) {
    return { completed: true, conflicted: [] };
  }

  // Still rebasing — check for new conflicts
  const conflictedFiles = getConflictedFiles();
  return { completed: false, conflicted: conflictedFiles };
}

/** Run a command in a directory and return stdout. Throws on non-zero exit. */
function run(
  command: string,
  cwd: string,
  opts?: { timeout?: number; env?: Record<string, string> },
): string {
  return execSync(command, {
    cwd,
    encoding: 'utf-8',
    timeout: opts?.timeout ?? 120_000,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, ...opts?.env },
  });
}

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------

const server = new Server(
  { name: 'worktree-server', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [
    {
      name: 'worktree_checkout_file',
      description:
        'Restore files to a specific ref or resolve conflicts using theirs/ours. ' +
        'Two modes: (1) With strategy ("theirs"/"ours") — resolves conflicted files and stages them. ' +
        '(2) Without strategy — restores files to a ref (default HEAD), discarding local changes.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          files: {
            type: 'array' as const,
            items: { type: 'string' },
            description: 'File paths to restore or resolve.',
          },
          strategy: {
            type: 'string',
            enum: ['theirs', 'ours'],
            description:
              'Conflict resolution strategy. If omitted, restores files to ref instead.',
          },
          ref: {
            type: 'string',
            description:
              'Git ref to restore files from (e.g. "HEAD", "origin/main"). ' +
              'Default: "HEAD". Only used when strategy is omitted.',
          },
          worktree: { type: 'string', description: 'Optional ticket key.' },
        },
        required: ['files'],
      },
    },
    {
      name: 'worktree_commit',
      description:
        'Stage files and create a conventional commit in the active (or specified) worktree. ' +
        'Supports --amend to amend the previous commit. ' +
        'Refuses to commit on main. Refuses to stage .env or credential files (Terraform .tf files are allowed). ' +
        'For new commits, auto-appends a Co-Authored-By line and validates conventional commit message format; ' +
        'when amending, it skips these steps and keeps the existing commit message.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          message: {
            type: 'string',
            description:
              'Commit message in conventional format: type(scope): description. ' +
              'Example: "feat(auth): add oauth flow"',
          },
          files: {
            type: 'array' as const,
            items: { type: 'string' },
            description:
              'Files to stage. If omitted, stages all modified/untracked files (like git add -A). ' +
              'Prefer specifying files explicitly over staging all.',
          },
          worktree: {
            type: 'string',
            description:
              "Optional ticket key (e.g. 'LS-1134'). Uses active worktree if omitted.",
          },
          amend: {
            type: 'boolean',
            description:
              'If true, amends the previous commit instead of creating a new one. ' +
              'Uses --amend --no-edit (keeps the original message). The message parameter is ignored when amending.',
          },
        },
        required: [],
      },
    },
    {
      name: 'worktree_conflict_info',
      description:
        'List all conflicted files with line ranges and short previews of each side.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          worktree: { type: 'string', description: 'Optional ticket key.' },
        },
      },
    },
    {
      name: 'worktree_diff',
      description:
        'Show git diff for the active (or specified) worktree. ' +
        'Defaults to diffing against origin/main. Supports stat-only, name-only, ' +
        'and path-filtered modes.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          worktree: { type: 'string', description: 'Optional ticket key.' },
          base: {
            type: 'string',
            description:
              'Base ref to diff against (default: "origin/main"). ' +
              'Use "HEAD" for working-tree + index vs HEAD, "HEAD~1" for last commit, etc.',
          },
          paths: {
            type: 'array' as const,
            items: { type: 'string' },
            description: 'Restrict diff to specific file paths.',
          },
          stat: {
            type: 'boolean',
            description: 'Show diffstat summary instead of full diff.',
          },
          nameOnly: {
            type: 'boolean',
            description: 'List only changed file names.',
          },
        },
      },
    },
    {
      name: 'worktree_guard',
      description:
        'Check whether a path is inside the main repo and warn if worktrees are active.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          path: { type: 'string', description: 'Path to check' },
        },
        required: ['path'],
      },
    },
    {
      name: 'worktree_list',
      description:
        'List all active worktrees with junction status and branch info.',
      inputSchema: { type: 'object' as const, properties: {} },
    },
    {
      name: 'worktree_log',
      description:
        'Show structured commit log for the active (or specified) worktree. ' +
        'Returns a JSON object with a commits array containing sha, shortSha, message, author, date, and refs.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          worktree: { type: 'string', description: 'Optional ticket key.' },
          maxCount: { type: 'number', description: 'Max commits. Default 20.' },
          path: { type: 'string', description: 'File path filter.' },
          range: {
            type: 'string',
            description: 'Commit range (e.g. "origin/main..HEAD").',
          },
        },
      },
    },
    {
      name: 'worktree_ls_tree',
      description:
        'List files in a directory at a specific git ref (branch, tag, or SHA) ' +
        'without checking it out. Useful for checking file existence on remote branches ' +
        'during CI triage. Runs `git ls-tree`.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          ref: {
            type: 'string',
            description:
              'Git ref to list from (e.g. "origin/main", "origin/LS-1234/branch", a SHA).',
          },
          path: {
            type: 'string',
            description:
              'Optional directory path relative to repo root (e.g. "lib/db-client/src/"). ' +
              'Omit to list the entire tree.',
          },
          recursive: {
            type: 'boolean',
            description: 'If true, list files recursively (default: true).',
          },
          worktree: {
            type: 'string',
            description:
              'Optional ticket key. Uses active worktree if omitted.',
          },
        },
        required: ['ref'],
      },
    },
    {
      name: 'worktree_push',
      description:
        'Push the current branch with --force-with-lease. Refuses to push ' +
        'the main branch. Intended for use after rebase + stabilize + make pc.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          worktree: {
            type: 'string',
            description:
              "Optional ticket key (e.g. 'LS-1134'). Uses active worktree if omitted.",
          },
          setUpstream: {
            type: 'boolean',
            description:
              'If true, adds -u to set the upstream tracking branch. Default false.',
          },
        },
      },
    },
    {
      name: 'worktree_rebase',
      description:
        'Fetch origin and rebase the active worktree branch onto its parent ' +
        '(via twig rebase). Sets GIT_EDITOR to prevent blocking in agent workflows. ' +
        'Use worktree_stabilize after a successful rebase before pushing.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          worktree: {
            type: 'string',
            description:
              "Optional ticket key (e.g. 'LS-1134'). Uses active worktree if omitted.",
          },
          abort: {
            type: 'boolean',
            description:
              'If true, aborts an in-progress rebase instead of starting one.',
          },
          skip: {
            type: 'boolean',
            description:
              'If true, skips the current commit/patch in an in-progress rebase ' +
              '(for example, an empty or duplicate commit) and continues the rebase.',
          },
        },
      },
    },
    {
      name: 'worktree_rebase_continue',
      description:
        'Continue an in-progress rebase after conflicts have been resolved. ' +
        'Stages resolved files, runs git rebase --continue, returns structured JSON.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          files: {
            type: 'array' as const,
            items: { type: 'string' },
            description:
              'Files to stage before continuing. If omitted, stages all (git add -A).',
          },
          worktree: {
            type: 'string',
            description: "Optional ticket key (e.g. 'LS-1134').",
          },
        },
      },
    },
    {
      name: 'worktree_run',
      description:
        'Run a shell command in the active (or specified) worktree. ' +
        'Refuses to run in the main repo when worktrees are active unless overridden.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
          worktree: {
            type: 'string',
            description:
              "Optional ticket key (e.g. 'LS-1134'). Uses active worktree if omitted.",
          },
          allowMainRepo: {
            type: 'boolean',
            description:
              'Override: allow running in the main repo even when worktrees exist.',
          },
        },
        required: ['command'],
      },
    },
    {
      name: 'worktree_set',
      description: 'Set the active worktree for subsequent commands.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          key: {
            type: 'string',
            description: "Ticket key like 'LS-1134' or just '1134'",
          },
        },
        required: ['key'],
      },
    },
    {
      name: 'worktree_show',
      description:
        'Show a specific commit metadata, stat summary, and optional file-filtered diff.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          sha: {
            type: 'string',
            description: 'Commit SHA (hex only, e.g. "abc1234" or "HEAD").',
          },
          worktree: { type: 'string', description: 'Optional ticket key.' },
          path: { type: 'string', description: 'File path for filtered diff.' },
        },
        required: ['sha'],
      },
    },
    {
      name: 'worktree_stabilize',
      description:
        'Run post-rebase stabilization: make install, regenerate schema, ' +
        'and run codegen on affected projects. Must be run BEFORE pushing ' +
        'after a rebase to prevent CI failures.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          worktree: {
            type: 'string',
            description:
              "Optional ticket key (e.g. 'LS-1134'). Uses active worktree if omitted.",
          },
        },
      },
    },
    {
      name: 'worktree_status',
      description:
        'Get structured git status for the active (or specified) worktree. ' +
        'Returns modified, staged, untracked files, branch info, ahead/behind counts, ' +
        'rebase/merge/conflict state, and merge-base info relative to origin/main as structured JSON.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          worktree: {
            type: 'string',
            description:
              "Optional ticket key (e.g. 'LS-1134'). Uses active worktree if omitted.",
          },
        },
      },
    },
    {
      name: 'worktree_unjunction',
      description:
        'Remove the node_modules junction/symlink in a worktree so it can get independent ' +
        'node_modules via make install. Detects whether node_modules is a junction, symlink, ' +
        'real directory, or missing, and handles platform differences (Windows NTFS junctions vs Unix symlinks).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          worktree: {
            type: 'string',
            description:
              "Optional ticket key (e.g. 'LS-1134'). Uses active worktree if omitted.",
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    // -----------------------------------------------------------------------
    // worktree_checkout_file
    // -----------------------------------------------------------------------
    case 'worktree_checkout_file': {
      const {
        files,
        strategy,
        ref = 'HEAD',
        worktree: wtKey,
      } = args as {
        files: string[];
        strategy?: 'theirs' | 'ours';
        ref?: string;
        worktree?: string;
      };
      const target = resolveTargetDir(wtKey);
      if ('error' in target) {
        return {
          content: [{ type: 'text', text: target.error }],
          isError: true,
        };
      }
      const cwd = target.path;

      // Validate ref (only safe rev chars)
      if (!strategy && !/^[a-zA-Z0-9_./~^{}-]+$/.test(ref)) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid ref: "${ref}". Only alphanumeric, '_', '.', '/', '~', '^', '{', '}', '-' allowed.`,
            },
          ],
          isError: true,
        };
      }

      try {
        const restoredFiles: string[] = [];
        for (const file of files) {
          if (strategy) {
            // Conflict resolution mode: checkout --theirs/--ours and stage
            runGit(['checkout', `--${strategy}`, '--', file], cwd);
            runGit(['add', '--', file], cwd);
          } else {
            // Restore mode: checkout file from ref
            runGit(['checkout', ref, '--', file], cwd);
          }
          restoredFiles.push(file);
        }

        const mode = strategy ? `--${strategy}` : ref;
        const verb = strategy ? 'Resolved' : 'Restored';
        const suffix = strategy ? ' and staged them' : '';
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  mode,
                  files: restoredFiles,
                  message: `${verb} ${restoredFiles.length} file(s) using ${mode}${suffix}.`,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err: unknown) {
        const e = err as {
          stdout?: string;
          stderr?: string;
          status?: number;
          message?: string;
        };
        const output =
          [e.stdout, e.stderr].filter(Boolean).join('\n') ||
          e.message ||
          String(err);
        return {
          content: [
            {
              type: 'text',
              text: `Failed (exit code ${e.status ?? 'unknown'}):\n${output}`,
            },
          ],
          isError: true,
        };
      }
    }

    // -----------------------------------------------------------------------
    // worktree_commit
    // -----------------------------------------------------------------------
    case 'worktree_commit': {
      const {
        message,
        files,
        worktree: wtKey,
        amend,
      } = args as {
        message?: string;
        files?: string[];
        worktree?: string;
        amend?: boolean;
      };

      // message is required for new commits, optional for amend
      if (!amend && !message) {
        return {
          content: [
            {
              type: 'text',
              text: 'Missing required parameter: message is required when not amending.',
            },
          ],
          isError: true,
        };
      }

      const target = resolveTargetDir(wtKey);
      if ('error' in target) {
        return {
          content: [{ type: 'text', text: target.error }],
          isError: true,
        };
      }

      const cwd = target.path;

      // Safety: refuse main, detached HEAD, and in-progress rebase/merge
      try {
        const branch = run('git branch --show-current', cwd).trim();
        if (!branch) {
          const gitDir = run('git rev-parse --absolute-git-dir', cwd).trim();
          const inRebase =
            existsSync(join(gitDir, 'rebase-merge')) ||
            existsSync(join(gitDir, 'rebase-apply'));
          return {
            content: [
              {
                type: 'text',
                text: inRebase
                  ? 'Refused: rebase is in progress. Finish the rebase before committing.'
                  : 'Refused: HEAD is detached (no branch checked out). Aborting commit.',
              },
            ],
            isError: true,
          };
        }
        if (branch === 'main') {
          return {
            content: [
              {
                type: 'text',
                text: 'Refused: cannot commit on main. Create a worktree first.',
              },
            ],
            isError: true,
          };
        }
        // Check for in-progress merge
        const gitDir = run('git rev-parse --absolute-git-dir', cwd).trim();
        if (existsSync(join(gitDir, 'MERGE_HEAD'))) {
          return {
            content: [
              {
                type: 'text',
                text: 'Refused: merge is in progress. Complete or abort the merge first.',
              },
            ],
            isError: true,
          };
        }
      } catch {
        return {
          content: [
            {
              type: 'text',
              text: 'Could not determine current branch. Aborting commit.',
            },
          ],
          isError: true,
        };
      }

      // Validate conventional commit format (scope is optional) — skip for amend
      const conventionalPattern =
        /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?:\s.+/;
      if (!amend && !conventionalPattern.test(message as string)) {
        return {
          content: [
            {
              type: 'text',
              text:
                `Invalid commit message format: "${message}"\n\n` +
                'Expected conventional commit: type[(scope)]: description\n' +
                'Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert\n' +
                'Scope is optional. Examples: "feat(auth): add oauth", "fix: typo"',
            },
          ],
          isError: true,
        };
      }

      // Refuse to stage dangerous files
      // "Always block" patterns — no safe-extension exemption applies
      const alwaysBlockPatterns = [
        /\.env$/,
        /\.env\./,
        /credentials/i,
        /\.pem$/,
        /\.key$/,
      ];
      // "Name-based" patterns that cause false positives on IaC/source files
      // (e.g. secrets.tf, secrets.ts) — safe extensions are exempted
      const nameBasedPatterns = [/secrets?\./i];

      // IaC and source code files that reference secrets but don't contain them
      const safeExtensions =
        /\.(tf|ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|sh)$/i;

      // Distinguish files=undefined (stage all) from files=[] (error: nothing specified)
      const stageAll = files === undefined;
      if (!stageAll && files.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No files specified. Either omit the files parameter to stage all, or provide file paths.',
            },
          ],
          isError: true,
        };
      }

      const isDangerous = (f: string) =>
        alwaysBlockPatterns.some((p) => p.test(f)) ||
        (nameBasedPatterns.some((p) => p.test(f)) && !safeExtensions.test(f));

      if (!stageAll) {
        for (const f of files) {
          if (isDangerous(f)) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Refused: "${f}" looks like a credential/secret file. Remove it from the file list.`,
                },
              ],
              isError: true,
            };
          }
        }
      }

      try {
        // Stage files using execFileSync to avoid shell injection
        if (!stageAll) {
          runGit(['add', '--', ...files], cwd);
        } else {
          // Stage all modified files, but check for dangerous files first
          const status = run('git status --porcelain', cwd).trim();
          if (!status && !amend) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Nothing to commit — working tree is clean.',
                },
              ],
            };
          }

          // Check for dangerous files in the changeset
          const changedFiles = status
            .split('\n')
            .map((l) => l.slice(3).trim())
            .filter(Boolean);
          for (const f of changedFiles) {
            if (isDangerous(f)) {
              return {
                content: [
                  {
                    type: 'text',
                    text:
                      `Refused: "${f}" looks like a credential/secret file and would be staged by git add -A.\n` +
                      'Specify files explicitly to exclude it.',
                  },
                ],
                isError: true,
              };
            }
          }

          runGit(['add', '-A'], cwd);
        }

        // Commit
        if (amend) {
          runGit(['commit', '--amend', '--no-edit'], cwd, {
            env: { GIT_EDITOR: 'true' },
          });
        } else {
          const fullMessage =
            message + '\n\nCo-Authored-By: Claude <noreply@anthropic.com>';
          const msgPath = join(
            tmpdir(),
            `worktree-commit-msg-${Date.now()}.txt`,
          );
          writeFileSync(msgPath, fullMessage, 'utf-8');
          try {
            runGit(['commit', '-F', msgPath], cwd, {
              env: { GIT_EDITOR: 'true' },
            });
          } finally {
            try {
              unlinkSync(msgPath);
            } catch {
              // Ignore cleanup errors
            }
          }
        }

        // Get commit info (works on orphan/first commits too)
        const sha = run('git rev-parse --short HEAD', cwd).trim();
        const filesChanged = run(
          'git diff-tree --no-commit-id --name-only -r HEAD',
          cwd,
        ).trim();

        const commitMessage = amend
          ? run('git log -1 --pretty=%B', cwd).trim()
          : message;

        const result = {
          sha,
          message: commitMessage,
          filesChanged: filesChanged.split('\n').filter(Boolean),
          ...(amend ? { amended: true } : {}),
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; status?: number };
        const output = [e.stdout, e.stderr].filter(Boolean).join('\n');
        return {
          content: [
            {
              type: 'text',
              text: `Commit failed (exit code ${e.status ?? 'unknown'}):\n${output}`,
            },
          ],
          isError: true,
        };
      }
    }

    // -----------------------------------------------------------------------
    // worktree_conflict_info
    // -----------------------------------------------------------------------
    case 'worktree_conflict_info': {
      const { worktree: wtKey } = args as { worktree?: string };
      const target = resolveTargetDir(wtKey);
      if ('error' in target) {
        return {
          content: [{ type: 'text', text: target.error }],
          isError: true,
        };
      }
      const cwd = target.path;
      try {
        // Use NUL-delimited output for safe path handling
        const rawConflicts = run(
          'git diff --name-only --diff-filter=U -z',
          cwd,
        );
        const conflictedPaths = rawConflicts.split('\0').filter(Boolean);
        if (conflictedPaths.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  { files: [], message: 'No conflicts found.' },
                  null,
                  2,
                ),
              },
            ],
          };
        }
        const files: Array<{
          path: string;
          conflicts: Array<{
            startLine: number;
            separatorLine: number;
            endLine: number;
            oursPreview: string;
            theirsPreview: string;
          }>;
        }> = [];
        for (const filePath of conflictedPaths) {
          const fullPath = join(cwd, filePath);
          if (!existsSync(fullPath)) {
            files.push({ path: filePath, conflicts: [] });
            continue;
          }
          const content = readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          const conflicts: Array<{
            startLine: number;
            separatorLine: number;
            endLine: number;
            oursPreview: string;
            theirsPreview: string;
          }> = [];
          let i = 0;
          while (i < lines.length) {
            if (lines[i].startsWith('<<<<<<<')) {
              const startLine = i + 1;
              const oursLines: string[] = [];
              i++;
              while (i < lines.length && !lines[i].startsWith('=======')) {
                oursLines.push(lines[i]);
                i++;
              }
              const separatorLine = i + 1;
              i++;
              const theirsLines: string[] = [];
              while (i < lines.length && !lines[i].startsWith('>>>>>>>')) {
                theirsLines.push(lines[i]);
                i++;
              }
              const endLine = i + 1;
              const preview = (arr: string[]) => {
                const suffix =
                  arr.length > 3 ? `\n... (${arr.length} lines total)` : '';
                const maxContent = 200 - suffix.length;
                return arr.slice(0, 3).join('\n').slice(0, maxContent) + suffix;
              };
              conflicts.push({
                startLine,
                separatorLine,
                endLine,
                oursPreview: preview(oursLines),
                theirsPreview: preview(theirsLines),
              });
            }
            i++;
          }
          files.push({ path: filePath, conflicts });
        }
        return {
          content: [{ type: 'text', text: JSON.stringify({ files }, null, 2) }],
        };
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; message?: string };
        const output =
          [e.stdout, e.stderr].filter(Boolean).join('\n') ||
          e.message ||
          String(err);
        return {
          content: [
            { type: 'text', text: `Failed to inspect conflicts: ${output}` },
          ],
          isError: true,
        };
      }
    }

    // -----------------------------------------------------------------------
    // worktree_diff
    // -----------------------------------------------------------------------
    case 'worktree_diff': {
      const {
        worktree: wtKey,
        base = 'origin/main',
        paths,
        stat,
        nameOnly,
      } = args as {
        worktree?: string;
        base?: string;
        paths?: string[];
        stat?: boolean;
        nameOnly?: boolean;
      };

      const target = resolveTargetDir(wtKey);
      if ('error' in target) {
        return {
          content: [{ type: 'text', text: target.error }],
          isError: true,
        };
      }
      const cwd = target.path;

      // Validate base ref (only safe rev chars; reject option-like values)
      if (base.startsWith('-')) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid base ref: "${base}". Base ref must not start with '-'.`,
            },
          ],
          isError: true,
        };
      }
      if (!/^[a-zA-Z0-9_./~^{}-]+$/.test(base)) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid base ref: "${base}". Only alphanumeric, '.', '/', '~', '^', '-', '_', '{', '}' allowed.`,
            },
          ],
          isError: true,
        };
      }

      // Enforce mutual exclusivity of stat and nameOnly
      if (stat && nameOnly) {
        return {
          content: [
            {
              type: 'text',
              text: 'Cannot use both "stat" and "nameOnly" — pick one.',
            },
          ],
          isError: true,
        };
      }

      try {
        const gitArgs = ['diff', base];
        if (stat) gitArgs.push('--stat');
        if (nameOnly) gitArgs.push('--name-only');
        if (paths?.length) {
          gitArgs.push('--');
          gitArgs.push(...paths);
        }

        const output = runGit(gitArgs, cwd);
        const trimmed = output.trim();

        if (!trimmed) {
          return {
            content: [
              {
                type: 'text',
                text: `No differences found between ${base} and HEAD.`,
              },
            ],
          };
        }

        // Truncate large diffs to prevent exceeding MCP/stdio limits
        const MAX_DIFF_BYTES = 512_000; // 500 KB
        if (trimmed.length > MAX_DIFF_BYTES) {
          const truncated = trimmed.slice(0, MAX_DIFF_BYTES);
          return {
            content: [
              {
                type: 'text',
                text:
                  truncated +
                  `\n\n... [truncated — diff exceeds ${MAX_DIFF_BYTES / 1000}KB. Use path filters to narrow scope.]`,
              },
            ],
          };
        }

        return {
          content: [{ type: 'text', text: trimmed }],
        };
      } catch (err: unknown) {
        const e = err as {
          stdout?: string;
          stderr?: string;
          status?: number;
          message?: string;
        };
        const output =
          [e.stdout, e.stderr].filter(Boolean).join('\n') ||
          e.message ||
          String(err);
        return {
          content: [
            {
              type: 'text',
              text: `git diff failed (exit code ${e.status ?? 'unknown'}):\n${output}`,
            },
          ],
          isError: true,
        };
      }
    }

    // -----------------------------------------------------------------------
    // worktree_guard
    // -----------------------------------------------------------------------
    case 'worktree_guard': {
      const { path: checkPath } = args as { path: string };
      const resolved = resolve(checkPath);
      const mainResolved = resolve(MAIN_REPO);
      const isMainRepo =
        resolved === mainResolved ||
        resolved.startsWith(mainResolved + '\\') ||
        resolved.startsWith(mainResolved + '/');
      const worktrees = getWorktrees();

      const result: {
        isMainRepo: boolean;
        activeWorktrees: string[];
        warning?: string;
      } = {
        isMainRepo,
        activeWorktrees: worktrees.map((w) => w.key),
      };

      if (isMainRepo && worktrees.length > 0) {
        result.warning =
          `Path is in the main repo (${MAIN_REPO}) and ${worktrees.length} ` +
          'worktree(s) are active. Running commands or editing files here ' +
          'instead of in a worktree is the #1 agent failure mode. ' +
          `Active worktrees: ${worktrees.map((w) => w.key).join(', ')}`;
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    // -----------------------------------------------------------------------
    // worktree_list
    // -----------------------------------------------------------------------
    case 'worktree_list': {
      const worktrees = getWorktrees();
      const activeLabel = activeWorktree
        ? `\nActive worktree: ${activeWorktree}`
        : '\nNo active worktree set.';

      if (worktrees.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No worktrees found.${activeLabel}`,
            },
          ],
        };
      }

      const lines = worktrees.map((w) => {
        const nmStatus = w.hasJunctionedNodeModules
          ? `node_modules: junctioned -> ${w.nodeModulesTarget}`
          : existsSync(join(w.path, 'node_modules'))
            ? 'node_modules: independent'
            : 'node_modules: missing';
        return [
          w.key,
          `  Path:   ${w.path}`,
          `  Branch: ${w.branch ?? 'unknown'}`,
          `  ${nmStatus}`,
        ].join('\n');
      });

      return {
        content: [{ type: 'text', text: lines.join('\n\n') + activeLabel }],
      };
    }

    // -----------------------------------------------------------------------
    // worktree_log
    // -----------------------------------------------------------------------
    case 'worktree_log': {
      const {
        worktree: wtKey,
        maxCount = 20,
        path: filterPath,
        range,
      } = args as {
        worktree?: string;
        maxCount?: number;
        path?: string;
        range?: string;
      };
      const target = resolveTargetDir(wtKey);
      if ('error' in target) {
        return {
          content: [{ type: 'text', text: target.error }],
          isError: true,
        };
      }
      const cwd = target.path;
      const limit = Math.min(Math.max(maxCount, 1), 100);

      // Validate range if provided (only safe rev chars)
      if (range && !/^[a-zA-Z0-9_./~^{}-]+$/.test(range)) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid range: "${range}". Only rev characters allowed.`,
            },
          ],
          isError: true,
        };
      }

      try {
        // Use record/field separators to avoid delimiter collisions with commit text
        const RS = '\x1e'; // record separator
        const FS = '\x1f'; // field separator
        const gitArgs = [
          'log',
          `--format=${RS}%H${FS}%h${FS}%s${FS}%an${FS}%aI${FS}%D`,
          `-n`,
          `${limit}`,
        ];
        if (range) gitArgs.push(range);
        if (filterPath) gitArgs.push('--', filterPath);

        const output = runGit(gitArgs, cwd, { timeout: 30_000 });
        const commits = output
          .split(RS)
          .filter((b) => b.trim())
          .map((record) => {
            const fields = record.trim().split(FS);
            return {
              sha: fields[0] ?? '',
              shortSha: fields[1] ?? '',
              message: fields[2] ?? '',
              author: fields[3] ?? '',
              date: fields[4] ?? '',
              refs: fields[5] ?? '',
            };
          });
        return {
          content: [
            { type: 'text', text: JSON.stringify({ commits }, null, 2) },
          ],
        };
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; message?: string };
        const output =
          [e.stdout, e.stderr].filter(Boolean).join('\n') ||
          e.message ||
          String(err);
        return {
          content: [{ type: 'text', text: `Failed to get log: ${output}` }],
          isError: true,
        };
      }
    }

    // -----------------------------------------------------------------------
    // worktree_ls_tree
    // -----------------------------------------------------------------------
    case 'worktree_ls_tree': {
      const {
        ref,
        path: dirPath,
        recursive = true,
        worktree,
      } = args as {
        ref: string;
        path?: string;
        recursive?: boolean;
        worktree?: string;
      };

      let cwd: string;
      if (worktree) {
        const target = resolveTargetDir(worktree);
        if ('error' in target) {
          return {
            content: [{ type: 'text', text: target.error }],
            isError: true,
          };
        }
        cwd = target.path;
      } else if (activeWorktree) {
        cwd = activeWorktree;
      } else {
        cwd = MAIN_REPO;
      }

      // Validate ref (only safe rev chars; reject option-like values)
      if (ref.startsWith('-')) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid ref: "${ref}". Ref must not start with '-'.`,
            },
          ],
          isError: true,
        };
      }
      if (!/^[a-zA-Z0-9_./~^{}-]+$/.test(ref)) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid ref: "${ref}". Only alphanumeric, '_', '.', '/', '~', '^', '{', '}', '-' allowed.`,
            },
          ],
          isError: true,
        };
      }

      try {
        const MAX_FILES = 500;
        const gitArgs = ['ls-tree', '--name-only'];
        if (recursive) gitArgs.push('-r');

        // For non-recursive mode with a directory path, use <ref>:<dirPath>
        // so git returns the directory's children instead of just the directory entry.
        if (dirPath && !recursive) {
          gitArgs.push(`${ref}:${dirPath}`);
        } else {
          gitArgs.push(ref);
          if (dirPath) gitArgs.push('--', dirPath);
        }

        const output = runGit(gitArgs, cwd);
        const allFiles = output.trim().split('\n').filter(Boolean);
        const truncated = allFiles.length > MAX_FILES;
        const files = truncated ? allFiles.slice(0, MAX_FILES) : allFiles;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ref,
                path: dirPath ?? '/',
                fileCount: allFiles.length,
                truncated,
                files,
              }),
            },
          ],
        };
      } catch (err: unknown) {
        const e = err as { message?: string; stderr?: string };
        const msg = e.stderr || e.message || String(err);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to list files at ${ref}${dirPath ? `:${dirPath}` : ''}: ${msg.trim()}`,
            },
          ],
          isError: true,
        };
      }
    }

    // -----------------------------------------------------------------------
    // worktree_push
    // -----------------------------------------------------------------------
    case 'worktree_push': {
      const { worktree: wtKey, setUpstream } = args as {
        worktree?: string;
        setUpstream?: boolean;
      };

      const target = resolveTargetDir(wtKey);
      if ('error' in target) {
        return {
          content: [{ type: 'text', text: target.error }],
          isError: true,
        };
      }

      const cwd = target.path;

      // Safety: refuse to push main or in detached HEAD / mid-rebase state
      try {
        const branch = run('git branch --show-current', cwd).trim();
        if (!branch) {
          // Detached HEAD — check if a rebase is in progress
          const gitDir = run('git rev-parse --git-dir', cwd).trim();
          const inRebase =
            existsSync(join(gitDir, 'rebase-merge')) ||
            existsSync(join(gitDir, 'rebase-apply'));
          return {
            content: [
              {
                type: 'text',
                text: inRebase
                  ? 'Refused: rebase is in progress. Finish the rebase before pushing.'
                  : 'Refused: HEAD is detached (no branch checked out). Aborting push.',
              },
            ],
            isError: true,
          };
        }
        if (branch === 'main') {
          return {
            content: [
              {
                type: 'text',
                text: 'Refused: cannot force-push main. Use git revert instead.',
              },
            ],
            isError: true,
          };
        }
      } catch {
        // If we can't determine the branch, refuse to proceed
        return {
          content: [
            {
              type: 'text',
              text: 'Could not determine current branch. Aborting push.',
            },
          ],
          isError: true,
        };
      }

      const upstreamFlag = setUpstream ? ' -u' : '';
      const cmd = `git push${upstreamFlag} --force-with-lease origin HEAD`;

      try {
        const out = run(cmd, cwd, { timeout: 30_000 });
        return {
          content: [
            {
              type: 'text',
              text: `[cwd: ${cwd}]\n$ ${cmd}\n\n${out.trim()}`,
            },
          ],
        };
      } catch (err: unknown) {
        const e = err as {
          stdout?: string;
          stderr?: string;
          status?: number;
        };
        const output = [e.stdout, e.stderr].filter(Boolean).join('\n');
        return {
          content: [
            {
              type: 'text',
              text: `[cwd: ${cwd}]\n$ ${cmd}\n\nExit code: ${e.status ?? 'unknown'}\n${output}`,
            },
          ],
          isError: true,
        };
      }
    }

    // -----------------------------------------------------------------------
    // worktree_rebase
    // -----------------------------------------------------------------------
    case 'worktree_rebase': {
      const { worktree, abort, skip } = args as {
        worktree?: string;
        abort?: boolean;
        skip?: boolean;
      };

      const target = resolveTargetDir(worktree);
      if ('error' in target) {
        return {
          content: [{ type: 'text', text: target.error }],
          isError: true,
        };
      }

      const cwd = target.path;
      const log: string[] = [`[cwd: ${cwd}]`];

      // Agent-safe: prevent Git from opening an editor
      const agentEnv = {
        GIT_EDITOR: 'true',
        GIT_SEQUENCE_EDITOR: 'true',
      };

      try {
        if (abort && skip) {
          return {
            content: [
              {
                type: 'text',
                text: `[cwd: ${cwd}] Cannot specify both abort and skip. Use one or the other.`,
              },
            ],
            isError: true,
          };
        }

        if (abort) {
          const out = runGit(['rebase', '--abort'], cwd, { env: agentEnv });
          log.push('$ git rebase --abort', out);
          return { content: [{ type: 'text', text: log.join('\n') }] };
        }

        if (skip) {
          const out = runGit(['rebase', '--skip'], cwd, { env: agentEnv });
          log.push('$ git rebase --skip', out);
          return { content: [{ type: 'text', text: log.join('\n') }] };
        }

        // Check for clean working directory
        const status = run('git status --porcelain', cwd).trim();
        if (status) {
          return {
            content: [
              {
                type: 'text',
                text:
                  `Working directory is not clean in ${cwd}:\n${status}\n\n` +
                  'Commit or stash changes before rebasing.',
              },
            ],
            isError: true,
          };
        }

        // Fetch origin and update local main ref
        log.push('$ git fetch origin');
        const fetchOut = run('git fetch origin', cwd, { timeout: 30_000 });
        if (fetchOut.trim()) log.push(fetchOut.trim());

        // Update remote-tracking ref origin/main so twig rebase sees latest commits
        try {
          log.push('$ git fetch origin main');
          const ffOut = run('git fetch origin main', cwd, {
            timeout: 30_000,
          });
          if (ffOut.trim()) log.push(ffOut.trim());
        } catch (fetchErr: unknown) {
          // Non-fatal: twig rebase will still work against whatever origin/main ref is available.
          const reason =
            fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
          log.push(`(warning: could not update origin/main — ${reason})`);
        }

        // Rebase via twig (knows the parent branch)
        log.push('$ twig rebase');
        const rebaseOut = run('twig rebase', cwd, {
          timeout: 120_000,
          env: agentEnv,
        });
        log.push(rebaseOut.trim());

        // Check if twig reported "up to date" but branch is actually behind origin/main.
        // This can happen when twig compares against a stale local main ref.
        const upToDate = /already up[ -]to[ -]date|is up[ -]to[ -]date/i.test(
          rebaseOut,
        );
        if (upToDate) {
          try {
            // Verify: is origin/main actually an ancestor of HEAD?
            runGit(['merge-base', '--is-ancestor', 'origin/main', 'HEAD'], cwd);
            // Exit code 0 means origin/main IS an ancestor — truly up to date
            log.push('(verified: branch is current with origin/main)');
          } catch (ancestorErr: unknown) {
            const exitStatus = (ancestorErr as { status?: number }).status;
            if (exitStatus === 1) {
              // Exit code 1 means origin/main is NOT an ancestor — branch is stale
              log.push(
                '(twig reported up-to-date but branch is behind origin/main — rebasing directly)',
              );
              log.push('$ git rebase origin/main');
              const directRebase = run('git rebase origin/main', cwd, {
                timeout: 120_000,
                env: agentEnv,
              });
              log.push(directRebase.trim());
            } else {
              // Unexpected error (e.g. exit 128 for invalid ref) — warn and skip fallback
              const msg =
                ancestorErr instanceof Error
                  ? ancestorErr.message
                  : String(ancestorErr);
              log.push(
                `(warning: merge-base --is-ancestor failed with exit ${exitStatus ?? 'unknown'} — skipping staleness check: ${msg})`,
              );
            }
          }
        }

        log.push(
          '',
          'Rebase complete. Next steps:',
          '1. worktree_stabilize — run post-rebase stabilization',
          '2. worktree_run(command: "make pc") — validate',
          '3. worktree_push — push the validated branch',
        );
        return { content: [{ type: 'text', text: log.join('\n') }] };
      } catch (err: unknown) {
        const e = err as {
          stdout?: string;
          stderr?: string;
          status?: number;
        };
        const output = [e.stdout, e.stderr].filter(Boolean).join('\n');
        const hasConflicts =
          output.includes('CONFLICT') || output.includes('could not apply');

        log.push(`Exit code: ${e.status ?? 'unknown'}`, output);

        if (hasConflicts) {
          // Check if rerere auto-resolved all conflicts.
          // rerere may populate the working tree without staging, so stage
          // resolved files first, then check for remaining unmerged entries.
          let rerereResolved = false;
          try {
            runGit(['add', '-u'], cwd);
            const conflictCheck = run(
              'git diff --name-only --diff-filter=U',
              cwd,
            ).trim();
            if (!conflictCheck) {
              // No unresolved conflicts — rerere handled them all
              rerereResolved = true;
            }
          } catch {
            // If we can't check, fall through to manual resolution
          }

          if (rerereResolved) {
            log.push(
              '',
              'rerere auto-resolved all conflicts. Continuing rebase...',
            );

            // Auto-continue loop using shared helper
            const maxIterations = 50; // Safety limit
            let iterations = 0;

            while (iterations < maxIterations) {
              iterations++;
              try {
                const step = rebaseContinueStep(cwd);

                if (step.completed) {
                  log.push(
                    `Rebase completed after ${iterations} auto-continue step(s).`,
                  );
                  log.push(
                    '',
                    'Rebase complete (rerere auto-resolved). Next steps:',
                    '1. worktree_stabilize — run post-rebase stabilization',
                    '2. worktree_run(command: "make pc") — validate',
                    '3. worktree_push — push the validated branch',
                  );
                  return {
                    content: [{ type: 'text', text: log.join('\n') }],
                  };
                }

                if (step.conflicted.length > 0) {
                  log.push(
                    `Step ${iterations}: new conflicts that rerere could not resolve:`,
                    step.conflicted.join('\n'),
                    '',
                    'Rebase paused. Resolve remaining conflicts, then:',
                    '  worktree_rebase_continue',
                    'Or: worktree_rebase(abort: true) to abort.',
                  );
                  return {
                    content: [{ type: 'text', text: log.join('\n') }],
                    isError: true,
                  };
                }

                // No conflicts but still rebasing — continue the loop
                log.push(
                  `Step ${iterations}: auto-continued (rerere resolved)`,
                );
              } catch (continueErr: unknown) {
                const ce = continueErr as {
                  stdout?: string;
                  stderr?: string;
                };
                const continueOutput = [ce.stdout, ce.stderr]
                  .filter(Boolean)
                  .join('\n');

                // Check if this step has new unresolvable conflicts
                try {
                  const remainingConflicts = run(
                    'git diff --name-only --diff-filter=U',
                    cwd,
                  )
                    .trim()
                    .split('\n')
                    .filter(Boolean);
                  if (remainingConflicts.length > 0) {
                    log.push(
                      `Step ${iterations}: new conflicts encountered:`,
                      remainingConflicts.join('\n'),
                      '',
                      'Rebase paused. Resolve remaining conflicts, then:',
                      '  worktree_rebase_continue',
                      'Or: worktree_rebase(abort: true) to abort.',
                    );
                    return {
                      content: [{ type: 'text', text: log.join('\n') }],
                      isError: true,
                    };
                  }
                } catch {
                  // Fall through
                }

                log.push(
                  `Auto-continue failed at step ${iterations}:`,
                  continueOutput,
                );
                return {
                  content: [{ type: 'text', text: log.join('\n') }],
                  isError: true,
                };
              }
            }

            log.push(
              `Safety limit reached (${maxIterations} iterations). Rebase still in progress.`,
            );
            return {
              content: [{ type: 'text', text: log.join('\n') }],
              isError: true,
            };
          }

          // rerere did not resolve all conflicts — manual resolution needed
          log.push(
            '',
            'Rebase paused due to conflicts. Resolve them, then:',
            '  git add <resolved-files>',
            '  worktree_rebase_continue',
            'Or: worktree_rebase(abort: true) to abort.',
          );
        }

        return {
          content: [{ type: 'text', text: log.join('\n') }],
          isError: true,
        };
      }
    }

    // -----------------------------------------------------------------------
    // worktree_rebase_continue
    // -----------------------------------------------------------------------
    case 'worktree_rebase_continue': {
      const { files, worktree: wtKey } = args as {
        files?: string[];
        worktree?: string;
      };

      const target = resolveTargetDir(wtKey);
      if ('error' in target) {
        return {
          content: [{ type: 'text', text: target.error }],
          isError: true,
        };
      }

      const cwd = target.path;

      // Verify rebase is in progress
      try {
        const gitDir = run('git rev-parse --absolute-git-dir', cwd).trim();
        const inRebase =
          existsSync(join(gitDir, 'rebase-merge')) ||
          existsSync(join(gitDir, 'rebase-apply'));
        if (!inRebase) {
          return {
            content: [
              {
                type: 'text',
                text: 'No rebase in progress. Use worktree_rebase to start one.',
              },
            ],
            isError: true,
          };
        }
      } catch {
        return {
          content: [{ type: 'text', text: 'Could not determine git state.' }],
          isError: true,
        };
      }

      try {
        const step = rebaseContinueStep(cwd, files);

        if (step.completed) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    completed: true,
                    remainingConflicts: [],
                    message:
                      'Rebase complete. Next: worktree_stabilize, then make pc, then worktree_push.',
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        const message =
          step.conflicted.length > 0
            ? 'Rebase paused — more conflicts to resolve.'
            : 'Rebase paused — awaiting action (e.g., edit/reword step).';

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  completed: false,
                  remainingConflicts: step.conflicted,
                  message,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; status?: number };
        const output = [e.stdout, e.stderr].filter(Boolean).join('\n');
        const hasConflicts =
          output.includes('CONFLICT') || output.includes('could not apply');

        if (hasConflicts) {
          const conflictedFiles = (() => {
            try {
              return run('git diff --name-only --diff-filter=U', cwd)
                .trim()
                .split('\n')
                .filter(Boolean);
            } catch {
              return [];
            }
          })();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    completed: false,
                    remainingConflicts: conflictedFiles,
                    message:
                      'New conflicts encountered. Resolve them and call worktree_rebase_continue again.',
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `Rebase continue failed (exit code ${e.status ?? 'unknown'}):\n${output}`,
            },
          ],
          isError: true,
        };
      }
    }

    // -----------------------------------------------------------------------
    // worktree_run
    // -----------------------------------------------------------------------
    case 'worktree_run': {
      const { command, worktree, allowMainRepo } = args as {
        command: string;
        worktree?: string;
        allowMainRepo?: boolean;
      };

      let targetDir: string;

      if (worktree) {
        const resolved = resolveWorktreePath(worktree);
        if ('error' in resolved) {
          return {
            content: [
              {
                type: 'text',
                text: resolved.error,
              },
            ],
            isError: true,
          };
        }
        targetDir = resolved.path;
      } else if (activeWorktree) {
        targetDir = activeWorktree;
      } else {
        const wts = getWorktrees();
        if (wts.length > 0 && !allowMainRepo) {
          return {
            content: [
              {
                type: 'text',
                text:
                  `Refused: no active worktree set and ${wts.length} worktree(s) exist.\n` +
                  'Running commands in the main repo while worktrees are active is dangerous.\n' +
                  'Use worktree_set first, pass the worktree parameter, or set allowMainRepo=true.\n\n' +
                  `Available: ${wts.map((w) => w.key).join(', ')}`,
              },
            ],
            isError: true,
          };
        }
        targetDir = MAIN_REPO;
      }

      // Guard: refuse main-repo execution when worktrees exist
      if (resolve(targetDir) === resolve(MAIN_REPO) && !allowMainRepo) {
        const wts = getWorktrees();
        if (wts.length > 0) {
          return {
            content: [
              {
                type: 'text',
                text:
                  `Refused: cannot run in main repo (${MAIN_REPO}) while ` +
                  `${wts.length} worktree(s) are active. Set allowMainRepo=true to override.`,
              },
            ],
            isError: true,
          };
        }
      }

      if (!existsSync(targetDir)) {
        return {
          content: [
            { type: 'text', text: `Directory does not exist: ${targetDir}` },
          ],
          isError: true,
        };
      }

      try {
        const shell =
          process.platform === 'win32' ? 'powershell.exe' : '/bin/sh';
        const output = execSync(command, {
          cwd: targetDir,
          encoding: 'utf-8',
          timeout: 120_000,
          shell,
          maxBuffer: 10 * 1024 * 1024,
        });

        return {
          content: [
            {
              type: 'text',
              text: `[cwd: ${targetDir}]\n$ ${command}\n\n${output}`,
            },
          ],
        };
      } catch (err: unknown) {
        const e = err as {
          stdout?: string;
          stderr?: string;
          status?: number;
        };
        const output =
          [e.stdout, e.stderr].filter(Boolean).join('\n') ||
          (err instanceof Error ? err.message : String(err));
        return {
          content: [
            {
              type: 'text',
              text: `[cwd: ${targetDir}]\n$ ${command}\n\nExit code: ${e.status ?? 'unknown'}\n${output}`,
            },
          ],
          isError: true,
        };
      }
    }

    // -----------------------------------------------------------------------
    // worktree_set
    // -----------------------------------------------------------------------
    case 'worktree_set': {
      const { key } = args as { key: string };
      const resolved = resolveWorktreePath(key);

      if ('error' in resolved) {
        return {
          content: [
            {
              type: 'text',
              text: `${resolved.error}\nRun worktree_list to see available worktrees.`,
            },
          ],
          isError: true,
        };
      }

      activeWorktree = resolved.path;
      return {
        content: [
          { type: 'text', text: `Active worktree set to: ${resolved.path}` },
        ],
      };
    }

    // -----------------------------------------------------------------------
    // worktree_show
    // -----------------------------------------------------------------------
    case 'worktree_show': {
      const {
        sha,
        worktree: wtKey,
        path: filterPath,
      } = args as {
        sha: string;
        worktree?: string;
        path?: string;
      };
      const target = resolveTargetDir(wtKey);
      if ('error' in target) {
        return {
          content: [{ type: 'text', text: target.error }],
          isError: true,
        };
      }
      const cwd = target.path;

      // Validate SHA — allow hex, HEAD, HEAD~N, branch names
      if (!/^[a-zA-Z0-9_./~^{}-]+$/.test(sha)) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid SHA: "${sha}". Only rev characters allowed.`,
            },
          ],
          isError: true,
        };
      }

      try {
        // Use execFileSync via runGit for safe argument passing
        const meta = runGit(
          ['show', sha, '--no-patch', '--format=%H%n%s%n%an%n%aI'],
          cwd,
          { timeout: 10_000 },
        ).trim();
        const metaLines = meta.split('\n');

        const stat = runGit(['show', sha, '--stat', '--format='], cwd, {
          timeout: 10_000,
        }).trim();
        const statEntries = stat
          .split('\n')
          .filter((l) => l.includes('|'))
          .map((l) => {
            const match = l.match(/^\s*(.+?)\s*\|\s*(\d+)\s*([+-]*)/);
            return match
              ? { file: match[1].trim(), changes: parseInt(match[2], 10) }
              : { file: l.trim(), changes: 0 };
          });

        const result: Record<string, unknown> = {
          sha: metaLines[0] ?? sha,
          message: metaLines[1] ?? '',
          author: metaLines[2] ?? '',
          date: metaLines[3] ?? '',
          stat: statEntries,
        };

        if (filterPath) {
          try {
            const diff = runGit(['show', sha, '--', filterPath], cwd, {
              timeout: 30_000,
            }).trim();
            result.diff =
              diff.length > 50_000
                ? diff.slice(0, 50_000) + '\n... [truncated]'
                : diff;
          } catch {
            result.diff =
              '(diff unavailable — file may not exist in this commit)';
          }
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; message?: string };
        const output =
          [e.stdout, e.stderr].filter(Boolean).join('\n') ||
          e.message ||
          String(err);
        return {
          content: [{ type: 'text', text: `Failed to show commit: ${output}` }],
          isError: true,
        };
      }
    }

    // -----------------------------------------------------------------------
    // worktree_stabilize
    // -----------------------------------------------------------------------
    case 'worktree_stabilize': {
      const { worktree: wtKey } = args as { worktree?: string };

      const target = resolveTargetDir(wtKey);
      if ('error' in target) {
        return {
          content: [{ type: 'text', text: target.error }],
          isError: true,
        };
      }

      const cwd = target.path;
      const log: string[] = [`[cwd: ${cwd}]`, '', 'Post-rebase stabilization:'];
      const steps = [
        { label: 'make install', cmd: 'make install', timeout: 300_000 },
        {
          label: 'pnpm exec nx run db:print-schema',
          cmd: 'pnpm exec nx run db:print-schema',
          timeout: 60_000,
        },
        {
          label: 'pnpm exec nx affected -t codegen --base=origin/main',
          cmd: 'pnpm exec nx affected -t codegen --base=origin/main',
          timeout: 120_000,
        },
      ];

      for (const step of steps) {
        log.push(``, `$ ${step.label}`);
        try {
          const out = run(step.cmd, cwd, { timeout: step.timeout });
          const trimmed = out.trim();
          if (trimmed) log.push(trimmed);
          log.push(`✓ ${step.label} succeeded`);
        } catch (err: unknown) {
          const e = err as {
            stdout?: string;
            stderr?: string;
            status?: number;
          };
          const output = [e.stdout, e.stderr].filter(Boolean).join('\n');
          log.push(
            `✗ ${step.label} failed (exit code ${e.status ?? 'unknown'})`,
            output,
          );
          return {
            content: [{ type: 'text', text: log.join('\n') }],
            isError: true,
          };
        }
      }

      log.push(
        '',
        'Stabilization complete. Next: worktree_run(command: "make pc") to validate.',
      );
      return { content: [{ type: 'text', text: log.join('\n') }] };
    }

    // -----------------------------------------------------------------------
    // worktree_status
    // -----------------------------------------------------------------------
    case 'worktree_status': {
      const { worktree: wtKey } = args as { worktree?: string };

      const target = resolveTargetDir(wtKey);
      if ('error' in target) {
        return {
          content: [{ type: 'text', text: target.error }],
          isError: true,
        };
      }

      const cwd = target.path;

      try {
        // Branch name
        const branch = run('git branch --show-current', cwd).trim();

        // Porcelain v2 status for structured parsing
        const porcelain = run('git status --porcelain=v2 --branch', cwd);
        const lines = porcelain.split('\n').filter(Boolean);

        const modified: string[] = [];
        const staged: string[] = [];
        const untracked: string[] = [];
        const conflicted: string[] = [];
        let ahead = 0;
        let behind = 0;

        for (const line of lines) {
          if (line.startsWith('# branch.ab ')) {
            // "# branch.ab +3 -1" → ahead=3, behind=1
            const match = line.match(/\+(\d+)\s+-(\d+)/);
            if (match) {
              ahead = parseInt(match[1], 10);
              behind = parseInt(match[2], 10);
            }
          } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
            // Ordinary (1) or rename/copy (2) entry
            // Format: "1 XY sub mH mI mW hH hI path"
            // Rename: "2 XY sub mH mI mW hH hI Xscore\tpath\torigPath"
            const xy = line.slice(2, 4);
            const tabParts = line.split('\t');
            // For type 2, the new path is the second tab-separated field
            const path = line.startsWith('2 ')
              ? (tabParts[1] ?? '')
              : (tabParts[1] ?? line.slice(line.indexOf('\t') + 1));
            // X = index status, Y = worktree status
            const indexStatus = xy[0];
            const worktreeStatus = xy[1];

            if (
              indexStatus === 'U' ||
              worktreeStatus === 'U' ||
              xy === 'AA' ||
              xy === 'DD'
            ) {
              conflicted.push(path);
            } else {
              if (indexStatus !== '.' && indexStatus !== '?') {
                staged.push(path);
              }
              if (worktreeStatus !== '.' && worktreeStatus !== '?') {
                modified.push(path);
              }
            }
          } else if (line.startsWith('u ')) {
            // Unmerged entry — conflict
            const path = line.slice(line.indexOf('\t') + 1);
            conflicted.push(path);
          } else if (line.startsWith('? ')) {
            untracked.push(line.slice(2));
          }
        }

        // Detect rebase/merge state — use absolute path to handle worktrees correctly
        const gitDir = run('git rev-parse --absolute-git-dir', cwd).trim();
        const rebaseInProgress =
          existsSync(join(gitDir, 'rebase-merge')) ||
          existsSync(join(gitDir, 'rebase-apply'));
        const mergeInProgress = existsSync(join(gitDir, 'MERGE_HEAD'));

        // Compute merge-base with origin/main for rebase verification
        let mergeBase: {
          ref: string;
          sha: string;
          behindMain: number;
        } | null = null;

        try {
          const mbSha = runGit(['merge-base', 'HEAD', 'origin/main'], cwd, {
            timeout: 10_000,
          }).trim();
          // Count commits on origin/main not reachable from HEAD
          const behindOutput = runGit(
            ['rev-list', '--count', 'HEAD..origin/main'],
            cwd,
            { timeout: 10_000 },
          ).trim();
          mergeBase = {
            ref: 'origin/main',
            sha: mbSha,
            behindMain: parseInt(behindOutput, 10) || 0,
          };
        } catch {
          // merge-base can fail on orphan branches or if origin/main doesn't exist
        }

        const result = {
          branch: branch || '(detached)',
          modified,
          staged,
          untracked,
          conflicted,
          ahead,
          behind,
          rebaseInProgress,
          mergeInProgress,
          mergeBase,
          clean:
            modified.length === 0 &&
            staged.length === 0 &&
            untracked.length === 0 &&
            conflicted.length === 0,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string };
        const output = [e.stdout, e.stderr].filter(Boolean).join('\n');
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get status for ${cwd}:\n${output}`,
            },
          ],
          isError: true,
        };
      }
    }

    // -----------------------------------------------------------------------
    // worktree_unjunction
    // -----------------------------------------------------------------------
    case 'worktree_unjunction': {
      const { worktree: wtKey } = args as { worktree?: string };

      const target = resolveTargetDir(wtKey);
      if ('error' in target) {
        return {
          content: [{ type: 'text', text: target.error }],
          isError: true,
        };
      }

      const cwd = target.path;
      const nmPath = join(cwd, 'node_modules');

      try {
        // Check what node_modules is
        if (!existsSync(nmPath)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    removed: false,
                    was: 'missing',
                    message: 'node_modules does not exist — nothing to remove.',
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        const stat = lstatSync(nmPath);

        if (stat.isSymbolicLink()) {
          // Junction or symlink — remove it
          // On Windows, junctions appear as symlinks to lstatSync
          // rmSync with recursive:false safely removes both junctions and symlinks
          const linkType =
            process.platform === 'win32' ? 'junction' : 'symlink';
          rmSync(nmPath, { recursive: false });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    removed: true,
                    was: linkType,
                    message: `Removed node_modules ${linkType}. Run make install in the worktree to create independent node_modules.`,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        if (stat.isDirectory()) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    removed: false,
                    was: 'directory',
                    message:
                      'node_modules is already a real directory (not a junction). No action needed.',
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  removed: false,
                  was: 'unknown',
                  message:
                    'node_modules exists but is neither a symlink/junction nor a directory.',
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err: unknown) {
        const e = err as { message?: string };
        return {
          content: [
            {
              type: 'text',
              text: `Failed to remove node_modules junction/symlink: ${e.message ?? String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`MCP worktree-server fatal: ${String(err)}\n`);
  process.exit(1);
});
