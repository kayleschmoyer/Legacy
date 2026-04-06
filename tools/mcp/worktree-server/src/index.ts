import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { execFile, execFileSync, execSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
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

/**
 * File-based persistence for the active worktree so it survives MCP server
 * restarts between tool calls.  Written on worktree_set, read when the
 * in-memory value is null.
 */
const ACTIVE_WORKTREE_STATE_FILE = join(
  MAIN_REPO,
  '.twig',
  'mcp-active-worktree',
);

function persistActiveWorktree(path: string | null): void {
  try {
    if (path) {
      mkdirSync(dirname(ACTIVE_WORKTREE_STATE_FILE), { recursive: true });
      writeFileSync(ACTIVE_WORKTREE_STATE_FILE, path, 'utf-8');
    } else if (existsSync(ACTIVE_WORKTREE_STATE_FILE)) {
      unlinkSync(ACTIVE_WORKTREE_STATE_FILE);
    }
  } catch {
    // Best-effort — don't fail tool calls over state persistence.
  }
}

function restoreActiveWorktree(): string | null {
  try {
    if (!existsSync(ACTIVE_WORKTREE_STATE_FILE)) return null;
    const saved = readFileSync(ACTIVE_WORKTREE_STATE_FILE, 'utf-8').trim();
    if (!saved || !existsSync(saved)) {
      // Stale path — clean up.
      unlinkSync(ACTIVE_WORKTREE_STATE_FILE);
      return null;
    }
    // Validate that the saved path is a known git worktree.
    try {
      const porcelain = execSync('git worktree list --porcelain', {
        cwd: MAIN_REPO,
        encoding: 'utf-8',
        timeout: 5_000,
      });
      const knownPaths = porcelain
        .split('\n')
        .filter((l) => l.startsWith('worktree '))
        .map((l) => resolve(l.slice('worktree '.length).trim()));
      if (!knownPaths.includes(resolve(saved))) {
        unlinkSync(ACTIVE_WORKTREE_STATE_FILE);
        return null;
      }
    } catch {
      // If git worktree list fails, fall back to path-exists check (already passed above).
    }
    return saved;
  } catch {
    // Best-effort.
  }
  return null;
}

// ---------------------------------------------------------------------------
// Worktree locking — file-based coordination for multi-agent workflows
// ---------------------------------------------------------------------------

/** Default lock TTL: 2 hours (in seconds). */
const DEFAULT_LOCK_TTL_SECONDS = 2 * 60 * 60;
const LOCK_FILENAME = '.agent-lock';

interface AgentLock {
  /** Identifier of the agent holding the lock (e.g. session ID, agent name). */
  agent: string;
  /** Process ID of the locking agent (for stale detection). */
  pid: number;
  /** ISO timestamp when the lock was acquired. */
  acquired: string;
  /** Lock TTL in seconds — lock is stale after acquired + ttl. */
  ttl: number;
  /** Optional human-readable description of what the agent is doing. */
  task?: string;
}

function lockFilePath(worktreePath: string): string {
  return join(worktreePath, LOCK_FILENAME);
}

function readLock(worktreePath: string): AgentLock | null {
  const p = lockFilePath(worktreePath);
  try {
    const raw = readFileSync(p, 'utf-8');
    return JSON.parse(raw) as AgentLock;
  } catch {
    return null;
  }
}

function isLockStale(lock: AgentLock): boolean {
  const acquiredTime = Date.parse(lock.acquired);
  if (!Number.isFinite(acquiredTime)) {
    // Malformed or unparseable acquisition time: treat lock as stale.
    return true;
  }
  const ttlMs = Number(lock.ttl) * 1000;
  if (!Number.isFinite(ttlMs) || ttlMs < 0) {
    // Invalid TTL (NaN, Infinity, or negative): treat lock as stale.
    return true;
  }
  const expiresAt = acquiredTime + ttlMs;
  return Date.now() >= expiresAt;
}

function writeLock(worktreePath: string, lock: AgentLock): void {
  writeFileSync(lockFilePath(worktreePath), JSON.stringify(lock, null, 2));
}

function removeLock(worktreePath: string): boolean {
  try {
    unlinkSync(lockFilePath(worktreePath));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize and validate the `files` MCP parameter.
 * MCP args are unvalidated `unknown` at runtime — clients may send a single
 * string, an array, null, or other unexpected types.
 *
 * @returns `string[]` for valid input, `undefined` when omitted, or an error
 *          message string for invalid input.
 */
function normalizeFilesParam(
  raw: unknown,
): string[] | undefined | { error: string } {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === 'string') {
    if (raw.trim() === '')
      return {
        error: 'Invalid "files" parameter: paths must be non-empty strings.',
      };
    return [raw];
  }
  if (Array.isArray(raw)) {
    const hasInvalid = raw.some(
      (f) => typeof f !== 'string' || f.trim() === '',
    );
    if (hasInvalid)
      return {
        error:
          'Invalid "files" parameter: all entries must be non-empty strings.',
      };
    return raw as string[];
  }
  return { error: 'Invalid "files" parameter: expected string or string[].' };
}

interface WorktreeInfo {
  key: string;
  path: string;
  branch: string | null;
  hasJunctionedNodeModules: boolean;
  nodeModulesTarget: string | null;
  lock: AgentLock | null;
  lockStale: boolean;
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

    // Extract Jira key from branch name (e.g. "LS-1136/mcp-worktree-server"),
    // falling back to directory name (e.g. "LS-1136-mcp-worktree-server").
    // During a rebase, HEAD is detached so branch may be null — the directory
    // name fallback ensures ticket-key lookup still works.
    const dirName = wtPath.split(/[\\/]/).pop() ?? wtPath;
    const keyMatch = branch?.match(/^(LS-\d+)/) ?? dirName.match(/^(LS-\d+)/);
    const key = keyMatch?.[1] ?? dirName;

    const nmPath = join(wtPath, 'node_modules');
    const junctioned = isJunction(nmPath);
    const target = junctioned ? getJunctionTarget(nmPath) : null;
    const lock = readLock(wtPath);

    worktrees.push({
      key,
      path: wtPath,
      branch,
      hasJunctionedNodeModules: junctioned,
      nodeModulesTarget: target,
      lock,
      lockStale: lock ? isLockStale(lock) : false,
    });
  }

  return worktrees;
}

/**
 * Look up a worktree by key, branch name, or directory name.
 *
 * Resolution order:
 * 1. Absolute path (for ephemeral worktrees like `.claude/worktrees/agent-*`)
 * 2. Exact branch name match (e.g. "LS-1508/worktree-commit-secrets-tf")
 * 3. Exact directory name match (e.g. "LS-1508-worktree-commit-secrets-tf")
 * 4. Ticket key prefix match (e.g. "LS-1508" or "1508")
 *    - If multiple worktrees share the same key, returns an error listing options
 */
function resolveWorktreePath(
  key: string | undefined,
): { path: string } | { error: string } {
  if (!key) {
    return { error: 'Missing required key parameter.' };
  }

  // 1. Absolute path — supports ephemeral worktrees (e.g. .claude/worktrees/)
  //    that are not registered via `make worktree`
  if (isAbsolute(key)) {
    const normalized = resolve(key);
    if (normalized === MAIN_REPO) {
      return {
        error:
          'Absolute path resolves to the main repository root, which cannot be used as a worktree',
      };
    }
    if (!existsSync(normalized)) {
      return { error: `Absolute path does not exist: ${normalized}` };
    }
    // Validate it's a git worktree or repo (has .git file or directory)
    if (!existsSync(join(normalized, '.git'))) {
      return {
        error: `Path exists but is not a git worktree: ${normalized}`,
      };
    }
    return { path: normalized };
  }

  const worktrees = getWorktrees();

  // 2. Exact branch name match
  const branchMatch = worktrees.find((w) => w.branch === key);
  if (branchMatch) return { path: branchMatch.path };

  // 3. Exact directory name match (last segment of path)
  const dirMatch = worktrees.find((w) => w.path.split(/[\\/]/).pop() === key);
  if (dirMatch) return { path: dirMatch.path };

  // 4. Ticket key prefix match
  const normalized = key.startsWith('LS-') ? key : `LS-${key}`;
  const keyMatches = worktrees.filter((w) => w.key === normalized);

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
      `Ambiguous: ${keyMatches.length} worktrees match key '${normalized}'.\n` +
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
  // Try restoring from file (survives server restarts).
  const restored = restoreActiveWorktree();
  if (restored) {
    activeWorktree = restored;
    return { path: restored };
  }
  return {
    error:
      'No active worktree set. Use worktree_set first or pass the worktree parameter.',
  };
}

/**
 * Resolve the best available shell for `worktree_run` on Windows.
 *
 * Priority:
 *  1. Git Bash (`bash.exe` bundled with Git for Windows) — full Unix semantics:
 *     `&&`, `||`, `|`, `head`, `grep`, `sed`, `awk`, etc.
 *  2. `cmd.exe` — supports `&&` and `|` but lacks Unix utilities.
 *
 * PowerShell 5 (`powershell.exe`) is intentionally avoided: it does not
 * support `&&` as a command separator and lacks Unix utilities, causing
 * frequent agent failures when running shell pipelines.
 */
let cachedWindowsShell: string | undefined;

function resolveWindowsShell(): string {
  if (cachedWindowsShell !== undefined) return cachedWindowsShell;

  const programFiles = process.env['ProgramFiles'];
  const programFilesX86 = process.env['ProgramFiles(x86)'];
  const localAppData = process.env['LOCALAPPDATA'];

  const gitBashCandidates: string[] = [
    // Derive from environment variables when possible
    ...(programFiles ? [join(programFiles, 'Git', 'bin', 'bash.exe')] : []),
    ...(programFilesX86
      ? [join(programFilesX86, 'Git', 'bin', 'bash.exe')]
      : []),
    ...(localAppData
      ? [join(localAppData, 'Programs', 'Git', 'bin', 'bash.exe')]
      : []),
    // Backwards-compatible hardcoded defaults
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  ];

  for (const candidate of gitBashCandidates) {
    if (existsSync(candidate)) return (cachedWindowsShell = candidate);
  }

  // Fallback: try to locate bash.exe on PATH using where.exe
  try {
    const whereOutput = execSync('where bash', {
      encoding: 'utf-8',
      timeout: 3_000,
    });
    const lines = whereOutput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    for (const line of lines) {
      const lower = line.toLowerCase();
      // Exclude the WSL launcher (C:\Windows\System32\bash.exe): it does not behave
      // like Git Bash and will fail when given Windows paths as cwd.
      if (lower.includes('\\windows\\system32\\bash.exe')) continue;
      if (existsSync(line)) return (cachedWindowsShell = line);
    }
  } catch {
    // Ignore errors and fall back to cmd.exe below.
  }

  return (cachedWindowsShell = 'cmd.exe');
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

/**
 * Optionally cap output to the last N lines.
 * When lines are omitted, a header indicating the omitted count is prepended
 * so agents know the output was trimmed and can adjust if needed.
 */
function applyTailLines(output: string, tailLines?: number): string {
  if (!tailLines || tailLines <= 0) return output;
  const lines = output.trimEnd().split('\n');
  if (lines.length <= tailLines) return output;
  const omitted = lines.length - tailLines;
  const tail = lines.slice(-tailLines).join('\n');
  return `[... ${omitted} line${omitted === 1 ? '' : 's'} omitted — use tailLines=0 or omit to see full output ...]\n${tail}`;
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
        'Restore files to a ref, or resolve conflicts with theirs/ours strategy.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          files: {
            type: 'array' as const,
            items: { type: 'string' },
            description: 'File paths',
          },
          strategy: {
            type: 'string',
            enum: ['theirs', 'ours'],
            description: 'Conflict resolution strategy',
          },
          ref: { type: 'string', description: 'Restore ref (default: HEAD)' },
          worktree: {
            type: 'string',
            description:
              'Ticket key, absolute path, or omit for active worktree',
          },
        },
        required: ['files'],
      },
    },
    {
      name: 'worktree_resolve_conflict',
      description:
        'List conflicted files or resolve them with per-file strategies. Without resolutions, returns conflict details.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          resolutions: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                file: { type: 'string', description: 'File path' },
                strategy: {
                  type: 'string',
                  enum: ['theirs', 'ours'],
                  description: 'Resolution strategy',
                },
              },
              required: ['file', 'strategy'],
            },
            description:
              'Per-file resolution strategies. Omit to list conflicted files.',
          },
          worktree: {
            type: 'string',
            description:
              'Ticket key, absolute path, or omit for active worktree',
          },
        },
      },
    },
    {
      name: 'worktree_commit',
      description:
        'Stage and commit. Refuses main. Refuses .env/credentials. Supports amend. Auto-appends Co-Authored-By.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          message: {
            type: 'string',
            description: 'Conventional format: type(scope): description',
          },
          files: {
            anyOf: [
              { type: 'string' as const },
              { type: 'array' as const, items: { type: 'string' } },
            ],
            description: 'Files to stage (default: all)',
          },
          worktree: {
            type: 'string',
            description:
              'Ticket key, absolute path, or omit for active worktree',
          },
          worktreeKey: {
            type: 'string',
            description:
              'Alias for worktree. Ticket key, absolute path, or omit for active worktree',
          },
          amend: {
            type: 'boolean',
            description: 'Amend previous commit (--no-edit)',
          },
        },
        required: [],
      },
    },
    {
      name: 'worktree_conflict_info',
      description: 'List conflicted files with line ranges and previews.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          worktree: {
            type: 'string',
            description:
              'Ticket key, absolute path, or omit for active worktree',
          },
        },
      },
    },
    {
      name: 'worktree_diff',
      description:
        'Git diff against a base ref (default: origin/main). Supports stat/name-only. Pass staged:true to show staged changes (git diff --cached).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          worktree: {
            type: 'string',
            description:
              'Ticket key, absolute path, or omit for active worktree',
          },
          base: {
            type: 'string',
            description:
              'Base ref (default: origin/main). Ignored when staged is true.',
          },
          paths: {
            type: 'array' as const,
            items: { type: 'string' },
            description: 'Path filter',
          },
          stat: { type: 'boolean', description: 'Diffstat only' },
          nameOnly: { type: 'boolean', description: 'File names only' },
          staged: {
            type: 'boolean',
            description:
              'Show staged changes only (git diff --cached / index vs HEAD). When true, the base ref is ignored.',
          },
        },
      },
    },
    {
      name: 'worktree_guard',
      description: 'Check if a path is inside the main repo and warn.',
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
        'List active worktrees with junction status and branch info. ' +
        'Pass remote=true to list remote branches instead (with optional pattern filter and ahead/behind counts).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          remote: {
            type: 'boolean',
            description:
              'List remote branches instead of local worktrees (default: false)',
          },
          pattern: {
            type: 'string',
            description:
              'Glob pattern to filter remote branches (e.g. "*LS-193*"). Only used when remote=true.',
          },
          limit: {
            type: 'number',
            description:
              'Maximum number of remote branches to return (default: 50). Only used when remote=true.',
          },
        },
      },
    },
    {
      name: 'worktree_log',
      description: 'Structured commit log as JSON.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          worktree: {
            type: 'string',
            description:
              'Ticket key, absolute path, or omit for active worktree',
          },
          maxCount: {
            type: 'number',
            description: 'Max commits (default: 20)',
          },
          path: { type: 'string', description: 'File path filter' },
          range: { type: 'string', description: 'Commit range' },
          stat: {
            type: 'boolean',
            description:
              'Include per-commit file change stats (files changed, insertions, deletions). Use maxCount=1 + stat=true as replacement for git show --stat HEAD.',
          },
        },
      },
    },
    {
      name: 'worktree_ls_tree',
      description: 'List files at a git ref without checkout (git ls-tree).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          ref: { type: 'string', description: 'Git ref to list from' },
          path: {
            type: 'string',
            description: 'Directory path (relative to root)',
          },
          recursive: {
            type: 'boolean',
            description: 'Recursive (default: true)',
          },
          worktree: {
            type: 'string',
            description:
              'Ticket key, absolute path, or omit for active worktree',
          },
        },
        required: ['ref'],
      },
    },
    {
      name: 'worktree_push',
      description: 'Push with --force-with-lease. Refuses main.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          worktree: {
            type: 'string',
            description:
              'Ticket key, absolute path, or omit for active worktree',
          },
          worktreeKey: {
            type: 'string',
            description:
              'Alias for worktree. Ticket key, absolute path, or omit for active worktree',
          },
          setUpstream: { type: 'boolean', description: 'Set upstream (-u)' },
        },
      },
    },
    {
      name: 'worktree_rebase',
      description:
        'Fetch and rebase onto parent. Run worktree_stabilize after before pushing.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          worktree: {
            type: 'string',
            description:
              'Ticket key, absolute path, or omit for active worktree',
          },
          abort: { type: 'boolean', description: 'Abort in-progress rebase' },
          skip: {
            type: 'boolean',
            description: 'Skip current commit in rebase',
          },
        },
      },
    },
    {
      name: 'worktree_rebase_continue',
      description: 'Continue rebase after resolving conflicts.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          files: {
            anyOf: [
              { type: 'string' as const },
              { type: 'array' as const, items: { type: 'string' } },
            ],
            description: 'Files to stage (default: all)',
          },
          worktree: {
            type: 'string',
            description:
              'Ticket key, absolute path, or omit for active worktree',
          },
        },
      },
    },
    {
      name: 'worktree_run',
      description:
        'Run a command in the active worktree. Refuses main repo unless overridden.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          command: { type: 'string', description: 'Shell command' },
          worktree: {
            type: 'string',
            description:
              'Ticket key, absolute path, or omit for active worktree',
          },
          allowMainRepo: { type: 'boolean', description: 'Allow main repo' },
          tailLines: {
            type: 'integer',
            minimum: 0,
            description:
              'Cap output to the last N lines. Use 0 for no truncation. Useful for high-volume commands like "make pc" (~430 KB) where only the final pass/fail lines matter. A header showing the omitted line count is prepended.',
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
            description:
              'Ticket key, number, branch name, directory name, or absolute path to a git worktree (including ephemeral .claude/worktrees/ paths)',
          },
        },
        required: ['key'],
      },
    },
    {
      name: 'worktree_show',
      description:
        'Show commit metadata, stat summary, and optional filtered diff.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          sha: { type: 'string', description: 'Commit SHA or HEAD' },
          worktree: {
            type: 'string',
            description:
              'Ticket key, absolute path, or omit for active worktree',
          },
          path: { type: 'string', description: 'File path for filtered diff' },
        },
        required: ['sha'],
      },
    },
    {
      name: 'worktree_stabilize',
      description:
        'Post-rebase stabilization: install, db:print-schema, codegen. Must run BEFORE push.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          worktree: {
            type: 'string',
            description:
              'Ticket key, absolute path, or omit for active worktree',
          },
        },
      },
    },
    {
      name: 'worktree_status',
      description:
        'Structured git status: files, branch, ahead/behind, rebase/conflict state.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          worktree: {
            type: 'string',
            description:
              'Ticket key, absolute path, or omit for active worktree',
          },
          worktreeKey: {
            type: 'string',
            description:
              'Alias for worktree. Ticket key, absolute path, or omit for active worktree',
          },
        },
      },
    },
    {
      name: 'worktree_show_file',
      description:
        'Read the contents of a file at a specific git ref (branch, tag, or SHA) ' +
        'without checking it out. Useful for inspecting files on remote branches ' +
        'during CI triage. Runs `git show <ref>:<path>`. ' +
        'Defaults to HEAD when `ref` is omitted.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          ref: {
            type: 'string',
            description:
              'Git ref to read from (e.g. "origin/main", "origin/LS-1234/branch", "HEAD~1", a SHA). ' +
              'Defaults to "HEAD" when omitted.',
          },
          path: {
            type: 'string',
            description:
              'File path relative to repo root (e.g. "lib/db-client/src/schema.ts").',
          },
          worktree: {
            type: 'string',
            description:
              'Optional ticket key. Uses active worktree if omitted, falls back to main repo if no active worktree is set.',
          },
          startLine: {
            type: 'integer',
            minimum: 1,
            description:
              'First line to return (1-based, inclusive). Omit to return the full file.',
          },
          endLine: {
            type: 'integer',
            minimum: 1,
            description:
              'Last line to return (1-based, inclusive). Requires startLine. Defaults to startLine when omitted.',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'worktree_show_remote',
      description:
        'Read a file from a remote branch without needing a worktree. ' +
        'Auto-fetches the remote ref first, then reads the file via `git show`. ' +
        'Useful for inspecting files on PR branches before deciding whether to create a worktree.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          ref: {
            type: 'string',
            description:
              'Remote ref to read from (e.g. "origin/LS-1901/ci-dispatch-workflow"). ' +
              'If no remote prefix is given, "origin/" is prepended automatically.',
          },
          path: {
            type: 'string',
            description:
              'File path relative to repo root (e.g. "tools/mcp/ci-server/src/tools/dispatch-workflow.ts").',
          },
          lines: {
            type: 'string',
            description:
              'Optional line range to return (e.g. "1-30", "50-100"). Returns the full file if omitted.',
          },
        },
        required: ['ref', 'path'],
      },
    },
    {
      name: 'worktree_unjunction',
      description:
        'Remove node_modules junction so worktree gets independent deps via make install.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          worktree: {
            type: 'string',
            description:
              'Ticket key, absolute path, or omit for active worktree',
          },
        },
      },
    },
    {
      name: 'worktree_unstage',
      description:
        'Remove files from the git staging area (index) without losing changes. ' +
        'Equivalent to `git reset HEAD -- <files>`. Use to unstage accidentally added files.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          files: {
            anyOf: [
              { type: 'string' as const },
              { type: 'array' as const, items: { type: 'string' } },
            ],
            description:
              'File paths to unstage (relative to repo root). Use ["."] to unstage all.',
          },
          worktree: {
            type: 'string',
            description:
              "Optional ticket key (e.g. 'LS-1134'). Uses active worktree if omitted.",
          },
        },
        required: ['files'],
      },
    },
    {
      name: 'worktree_run_all',
      description:
        'Run a make target across all active worktrees and report pass/fail per worktree. ' +
        'Useful for batch validation (e.g. format:write, lint, typecheck, pc) across all in-flight branches.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          command: {
            type: 'string',
            description:
              'Make target to run (e.g. "format:write", "lint", "lint-fix", "typecheck", "pc", "build", "test", "codegen", "format:check").',
          },
          filter: {
            type: 'string',
            description:
              'Filter worktrees by ticket prefix (e.g. "LS-16"). Matches against key or branch.',
          },
          parallel: {
            type: 'boolean',
            description:
              'Run in parallel vs sequential. Default: false (sequential).',
          },
          maxConcurrency: {
            type: 'number',
            description: 'Max parallel workers when parallel=true. Default: 4.',
          },
          timeoutSeconds: {
            type: 'number',
            description:
              'Override per-target timeout in seconds. Defaults: pc=600, install/build/test/codegen=900, others=300.',
          },
        },
        required: ['command'],
      },
    },
    {
      name: 'worktree_lock',
      description:
        'Acquire an advisory lock on a worktree for multi-agent coordination. ' +
        'Signals to other agents that the worktree is in use so they should avoid modifying it concurrently. ' +
        'Locks have a TTL and are automatically cleaned up when stale.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          worktree: {
            type: 'string',
            description:
              'Ticket key, absolute path, or omit for active worktree',
          },
          agent: {
            type: 'string',
            description:
              'Agent identifier (e.g. session ID, agent name). Defaults to "claude-session".',
          },
          task: {
            type: 'string',
            description:
              'Human-readable description of what the agent is doing (optional).',
          },
          ttl: {
            type: 'number',
            description:
              'Lock TTL in seconds (default: 7200 = 2 hours). Lock expires after this period.',
          },
          force: {
            type: 'boolean',
            description:
              'Force-acquire even if another agent holds the lock (default: false).',
          },
        },
      },
    },
    {
      name: 'worktree_unlock',
      description:
        'Release an advisory lock on a worktree. Any agent can release any lock ' +
        '(locks are advisory, not enforced).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          worktree: {
            type: 'string',
            description:
              'Ticket key, absolute path, or omit for active worktree',
          },
        },
      },
    },
    {
      name: 'worktree_clean',
      description:
        'Remove a worktree safely (junction-aware). Uses `twig worktree remove` to avoid ' +
        'destroying shared junctions. Clears active worktree if it was the one removed.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          worktree: {
            type: 'string',
            description:
              'Ticket key, absolute path, or omit for active worktree',
          },
          prune: {
            type: 'boolean',
            description:
              'Also run `twig worktree clean` to prune stale references (default: true)',
          },
          force: {
            type: 'boolean',
            description:
              'Fall back to `git worktree remove --force` if twig times out or fails. ' +
              'Removes junctions first to avoid deleting through them. (default: false)',
          },
        },
      },
    },
    {
      name: 'worktree_check_ignore',
      description:
        'Check whether paths would be ignored by .gitignore rules (git check-ignore -v). ' +
        'Returns per-path results with the matching rule, source file, and line number. ' +
        'Useful when a newly created file silently disappears from git status.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
            description:
              'One or more file/directory paths to check (maximum 100). Paths are passed through as provided; only values beginning with `-` are rejected.',
            minItems: 1,
            maxItems: 100,
          },
          worktree: {
            type: 'string',
            description:
              'Ticket key, absolute path, or omit for active worktree',
          },
        },
        required: ['paths'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Restore persisted active worktree on first tool call after server restart.
  activeWorktree ??= restoreActiveWorktree();

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
    // worktree_resolve_conflict
    // -----------------------------------------------------------------------
    case 'worktree_resolve_conflict': {
      const { resolutions, worktree: wtKey } = args as {
        resolutions?: Array<{
          file: string;
          strategy: 'theirs' | 'ours';
        }>;
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

      // List conflicted files
      let conflictedFiles: string[];
      try {
        conflictedFiles = run('git diff --name-only --diff-filter=U', cwd)
          .trim()
          .split('\n')
          .filter(Boolean);
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
              text: `Failed to detect conflicted files (exit code ${e.status ?? 'unknown'}):\n${output}`,
            },
          ],
          isError: true,
        };
      }

      // If no resolutions provided, return the list of conflicts
      if (!resolutions || resolutions.length === 0) {
        if (conflictedFiles.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  { conflictedFiles: [], message: 'No conflicts found.' },
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
                  conflictedFiles,
                  message: `${conflictedFiles.length} conflicted file(s). Provide resolutions to resolve them.`,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // Apply resolutions
      const resolved: string[] = [];
      const errors: Array<{ file: string; error: string }> = [];

      for (const { file, strategy } of resolutions) {
        try {
          runGit(['checkout', `--${strategy}`, '--', file], cwd);
          runGit(['add', '--', file], cwd);
          resolved.push(file);
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
          errors.push({
            file,
            error: `exit code ${e.status ?? 'unknown'}: ${output}`,
          });
        }
      }

      // Check remaining conflicts
      let remaining: string[];
      try {
        remaining = run('git diff --name-only --diff-filter=U', cwd)
          .trim()
          .split('\n')
          .filter(Boolean);
      } catch {
        remaining = [];
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                resolved,
                errors: errors.length > 0 ? errors : undefined,
                remainingConflicts: remaining,
                message:
                  remaining.length === 0
                    ? `All conflicts resolved (${resolved.length} file(s)). Ready for worktree_rebase_continue.`
                    : `Resolved ${resolved.length} file(s), ${remaining.length} conflict(s) remaining.`,
              },
              null,
              2,
            ),
          },
        ],
        ...(errors.length > 0 ? { isError: true } : {}),
      };
    }

    // -----------------------------------------------------------------------
    // worktree_commit
    // -----------------------------------------------------------------------
    case 'worktree_commit': {
      const {
        message,
        files: rawFiles,
        worktree,
        worktreeKey,
        amend,
      } = args as {
        message?: string;
        files?: unknown;
        worktree?: unknown;
        worktreeKey?: unknown;
        amend?: boolean;
      };
      if (worktreeKey !== undefined && typeof worktreeKey !== 'string') {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid worktreeKey: expected string, got ${typeof worktreeKey}`,
            },
          ],
          isError: true,
        };
      }
      if (typeof worktreeKey === 'string' && worktreeKey.trim().length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'Invalid worktreeKey: provided value is empty or whitespace-only. Omit the parameter to use the active worktree.',
            },
          ],
          isError: true,
        };
      }
      if (worktree !== undefined && typeof worktree !== 'string') {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid worktree: expected string, got ${typeof worktree}`,
            },
          ],
          isError: true,
        };
      }
      if (typeof worktree === 'string' && worktree.trim().length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'Invalid worktree: provided value is empty or whitespace-only. Omit the parameter to use the active worktree.',
            },
          ],
          isError: true,
        };
      }
      const normalizedWorktreeKey =
        typeof worktreeKey === 'string' && worktreeKey.trim().length > 0
          ? worktreeKey.trim()
          : undefined;
      const normalizedWorktree =
        typeof worktree === 'string' && worktree.trim().length > 0
          ? worktree.trim()
          : undefined;
      if (
        normalizedWorktreeKey &&
        normalizedWorktree &&
        normalizedWorktreeKey !== normalizedWorktree
      ) {
        return {
          content: [
            {
              type: 'text',
              text: 'Conflicting parameters: worktreeKey and worktree were both provided with different non-empty values.',
            },
          ],
          isError: true,
        };
      }
      const wtKey = normalizedWorktreeKey ?? normalizedWorktree;

      // Normalize and validate files parameter
      const filesResult = normalizeFilesParam(rawFiles);
      if (
        filesResult &&
        typeof filesResult === 'object' &&
        'error' in filesResult
      ) {
        return {
          content: [{ type: 'text', text: filesResult.error }],
          isError: true,
        };
      }
      const files = filesResult;

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

      // .example files are templates with placeholder values (e.g. .env.example,
      // terraform/secrets.auto.tfvars.example) — safe to commit by convention
      const isExampleTemplate = (f: string) => /\.example$/i.test(f);

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
        !isExampleTemplate(f) &&
        (alwaysBlockPatterns.some((p) => p.test(f)) ||
          (nameBasedPatterns.some((p) => p.test(f)) &&
            !safeExtensions.test(f)));

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
        staged,
      } = args as {
        worktree?: string;
        base?: string;
        paths?: string[];
        stat?: boolean;
        nameOnly?: boolean;
        staged?: boolean;
      };

      const target = resolveTargetDir(wtKey);
      if ('error' in target) {
        return {
          content: [{ type: 'text', text: target.error }],
          isError: true,
        };
      }
      const cwd = target.path;

      // Validate base ref only when not in staged mode
      if (!staged) {
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
        // staged=true → git diff --cached (index vs HEAD)
        // staged=false/omitted → git diff <base> (working tree vs base ref)
        const gitArgs = staged ? ['diff', '--cached'] : ['diff', base];
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
                text: staged
                  ? 'No staged changes (index is clean).'
                  : `No differences found between ${base} and the working tree.`,
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
      const { remote, pattern, limit } = args as {
        remote?: boolean;
        pattern?: string;
        limit?: number;
      };

      // Remote branch listing mode
      if (remote) {
        // Validate pattern — only safe glob chars
        if (pattern && !/^[a-zA-Z0-9_./\-*?[\]{}]+$/.test(pattern)) {
          return {
            content: [
              {
                type: 'text',
                text: `Invalid pattern: "${pattern}". Only alphanumeric, glob wildcards (*?[]{}) and '.', '/', '-', '_' allowed.`,
              },
            ],
            isError: true,
          };
        }

        try {
          // Fetch latest remote state
          runGit(['fetch', 'origin', '--prune'], MAIN_REPO, {
            timeout: 30_000,
          });

          // List remote branches (optionally filtered by pattern)
          const listArgs = ['branch', '-r', '--list'];
          if (pattern) {
            // Ensure pattern targets origin/ namespace
            const fullPattern = pattern.startsWith('origin/')
              ? pattern
              : `origin/${pattern}`;
            listArgs.push(fullPattern);
          }
          const branchOutput = runGit(listArgs, MAIN_REPO);
          const branches = branchOutput
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(
              (line) => line.length > 0 && !line.includes(' -> '), // skip HEAD alias
            );

          if (branches.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: pattern
                    ? `No remote branches matching "${pattern}".`
                    : 'No remote branches found.',
                },
              ],
            };
          }

          // Cap the number of branches to avoid slow sequential git operations
          const maxBranches = limit && limit > 0 ? limit : 50;
          const cappedBranches = branches.slice(0, maxBranches);
          const truncated = branches.length > maxBranches;

          // Get ahead/behind counts relative to origin/main for each branch
          const results: Array<{
            branch: string;
            ahead: number;
            behind: number;
            lastCommitDate: string;
          }> = [];

          for (const branch of cappedBranches) {
            if (branch === 'origin/main' || branch === 'origin/HEAD') continue;
            try {
              const counts = runGit(
                [
                  'rev-list',
                  '--left-right',
                  '--count',
                  `origin/main...${branch}`,
                ],
                MAIN_REPO,
              ).trim();
              const parts = counts.split(/\s+/);
              const parsedBehind = Number(parts[0]);
              const parsedAhead = Number(parts[1]);
              const behindCount =
                parts.length >= 2 && !Number.isNaN(parsedBehind)
                  ? parsedBehind
                  : 0;
              const aheadCount =
                parts.length >= 2 && !Number.isNaN(parsedAhead)
                  ? parsedAhead
                  : 0;
              const lastDate = runGit(
                ['log', '-1', '--format=%ci', branch],
                MAIN_REPO,
              ).trim();
              results.push({
                branch: branch.replace(/^origin\//, ''),
                ahead: aheadCount,
                behind: behindCount,
                lastCommitDate: lastDate,
              });
            } catch {
              results.push({
                branch: branch.replace(/^origin\//, ''),
                ahead: 0,
                behind: 0,
                lastCommitDate: 'unknown',
              });
            }
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    count: results.length,
                    totalRemote: branches.length,
                    truncated,
                    branches: results,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            content: [
              {
                type: 'text',
                text: `Failed to list remote branches: ${message}`,
              },
            ],
            isError: true,
          };
        }
      }

      // Default: list local worktrees
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
        const lockStatus = w.lock
          ? w.lockStale
            ? `Lock: STALE (agent: ${w.lock.agent}, acquired: ${w.lock.acquired})`
            : `Lock: ACTIVE (agent: ${w.lock.agent}, task: ${w.lock.task ?? 'n/a'}, acquired: ${w.lock.acquired})`
          : 'Lock: none';
        return [
          w.key,
          `  Path:   ${w.path}`,
          `  Branch: ${w.branch ?? 'unknown'}`,
          `  ${nmStatus}`,
          `  ${lockStatus}`,
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
        stat = false,
      } = args as {
        worktree?: string;
        maxCount?: number;
        path?: string;
        range?: string;
        stat?: boolean;
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
        if (stat) gitArgs.push('--numstat');
        if (range) gitArgs.push(range);
        if (filterPath) gitArgs.push('--', filterPath);

        const output = runGit(gitArgs, cwd, { timeout: 30_000 });
        const commits = output
          .split(RS)
          .filter((b) => b.trim())
          .map((record) => {
            const lines = record.trim().split('\n');
            // First line contains the format fields
            const fields = lines[0].split(FS);
            const commit: Record<string, unknown> = {
              sha: fields[0] ?? '',
              shortSha: fields[1] ?? '',
              message: fields[2] ?? '',
              author: fields[3] ?? '',
              date: fields[4] ?? '',
              refs: fields[5] ?? '',
            };

            if (stat && lines.length > 1) {
              const files: Array<{
                path: string;
                insertions: number;
                deletions: number;
              }> = [];
              // Parse numstat lines: "12\t3\tpath/to/file" or "-\t-\tpath/to/file" for binary files
              for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                const numstatMatch = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
                if (numstatMatch) {
                  files.push({
                    path: numstatMatch[3],
                    insertions:
                      numstatMatch[1] === '-'
                        ? 0
                        : Number.parseInt(numstatMatch[1], 10),
                    deletions:
                      numstatMatch[2] === '-'
                        ? 0
                        : Number.parseInt(numstatMatch[2], 10),
                  });
                }
                // Skip non-numstat lines such as summaries
              }
              commit.files = files;
            }

            return commit;
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
      const { worktree, worktreeKey, setUpstream } = args as {
        worktree?: unknown;
        worktreeKey?: unknown;
        setUpstream?: boolean;
      };
      if (worktreeKey !== undefined && typeof worktreeKey !== 'string') {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid worktreeKey: expected string, got ${typeof worktreeKey}`,
            },
          ],
          isError: true,
        };
      }
      if (typeof worktreeKey === 'string' && worktreeKey.trim().length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'Invalid worktreeKey: provided value is empty or whitespace-only. Omit the parameter to use the active worktree.',
            },
          ],
          isError: true,
        };
      }
      if (worktree !== undefined && typeof worktree !== 'string') {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid worktree: expected string, got ${typeof worktree}`,
            },
          ],
          isError: true,
        };
      }
      if (typeof worktree === 'string' && worktree.trim().length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'Invalid worktree: provided value is empty or whitespace-only. Omit the parameter to use the active worktree.',
            },
          ],
          isError: true,
        };
      }
      const normalizedWorktreeKey =
        typeof worktreeKey === 'string' && worktreeKey.trim().length > 0
          ? worktreeKey.trim()
          : undefined;
      const normalizedWorktree =
        typeof worktree === 'string' && worktree.trim().length > 0
          ? worktree.trim()
          : undefined;
      if (
        normalizedWorktreeKey &&
        normalizedWorktree &&
        normalizedWorktreeKey !== normalizedWorktree
      ) {
        return {
          content: [
            {
              type: 'text',
              text: 'Conflicting parameters: worktreeKey and worktree were both provided with different non-empty values.',
            },
          ],
          isError: true,
        };
      }
      const wtKey = normalizedWorktreeKey ?? normalizedWorktree;

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

        // Append an explicit success summary so agents don't need a follow-up
        // worktree_status call to confirm the push landed. git push writes its
        // progress/result lines to stderr (not captured by run()), so the raw
        // `out` may be empty or contain only hook output.
        const pushedFullSha = run('git rev-parse HEAD', cwd).trim();
        const pushedSha = pushedFullSha.slice(0, 7);
        const pushedBranch = run('git branch --show-current', cwd).trim();
        let remoteConfirmed = false;
        try {
          const remoteRef = `refs/heads/${pushedBranch}`;
          const remoteInfo = execFileSync(
            'git',
            ['ls-remote', '--exit-code', 'origin', remoteRef],
            { cwd, encoding: 'utf8', timeout: 30_000 },
          ).trim();
          const remoteSha = remoteInfo.split(/\s+/)[0] ?? '';
          remoteConfirmed = remoteSha === pushedFullSha;
        } catch {
          // If the remote ref cannot be queried, leave confirmation as false.
        }

        const summary = [
          `pushed: true`,
          `branch: ${pushedBranch}`,
          `sha: ${pushedSha}`,
          `remote-confirmed: ${remoteConfirmed}`,
        ].join('  ');

        return {
          content: [
            {
              type: 'text',
              text: `[resolvedWorktree: ${cwd}]\n[cwd: ${cwd}]\n$ ${cmd}\n\n${out.trim()}\n\n✓ ${summary}`,
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

        // Pre-push hook may auto-amend the commit (e.g. formatting fixes) and
        // abort the push with "Push aborted — run 'git push' again". The
        // amended commit is already created, so a single retry is safe.
        const hookAmended =
          /push aborted/i.test(output) &&
          /amended commit|auto-amending/i.test(output);

        if (hookAmended) {
          try {
            const retryOut = run(cmd, cwd, { timeout: 30_000 });
            const retryPushedFullSha = run('git rev-parse HEAD', cwd).trim();
            const retryPushedSha = retryPushedFullSha.slice(0, 7);
            const retryPushedBranch = run(
              'git branch --show-current',
              cwd,
            ).trim();
            let retryRemoteConfirmed = false;
            try {
              const retryRemoteRef = `refs/heads/${retryPushedBranch}`;
              const retryRemoteInfo = execFileSync(
                'git',
                ['ls-remote', '--exit-code', 'origin', retryRemoteRef],
                { cwd, encoding: 'utf8', timeout: 30_000 },
              ).trim();
              const retryRemoteSha = retryRemoteInfo.split(/\s+/)[0] ?? '';
              retryRemoteConfirmed = retryRemoteSha === retryPushedFullSha;
            } catch {
              // If the remote ref cannot be queried, leave confirmation as false.
            }
            const retrySummary = `pushed: true  branch: ${retryPushedBranch}  sha: ${retryPushedSha}  remote-confirmed: ${retryRemoteConfirmed}`;
            return {
              content: [
                {
                  type: 'text',
                  text: [
                    `[resolvedWorktree: ${cwd}]`,
                    `[cwd: ${cwd}]`,
                    `$ ${cmd}  (initial push — hook amended commit)`,
                    `Exit code: ${e.status ?? 'unknown'}`,
                    output,
                    ``,
                    `Pre-push hook amended the commit; retrying push...`,
                    ``,
                    `$ ${cmd}  (retry)`,
                    retryOut.trim(),
                    ``,
                    `✓ ${retrySummary}`,
                  ].join('\n'),
                },
              ],
            };
          } catch (retryErr: unknown) {
            const r = retryErr as {
              stdout?: string;
              stderr?: string;
              status?: number;
            };
            const retryOutput = [r.stdout, r.stderr].filter(Boolean).join('\n');
            return {
              content: [
                {
                  type: 'text',
                  text: [
                    `[cwd: ${cwd}]`,
                    `$ ${cmd}  (initial push — hook amended commit)`,
                    `Exit code: ${e.status ?? 'unknown'}`,
                    output,
                    ``,
                    `$ ${cmd}  (retry)`,
                    `Exit code: ${r.status ?? 'unknown'}`,
                    retryOutput,
                  ].join('\n'),
                },
              ],
              isError: true,
            };
          }
        }

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

            // Compute gitDir once for rebase-in-progress checks
            let gitDir: string;
            try {
              gitDir = run('git rev-parse --absolute-git-dir', cwd).trim();
            } catch (gdErr: unknown) {
              const e = gdErr as { message?: string };
              log.push(
                `Warning: could not determine git dir: ${e.message ?? 'unknown error'}`,
                'Cannot auto-continue rebase.',
              );
              return {
                content: [{ type: 'text', text: log.join('\n') }],
                isError: true,
              };
            }

            // Helper: check if rebase is still in progress (filesystem only)
            const isRebaseInProgress = (): boolean => {
              return (
                existsSync(join(gitDir, 'rebase-merge')) ||
                existsSync(join(gitDir, 'rebase-apply'))
              );
            };

            // Helper: append standardized completion message and return response
            const rebaseCompleteResponse = (
              summary: string,
            ): { content: { type: 'text'; text: string }[] } => {
              log.push(summary);
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
            };

            // Auto-continue loop using shared helper.
            // Always enter the loop — staging files alone doesn't complete
            // a rebase; `git rebase --continue` must be called.
            const maxIterations = 50; // Safety limit
            let iterations = 0;

            while (iterations < maxIterations) {
              iterations++;

              // Check if rebase completed between iterations (skip on first
              // iteration — we must call rebaseContinueStep at least once so
              // that `git rebase --continue` actually runs; a filesystem check
              // alone can false-negative).
              if (iterations > 1 && !isRebaseInProgress()) {
                return rebaseCompleteResponse(
                  `Rebase completed after ${iterations - 1} auto-continue step(s).`,
                );
              }

              try {
                const step = rebaseContinueStep(cwd);

                if (step.completed) {
                  return rebaseCompleteResponse(
                    `Rebase completed after ${iterations} auto-continue step(s).`,
                  );
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
                // Check if the rebase completed despite the error
                if (!isRebaseInProgress()) {
                  return rebaseCompleteResponse(
                    `Rebase completed after ${iterations} auto-continue step(s).`,
                  );
                }

                const ce = continueErr as {
                  stdout?: string;
                  stderr?: string;
                };
                const continueOutput = [ce.stdout, ce.stderr]
                  .filter(Boolean)
                  .join('\n');

                // Only attempt auto-continue when the error indicates a
                // merge conflict.  Non-conflict failures (e.g. permission
                // errors, corrupt index) should surface immediately.
                const isConflictError =
                  /conflict|merge|CONFLICT|could not apply/i.test(
                    continueOutput,
                  );

                if (isConflictError) {
                  // rerere may have resolved this step's conflicts in the
                  // working tree without staging.  Stage first, then check.
                  try {
                    runGit(['add', '-u'], cwd);
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
                    // rerere resolved this step too — continue the loop
                    log.push(
                      `Step ${iterations}: auto-continued (rerere resolved after conflict)`,
                    );
                    continue;
                  } catch {
                    // Fall through to generic error
                  }
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
      const { files: rawFiles, worktree: wtKey } = args as {
        files?: unknown;
        worktree?: string;
      };

      // Normalize and validate files parameter
      const filesResult = normalizeFilesParam(rawFiles);
      if (
        filesResult &&
        typeof filesResult === 'object' &&
        'error' in filesResult
      ) {
        return {
          content: [{ type: 'text', text: filesResult.error }],
          isError: true,
        };
      }
      const files = filesResult;

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
      const { command, worktree, allowMainRepo, tailLines } = args as {
        command: string;
        worktree?: string;
        allowMainRepo?: boolean;
        tailLines?: number;
      };

      if (
        tailLines !== undefined &&
        (!Number.isInteger(tailLines) || tailLines < 0)
      ) {
        return {
          content: [
            { type: 'text', text: 'tailLines must be a non-negative integer' },
          ],
          isError: true,
        };
      }

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
          process.platform === 'win32' ? resolveWindowsShell() : '/bin/sh';
        const isCmdShell =
          process.platform === 'win32' &&
          shell.toLowerCase().endsWith('cmd.exe');
        const output = await new Promise<string>((resolve, reject) => {
          const cb = (error: Error | null, stdout: string, stderr: string) => {
            if (error) {
              const e = error as Error & {
                stdout?: string;
                stderr?: string;
              };
              e.stdout = stdout;
              e.stderr = stderr;
              reject(e);
            } else {
              resolve(stdout);
            }
          };
          const opts = {
            cwd: targetDir,
            encoding: 'utf-8' as const,
            timeout: 120_000,
            maxBuffer: 10 * 1024 * 1024,
          };
          if (isCmdShell) {
            // Use execFile with explicit /d /s /c args so cmd.exe handling is
            // consistent with the git-bash branch — no implicit shell wrapping.
            execFile(shell, ['/d', '/s', '/c', command], opts, cb);
          } else {
            execFile(shell, ['-c', command], opts, cb);
          }
        });

        const displayOutput = applyTailLines(output, tailLines);
        return {
          content: [
            {
              type: 'text',
              text: `[cwd: ${targetDir}]\n$ ${command}\n\n${displayOutput}`,
            },
          ],
        };
      } catch (err: unknown) {
        const e = err as {
          stdout?: string;
          stderr?: string;
          code?: number | string | null;
          signal?: string | null;
        };
        const rawOutput =
          [e.stdout, e.stderr].filter(Boolean).join('\n') ||
          (err instanceof Error ? err.message : String(err));
        const output = applyTailLines(rawOutput, tailLines);
        return {
          content: [
            {
              type: 'text',
              text: `[cwd: ${targetDir}]\n$ ${command}\n\nError code/signal: ${e.code ?? 'unknown'}${e.signal ? ` (signal: ${e.signal})` : ''}\n${output}`,
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
      persistActiveWorktree(resolved.path);
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

      // Check if node_modules is a junction/symlink — skip install if so
      const nodeModulesPath = join(cwd, 'node_modules');
      const nodeModulesIsJunction = isJunction(nodeModulesPath);

      const steps = [
        ...(nodeModulesIsJunction
          ? []
          : [
              {
                label: 'make install',
                cmd: 'make install',
                timeout: 300_000,
              },
            ]),
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

      if (nodeModulesIsJunction) {
        log.push(
          '⚠ node_modules is a junction/symlink — skipping make install to avoid mutating shared deps',
        );
      }

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
      const { worktree, worktreeKey } = args as {
        worktree?: unknown;
        worktreeKey?: unknown;
      };
      if (worktreeKey !== undefined && typeof worktreeKey !== 'string') {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid worktreeKey: expected string, got ${typeof worktreeKey}`,
            },
          ],
          isError: true,
        };
      }
      if (typeof worktreeKey === 'string' && worktreeKey.trim().length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'Invalid worktreeKey: provided value is empty or whitespace-only. Omit the parameter to use the active worktree.',
            },
          ],
          isError: true,
        };
      }
      if (worktree !== undefined && typeof worktree !== 'string') {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid worktree: expected string, got ${typeof worktree}`,
            },
          ],
          isError: true,
        };
      }
      if (typeof worktree === 'string' && worktree.trim().length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'Invalid worktree: provided value is empty or whitespace-only. Omit the parameter to use the active worktree.',
            },
          ],
          isError: true,
        };
      }
      const normalizedWorktreeKey =
        typeof worktreeKey === 'string' && worktreeKey.trim().length > 0
          ? worktreeKey.trim()
          : undefined;
      const normalizedWorktree =
        typeof worktree === 'string' && worktree.trim().length > 0
          ? worktree.trim()
          : undefined;
      if (
        normalizedWorktreeKey &&
        normalizedWorktree &&
        normalizedWorktreeKey !== normalizedWorktree
      ) {
        return {
          content: [
            {
              type: 'text',
              text: 'Conflicting parameters: worktreeKey and worktree were both provided with different non-empty values.',
            },
          ],
          isError: true,
        };
      }
      const wtKey = normalizedWorktreeKey ?? normalizedWorktree;

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

    // -----------------------------------------------------------------------
    // worktree_show_file
    // -----------------------------------------------------------------------
    case 'worktree_show_file': {
      const {
        ref: rawRef,
        path: filePath,
        worktree,
        startLine: startLineArg,
        endLine: endLineArg,
      } = args as {
        ref?: string;
        path: string;
        worktree?: string;
        startLine?: number;
        endLine?: number;
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

      // Default ref to HEAD when omitted (common when worktree is specified)
      const ref = rawRef ?? 'HEAD';

      // Reject endLine without startLine
      if (endLineArg !== undefined && startLineArg === undefined) {
        return {
          content: [
            {
              type: 'text',
              text: '`endLine` requires `startLine` to be provided.',
            },
          ],
          isError: true,
        };
      }

      // Validate line range if provided
      if (startLineArg !== undefined) {
        if (!Number.isInteger(startLineArg) || startLineArg < 1) {
          return {
            content: [
              {
                type: 'text',
                text: `Invalid startLine: must be an integer >= 1, got ${startLineArg}.`,
              },
            ],
            isError: true,
          };
        }
        const end = endLineArg ?? startLineArg;
        if (!Number.isInteger(end) || end < startLineArg) {
          return {
            content: [
              {
                type: 'text',
                text: `Invalid endLine: must be an integer >= startLine (${startLineArg}), got ${end}.`,
              },
            ],
            isError: true,
          };
        }
        const MAX_LINE_RANGE = 1000;
        if (end - startLineArg + 1 > MAX_LINE_RANGE) {
          return {
            content: [
              {
                type: 'text',
                text: `Line range too large: ${end - startLineArg + 1} lines requested, max is ${MAX_LINE_RANGE}.`,
              },
            ],
            isError: true,
          };
        }
      }

      // Validate ref (reject option-like values and only safe rev chars)
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
              text: `Invalid ref: "${ref}". Only alphanumeric, '.', '/', '~', '^', '-', '_', '{', '}' allowed.`,
            },
          ],
          isError: true,
        };
      }

      // Reject paths that could cause issues with git show
      if (
        filePath.startsWith('/') ||
        filePath.includes(':') ||
        filePath.startsWith('-') ||
        /(?:^|\/)\.\.(?:\/|$)/.test(filePath)
      ) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid path: "${filePath}". Path must be relative and must not contain ':', start with '-' or '/', or contain '..' segments.`,
            },
          ],
          isError: true,
        };
      }

      try {
        let content = runGit(['show', `${ref}:${filePath}`], cwd);

        // Apply line range if provided
        if (startLineArg !== undefined) {
          const endLine = endLineArg ?? startLineArg;
          const allLines = content.split('\n');
          const sliced = allLines.slice(startLineArg - 1, endLine);
          content = sliced
            .map((line, i) => `${startLineArg + i}\t${line}`)
            .join('\n');
        }

        // Truncate large file contents to prevent exceeding MCP/stdio limits.
        // We use a character limit (not byte limit) to avoid splitting multi-byte
        // UTF-8 characters, and apply it after JSON.stringify so the final
        // serialized output respects the size budget.
        const MAX_OUTPUT_CHARS = 512_000; // ~512 KB for ASCII content
        const lineRange =
          startLineArg !== undefined
            ? { startLine: startLineArg, endLine: endLineArg ?? startLineArg }
            : {};
        const jsonPayload = JSON.stringify(
          {
            ref,
            path: filePath,
            ...lineRange,
            content,
            truncated: false,
          },
          null,
          2,
        );

        const truncated = jsonPayload.length > MAX_OUTPUT_CHARS;
        const safeText = truncated
          ? JSON.stringify(
              {
                ref,
                path: filePath,
                ...lineRange,
                content:
                  content.slice(0, MAX_OUTPUT_CHARS) +
                  `\n\n... [truncated — output exceeds ${MAX_OUTPUT_CHARS / 1000}KB. Consider reading a smaller file or a specific section.]`,
                truncated: true,
              },
              null,
              2,
            )
          : jsonPayload;

        return {
          content: [
            {
              type: 'text',
              text: safeText,
            },
          ],
        };
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; message?: string };
        const MAX_ERROR_CHARS = 4_000;
        const rawOutput =
          [e.stdout, e.stderr].filter(Boolean).join('\n') ||
          e.message ||
          String(err);
        const output =
          rawOutput.length > MAX_ERROR_CHARS
            ? rawOutput.slice(0, MAX_ERROR_CHARS) + '\n... [truncated]'
            : rawOutput;
        return {
          content: [
            {
              type: 'text',
              text: `Failed to read ${filePath} at ${ref}: ${output.trim()}`,
            },
          ],
          isError: true,
        };
      }
    }

    // -----------------------------------------------------------------------
    // worktree_show_remote
    // -----------------------------------------------------------------------
    case 'worktree_show_remote': {
      const {
        ref: rawRef,
        path: filePath,
        lines,
      } = args as {
        ref: string;
        path: string;
        lines?: string;
      };

      // Auto-prepend "origin/" if the ref doesn't already start with a known remote name
      let ref: string;
      try {
        const remotesOutput = execFileSync('git', ['remote'], {
          cwd: MAIN_REPO,
          encoding: 'utf8',
        });
        const remotes = remotesOutput
          .split(/\r?\n/)
          .filter((name) => name.length > 0);
        const firstSegment = rawRef.split('/', 1)[0];
        const hasExplicitRemote =
          rawRef.includes('/') && remotes.includes(firstSegment);
        ref = hasExplicitRemote ? rawRef : `origin/${rawRef}`;
      } catch {
        ref = rawRef.includes('/') ? rawRef : `origin/${rawRef}`;
      }

      // Validate ref
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
              text: `Invalid ref: "${ref}". Only alphanumeric, '.', '/', '~', '^', '-', '_', '{', '}' allowed.`,
            },
          ],
          isError: true,
        };
      }

      // Validate path
      if (
        filePath.startsWith('/') ||
        filePath.includes(':') ||
        filePath.startsWith('-') ||
        /(?:^|\/)\.\.(?:\/|$)/.test(filePath)
      ) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid path: "${filePath}". Path must be relative and must not contain ':', start with '-' or '/', or contain '..' segments.`,
            },
          ],
          isError: true,
        };
      }

      // Parse line range if provided
      let startLine: number | undefined;
      let endLine: number | undefined;
      if (lines) {
        const rangeMatch = lines.match(/^(\d+)(?:-(\d+))?$/);
        if (!rangeMatch) {
          return {
            content: [
              {
                type: 'text',
                text: `Invalid line range: "${lines}". Expected format: "N" or "N-M" (e.g. "1-30").`,
              },
            ],
            isError: true,
          };
        }
        startLine = parseInt(rangeMatch[1], 10);
        endLine = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : startLine;

        // Validate line range bounds
        if (startLine < 1) {
          return {
            content: [
              {
                type: 'text',
                text: `Invalid line range: startLine must be >= 1, got ${startLine}.`,
              },
            ],
            isError: true,
          };
        }
        if (endLine < startLine) {
          return {
            content: [
              {
                type: 'text',
                text: `Invalid line range: endLine (${endLine}) must be >= startLine (${startLine}).`,
              },
            ],
            isError: true,
          };
        }
        const MAX_LINE_RANGE = 1000;
        if (endLine - startLine + 1 > MAX_LINE_RANGE) {
          return {
            content: [
              {
                type: 'text',
                text: `Line range too large: ${endLine - startLine + 1} lines requested, max is ${MAX_LINE_RANGE}.`,
              },
            ],
            isError: true,
          };
        }
      }

      const cwd = MAIN_REPO;

      // Fetch the remote ref first
      // Extract the remote name (part before first /) and the branch name
      const slashIdx = ref.indexOf('/');
      const remote = ref.slice(0, slashIdx);
      const branchName = ref.slice(slashIdx + 1);

      // Validate remote and branchName are non-empty
      if (!remote || !branchName) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid ref: "${ref}". Both remote and branch name must be non-empty.`,
            },
          ],
          isError: true,
        };
      }

      // Validate that remote is a configured git remote
      try {
        const configuredRemotes = execFileSync('git', ['remote'], {
          cwd,
          encoding: 'utf8',
        })
          .split(/\r?\n/)
          .filter((name) => name.length > 0);
        if (!configuredRemotes.includes(remote)) {
          return {
            content: [
              {
                type: 'text',
                text: `Invalid remote: "${remote}". Configured remotes: ${configuredRemotes.join(', ') || '(none)'}.`,
              },
            ],
            isError: true,
          };
        }
      } catch {
        // If git remote fails, skip remote validation and let fetch surface the error
      }

      // Reject rev-parse characters (~, ^, {}) in the branch name portion
      if (/[~^{}]/.test(branchName)) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid branch name: "${branchName}". Rev-parse characters (~, ^, {, }) are not allowed.`,
            },
          ],
          isError: true,
        };
      }

      try {
        runGit(['fetch', remote, branchName], cwd, { timeout: 30_000 });
      } catch (err: unknown) {
        const e = err as { stderr?: string; message?: string };
        const msg = e.stderr || e.message || String(err);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to fetch ${remote}/${branchName}: ${msg.trim()}`,
            },
          ],
          isError: true,
        };
      }

      try {
        let content = runGit(['show', `${ref}:${filePath}`], cwd);

        // Apply line range if specified
        if (startLine !== undefined) {
          const allLines = content.split('\n');
          const sliced = allLines.slice(startLine - 1, endLine ?? startLine);
          content = sliced
            .map((line, i) => `${startLine + i}\t${line}`)
            .join('\n');
        }

        const MAX_OUTPUT_CHARS = 512_000;
        const jsonPayload = JSON.stringify(
          {
            ref,
            path: filePath,
            ...(lines ? { lines } : {}),
            content,
            truncated: false,
          },
          null,
          2,
        );

        const truncated = jsonPayload.length > MAX_OUTPUT_CHARS;
        const safeText = truncated
          ? JSON.stringify(
              {
                ref,
                path: filePath,
                ...(lines ? { lines } : {}),
                content:
                  content.slice(0, MAX_OUTPUT_CHARS) +
                  `\n\n... [truncated — output exceeds ${MAX_OUTPUT_CHARS / 1000}KB]`,
                truncated: true,
              },
              null,
              2,
            )
          : jsonPayload;

        return { content: [{ type: 'text', text: safeText }] };
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; message?: string };
        const rawOutput =
          [e.stdout, e.stderr].filter(Boolean).join('\n') ||
          e.message ||
          String(err);
        const output =
          rawOutput.length > 4_000
            ? rawOutput.slice(0, 4_000) + '\n... [truncated]'
            : rawOutput;
        return {
          content: [
            {
              type: 'text',
              text: `Failed to read ${filePath} at ${ref}: ${output.trim()}`,
            },
          ],
          isError: true,
        };
      }
    }

    // -----------------------------------------------------------------------
    // worktree_unstage
    // -----------------------------------------------------------------------
    case 'worktree_unstage': {
      const { files: rawFiles, worktree: wtKey } = args as {
        files: unknown;
        worktree?: string;
      };

      // Normalize and validate files parameter
      const filesResult = normalizeFilesParam(rawFiles);
      if (
        filesResult &&
        typeof filesResult === 'object' &&
        'error' in filesResult
      ) {
        return {
          content: [{ type: 'text', text: filesResult.error }],
          isError: true,
        };
      }
      const files = filesResult ?? [];

      const target = resolveTargetDir(wtKey);
      if ('error' in target) {
        return {
          content: [{ type: 'text', text: target.error }],
          isError: true,
        };
      }
      const cwd = target.path;

      if (files.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No files specified. Pass file paths or ["."] to unstage all.',
            },
          ],
          isError: true,
        };
      }

      try {
        runGit(['reset', 'HEAD', '--', ...files], cwd);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  requestedPaths: files,
                  message: `Unstage requested for ${files.length} path(s).`,
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
              text: `Unstage failed (exit code ${e.status ?? 'unknown'}):\n${output}`,
            },
          ],
          isError: true,
        };
      }
    }

    // -----------------------------------------------------------------------
    // worktree_run_all
    // -----------------------------------------------------------------------
    case 'worktree_run_all': {
      const {
        command,
        filter,
        parallel = false,
        maxConcurrency = 4,
        timeoutSeconds,
      } = args as {
        command: string;
        filter?: string;
        parallel?: boolean;
        maxConcurrency?: number;
        timeoutSeconds?: number;
      };

      // Whitelist of allowed make targets
      const ALLOWED_TARGETS = new Set([
        'format:write',
        'format:check',
        'lint',
        'lint-fix',
        'typecheck',
        'pc',
        'build',
        'test',
        'codegen',
        'install',
      ]);

      if (!ALLOWED_TARGETS.has(command)) {
        return {
          content: [
            {
              type: 'text',
              text:
                `Refused: "${command}" is not an allowed target.\n` +
                `Allowed targets: ${[...ALLOWED_TARGETS].join(', ')}`,
            },
          ],
          isError: true,
        };
      }

      let worktrees = getWorktrees();
      if (worktrees.length === 0) {
        return {
          content: [{ type: 'text', text: 'No active worktrees found.' }],
        };
      }

      // Apply filter
      if (filter) {
        worktrees = worktrees.filter(
          (w) =>
            w.key.includes(filter) ||
            (w.branch !== null && w.branch.includes(filter)),
        );
        if (worktrees.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No worktrees match filter "${filter}".`,
              },
            ],
          };
        }
      }

      // Per-target timeout defaults (in seconds), overridable via timeoutSeconds
      const TARGET_TIMEOUT_DEFAULTS: Record<string, number> = {
        pc: 600,
        install: 900,
        build: 900,
        test: 900,
        codegen: 900,
      };
      const DEFAULT_TIMEOUT_S = 300;
      const resolvedTimeoutMs =
        (timeoutSeconds ??
          TARGET_TIMEOUT_DEFAULTS[command] ??
          DEFAULT_TIMEOUT_S) * 1000;

      interface RunResult {
        key: string;
        path: string;
        branch: string | null;
        passed: boolean;
        stdout: string;
        stderr: string;
        durationMs: number;
      }

      const runInWorktree = (wt: WorktreeInfo): Promise<RunResult> => {
        const start = Date.now();
        return new Promise<RunResult>((res) => {
          execFile(
            'make',
            [command],
            {
              cwd: wt.path,
              encoding: 'utf-8',
              timeout: resolvedTimeoutMs,
              maxBuffer: 10 * 1024 * 1024,
              env: { ...process.env },
              shell:
                process.platform === 'win32' ? 'powershell.exe' : undefined,
            },
            (error, stdout, stderr) => {
              const durationMs = Date.now() - start;
              const MAX_OUTPUT = 2000;
              const trimOutput = (s: string): string =>
                s.length > MAX_OUTPUT
                  ? `…(truncated)\n${s.slice(-MAX_OUTPUT)}`
                  : s;

              // Append ExecException details when the process fails
              let stderrOut = stderr ?? '';
              if (error) {
                const details: string[] = [];
                if (error.message) details.push(`message: ${error.message}`);
                if (error.code !== undefined)
                  details.push(`code: ${String(error.code)}`);
                if (error.signal) details.push(`signal: ${error.signal}`);
                if (details.length > 0) {
                  stderrOut += `\n[ExecException] ${details.join(', ')}`;
                }
              }

              res({
                key: wt.key,
                path: wt.path,
                branch: wt.branch,
                passed: error === null,
                stdout: trimOutput(stdout ?? ''),
                stderr: trimOutput(stderrOut),
                durationMs,
              });
            },
          );
        });
      };

      let results: RunResult[];
      if (parallel) {
        // Semaphore-based concurrency limiter
        const limit = Math.max(1, maxConcurrency);
        let active = 0;
        let idx = 0;
        results = new Array<RunResult>(worktrees.length);
        await new Promise<void>((resolveAll) => {
          const next = (): void => {
            if (idx >= worktrees.length && active === 0) {
              resolveAll();
              return;
            }
            while (active < limit && idx < worktrees.length) {
              const i = idx++;
              active++;
              void runInWorktree(worktrees[i]).then((result) => {
                results[i] = result;
                active--;
                next();
              });
            }
          };
          next();
        });
      } else {
        results = [];
        for (const wt of worktrees) {
          results.push(await runInWorktree(wt));
        }
      }

      const passed = results.filter((r) => r.passed).length;
      const failed = results.filter((r) => !r.passed).length;

      const summary = {
        command: `make ${command}`,
        mode: parallel ? 'parallel' : 'sequential',
        total: results.length,
        passed,
        failed,
        results: results.map((r) => ({
          key: r.key,
          branch: r.branch,
          passed: r.passed,
          durationMs: r.durationMs,
          stdout: r.stdout,
          stderr: r.stderr,
        })),
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
        isError: failed > 0,
      };
    }

    // -----------------------------------------------------------------------
    // worktree_lock
    // -----------------------------------------------------------------------
    case 'worktree_lock': {
      const {
        worktree: wtKey,
        agent = 'claude-session',
        task,
        ttl = DEFAULT_LOCK_TTL_SECONDS,
        force = false,
      } = args as {
        worktree?: string;
        agent?: string;
        task?: string;
        ttl?: number;
        force?: boolean;
      };

      const target = resolveTargetDir(wtKey);
      if ('error' in target) {
        return {
          content: [{ type: 'text', text: target.error }],
          isError: true,
        };
      }

      const targetPath = target.path;
      const existing = readLock(targetPath);

      if (existing && !force) {
        const stale = isLockStale(existing);
        if (!stale) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    acquired: false,
                    reason: 'Worktree is locked by another agent.',
                    existingLock: existing,
                    hint: 'Use force:true to override, or worktree_unlock to release.',
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
        // Stale lock — auto-clean and proceed
      }

      // Validate TTL
      let normalizedTtl = DEFAULT_LOCK_TTL_SECONDS;
      if (ttl !== undefined && ttl !== null) {
        if (typeof ttl !== 'number' || !Number.isFinite(ttl) || ttl <= 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    acquired: false,
                    reason: 'Invalid ttl: must be a finite, positive number.',
                    hint: 'Provide a finite, positive integer ttl value in seconds.',
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
        normalizedTtl = Math.max(Math.floor(ttl), 1);
      }

      const newLock: AgentLock = {
        agent,
        pid: process.pid,
        acquired: new Date().toISOString(),
        ttl: normalizedTtl,
        ...(task ? { task } : {}),
      };

      writeLock(targetPath, newLock);

      // Re-read the lock to detect race conditions (another agent may have overwritten)
      const confirmed = readLock(targetPath);
      if (
        !confirmed ||
        confirmed.agent !== newLock.agent ||
        confirmed.pid !== newLock.pid ||
        confirmed.acquired !== newLock.acquired
      ) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  acquired: false,
                  reason:
                    'Failed to acquire worktree lock: another agent won the race.',
                  existingLock: confirmed ?? existing ?? null,
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }

      const replaced = existing
        ? isLockStale(existing)
          ? 'stale'
          : 'forced'
        : null;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                acquired: true,
                lock: newLock,
                worktree: targetPath,
                ...(replaced ? { replaced, previousLock: existing } : {}),
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    // -----------------------------------------------------------------------
    // worktree_unlock
    // -----------------------------------------------------------------------
    case 'worktree_unlock': {
      const { worktree: wtKey } = args as { worktree?: string };

      const target = resolveTargetDir(wtKey);
      if ('error' in target) {
        return {
          content: [{ type: 'text', text: target.error }],
          isError: true,
        };
      }

      const targetPath = target.path;
      const existing = readLock(targetPath);
      const removed = removeLock(targetPath);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                released: removed,
                worktree: targetPath,
                previousLock: existing,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    // -----------------------------------------------------------------------
    // worktree_clean
    // -----------------------------------------------------------------------
    case 'worktree_clean': {
      const {
        worktree: wtKey,
        prune = true,
        force = false,
      } = args as {
        worktree?: string;
        prune?: boolean;
        force?: boolean;
      };

      const target = resolveTargetDir(wtKey);
      if ('error' in target) {
        return {
          content: [{ type: 'text', text: target.error }],
          isError: true,
        };
      }

      const targetPath = target.path;

      // Find the branch name for this worktree
      const worktrees = getWorktrees();
      const wt = worktrees.find((w) => {
        const a = resolve(w.path);
        const b = resolve(targetPath);
        return process.platform === 'win32'
          ? a.toLowerCase() === b.toLowerCase()
          : a === b;
      });
      if (!wt?.branch) {
        return {
          content: [
            {
              type: 'text',
              text: `Cannot determine branch for worktree at ${targetPath}. HEAD may be detached (e.g. during a rebase). Resolve or abort the rebase and ensure HEAD is attached to a branch, then retry.`,
            },
          ],
          isError: true,
        };
      }

      const branch = wt.branch;
      const results: string[] = [];

      // Use twig worktree remove for junction-safe removal (60s timeout).
      let twigFailed = false;
      let twigTimedOut = false;
      try {
        const removeOutput = execFileSync(
          'twig',
          ['worktree', 'remove', '--', branch],
          {
            cwd: MAIN_REPO,
            encoding: 'utf-8',
            timeout: 60_000,
            maxBuffer: 10 * 1024 * 1024,
          },
        );
        results.push(`Removed worktree: ${branch}`);
        if (removeOutput.trim()) {
          results.push(removeOutput.trim());
        }
      } catch (err) {
        const msg =
          err instanceof Error
            ? (err as { stderr?: string }).stderr || err.message
            : String(err);
        twigTimedOut = msg.includes('ETIMEDOUT') || msg.includes('timed out');
        twigFailed = true;

        if (!force) {
          const hint = twigTimedOut
            ? 'Twig timed out — the worktree may have independent node_modules or file locks. On Windows, try `make kill-stale` to release locks. On other platforms, close any processes using the worktree directory. Then retry, or use force=true.'
            : 'Retry with force=true to fall back to `git worktree remove --force`.';
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: false,
                    branch,
                    path: targetPath,
                    error: `twig worktree remove failed: ${msg.trim()}`,
                    hint,
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      }

      // Force fallback: use git worktree remove --force when twig fails.
      if (twigFailed && force) {
        try {
          // Remove junctions first to avoid git deleting through them.
          for (const junctionName of [
            'node_modules',
            '.twig',
            '.github/skills',
          ]) {
            const jPath = join(targetPath, junctionName);
            try {
              if (existsSync(jPath) && lstatSync(jPath).isSymbolicLink()) {
                rmSync(jPath, { recursive: false });
              }
            } catch (linkErr) {
              const linkMsg =
                linkErr instanceof Error ? linkErr.message : String(linkErr);
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(
                      {
                        success: false,
                        branch,
                        path: targetPath,
                        error: `Failed to remove junction '${junctionName}' before force removal: ${linkMsg}. Aborting to avoid deleting through shared junction.`,
                      },
                      null,
                      2,
                    ),
                  },
                ],
                isError: true,
              };
            }
          }
          execFileSync(
            'git',
            ['worktree', 'remove', '--force', '--', targetPath],
            {
              cwd: MAIN_REPO,
              encoding: 'utf-8',
              timeout: 60_000,
              maxBuffer: 10 * 1024 * 1024,
            },
          );
          results.push(
            `Removed worktree via git (force fallback after twig ${twigTimedOut ? 'timeout' : 'failure'}): ${branch}`,
          );
        } catch (gitErr) {
          const gitMsg =
            gitErr instanceof Error
              ? (gitErr as { stderr?: string }).stderr || gitErr.message
              : String(gitErr);
          // When the worktree's .git file is missing, `git worktree remove` cannot
          // validate the directory and refuses with "cannot remove working tree:
          // '.git' does not exist". Fall back to direct deletion + prune.
          if (
            gitMsg.includes("'.git' does not exist") &&
            existsSync(targetPath)
          ) {
            try {
              rmSync(targetPath, { recursive: true, force: true });
              results.push(
                `Removed worktree via direct deletion (no .git — force fallback after twig ${twigTimedOut ? 'timeout' : 'failure'}): ${branch}`,
              );
            } catch (rmErr) {
              const rmMsg =
                rmErr instanceof Error ? rmErr.message : String(rmErr);
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(
                      {
                        success: false,
                        branch,
                        path: targetPath,
                        error: `Direct deletion fallback failed: ${rmMsg.trim()}`,
                        hint: 'The worktree directory may be locked by another process. Run `make kill-stale` then retry.',
                      },
                      null,
                      2,
                    ),
                  },
                ],
                isError: true,
              };
            } finally {
              try {
                execFileSync('git', ['worktree', 'prune'], {
                  cwd: MAIN_REPO,
                  encoding: 'utf-8',
                  timeout: 30_000,
                });
              } catch {
                // prune failure is non-fatal — stale refs will be cleaned up on
                // next `git worktree prune` or `twig worktree clean`
              }
            }
          } else {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: false,
                      branch,
                      path: targetPath,
                      error: `Both twig and git worktree remove failed: ${gitMsg.trim()}`,
                      hint: 'Manually delete the worktree directory and run `git worktree prune`.',
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }
        }
      }

      // Clear active worktree if it was the one removed
      if (activeWorktree && resolve(activeWorktree) === resolve(targetPath)) {
        activeWorktree = null;
        persistActiveWorktree(null);
        results.push('Cleared active worktree.');
      } else if (!activeWorktree) {
        // Also check persisted state file in case server restarted.
        try {
          if (existsSync(ACTIVE_WORKTREE_STATE_FILE)) {
            const persisted = readFileSync(
              ACTIVE_WORKTREE_STATE_FILE,
              'utf-8',
            ).trim();
            if (persisted && resolve(persisted) === resolve(targetPath)) {
              unlinkSync(ACTIVE_WORKTREE_STATE_FILE);
              results.push('Cleared persisted active worktree state.');
            }
          }
        } catch {
          // Best-effort.
        }
      }

      // Optionally prune stale references
      if (prune) {
        try {
          execFileSync('twig', ['worktree', 'clean'], {
            cwd: MAIN_REPO,
            encoding: 'utf-8',
            timeout: 15_000,
            maxBuffer: 10 * 1024 * 1024,
          });
          results.push('Pruned stale worktree references.');
        } catch (pruneErr) {
          const pruneMsg =
            pruneErr instanceof Error
              ? (pruneErr as { stderr?: string }).stderr || pruneErr.message
              : String(pruneErr);
          results.push(
            `Warning: twig worktree clean failed (non-fatal). Error: ${pruneMsg.trim()}`,
          );
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                branch,
                path: targetPath,
                details: results,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    // -----------------------------------------------------------------------
    // worktree_check_ignore
    // -----------------------------------------------------------------------
    case 'worktree_check_ignore': {
      const { paths, worktree: wtKey } = args as {
        paths: string[];
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

      // Validate paths — reject empty strings, control chars, and git flags
      for (const p of paths) {
        if (!p || /[\r\n\0]/.test(p)) {
          return {
            content: [
              { type: 'text', text: `Invalid path: ${JSON.stringify(p)}` },
            ],
            isError: true,
          };
        }
        if (p.startsWith('-')) {
          return {
            content: [
              {
                type: 'text',
                text: `Invalid path: "${p}". Paths must not start with '-'.`,
              },
            ],
            isError: true,
          };
        }
      }

      // Run: git check-ignore -v --stdin
      // Output format for ignored paths: <source>:<linenum>:<pattern>\t<pathname>
      // Paths that are not ignored produce no output; exit code 1 means nothing ignored.
      const ignored = new Map<
        string,
        { ruleFile: string; line: number; rule: string }
      >();

      try {
        await new Promise<void>((resolve, reject) => {
          const proc = execFile(
            'git',
            ['check-ignore', '-v', '--stdin'],
            {
              cwd,
              timeout: 10_000,
              encoding: 'utf-8',
              maxBuffer: 10 * 1024 * 1024,
            },
            (err, stdout, stderr) => {
              // exit code 1 = no files were ignored (not an error)
              const code = (err as NodeJS.ErrnoException & { code?: number })
                ?.code;
              if (err && code !== 1) {
                const details = [stderr.trim(), stdout.trim()]
                  .filter(Boolean)
                  .join('\n');
                reject(
                  new Error(
                    details
                      ? `git check-ignore failed: ${err.message}\n${details}`
                      : `git check-ignore failed: ${err.message}`,
                  ),
                );
                return;
              }
              for (const line of stdout.split('\n')) {
                const trimmed = line.trimEnd();
                if (!trimmed) continue;
                // format: <source>:<linenum>:<pattern>\t<pathname>
                const tabIdx = trimmed.indexOf('\t');
                if (tabIdx === -1) continue;
                const meta = trimmed.slice(0, tabIdx);
                const pathname = trimmed.slice(tabIdx + 1);
                // Use regex to safely parse meta — Windows paths contain colons (e.g. C:\...)
                const metaMatch = meta.match(/^(.*):(\d+):(.*)$/);
                if (!metaMatch) continue;
                const [, ruleFile, lineText, rule] = metaMatch;
                const lineNum = Number.parseInt(lineText, 10);
                ignored.set(pathname, {
                  ruleFile,
                  line: Number.isNaN(lineNum) ? 0 : lineNum,
                  rule,
                });
              }
              resolve();
            },
          );

          // Write paths to stdin
          if (!proc.stdin) {
            reject(new Error('git check-ignore: stdin stream unavailable'));
            return;
          }
          proc.stdin.write(paths.join('\n') + '\n');
          proc.stdin.end();
        });
      } catch (err) {
        return {
          content: [{ type: 'text', text: (err as Error).message }],
          isError: true,
        };
      }

      const results = paths.map((p) => {
        const match = ignored.get(p);
        if (match) {
          return {
            path: p,
            ignored: true,
            rule: match.rule,
            ruleFile: match.ruleFile,
            line: match.line,
          };
        }
        return { path: p, ignored: false };
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ results }, null, 2),
          },
        ],
      };
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
