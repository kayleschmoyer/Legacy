import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { execFile, execFileSync, execSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { homedir, tmpdir } from 'node:os';

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
// Use Node as a cross-platform no-op editor so Git never blocks on an editor
// prompt during agent-driven rebases or commit flows.
const NOOP_GIT_EDITOR_CMD = 'node -e "process.exit(0)"';
const NON_INTERACTIVE_GIT_ENV = {
  GIT_EDITOR: NOOP_GIT_EDITOR_CMD,
  GIT_SEQUENCE_EDITOR: NOOP_GIT_EDITOR_CMD,
};
const NON_INTERACTIVE_COMMIT_ENV = {
  GIT_EDITOR: NOOP_GIT_EDITOR_CMD,
};

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

/**
 * Detect whether the MCP server was launched from inside a native Claude Code
 * ephemeral worktree (`.claude/worktrees/<name>/`).
 *
 * When a session is opened with the Claude Code launcher's "worktree" checkbox,
 * the primary working directory — and therefore the MCP server's `process.cwd()`
 * — is the ephemeral worktree directory.  In that case we should use the CWD as
 * the active worktree instead of restoring from the state file, which may
 * contain stale state written by a different session.
 *
 * Returns the resolved CWD if it is a valid ephemeral worktree, or `null`.
 */
function detectEphemeralWorktreeCwd(): string | null {
  try {
    const cwd = resolve(process.cwd());
    const worktreesDir = resolve(join(MAIN_REPO, '.claude', 'worktrees'));
    // CWD must be a direct child of the worktrees directory.
    if (!cwd.startsWith(worktreesDir + sep)) return null;
    // Must be a valid git worktree: .git must be a file (not a directory) whose
    // `gitdir:` pointer falls under MAIN_REPO/.git/worktrees/.  This prevents
    // false-positives from standalone repos accidentally placed under the
    // .claude/worktrees/ path.
    const gitPath = join(cwd, '.git');
    if (!existsSync(gitPath)) return null;
    if (!lstatSync(gitPath).isFile()) return null;
    const gitFileContents = readFileSync(gitPath, 'utf-8').trim();
    const gitDirPrefix = 'gitdir:';
    if (!gitFileContents.startsWith(gitDirPrefix)) return null;
    const rawGitDir = gitFileContents.slice(gitDirPrefix.length).trim();
    if (!rawGitDir) return null;
    const resolvedGitDir = resolve(cwd, rawGitDir);
    const mainRepoWorktreesGitDir = resolve(
      join(MAIN_REPO, '.git', 'worktrees'),
    );
    if (!resolvedGitDir.startsWith(mainRepoWorktreesGitDir + sep)) return null;
    return cwd;
  } catch {
    return null;
  }
}

// Auto-detect the active worktree from process CWD at server startup.
//
// If the MCP server is launched from inside an ephemeral worktree directory
// (native Claude Code session with the "worktree" checkbox), initialise the
// active worktree from the CWD so that worktree_commit / worktree_push work
// without an explicit worktree_set call.
//
// Critically: we also clear the state file so that stale state written by a
// previous session does not leak into this one.  Without this, a session that
// ran worktree_set("X") would leave ".twig/mcp-active-worktree" pointing to X,
// and a fresh ephemeral-worktree session that never calls worktree_set would
// silently commit/push to X instead of its own worktree.
{
  const cwdWorktree = detectEphemeralWorktreeCwd();
  if (cwdWorktree) {
    activeWorktree = cwdWorktree;
    // Erase any persisted state — it belongs to a different session.
    persistActiveWorktree(null);
  }
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
  // Handle JSON-encoded array sent by some MCP clients (e.g. Claude Desktop)
  // e.g. files = '["path/to/file.ts"]' instead of files = ["path/to/file.ts"]
  if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) raw = parsed;
    } catch {
      // fall through — treat as a single path string
    }
  }
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
  hasLinkedNodeModules: boolean;
  nodeModulesTarget: string | null;
  lock: AgentLock | null;
  lockStale: boolean;
}

function isSymlink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Get the Windows link type for a reparse point.
 * Returns 'SymbolicLink' | 'Junction' | null.
 *
 * On Windows, lstatSync().isSymbolicLink() returns true for BOTH directory
 * symlinks and NTFS junctions. `git worktree remove` follows junctions and
 * recursively deletes the target — so we must distinguish them. See LS-3084.
 */
function getWindowsLinkType(p: string): 'SymbolicLink' | 'Junction' | null {
  if (process.platform !== 'win32') return null;
  try {
    const out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(Get-Item -LiteralPath '${p.replace(/'/g, "''")}' -Force).LinkType`,
      ],
      { encoding: 'utf-8', timeout: 10_000 },
    ).trim();
    if (out === 'SymbolicLink' || out === 'Junction') return out;
    return null;
  } catch {
    return null;
  }
}

function getSymlinkTarget(p: string): string | null {
  try {
    return readlinkSync(p);
  } catch {
    return null;
  }
}

/**
 * Coerce MCP string booleans to real booleans. The MCP framework sometimes
 * serialises JSON booleans as strings ("true"/"false" or "1"/"0"). This mirrors the
 * coercedBoolean preprocess used in the github-server (LS-1907 / LS-3007).
 */
function coerceBool(val: unknown): unknown {
  if (typeof val === 'string') {
    if (val === 'true' || val === '1') return true;
    if (val === 'false' || val === '0') return false;
  }
  return val;
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

    // Extract Jira key from branch name (e.g. "LS-1136/mcp-worktree-server" or
    // "claude/LS-1136-mcp-worktree-server"), falling back to directory name.
    // During a rebase, HEAD is detached so branch may be null — the directory
    // name fallback ensures ticket-key lookup still works.
    // NOTE: no ^ anchor — the key may appear after a prefix like "claude/".
    const dirName = wtPath.split(/[\\/]/).pop() ?? wtPath;
    const keyMatch = branch?.match(/(LS-\d+)/) ?? dirName.match(/(LS-\d+)/);
    const key = keyMatch?.[1] ?? dirName;

    const nmPath = join(wtPath, 'node_modules');
    const linked = isSymlink(nmPath);
    const target = linked ? getSymlinkTarget(nmPath) : null;
    const lock = readLock(wtPath);

    worktrees.push({
      key,
      path: wtPath,
      branch,
      hasLinkedNodeModules: linked,
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
 * Read the checked-out branch name directly from the filesystem for a given
 * worktree directory, bypassing any GIT_DIR / GIT_WORK_TREE environment
 * overrides that could cause `git branch --show-current` to lie.
 *
 * In a proper git worktree, `.git` is a file containing a `gitdir:` pointer.
 * In the main repo, `.git` is a directory. Either way we end up reading the
 * `HEAD` file and parsing the branch ref from it.
 *
 * Returns `{ branch }` on success, `{ error }` on any failure (missing .git,
 * detached HEAD, unexpected format, etc.).
 */
function readWorktreeHead(dir: string): { branch: string } | { error: string } {
  const gitPath = join(dir, '.git');
  let headPath: string;

  try {
    const stat = statSync(gitPath);
    if (stat.isFile()) {
      // Worktree: .git is a file containing "gitdir: /absolute/path/to/gitdir"
      const content = readFileSync(gitPath, 'utf-8').trim();
      const m = content.match(/^gitdir:\s*(.+)$/);
      if (!m) {
        return {
          error: `Cannot parse .git file at ${gitPath}: unexpected format "${content}"`,
        };
      }
      const gitDir = resolve(dir, m[1].trim());
      headPath = join(gitDir, 'HEAD');
    } else {
      // Main repo: .git is a directory
      headPath = join(gitPath, 'HEAD');
    }
  } catch (err) {
    return {
      error: `Cannot read .git at ${dir}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  try {
    const headContent = readFileSync(headPath, 'utf-8').trim();
    const refMatch = headContent.match(/^ref:\s*refs\/heads\/(.+)$/);
    if (!refMatch) {
      return {
        error: `HEAD is detached (${headContent}). Cannot rename.`,
      };
    }
    return { branch: refMatch[1].trim() };
  } catch (err) {
    return {
      error: `Cannot read HEAD at ${headPath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
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
 * Apply a regex grep filter to file content. Used by `worktree_show_file` and
 * `worktree_show_remote` to return only matching lines for large files where
 * the agent already knows what to look for. Returns either a result object or
 * `{ error: string }` on failure (invalid pattern, etc.).
 *
 * Note: `pattern` is compiled as a JavaScript RegExp and applied per-line.
 * Callers should prefer simple, non-backtracking patterns to avoid ReDoS.
 */
const GREP_DEFAULT_MAX_MATCHES = 50;
const GREP_HARD_MAX_MATCHES = 500;

function grepContent(
  content: string,
  pattern: string,
  maxMatches?: number,
):
  | {
      matches: Array<{ line: number; text: string }>;
      totalMatches: number;
      truncated: boolean;
      maxMatches: number;
    }
  | { error: string } {
  const normalizedMaxMatches =
    typeof maxMatches === 'number' && Number.isFinite(maxMatches)
      ? Math.trunc(maxMatches)
      : GREP_DEFAULT_MAX_MATCHES;

  const cap = Math.min(
    Math.max(normalizedMaxMatches, 1),
    GREP_HARD_MAX_MATCHES,
  );

  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Invalid grep pattern "${pattern}": ${message}` };
  }

  const lines = content.split('\n');
  const matches: Array<{ line: number; text: string }> = [];
  let totalMatches = 0;
  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) {
      totalMatches++;
      if (matches.length < cap) {
        matches.push({ line: i + 1, text: lines[i] });
      }
    }
  }

  return {
    matches,
    totalMatches,
    truncated: totalMatches > matches.length,
    maxMatches: cap,
  };
}

/**
 * Perform a single rebase-continue step: stage files, run `git rebase --continue`
 * with a non-interactive editor, and return structured state. Shared by
 * `worktree_rebase` (auto-continue loop) and `worktree_rebase_continue` tool.
 */
function rebaseContinueStep(
  cwd: string,
  files?: string[],
): {
  completed: boolean;
  conflicted: string[];
  error?: string;
} {
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
  runGit(['rebase', '--continue'], cwd, {
    timeout: 120_000,
    env: NON_INTERACTIVE_GIT_ENV,
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

/** Read ~/.netrc (or ~/_netrc on Windows) and check for a machine entry. */
function checkNetrc(machine: string): boolean {
  const netrcName = process.platform === 'win32' ? '_netrc' : '.netrc';
  const netrcPath = join(homedir(), netrcName);
  if (!existsSync(netrcPath)) return false;
  try {
    return readFileSync(netrcPath, 'utf-8').includes(`machine ${machine}`);
  } catch {
    return false;
  }
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
        'Stage and commit. Pass `files` (string or string[]) to stage only specific paths (default: all). Refuses main. Refuses .env/credentials. Supports amend. Auto-appends Co-Authored-By.',
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
            description:
              'Files to stage. When provided, ONLY these files are staged (staging area is cleared first). When omitted, new commits stage all changes including untracked files (git add -A), while amend stages only tracked changes (git add -u, after clearing the index) to avoid pulling in untracked files.',
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
          worktreeId: {
            type: 'string',
            description:
              'Alias for worktree. Ticket key, absolute path, or omit for active worktree',
          },
          amend: {
            type: 'boolean',
            description:
              'Amend previous commit. If message is provided, replaces the commit message; otherwise uses --no-edit.',
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
        'List active worktrees with symlink status and branch info. ' +
        'Pass remote=true to list remote branches instead (with optional pattern or merged-into-ref filters and ahead/behind counts).',
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
          merged: {
            type: 'string',
            description:
              'Only include remote branches merged into this ref (e.g. "origin/main"). Only used when remote=true. Equivalent to `git branch -r --merged <ref>`.',
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
          since: {
            type: 'string',
            description:
              'Only show commits more recent than this date. Accepts any format `git log --since` accepts (e.g. "2026-04-03 15:00", "2.weeks.ago", ISO 8601). Combine with `until` to bracket a window.',
          },
          until: {
            type: 'string',
            description:
              'Only show commits older than this date. Accepts any format `git log --until` accepts. Combine with `since` to bracket a window.',
          },
          searchString: {
            type: 'string',
            description:
              'Pickaxe search (`git log -S`). Only show commits whose diff adds or removes the literal string. Combine with `path` to scope to a single file. Example: searchString="playwright_version" answers "when did this constant first appear?".',
          },
          searchRegex: {
            type: 'string',
            description:
              'Generalized pickaxe (`git log -G`). Like `searchString` but the value is treated as a regular expression. Mutually compatible with `searchString` (both forwarded to git, but typically use one at a time).',
          },
          file: {
            type: 'string',
            description:
              'Restrict log to commits that touched this file path (maps to `git log -- <file>`). Alias for `path` — use either; `file` takes precedence when both are provided. Example: file="apps/web/src/pages/Login.tsx" answers "which commits last modified this file?".',
          },
          grep: {
            type: 'string',
            description:
              'Filter commits whose message matches this pattern (maps to `git log --grep=<pattern>`). Useful for finding commits by Jira ticket key, e.g. grep="LS-2433". The pattern is matched case-insensitively against the full commit message.',
          },
          stat: {
            type: 'boolean',
            description:
              'Include per-commit file change stats. Each entry in the `files` array has `path`, `status` (A=added, M=modified, D=deleted, R=renamed, C=copied), `insertions`, and `deletions`. Use maxCount=1 + stat=true as a replacement for `git show --stat HEAD` or `git diff HEAD~1 HEAD --name-status`.',
          },
        },
      },
    },
    {
      name: 'worktree_reflog',
      description:
        'Show the reflog for a worktree — all HEAD movements including commits removed by reset --hard, amend, and rebase. ' +
        'Use this to recover SHAs after destructive operations (reset --hard, bad rebase, accidental amend). ' +
        'Prefer this over `git reflog` shell calls. Substitutes: `git reflog` → `worktree_reflog()`, `git reflog | head -20` → `worktree_reflog({ limit: 20 })`.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          limit: {
            type: 'number',
            description: 'Max reflog entries to return (default: 20, max: 100)',
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
      name: 'worktree_file_info',
      description:
        'Get metadata for one or more paths (files or directories). Always reports: exists, isFile, isDirectory, isSymlink, isJunction (Windows only), linkTarget (when isSymlink). For regular files ≤10MB also reports bytes, lines, and approxTokens; files >10MB get bytes only. Use this instead of `ls`, `dir`, `Test-Path`, or `Get-ChildItem` to detect whether node_modules is a junction, a real directory, or missing.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
            description:
              'One or more file paths (max 100). Relative paths are resolved against the worktree root; absolute paths are used as-is.',
            minItems: 1,
            maxItems: 100,
          },
          worktree: {
            type: 'string',
            description:
              'Ticket key, absolute path, or omit for active worktree. Used as the root for relative paths.',
          },
        },
        required: ['paths'],
      },
    },
    {
      name: 'worktree_ls_tree',
      description: 'List files at a git ref without checkout (git ls-tree).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          ref: {
            type: 'string',
            description:
              'Git ref to list from (default: "HEAD"). Accepts any rev: branch, tag, or SHA.',
          },
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
          worktreeId: {
            type: 'string',
            description:
              'Alias for worktree. Ticket key, absolute path, or omit for active worktree',
          },
          setUpstream: {
            type: 'boolean',
            description:
              'Set upstream (-u). Also accepts string "true"/"false"/"1"/"0" (MCP framework coercion).',
          },
          skipLint: {
            type: 'boolean',
            description:
              'Set SKIP_PREPUSH_LINT=1 before pushing. Use when pnpm virtual store is absent and the pre-push formatter hook fails. Also accepts string "true"/"false"/"1"/"0" (MCP framework coercion).',
          },
          remoteBranch: {
            type: 'string',
            description:
              'Push to this remote branch name instead of the local branch name. Must contain an LS-#### Jira key; pushes are refused otherwise. Providing remoteBranch also implies upstream is set (-u). ⚠️ Do NOT use this in native ephemeral (launcher-checkbox) sessions — local/remote name mismatch confuses PR association in the Claude Code UI (anthropics/claude-code#18690). Jira linking for native ephemeral sessions is done via PR title and commit messages containing LS-####, not the branch name. See .agents/skills/branch-naming/SKILL.md.',
          },
          timeoutMs: {
            type: 'number',
            description:
              'Timeout in milliseconds for the git push subprocess (default: 120000). Increase when pre-push hooks run slow checks (e.g. terraform validate, pnpm format) that exceed the default.',
          },
        },
      },
    },
    {
      name: 'worktree_rebase',
      description:
        "Fetch and rebase onto parent. Accepts an optional 'base' parameter to rebase onto an explicit branch (e.g. 'origin/main') when the branch has no twig parent registered. Run worktree_stabilize after rebasing, before pushing.",
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
          base: {
            type: 'string',
            description:
              "Explicit git ref or commit-ish to rebase onto, e.g. 'origin/main' or 'HEAD~3'. Defaults to twig parent if omitted; falls back to 'origin/main' if twig has no parent registered. Cannot be combined with 'abort' or 'skip'.",
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
          worktreeKey: {
            type: 'string',
            description:
              'Alias for key. Ticket key, number, branch name, directory name, or absolute path to a git worktree',
          },
          worktree: {
            type: 'string',
            description:
              'Alias for key. Ticket key, number, branch name, directory name, or absolute path to a git worktree',
          },
        },
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
      name: 'worktree_show_commit',
      description:
        'Read the diff introduced by a specific commit SHA. ' +
        'Use `stat: true` for a file-change summary (like `git show <sha> --stat --oneline`). ' +
        "Provide `path` to restrict output to a single file's diff. " +
        'Without either flag, returns the full commit diff. ' +
        'Prefer this over raw `git show` shell calls during commit reconnaissance.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          sha: {
            type: 'string',
            description: 'Commit SHA, HEAD, HEAD~N, or any git rev',
          },
          path: {
            type: 'string',
            description:
              'Optional file path to restrict the diff to a single file',
          },
          stat: {
            type: 'boolean',
            description:
              'When true, return a stat summary only (--stat --oneline) instead of the full diff',
          },
          worktree: {
            type: 'string',
            description:
              'Ticket key, absolute path, or omit for active worktree',
          },
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
          grep: {
            type: 'string',
            description:
              'Optional JavaScript RegExp source string passed to `new RegExp(pattern)`. Provide only the pattern text (for example, `foo.*bar`), not a slash-delimited literal like `/foo.*bar/`, and flags such as `i` or `m` are not supported by this parameter. When provided, only matching lines (with line numbers) are returned instead of the full file. Use this for large files where you know what to look for. Mutually exclusive with `startLine`/`endLine`.',
          },
          maxMatches: {
            type: 'integer',
            minimum: 1,
            maximum: 500,
            description:
              'Max number of matched lines to return when `grep` is provided (default: 50, max: 500).',
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
          grep: {
            type: 'string',
            description:
              'Optional JavaScript RegExp pattern. When provided, only matching lines (with line numbers) are returned instead of the full file. Use this for large files where you know what to look for. Mutually exclusive with `lines`.',
          },
          maxMatches: {
            type: 'integer',
            minimum: 1,
            maximum: 500,
            description:
              'Max number of matched lines to return when `grep` is provided (default: 50, max: 500).',
          },
        },
        required: ['ref', 'path'],
      },
    },
    {
      name: 'worktree_unlink',
      description:
        'Remove node_modules symlink so worktree gets independent deps via make install.',
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
      name: 'worktree_setup_node_modules',
      description:
        "Create a node_modules symlink from the worktree to the main repo's " +
        'node_modules. Required in native ephemeral worktrees before running ' +
        'pnpm/make commands. Sibling worktrees use make_wt_setup instead. ' +
        'Idempotent — skips creation if a valid symlink already ' +
        'exists. Uses directory symlink (mklink /D) to prevent cascade deletion ' +
        'when Claude Code archives the worktree.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          worktree: {
            type: 'string',
            description:
              'Ticket key, absolute path, or omit for active worktree.',
          },
          mainRepoPath: {
            type: 'string',
            description:
              'Path to the main repo root (parent of node_modules). ' +
              'Defaults to the detected main repo.',
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
      name: 'worktree_rm',
      description:
        'Delete a file or directory from a worktree. ' +
        'Refuses to delete paths outside the worktree root, .git/, or node_modules/. ' +
        'Use for removing accidentally created files, duplicates, or generated outputs before regeneration.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          path: {
            type: 'string',
            description:
              'Path relative to the worktree root (e.g. "scratch/debug.ts", "apps/web/old-component.tsx").',
          },
          recursive: {
            type: 'boolean',
            description:
              'Allow deleting non-empty directories. Default: false.',
          },
          worktree: {
            type: 'string',
            description:
              'Ticket key, absolute path, or omit for active worktree.',
          },
        },
        required: ['path'],
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
        'Remove a worktree safely (symlink-aware). Uses `twig worktree remove` to avoid ' +
        'destroying shared symlinks. Clears active worktree if it was the one removed.',
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
              'Removes symlinks first to avoid deleting through them. (default: false)',
          },
        },
      },
    },
    {
      name: 'worktree_remove_batch',
      description:
        'Remove multiple worktrees in one call using `twig worktree remove`. ' +
        'Symlink-aware — safer than `git worktree remove`. Use for bulk sweep pruning. ' +
        'Each worktree entry is processed independently; failures do not stop remaining removals.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          worktrees: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Worktrees to remove. Each entry can be a ticket key (e.g. "LS-1234"), branch name (e.g. "LS-1234/foo"), directory name, or absolute path. Maximum 100.',
            minItems: 1,
            maxItems: 100,
          },
          force: {
            type: 'boolean',
            description:
              'Fall back to `git worktree remove --force` (with symlink removal first) when twig fails. Default: false.',
          },
        },
        required: ['worktrees'],
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
    {
      name: 'worktree_is_tracked',
      description:
        'Check whether one or more paths are tracked by git (i.e. recorded in the index). ' +
        'Answers the "is this committed source or a build artifact?" question without falling back ' +
        'to `git ls-files <path>` via Bash. Returns tracked/ignored status and file size in one call.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
            description:
              'One or more file paths to check (maximum 100). Relative to the worktree root.',
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
    {
      name: 'worktree_attach',
      description:
        'Attach an existing branch as a new sibling worktree under ' +
        'D:\\code\\legacy-sports-worktrees\\. Use this when resuming work on an ' +
        'existing PR branch — it runs `git worktree add <path> <branch>`, sets ' +
        'the new worktree as active, and optionally runs `make wt-setup`. ' +
        'MCP alternative to raw `git worktree add` via Bash.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          branch: {
            type: 'string',
            description:
              'Existing branch name (e.g. "LS-2857/fix-ci" or "claude/LS-2857-fix-ci"). ' +
              'The branch must already exist locally or on origin.',
          },
          path: {
            type: 'string',
            description:
              'Explicit worktree path. Defaults to ' +
              'D:\\code\\legacy-sports-worktrees\\<slug> where slug is derived ' +
              'from the branch name by replacing "/" with "-".',
          },
          setup: {
            type: 'boolean',
            description:
              'If true, run `make wt-setup` after attaching to copy .env, ' +
              'create symlinks, and install git hooks (default: false). ' +
              'Windows-only — ignored on other platforms.',
          },
        },
        required: ['branch'],
      },
    },
    {
      name: 'worktree_rename_branch',
      description:
        'Rename the current branch in the active (or specified) worktree. ' +
        'Use this after `jira_create_ticket` returns the LS key to rename the ' +
        'auto-generated `claude/<random>` branch to `claude/LS-####-description` ' +
        'before the first push (AGENTS.md Step 4b). MCP alternative to ' +
        '`git branch -m <newName>` via Bash.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          newName: {
            type: 'string',
            description:
              'New branch name. Must contain an LS-#### Jira key ' +
              '(e.g. "claude/LS-2994-add-rename-tool"). ' +
              'Must not be "main" or "origin/main".',
          },
          worktree: {
            type: 'string',
            description:
              'Ticket key, absolute path, or omit for active worktree.',
          },
        },
        required: ['newName'],
      },
    },
    {
      name: 'worktree_rename_session',
      description:
        'Set the display title for the current Claude Code session. ' +
        'Appends a custom-title entry to the session JSONL so the session ' +
        'appears with the given title in /resume and the session list. ' +
        'Call after jira_view to set the title to "LS-#### <ticket summary>". ' +
        'Safe to call multiple times — the last title wins.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          title: {
            type: 'string',
            description:
              'New session title (e.g. "LS-3052 feat(skills): add session rename"). ' +
              'Must be non-empty.',
          },
          worktree: {
            type: 'string',
            description:
              'Ticket key or absolute path whose session to rename. ' +
              'Omit to use the active worktree (or main repo if none active).',
          },
        },
        required: ['title'],
      },
    },
    {
      name: 'worktree_reset',
      description:
        'Reset HEAD to a specific commit SHA (git reset). ' +
        'Safety: refuses main branch and only allows resetting to ancestor SHAs ' +
        '(commits already reachable from HEAD) to prevent accidental data loss. ' +
        'Typical use: strip a stray commit pushed by another agent and restore ' +
        'the branch to the correct SHA before force-pushing with worktree_push.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          sha: {
            type: 'string',
            description:
              'Target commit SHA to reset to. Must be an ancestor of the current HEAD.',
          },
          mode: {
            type: 'string',
            enum: ['hard', 'soft', 'mixed'],
            description:
              "Reset mode (default: 'hard'). 'hard' resets index and working tree. " +
              "'soft' moves HEAD only, leaving changes staged. " +
              "'mixed' resets index but leaves working tree unchanged.",
          },
          force: {
            type: 'boolean',
            description:
              'Skip the dirty-worktree safety check for --hard resets. ' +
              'When false (default), worktree_reset refuses to hard-reset if there are ' +
              'uncommitted working tree changes. Pass true to override and discard them.',
          },
          worktree: {
            type: 'string',
            description:
              'Ticket key, absolute path, or omit for active worktree',
          },
        },
        required: ['sha'],
      },
    },
    {
      name: 'worktree_delete_remote_branch',
      description:
        'Delete a remote branch via `git push origin --delete <branch>`. ' +
        'Refuses to delete main or origin/main. ' +
        'Use this to clean up accidentally-pushed branches that have no open PR.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          branch: {
            type: 'string',
            description:
              'Remote branch name to delete (e.g. "claude/LS-1234-my-branch"). ' +
              'Do not include the "origin/" prefix.',
          },
          worktree: {
            type: 'string',
            description:
              'Ticket key, absolute path, or omit for active worktree',
          },
        },
        required: ['branch'],
      },
    },
    {
      name: 'worktree_list_branches',
      description:
        'List local and/or remote-tracking branches with metadata (type, current-branch marker). ' +
        'Supports substring or regex filtering via the `filter` parameter. ' +
        'Use this to check whether a branch for a given Jira ticket key already exists (e.g. filter: "LS-2955") ' +
        'before creating a new worktree, or to verify no open branches reference a ticket.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          filter: {
            type: 'string',
            description:
              'Substring or JavaScript regex pattern to filter branch names. ' +
              'Examples: "LS-2955" (substring), "^claude/" (regex prefix). ' +
              'Omit to return all branches.',
          },
          remote: {
            type: 'boolean',
            description:
              'Include remote-tracking branches (default: true). ' +
              'Remote branches are listed as "origin/<name>".',
          },
          local: {
            type: 'boolean',
            description: 'Include local branches (default: true).',
          },
        },
      },
    },
    {
      name: 'worktree_ping',
      description:
        'Check connectivity and state of the worktree server. Returns git version, main repo path, active worktree, and total worktree count. Use this to verify the server is running correctly before using other worktree_* tools.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
    },
    {
      name: 'worktree_stash',
      description:
        'Temporarily shelve uncommitted changes in the working directory. ' +
        'Equivalent to `git stash push -u -m <message>` (includes untracked files). ' +
        'Use before running baseline tests to verify whether failures are pre-existing (i.e. present before your changes), ' +
        'then restore with worktree_stash_pop.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          message: {
            type: 'string',
            description:
              'Optional label for the stash entry (shown in git stash list output).',
          },
          worktree: {
            type: 'string',
            description:
              "Optional ticket key (e.g. 'LS-1134'). Uses active worktree if omitted.",
          },
        },
        required: [],
      },
    },
    {
      name: 'worktree_stash_pop',
      description:
        'Restore the most recently stashed changes. Equivalent to `git stash pop`. ' +
        'Use after running baseline tests with worktree_stash to restore your in-progress work.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          worktree: {
            type: 'string',
            description:
              "Optional ticket key (e.g. 'LS-1134'). Uses active worktree if omitted.",
          },
        },
        required: [],
      },
    },
    {
      name: 'auth_check_all',
      description:
        'Check workspace auth token presence for all services (GitHub, Jira, AWS, CI). ' +
        'Returns per-service ok/method/hint. Call at the start of any workflow that requires credentials. ' +
        'Never initiates login flows — read-only token presence check only. ' +
        'If allAuthenticated is false, surface the hint for each failing service and stop; never attempt to generate tokens.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Restore persisted active worktree on first tool call after server restart
  // (sibling-worktree sessions that call worktree_set explicitly).  CWD-based
  // auto-detection for native ephemeral worktrees already runs at module init,
  // so activeWorktree will be non-null there and this line is a no-op.
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
        worktree: worktreeRaw,
        worktreeKey,
        worktreeId,
        amend,
      } = args as {
        message?: string;
        files?: unknown;
        worktree?: unknown;
        worktreeKey?: unknown;
        worktreeId?: unknown;
        amend?: boolean;
      };
      // Accept worktreeId as an alias for worktree (agents sometimes pass worktreeId
      // from older documentation or habit).
      const worktree = worktreeRaw ?? worktreeId;
      // Track which parameter name was actually provided so error messages are accurate.
      const worktreeParamName =
        worktreeRaw !== undefined ? 'worktree' : 'worktreeId';
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
              text: `Invalid ${worktreeParamName}: expected string, got ${typeof worktree}`,
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
              text: `Invalid ${worktreeParamName}: provided value is empty or whitespace-only. Omit the parameter to use the active worktree.`,
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

      // Validate conventional commit format (scope is optional).
      // Also accepts an optional LS-#### prefix: "LS-3457 fix(scope): description"
      const conventionalPattern =
        /^(LS-\d+\s+)?(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?:\s.+/;

      // For amend+message: message !== undefined means caller explicitly passed a message.
      // Reject empty/whitespace-only strings so callers don't silently fall back to --no-edit.
      if (amend && message !== undefined) {
        const trimmed = message.trim();
        if (!trimmed) {
          return {
            content: [
              {
                type: 'text',
                text: 'Amend message cannot be empty. Provide a non-empty message or omit it to keep the existing commit message (--no-edit).',
              },
            ],
            isError: true,
          };
        }
        if (!conventionalPattern.test(trimmed)) {
          return {
            content: [
              {
                type: 'text',
                text:
                  `Invalid commit message format: "${trimmed}"\n\n` +
                  'Expected conventional commit: type[(scope)]: description\n' +
                  'Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert\n' +
                  'Scope is optional. Examples: "feat(auth): add oauth", "fix: typo", "LS-1234 fix(auth): typo"',
              },
            ],
            isError: true,
          };
        }
      }

      if (!amend && !conventionalPattern.test(message as string)) {
        return {
          content: [
            {
              type: 'text',
              text:
                `Invalid commit message format: "${message}"\n\n` +
                'Expected conventional commit: type[(scope)]: description\n' +
                'Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert\n' +
                'Scope is optional. Examples: "feat(auth): add oauth", "fix: typo", "LS-1234 fix(auth): typo"',
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

      // Check whether HEAD exists (fails on unborn branches / empty repos).
      // Used below to guard reset operations that require a valid HEAD ref.
      let headExists = true;
      try {
        runGit(['rev-parse', '--verify', 'HEAD'], cwd);
      } catch {
        headExists = false;
      }

      // Amend requires an existing commit — reject early with a clear message.
      if (amend && !headExists) {
        return {
          content: [
            {
              type: 'text',
              text: 'Cannot amend because this repository does not have a HEAD commit yet. Create an initial commit first, or retry without amend.',
            },
          ],
          isError: true,
        };
      }

      try {
        // Stage files using execFileSync to avoid shell injection
        if (!stageAll) {
          // Unstage everything first so previously-staged files that are NOT in
          // the explicit list don't sneak into this commit (fixes the case where
          // a prior git-add-A or another operation left unintended files staged).
          if (headExists) {
            runGit(['reset', 'HEAD', '--'], cwd);
          } else {
            // Unborn branch: clear the index without referencing HEAD.
            runGit(['read-tree', '--empty'], cwd);
          }
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

          // Check for dangerous files in the would-be-staged set.
          // When amending we use `git add -u` (tracked only), so untracked
          // files (lines starting with "??") are NOT staged — exclude them
          // from the danger scan to avoid false positives.
          const changedFiles = status
            .split('\n')
            .filter((l) => l && !(amend && l.startsWith('??')))
            .map((l) => l.slice(3).trim())
            .filter(Boolean);
          for (const f of changedFiles) {
            if (isDangerous(f)) {
              return {
                content: [
                  {
                    type: 'text',
                    text:
                      `Refused: "${f}" looks like a credential/secret file and would be staged.\n` +
                      'Specify files explicitly to exclude it.',
                  },
                ],
                isError: true,
              };
            }
          }

          if (amend) {
            // Reset the index to HEAD first, then restage only tracked changes.
            // This removes any previously-staged untracked files that
            // git add -u alone would leave in the index, preventing stray
            // files from corrupting the amended commit.
            if (headExists) {
              runGit(['reset', 'HEAD', '--'], cwd);
            }
            runGit(['add', '-u'], cwd);
          } else {
            runGit(['add', '-A'], cwd);
          }
        }

        // Commit
        if (amend && message !== undefined) {
          // Amend with a new message — message has already been validated above
          const fullMessage =
            message.trim() +
            '\n\nCo-Authored-By: Claude <noreply@anthropic.com>';
          const msgPath = join(
            tmpdir(),
            `worktree-commit-msg-${randomUUID()}.txt`,
          );
          writeFileSync(msgPath, fullMessage, 'utf-8');
          try {
            runGit(['commit', '--amend', '-F', msgPath], cwd, {
              env: NON_INTERACTIVE_COMMIT_ENV,
            });
          } finally {
            try {
              unlinkSync(msgPath);
            } catch {
              // ignore cleanup errors
            }
          }
        } else if (amend) {
          runGit(['commit', '--amend', '--no-edit'], cwd, {
            env: NON_INTERACTIVE_COMMIT_ENV,
          });
        } else {
          const fullMessage =
            message + '\n\nCo-Authored-By: Claude <noreply@anthropic.com>';
          const msgPath = join(
            tmpdir(),
            `worktree-commit-msg-${randomUUID()}.txt`,
          );
          writeFileSync(msgPath, fullMessage, 'utf-8');
          try {
            runGit(['commit', '-F', msgPath], cwd, {
              env: NON_INTERACTIVE_COMMIT_ENV,
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
      const { remote, pattern, limit, merged } = args as {
        remote?: boolean;
        pattern?: string;
        limit?: number;
        merged?: string;
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

        // Validate merged ref (reject flag injection and unsafe chars)
        if (merged) {
          if (merged.startsWith('-')) {
            return {
              content: [
                {
                  type: 'text',
                  text: `merged: invalid ref value "${merged}". Ref must not start with '-'.`,
                },
              ],
              isError: true,
            };
          }
          if (!/^[a-zA-Z0-9_./~^{}-]+$/.test(merged)) {
            return {
              content: [
                {
                  type: 'text',
                  text: `merged: invalid ref value "${merged}". Only alphanumeric, '_', '.', '/', '~', '^', '{', '}', '-' allowed.`,
                },
              ],
              isError: true,
            };
          }
        }

        try {
          // Fetch latest remote state
          runGit(['fetch', 'origin', '--prune'], MAIN_REPO, {
            timeout: 30_000,
          });

          // List remote branches (optionally filtered by pattern and/or merged into a ref).
          // Note: only `origin/` refs are reliably up-to-date here — the fetch above only prunes origin.
          // For `merged`, use `origin/<branch>` (e.g. "origin/main") to ensure the ref is current.
          // Refs from other remotes or local-only refs may produce stale or incorrect results.
          const listArgs = ['branch', '-r'];
          if (merged) {
            listArgs.push('--merged', merged);
          }
          listArgs.push('--list');
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

          const compareBase = merged ?? 'origin/main';

          if (branches.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      count: 0,
                      totalRemote: 0,
                      truncated: false,
                      ...(merged ? { mergedInto: merged } : {}),
                      compareBase,
                      branches: [],
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          // Cap the number of branches to avoid slow sequential git operations
          const maxBranches = limit && limit > 0 ? limit : 50;
          const cappedBranches = branches.slice(0, maxBranches);
          const truncated = branches.length > maxBranches;

          // Get ahead/behind counts relative to compareBase for each branch
          const results: Array<{
            branch: string;
            ahead: number;
            behind: number;
            lastCommitDate: string;
          }> = [];
          for (const branch of cappedBranches) {
            if (branch === compareBase || branch === 'origin/HEAD') continue;
            try {
              const counts = runGit(
                [
                  'rev-list',
                  '--left-right',
                  '--count',
                  `${compareBase}...${branch}`,
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
                    ...(merged ? { mergedInto: merged } : {}),
                    compareBase,
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
        const nmStatus = w.hasLinkedNodeModules
          ? `node_modules: symlinked -> ${w.nodeModulesTarget}`
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
        file: fileFilter,
        range,
        since,
        until,
        searchString,
        searchRegex,
        grep,
        stat = false,
      } = args as {
        worktree?: string;
        maxCount?: number;
        path?: string;
        file?: string;
        range?: string;
        since?: string;
        until?: string;
        searchString?: string;
        searchRegex?: string;
        grep?: string;
        stat?: boolean;
      };
      const resolvedFileFilter = fileFilter ?? filterPath;
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
        if (stat) {
          gitArgs.push('--numstat');
          gitArgs.push('--name-status');
        }
        if (since) gitArgs.push(`--since=${since}`);
        if (until) gitArgs.push(`--until=${until}`);
        if (searchString) gitArgs.push(`-S${searchString}`);
        if (searchRegex) gitArgs.push(`-G${searchRegex}`);
        if (grep) gitArgs.push(`--grep=${grep}`, '--regexp-ignore-case');
        if (range) gitArgs.push(range);
        if (resolvedFileFilter) gitArgs.push('--', resolvedFileFilter);

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
              // First pass: build numstat map path → counts from lines starting with digit/-.
              // numstat always uses the canonical (destination) path, even for renames.
              // Format: "12\t3\tpath/to/file" or "-\t-\tpath/to/file" for binary files
              const numstatByPath = new Map<
                string,
                { insertions: number; deletions: number }
              >();
              for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                const numstatMatch = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
                if (numstatMatch) {
                  numstatByPath.set(numstatMatch[3], {
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
              }

              // Second pass: build file list from --name-status lines, which are
              // authoritative for both status and canonical path. For renames/copies
              // the destination path is parts[2]; otherwise parts[1].
              // Format: "M\tpath", "A\tpath", "D\tpath", "R100\told\tnew", "C50\told\tnew"
              const files: Array<{
                path: string;
                status: string;
                insertions: number;
                deletions: number;
              }> = [];
              for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                if (!/^[A-Z]/.test(line)) continue;
                const parts = line.split('\t');
                const statusLetter = parts[0][0]; // first char is always the status letter
                const canonicalPath =
                  (statusLetter === 'R' || statusLetter === 'C') && parts[2]
                    ? parts[2]
                    : parts[1];
                if (!canonicalPath) continue;
                const counts = numstatByPath.get(canonicalPath);
                files.push({
                  path: canonicalPath,
                  status: statusLetter,
                  // Pure renames with no content change won't appear in numstat; default to 0
                  insertions: counts?.insertions ?? 0,
                  deletions: counts?.deletions ?? 0,
                });
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
    // worktree_reflog
    // -----------------------------------------------------------------------
    case 'worktree_reflog': {
      const { limit: limitRaw = 20, worktree: wtKey } = args as {
        limit?: number;
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
      const limit = Math.min(Math.max(Number(limitRaw) || 20, 1), 100);

      try {
        const RS = '\x1e'; // record separator
        const FS = '\x1f'; // field separator
        // %H=full SHA, %h=short SHA, %gd=short selector (HEAD@{0}), %gs=subject, %aI=ISO timestamp
        const output = runGit(
          [
            'reflog',
            `--format=${RS}%H${FS}%h${FS}%gd${FS}%gs${FS}%aI`,
            `-n`,
            `${limit}`,
          ],
          cwd,
          { timeout: 15_000 },
        );
        const entries = output
          .split(RS)
          .filter((b) => b.trim())
          .map((record) => {
            const fields = record.trim().split(FS);
            const sha = fields[0] ?? '';
            const shortSha = fields[1] ?? '';
            const selector = fields[2] ?? '';
            const action = fields[3] ?? '';
            return {
              sha,
              shortSha,
              action,
              message: selector ? `${selector}: ${action}` : action,
              timestamp: fields[4] ?? '',
            };
          });
        return {
          content: [
            { type: 'text', text: JSON.stringify({ entries }, null, 2) },
          ],
        };
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; message?: string };
        const output =
          [e.stdout, e.stderr].filter(Boolean).join('\n') ||
          e.message ||
          String(err);
        return {
          content: [{ type: 'text', text: `Failed to get reflog: ${output}` }],
          isError: true,
        };
      }
    }

    // -----------------------------------------------------------------------
    // worktree_file_info
    // -----------------------------------------------------------------------
    case 'worktree_file_info': {
      const { paths, worktree } = args as {
        paths: string[];
        worktree?: string;
      };

      if (!Array.isArray(paths) || paths.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: '`paths` must be a non-empty array of strings.',
            },
          ],
          isError: true,
        };
      }
      if (paths.length > 100) {
        return {
          content: [
            {
              type: 'text',
              text: `Too many paths: ${paths.length}. Max 100 per call.`,
            },
          ],
          isError: true,
        };
      }

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

      // Hoist realpathSync(cwd) outside the loop — cwd is constant for the
      // duration of this call and realpathSync is a synchronous syscall.
      const realCwd = (() => {
        try {
          return realpathSync(cwd);
        } catch {
          return cwd;
        }
      })();

      const files = paths.map((p) => {
        if (typeof p !== 'string' || p.length === 0) {
          return {
            path: String(p),
            exists: false,
            error: 'Path must be a non-empty string',
          };
        }
        if (p.includes('\0') || p.includes('\n')) {
          return {
            path: p,
            exists: false,
            error: 'Path must not contain null bytes or newline characters',
          };
        }
        // Always resolve (even absolute paths) to normalize away any `..` segments.
        const absolute = resolve(cwd, p);
        // Prevent path traversal: resolve the PARENT directory with realpathSync
        // (catches intermediate-symlink traversal), but do NOT follow the final
        // path component. This lets agents inspect junction/symlink entries whose
        // targets live outside the worktree (e.g. node_modules → main repo).
        const realParent = (() => {
          try {
            return realpathSync(dirname(absolute));
          } catch {
            return dirname(absolute);
          }
        })();
        const realAbsolute = join(realParent, basename(absolute));
        const rel = relative(realCwd, realAbsolute);
        if (rel.startsWith('..') || isAbsolute(rel)) {
          return {
            path: p,
            exists: false,
            error: 'Path is outside the worktree root',
          };
        }
        try {
          // Use lstatSync so we see the link entry itself, not its target.
          let lstat: ReturnType<typeof lstatSync>;
          try {
            lstat = lstatSync(absolute);
          } catch {
            return { path: p, exists: false };
          }

          const isSymlinkEntry = lstat.isSymbolicLink();
          const windowsLinkType = isSymlinkEntry
            ? getWindowsLinkType(absolute)
            : null;
          const isJunction = windowsLinkType === 'Junction';

          let linkTarget: string | undefined;
          if (isSymlinkEntry) {
            try {
              linkTarget = readlinkSync(absolute);
            } catch {
              // dangling or unreadable link — omit linkTarget
            }
          }

          // Follow the link to get the real file/directory stats.
          // Typed as Stats (not BigIntStats) — we call statSync without bigint option.
          let stat: import('node:fs').Stats | undefined;
          try {
            stat = statSync(absolute);
          } catch {
            // dangling symlink — target does not exist
          }

          const isFile = stat?.isFile() ?? false;
          const isDirectory = stat?.isDirectory() ?? false;

          const base = {
            path: p,
            exists: true,
            isFile,
            isDirectory,
            isSymlink: isSymlinkEntry,
            ...(isJunction ? { isJunction: true } : {}),
            ...(linkTarget !== undefined ? { linkTarget } : {}),
          };

          if (!isFile || stat === undefined) {
            return {
              ...base,
              ...(stat !== undefined ? { bytes: stat.size } : {}),
            };
          }

          // Regular file — count lines and estimate tokens.
          const MAX_READ = 10 * 1024 * 1024;
          const fileSize = stat.size;
          if (fileSize > MAX_READ) {
            return {
              ...base,
              bytes: fileSize,
              note: `File > ${MAX_READ} bytes — line/token count skipped`,
            };
          }
          // Read raw bytes so line counting does not create an additional
          // UTF-16 string copy in memory when the contents are not returned.
          const content = readFileSync(absolute);
          // Line count: number of LF bytes only; matches `wc -l`.
          let lines = 0;
          for (let i = 0; i < content.length; i++) {
            if (content[i] === 10) lines++;
          }
          // Rough token estimate: ~4 bytes per token (Anthropic guidance for
          // English/code). Use stat.size (bytes) to match documented behavior
          // and avoid UTF-16 code-unit discrepancies for non-ASCII files.
          const approxTokens = Math.ceil(fileSize / 4);
          return {
            ...base,
            bytes: fileSize,
            lines,
            approxTokens,
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          let exists = false;
          try {
            lstatSync(absolute);
            exists = true;
          } catch {
            // not accessible
          }
          return { path: p, exists, error: message };
        }
      });

      return {
        content: [{ type: 'text', text: JSON.stringify({ files }, null, 2) }],
      };
    }

    // -----------------------------------------------------------------------
    // worktree_ls_tree
    // -----------------------------------------------------------------------
    case 'worktree_ls_tree': {
      const {
        ref = 'HEAD',
        path: dirPath,
        recursive = true,
        worktree,
      } = args as {
        ref?: string;
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
      const {
        worktree: worktreeRaw,
        worktreeKey,
        worktreeId,
        setUpstream: setUpstreamRaw,
        skipLint: skipLintRaw,
        remoteBranch,
        timeoutMs: timeoutMsRaw,
      } = args as {
        worktree?: unknown;
        worktreeKey?: unknown;
        worktreeId?: unknown;
        setUpstream?: unknown;
        skipLint?: unknown;
        remoteBranch?: unknown;
        timeoutMs?: unknown;
      };
      const pushTimeoutMs =
        typeof timeoutMsRaw === 'number' && timeoutMsRaw > 0
          ? timeoutMsRaw
          : 120_000;
      // Coerce string booleans to real booleans (MCP framework may serialise
      // JSON booleans as strings — same class of bug as LS-1907).
      const setUpstream = coerceBool(setUpstreamRaw);
      const skipLint = coerceBool(skipLintRaw);
      // Accept worktreeId as an alias for worktree (agents sometimes pass worktreeId
      // from older documentation or habit).
      const worktree = worktreeRaw ?? worktreeId;
      // Track which parameter name was actually provided so error messages are accurate.
      const worktreeParamName =
        worktreeRaw !== undefined ? 'worktree' : 'worktreeId';
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
              text: `Invalid ${worktreeParamName}: expected string, got ${typeof worktree}`,
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
              text: `Invalid ${worktreeParamName}: provided value is empty or whitespace-only. Omit the parameter to use the active worktree.`,
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
          const resolvedGitDir = isAbsolute(gitDir)
            ? gitDir
            : join(cwd, gitDir);
          const inRebase =
            existsSync(join(resolvedGitDir, 'rebase-merge')) ||
            existsSync(join(resolvedGitDir, 'rebase-apply'));
          return {
            content: [
              {
                type: 'text',
                text: inRebase
                  ? `[resolvedWorktree: ${cwd}]\nRefused: rebase is in progress. Finish the rebase before pushing.`
                  : `[resolvedWorktree: ${cwd}]\nRefused: HEAD is detached (no branch checked out). Aborting push.`,
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
                text: `[resolvedWorktree: ${cwd}]\nRefused: cannot force-push main. Use git revert instead.`,
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
              text: `[resolvedWorktree: ${cwd}]\nCould not determine current branch. Aborting push.`,
            },
          ],
          isError: true,
        };
      }

      if (setUpstream !== undefined && typeof setUpstream !== 'boolean') {
        return {
          content: [
            {
              type: 'text',
              text: `[resolvedWorktree: ${cwd}]\nInvalid argument: setUpstream must be a boolean.`,
            },
          ],
          isError: true,
        };
      }

      if (skipLint !== undefined && typeof skipLint !== 'boolean') {
        return {
          content: [
            {
              type: 'text',
              text: `[resolvedWorktree: ${cwd}]\nInvalid argument: skipLint must be a boolean.`,
            },
          ],
          isError: true,
        };
      }

      if (remoteBranch !== undefined && typeof remoteBranch !== 'string') {
        return {
          content: [
            {
              type: 'text',
              text: `[resolvedWorktree: ${cwd}]\nInvalid argument: remoteBranch must be a string.`,
            },
          ],
          isError: true,
        };
      }
      if (
        typeof remoteBranch === 'string' &&
        remoteBranch.trim().length === 0
      ) {
        return {
          content: [
            {
              type: 'text',
              text: `[resolvedWorktree: ${cwd}]\nInvalid argument: remoteBranch is empty. Omit it to push to the default remote ref.`,
            },
          ],
          isError: true,
        };
      }
      // Normalize remoteBranch: strip leading "origin/" so callers can pass
      // either "claude/LS-####-desc" or "origin/claude/LS-####-desc" and get
      // the same result. Reject "refs/" prefixes — callers must pass the branch
      // name only, not a full refspec like "refs/heads/...".
      let normalizedRemoteBranch: string | undefined;
      if (typeof remoteBranch === 'string') {
        let rb = remoteBranch.trim();
        if (rb.startsWith('refs/')) {
          return {
            content: [
              {
                type: 'text',
                text: `[resolvedWorktree: ${cwd}]\nRefused: remoteBranch must be a branch name, not a full refspec (got "${rb}"). Pass only the branch name portion, e.g. "claude/LS-3049-my-feature".`,
              },
            ],
            isError: true,
          };
        }
        if (rb.startsWith('origin/')) {
          rb = rb.slice('origin/'.length);
        }
        if (!rb) {
          return {
            content: [
              {
                type: 'text',
                text: `[resolvedWorktree: ${cwd}]\nInvalid argument: remoteBranch is empty after stripping the "origin/" prefix. Pass a branch name like "claude/LS-3049-my-feature".`,
              },
            ],
            isError: true,
          };
        }
        normalizedRemoteBranch = rb;
      }
      if (normalizedRemoteBranch !== undefined) {
        if (!/LS-\d+/.test(normalizedRemoteBranch)) {
          return {
            content: [
              {
                type: 'text',
                text: `[resolvedWorktree: ${cwd}]\nRefused: remoteBranch "${normalizedRemoteBranch}" must contain an LS-#### Jira key (e.g. "claude/LS-3049-my-feature").`,
              },
            ],
            isError: true,
          };
        }
        if (normalizedRemoteBranch === 'main') {
          return {
            content: [
              {
                type: 'text',
                text: `[resolvedWorktree: ${cwd}]\nRefused: cannot push to "main" via remoteBranch.`,
              },
            ],
            isError: true,
          };
        }
        // Validate that the branch name is a legal git ref (prevents flag
        // injection from values starting with '-' and rejects illegal patterns).
        try {
          runGit(['check-ref-format', '--branch', normalizedRemoteBranch], cwd);
        } catch (err: unknown) {
          const e = err as {
            stdout?: string;
            stderr?: string;
            message?: string;
          };
          const output =
            [e.stdout, e.stderr].filter(Boolean).join('\n') ||
            (e as Error).message ||
            String(err);
          return {
            content: [
              {
                type: 'text',
                text: `[resolvedWorktree: ${cwd}]\nRefused: invalid branch name "${normalizedRemoteBranch}".\n${output}`,
              },
            ],
            isError: true,
          };
        }
      }

      // Determine the actual remote ref to push to:
      // 1. If remoteBranch was explicitly provided, use it (sets upstream).
      // 2. Else if an upstream tracking ref is already configured and differs
      //    from the local branch name (asymmetric upstream from a prior push
      //    with remoteBranch), use that remote branch so subsequent pushes
      //    continue targeting the correct remote ref.
      // 3. Otherwise fall back to the current behaviour (push to same-named remote).
      let resolvedRemoteBranch: string | undefined;
      if (normalizedRemoteBranch) {
        resolvedRemoteBranch = normalizedRemoteBranch;
      } else {
        try {
          const upstream = run(
            'git rev-parse --abbrev-ref --symbolic-full-name @{u}',
            cwd,
          ).trim();
          // upstream is "origin/<branchName>" when set
          const remotePrefix = 'origin/';
          if (upstream.startsWith(remotePrefix)) {
            const upstreamBranch = upstream.slice(remotePrefix.length);
            // Only use the detected upstream if it differs from the local branch
            // (i.e., an asymmetric remote was previously set via remoteBranch).
            const localBranchForCheck = run(
              'git branch --show-current',
              cwd,
            ).trim();
            if (upstreamBranch !== localBranchForCheck) {
              // Safety: only follow asymmetric upstreams that look like LS-keyed
              // agent branches set via a prior remoteBranch push. This prevents
              // a mis-configured upstream pointing at "main" (or any other
              // protected branch) from bypassing the 'main' guard above.
              const upstreamIsMain =
                upstreamBranch === 'main' ||
                upstreamBranch.replace(/^origin\//, '') === 'main';
              const upstreamHasLsKey = /LS-\d+/.test(upstreamBranch);
              if (!upstreamIsMain && upstreamHasLsKey) {
                resolvedRemoteBranch = upstreamBranch;
              }
            }
          }
        } catch {
          // No upstream configured — will use default symmetric push behaviour.
        }
      }

      const pushEnv =
        skipLint === true ? { SKIP_PREPUSH_LINT: '1' } : undefined;

      // Build args array for git push. Using runGit (execFileSync — no shell)
      // ensures resolvedRemoteBranch is never interpolated into a shell command
      // string, preventing flag injection or unexpected shell expansion.
      const wantsUpstream =
        setUpstream === true || normalizedRemoteBranch !== undefined;
      const pushArgs = [
        'push',
        ...(wantsUpstream ? ['-u'] : []),
        '--force-with-lease',
        'origin',
        resolvedRemoteBranch
          ? `HEAD:refs/heads/${resolvedRemoteBranch}`
          : 'HEAD',
      ];
      // cmdDisplay is only used in log output — never passed to a shell.
      const cmdDisplay = `git ${pushArgs.join(' ')}`;

      try {
        const out = runGit(pushArgs, cwd, {
          timeout: pushTimeoutMs,
          env: pushEnv,
        });

        // Append an explicit success summary so agents don't need a follow-up
        // worktree_status call to confirm the push landed. git push writes its
        // progress/result lines to stderr (not captured by run()), so the raw
        // `out` may be empty or contain only hook output.
        const pushedFullSha = run('git rev-parse HEAD', cwd).trim();
        const pushedSha = pushedFullSha.slice(0, 7);
        const pushedBranch = run('git branch --show-current', cwd).trim();
        // When pushing to an asymmetric remote ref, confirm against that ref.
        const confirmedRemoteRef = resolvedRemoteBranch ?? pushedBranch;
        let remoteConfirmed = false;
        try {
          const remoteRef = `refs/heads/${confirmedRemoteRef}`;
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

        const summaryParts = [
          `pushed: true`,
          `local-branch: ${pushedBranch}`,
          ...(resolvedRemoteBranch
            ? [`remote-branch: ${resolvedRemoteBranch}`]
            : []),
          `sha: ${pushedSha}`,
          `remote-confirmed: ${remoteConfirmed}`,
        ];
        const summary = summaryParts.join('  ');

        return {
          content: [
            {
              type: 'text',
              text: `[resolvedWorktree: ${cwd}]\n[cwd: ${cwd}]\n$ ${cmdDisplay}\n\n${out.trim()}\n\n✓ ${summary}`,
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
            const retryOut = runGit(pushArgs, cwd, {
              timeout: 30_000,
              env: pushEnv,
            });
            const retryPushedFullSha = run('git rev-parse HEAD', cwd).trim();
            const retryPushedSha = retryPushedFullSha.slice(0, 7);
            const retryPushedBranch = run(
              'git branch --show-current',
              cwd,
            ).trim();
            const retryConfirmedRemoteRef =
              resolvedRemoteBranch ?? retryPushedBranch;
            let retryRemoteConfirmed = false;
            try {
              const retryRemoteRef = `refs/heads/${retryConfirmedRemoteRef}`;
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
            const retrySummaryParts = [
              `pushed: true`,
              `local-branch: ${retryPushedBranch}`,
              ...(resolvedRemoteBranch
                ? [`remote-branch: ${resolvedRemoteBranch}`]
                : []),
              `sha: ${retryPushedSha}`,
              `remote-confirmed: ${retryRemoteConfirmed}`,
            ];
            const retrySummary = retrySummaryParts.join('  ');
            return {
              content: [
                {
                  type: 'text',
                  text: [
                    `[resolvedWorktree: ${cwd}]`,
                    `[cwd: ${cwd}]`,
                    `$ ${cmdDisplay}  (initial push — hook amended commit)`,
                    `Exit code: ${e.status ?? 'unknown'}`,
                    output,
                    ``,
                    `Pre-push hook amended the commit; retrying push...`,
                    ``,
                    `$ ${cmdDisplay}  (retry)`,
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
                    `[resolvedWorktree: ${cwd}]`,
                    `[cwd: ${cwd}]`,
                    `$ ${cmdDisplay}  (initial push — hook amended commit)`,
                    `Exit code: ${e.status ?? 'unknown'}`,
                    output,
                    ``,
                    `$ ${cmdDisplay}  (retry)`,
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
              text: `[resolvedWorktree: ${cwd}]\n[cwd: ${cwd}]\n$ ${cmdDisplay}\n\nExit code: ${e.status ?? 'unknown'}\n${output}`,
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
      const { worktree, abort, skip, base } = args as {
        worktree?: string;
        abort?: boolean;
        skip?: boolean;
        base?: string;
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

        if (base !== undefined && base.startsWith('-')) {
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

        if (base !== undefined && !/^[a-zA-Z0-9_./~^{}-]+$/.test(base)) {
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

        if (base !== undefined && (abort || skip)) {
          return {
            content: [
              {
                type: 'text',
                text: 'Cannot specify base together with abort or skip',
              },
            ],
            isError: true,
          };
        }

        if (abort) {
          const out = runGit(['rebase', '--abort'], cwd, {
            env: NON_INTERACTIVE_GIT_ENV,
          });
          log.push('$ git rebase --abort', out);
          return { content: [{ type: 'text', text: log.join('\n') }] };
        }

        if (skip) {
          const out = runGit(['rebase', '--skip'], cwd, {
            env: NON_INTERACTIVE_GIT_ENV,
          });
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

        // Rebase: use explicit base if provided, otherwise try twig, fall back to origin/main
        let rebaseOut = '';
        if (base) {
          // If base is a plain local branch name (no special git syntax), rebase onto
          // the freshly-fetched remote-tracking ref so we don't land on a stale local pointer.
          const isPlainBranchName =
            !/[/~^@:]/.test(base) &&
            !/^[0-9a-f]{40}$/.test(base) &&
            base !== 'HEAD';
          const rebaseTarget = isPlainBranchName ? `origin/${base}` : base;
          log.push(`$ git rebase ${rebaseTarget}`);
          rebaseOut = runGit(['rebase', rebaseTarget], cwd, {
            timeout: 120_000,
            env: NON_INTERACTIVE_GIT_ENV,
          });
        } else {
          try {
            log.push('$ twig rebase');
            rebaseOut = run('twig rebase', cwd, {
              timeout: 120_000,
              env: NON_INTERACTIVE_GIT_ENV,
            });
          } catch (twigErr: unknown) {
            const twigMsg =
              twigErr instanceof Error ? twigErr.message : String(twigErr);
            const twigStdout =
              (twigErr as { stdout?: string; stderr?: string }).stdout ?? '';
            const twigStderr =
              (twigErr as { stdout?: string; stderr?: string }).stderr ?? '';
            const noParent =
              /no parent|parent branch/i.test(twigMsg) ||
              /no parent|parent branch/i.test(twigStdout + twigStderr);
            if (noParent) {
              log.push(
                `(twig rebase failed — no parent registered: ${twigMsg})`,
                '(falling back to: git rebase origin/main)',
              );
              log.push('$ git rebase origin/main');
              rebaseOut = run('git rebase origin/main', cwd, {
                timeout: 120_000,
                env: NON_INTERACTIVE_GIT_ENV,
              });
            } else {
              throw twigErr;
            }
          }
          // twig exits 0 with "No parent branches found" when no parent is registered —
          // it prints "Rebase complete." but performs no actual rebase. Detect this on
          // the success path and fall back to git rebase origin/main.
          if (/no parent branches found/i.test(rebaseOut)) {
            log.push(
              '(twig reported no parent branches — falling back to: git rebase origin/main)',
            );
            log.push('$ git rebase origin/main');
            rebaseOut = run('git rebase origin/main', cwd, {
              timeout: 120_000,
              env: NON_INTERACTIVE_GIT_ENV,
            });
          }
        }
        log.push(rebaseOut.trim());

        // Check if twig reported "up to date" but branch is actually behind origin/main.
        // This can happen when twig compares against a stale local main ref.
        // Skip this check when `base` was explicitly provided — the caller chose their base,
        // so we must not silently rebase onto origin/main instead.
        const upToDate =
          !base &&
          /already up[ -]to[ -]date|is up[ -]to[ -]date/i.test(rebaseOut);
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
                env: NON_INTERACTIVE_GIT_ENV,
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
      const {
        key,
        worktreeKey,
        worktree: worktreeAlias,
      } = args as {
        key?: unknown;
        worktreeKey?: unknown;
        worktree?: unknown;
      };

      if (key !== undefined && typeof key !== 'string') {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid key: expected string, got ${typeof key}`,
            },
          ],
          isError: true,
        };
      }
      if (typeof key === 'string' && key.trim().length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'Invalid key: provided value is empty or whitespace-only.',
            },
          ],
          isError: true,
        };
      }
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
              text: 'Invalid worktreeKey: provided value is empty or whitespace-only. Provide the ticket key, branch name, directory name, or absolute path to a git worktree.',
            },
          ],
          isError: true,
        };
      }
      if (worktreeAlias !== undefined && typeof worktreeAlias !== 'string') {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid worktree: expected string, got ${typeof worktreeAlias}`,
            },
          ],
          isError: true,
        };
      }
      if (
        typeof worktreeAlias === 'string' &&
        worktreeAlias.trim().length === 0
      ) {
        return {
          content: [
            {
              type: 'text',
              text: 'Invalid worktree: provided value is empty or whitespace-only. Provide the ticket key, branch name, directory name, or absolute path to a git worktree.',
            },
          ],
          isError: true,
        };
      }

      const normalizedKey =
        typeof key === 'string' && key.trim().length > 0
          ? key.trim()
          : undefined;
      const normalizedWorktreeKey =
        typeof worktreeKey === 'string' && worktreeKey.trim().length > 0
          ? worktreeKey.trim()
          : undefined;
      const normalizedWorktreeAlias =
        typeof worktreeAlias === 'string' && worktreeAlias.trim().length > 0
          ? worktreeAlias.trim()
          : undefined;

      if (
        normalizedKey &&
        normalizedWorktreeKey &&
        normalizedKey !== normalizedWorktreeKey
      ) {
        return {
          content: [
            {
              type: 'text',
              text: 'Conflicting parameters: key and worktreeKey were both provided with different non-empty values.',
            },
          ],
          isError: true,
        };
      }
      if (
        normalizedKey &&
        normalizedWorktreeAlias &&
        normalizedKey !== normalizedWorktreeAlias
      ) {
        return {
          content: [
            {
              type: 'text',
              text: 'Conflicting parameters: key and worktree were both provided with different non-empty values.',
            },
          ],
          isError: true,
        };
      }
      if (
        normalizedWorktreeKey &&
        normalizedWorktreeAlias &&
        normalizedWorktreeKey !== normalizedWorktreeAlias
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

      const resolvedKey =
        normalizedKey ?? normalizedWorktreeKey ?? normalizedWorktreeAlias;

      if (!resolvedKey) {
        return {
          content: [
            {
              type: 'text',
              text: "Missing required 'key' parameter (or alias 'worktreeKey'/'worktree'). Provide the ticket key, branch name, directory name, or absolute path to a git worktree.",
            },
          ],
          isError: true,
        };
      }

      const resolved = resolveWorktreePath(resolvedKey);

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
    // worktree_show_commit
    // -----------------------------------------------------------------------
    case 'worktree_show_commit': {
      const {
        sha,
        path: filterPath,
        stat: statOnly,
        worktree: wtKey,
      } = args as {
        sha: string;
        path?: string;
        stat?: boolean;
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
        let output: string;
        if (statOnly) {
          output = runGit(['show', sha, '--stat', '--oneline'], cwd, {
            timeout: 10_000,
          }).trim();
        } else if (filterPath) {
          output = runGit(['show', sha, '--', filterPath], cwd, {
            timeout: 30_000,
          }).trim();
        } else {
          output = runGit(['show', sha], cwd, { timeout: 30_000 }).trim();
        }

        const MAX = 200_000;
        const truncated =
          output.length > MAX
            ? output.slice(0, MAX) + '\n... [truncated]'
            : output;

        return {
          content: [{ type: 'text', text: truncated }],
        };
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; message?: string };
        const msg =
          [e.stdout, e.stderr].filter(Boolean).join('\n') ||
          e.message ||
          String(err);
        return {
          content: [{ type: 'text', text: `Failed to show commit: ${msg}` }],
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

      // Check if node_modules is a symlink — skip install if so
      const nodeModulesPath = join(cwd, 'node_modules');
      const nodeModulesIsSymlink = isSymlink(nodeModulesPath);

      const steps = [
        ...(nodeModulesIsSymlink
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

      if (nodeModulesIsSymlink) {
        log.push(
          '⚠ node_modules is a symlink — skipping make install to avoid mutating shared deps',
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
    // worktree_unlink
    // -----------------------------------------------------------------------
    case 'worktree_unlink': {
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
          // Symlink — remove it
          // rmSync with recursive:false safely removes symlinks without following them
          const linkType = 'symlink';
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
                      'node_modules is already a real directory (not a symlink). No action needed.',
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
                    'node_modules exists but is neither a symlink nor a directory.',
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
              text: `Failed to remove node_modules symlink: ${e.message ?? String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }

    // -----------------------------------------------------------------------
    // worktree_setup_node_modules
    // -----------------------------------------------------------------------
    case 'worktree_setup_node_modules': {
      const { worktree: wtKey, mainRepoPath: customMainRepo } = args as {
        worktree?: string;
        mainRepoPath?: string;
      };

      const target = resolveTargetDir(wtKey);
      if ('error' in target) {
        return {
          content: [{ type: 'text', text: target.error }],
          isError: true,
        };
      }

      const cwd = target.path;
      const nmPath = join(cwd, 'node_modules');
      const mainRepo = customMainRepo ?? MAIN_REPO;
      const mainNmPath = join(mainRepo, 'node_modules');

      try {
        // Verify the main repo's node_modules exists
        if (!existsSync(mainNmPath)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: false,
                    message: `Main repo node_modules not found at ${mainNmPath}. Run 'make install' in the main repo first.`,
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        /**
         * Normalize a path for symlink-target comparison on Windows.
         * realpathSync may return paths with different casing or a \\?\ prefix;
         * toLowerCase + prefix stripping ensures consistent comparison.
         */
        const normalizeForCompare = (p: string): string => {
          let normalized = p;
          try {
            normalized = realpathSync(normalized);
          } catch {
            normalized = resolve(normalized);
          }
          if (process.platform === 'win32') {
            if (normalized.startsWith('\\\\?\\')) {
              normalized = normalized.slice(4);
            }
            normalized = normalized.toLowerCase();
          }
          return normalized;
        };

        // Track whether we're converting a junction (used in success response)
        let isJunction = false;

        // Check if node_modules already exists
        if (existsSync(nmPath)) {
          const stat = lstatSync(nmPath);
          if (stat.isSymbolicLink()) {
            // Already a reparse point — but on Windows lstatSync().isSymbolicLink()
            // returns true for BOTH directory symlinks and NTFS junctions. Junctions
            // are dangerous: recursive-delete tools follow them and destroy the
            // target. Detect and convert junctions automatically (LS-3084).
            const winLinkType = getWindowsLinkType(nmPath);
            isJunction = winLinkType === 'Junction';

            let currentTarget: string;
            try {
              currentTarget = realpathSync(nmPath);
            } catch {
              currentTarget = readlinkSync(nmPath);
            }

            if (
              !isJunction &&
              normalizeForCompare(currentTarget) ===
                normalizeForCompare(mainNmPath)
            ) {
              // Correct directory symlink already exists — verify it's healthy
              const binDir = join(nmPath, '.bin');
              let binPopulated = false;
              try {
                binPopulated = readdirSync(binDir).length > 0;
              } catch {
                /* .bin doesn't exist */
              }
              const verified = existsSync(join(nmPath, 'nx')) && binPopulated;

              if (verified) {
                // Confirm accessibility from a fresh subprocess before returning
                // success — same check as the creation path (LS-3580).
                let alreadyExistsTestPath = false;
                if (process.platform === 'win32') {
                  try {
                    const testOut = execFileSync(
                      'powershell',
                      [
                        '-NoProfile',
                        '-NonInteractive',
                        '-Command',
                        `Test-Path -LiteralPath '${nmPath.replace(/'/g, "''")}' -PathType Container`,
                      ],
                      { encoding: 'utf-8', timeout: 10_000 },
                    ).trim();
                    alreadyExistsTestPath = testOut === 'True';
                  } catch {
                    alreadyExistsTestPath = false;
                  }
                } else {
                  alreadyExistsTestPath = true; // non-Windows: rely on existsSync
                }

                if (alreadyExistsTestPath) {
                  return {
                    content: [
                      {
                        type: 'text',
                        text: JSON.stringify(
                          {
                            success: true,
                            created: false,
                            alreadyExists: true,
                            linkType: winLinkType ?? 'symlink',
                            symlinkPath: nmPath,
                            target: mainNmPath,
                            verified,
                            message:
                              'node_modules symlink already exists and points to the correct target.',
                          },
                          null,
                          2,
                        ),
                      },
                    ],
                  };
                }
                // Symlink exists per lstat but is not accessible from a fresh
                // process — fall through to remove and recreate.
              }
              // Symlink exists but .bin is empty, nx is missing, or not accessible — remove and recreate
            }
            // Remove link (junction, wrong target, or unhealthy) and recreate.
            // If junction, log the conversion.
            if (isJunction) {
              // Use cmd rmdir for safe junction removal (non-recursive)
              if (process.platform === 'win32') {
                execFileSync('cmd', ['/c', 'rmdir', nmPath], {
                  encoding: 'utf-8',
                  timeout: 10_000,
                });
              } else {
                rmSync(nmPath, { recursive: false });
              }
            } else {
              rmSync(nmPath, { recursive: false });
            }
          } else if (stat.isDirectory()) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: false,
                      message:
                        'node_modules is already a real directory (not a symlink). ' +
                        'Delete it manually first if you want to replace it with a symlink.',
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          } else {
            // Regular file or other unexpected type
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: false,
                      message:
                        `node_modules exists but is not a symlink or directory (type: ${stat.mode.toString(8)}). ` +
                        'Delete it manually before creating a symlink.',
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

        // Create a directory symlink using Node.js path APIs.
        // Symlinks are NOT followed by recursive-delete tools (PowerShell
        // Remove-Item, Node.js fs.rmSync, git worktree remove), so Claude
        // Code's archive can safely delete the worktree without destroying
        // the main repo's node_modules through the link.
        // Requires Windows Developer Mode (one-time system setting).
        if (process.platform === 'win32') {
          // Windows: use execFileSync with structured args array to avoid all
          // shell escaping issues. Paths are passed as separate argv elements —
          // no quoting, no backslash doubling, no mangling.
          // mklink /D = directory symlink (safe, not followed by recursive-delete)
          execFileSync('cmd', ['/c', 'mklink', '/D', nmPath, mainNmPath], {
            encoding: 'utf-8',
            timeout: 15_000,
          });

          // Verify the symlink is actually accessible from a fresh subprocess.
          // Node.js existsSync() runs in the same process context and has
          // produced false positives (LS-3580): mklink exits 0 but the path
          // is not accessible to the calling shell or other processes.
          // A separate PowerShell Test-Path call reflects the true file-system
          // state independently of the MCP server process.
          let testPathResult = false;
          let testPathErr: string | undefined;
          try {
            const testOut = execFileSync(
              'powershell',
              [
                '-NoProfile',
                '-NonInteractive',
                '-Command',
                `Test-Path -LiteralPath '${nmPath.replace(/'/g, "''")}' -PathType Container`,
              ],
              { encoding: 'utf-8', timeout: 10_000 },
            ).trim();
            testPathResult = testOut === 'True';
          } catch (psErr) {
            const e = psErr as {
              message?: string;
              stdout?: string;
              stderr?: string;
            };
            testPathErr = e.message ?? String(psErr);
            testPathResult = false;
          }

          if (!testPathResult) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: false,
                      message: testPathErr
                        ? 'node_modules symlink creation could not be verified: PowerShell Test-Path ' +
                          `subprocess failed (${testPathErr}). The symlink may or may not exist. ` +
                          `Check manually: powershell Test-Path -LiteralPath "${nmPath}"`
                        : 'node_modules symlink creation reported success but the path is ' +
                          'not accessible after mklink (false-positive exit code). ' +
                          'Directory symlinks require Windows Developer Mode. ' +
                          'Enable it: Settings > System > For Developers > Developer Mode. ' +
                          `Fallback: powershell -File scripts/mklink-symlink.ps1 -Link "${nmPath}" -Target "${mainNmPath}"`,
                      symlinkPath: nmPath,
                      target: mainNmPath,
                      ...(testPathErr ? { testPathError: testPathErr } : {}),
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }
        } else {
          symlinkSync(mainNmPath, nmPath);
        }

        const createdBinDir = join(nmPath, '.bin');
        let createdBinPopulated = false;
        try {
          createdBinPopulated = readdirSync(createdBinDir).length > 0;
        } catch {
          /* .bin doesn't exist */
        }
        const nxExists = existsSync(join(nmPath, 'nx'));
        const verified = nxExists && createdBinPopulated;
        // Verify link type post-creation (LS-3084)
        const createdLinkType = getWindowsLinkType(nmPath);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  created: true,
                  linkType: createdLinkType ?? 'symlink',
                  ...(isJunction ? { convertedFromJunction: true } : {}),
                  symlinkPath: nmPath,
                  target: mainNmPath,
                  verified,
                  message: verified
                    ? `node_modules ${isJunction ? 'junction converted to ' : ''}symlink created and verified. Ready to run pnpm/make commands.`
                    : !nxExists
                      ? 'Symlink created but nx not found — verify main repo node_modules is populated.'
                      : 'Symlink created but .bin is empty — main repo node_modules may be incomplete. Run make install in the main repo.',
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err: unknown) {
        const e = err as { message?: string; stdout?: string; stderr?: string };
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: false,
                  message:
                    `Failed to create node_modules symlink: ${e.message ?? String(err)}` +
                    (String(e.message ?? e.stderr ?? '').match(
                      /privilege|EPERM|1314/i,
                    )
                      ? '\n\nHint: Directory symlinks require Windows Developer Mode. ' +
                        'Enable it: Settings > System > For Developers > Developer Mode'
                      : ''),
                  ...(e.stdout ? { stdout: e.stdout } : {}),
                  ...(e.stderr ? { stderr: e.stderr } : {}),
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
        grep: grepPattern,
        maxMatches: grepMaxMatches,
      } = args as {
        ref?: string;
        path: string;
        worktree?: string;
        startLine?: number;
        endLine?: number;
        grep?: string;
        maxMatches?: number;
      };

      // grep is mutually exclusive with line ranges
      if (
        grepPattern !== undefined &&
        (startLineArg !== undefined || endLineArg !== undefined)
      ) {
        return {
          content: [
            {
              type: 'text',
              text: '`grep` is mutually exclusive with `startLine`/`endLine` — pick one or the other.',
            },
          ],
          isError: true,
        };
      }

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

        // Apply grep filter if provided (mutually exclusive with line range,
        // already validated above)
        if (grepPattern !== undefined) {
          const result = grepContent(content, grepPattern, grepMaxMatches);
          if ('error' in result) {
            return {
              content: [{ type: 'text', text: result.error }],
              isError: true,
            };
          }

          const MAX_OUTPUT_CHARS = 512_000;
          const grepPayload = {
            ref,
            path: filePath,
            grep: grepPattern,
            ...result,
          };
          let grepText = JSON.stringify(grepPayload, null, 2);

          if (grepText.length > MAX_OUTPUT_CHARS) {
            const originalMatches = result.matches;
            let low = 0;
            let high = originalMatches.length;
            let bestText = JSON.stringify(
              {
                ...grepPayload,
                matches: [],
                outputTruncated: originalMatches.length > 0,
                outputTruncationReason: `Response limited to ${MAX_OUTPUT_CHARS} characters`,
              },
              null,
              2,
            );

            while (low <= high) {
              const mid = Math.floor((low + high) / 2);
              const candidateText = JSON.stringify(
                {
                  ...grepPayload,
                  matches: originalMatches.slice(0, mid),
                  outputTruncated: mid < originalMatches.length,
                  outputTruncationReason:
                    mid < originalMatches.length
                      ? `Response limited to ${MAX_OUTPUT_CHARS} characters`
                      : undefined,
                },
                null,
                2,
              );

              if (candidateText.length <= MAX_OUTPUT_CHARS) {
                bestText = candidateText;
                low = mid + 1;
              } else {
                high = mid - 1;
              }
            }

            grepText = bestText;
          }

          return {
            content: [{ type: 'text', text: grepText }],
          };
        }

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
        grep: grepPattern,
        maxMatches: grepMaxMatches,
      } = args as {
        ref?: string;
        path?: string;
        lines?: string;
        grep?: string;
        maxMatches?: number;
      };

      // Validate required params (schema says required but MCP framework may not enforce it)
      if (!rawRef) {
        return {
          content: [
            {
              type: 'text',
              text: 'Missing required parameter `ref`. Provide a remote ref such as "origin/LS-1234/my-branch" or "LS-1234/my-branch". To inspect a worktree\'s remote tracking state, use `worktree_status` instead.',
            },
          ],
          isError: true,
        };
      }
      if (!filePath) {
        return {
          content: [
            {
              type: 'text',
              text: 'Missing required parameter `path`. Provide a file path relative to the repo root (e.g. "tools/mcp/worktree-server/src/index.ts").',
            },
          ],
          isError: true,
        };
      }

      // grep is mutually exclusive with lines
      if (grepPattern !== undefined && lines !== undefined) {
        return {
          content: [
            {
              type: 'text',
              text: '`grep` is mutually exclusive with `lines` — pick one or the other.',
            },
          ],
          isError: true,
        };
      }

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

        // Apply grep filter if provided (mutually exclusive with line range)
        if (grepPattern !== undefined) {
          const result = grepContent(content, grepPattern, grepMaxMatches);
          if ('error' in result) {
            return {
              content: [{ type: 'text', text: result.error }],
              isError: true,
            };
          }

          const MAX_OUTPUT_CHARS = 512_000;
          const grepPayload = {
            ref,
            path: filePath,
            grep: grepPattern,
            ...result,
          };
          let grepText = JSON.stringify(grepPayload, null, 2);

          if (grepText.length > MAX_OUTPUT_CHARS) {
            const originalMatches = result.matches;
            let low = 0;
            let high = originalMatches.length;
            let bestText = JSON.stringify(
              {
                ...grepPayload,
                matches: [],
                outputTruncated: originalMatches.length > 0,
                outputTruncationReason: `Response limited to ${MAX_OUTPUT_CHARS} characters`,
              },
              null,
              2,
            );

            while (low <= high) {
              const mid = Math.floor((low + high) / 2);
              const candidateText = JSON.stringify(
                {
                  ...grepPayload,
                  matches: originalMatches.slice(0, mid),
                  outputTruncated: mid < originalMatches.length,
                  outputTruncationReason:
                    mid < originalMatches.length
                      ? `Response limited to ${MAX_OUTPUT_CHARS} characters`
                      : undefined,
                },
                null,
                2,
              );

              if (candidateText.length <= MAX_OUTPUT_CHARS) {
                bestText = candidateText;
                low = mid + 1;
              } else {
                high = mid - 1;
              }
            }

            grepText = bestText;
          }

          return {
            content: [{ type: 'text', text: grepText }],
          };
        }

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
    // worktree_rm
    // -----------------------------------------------------------------------
    case 'worktree_rm': {
      const rawArgs = args as Record<string, unknown>;
      const relPath = rawArgs.path;
      if (typeof relPath !== 'string' || relPath.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'worktree_rm requires a non-empty string "path"',
            },
          ],
          isError: true,
        };
      }
      if (relPath.includes('\0') || relPath.includes('\n')) {
        return {
          content: [
            {
              type: 'text',
              text: 'worktree_rm: path must not contain null bytes or newline characters',
            },
          ],
          isError: true,
        };
      }
      const recursive = rawArgs.recursive === true;
      const wtKey =
        typeof rawArgs.worktree === 'string' ? rawArgs.worktree : undefined;

      const target = resolveTargetDir(wtKey);
      if ('error' in target) {
        return {
          content: [{ type: 'text', text: target.error }],
          isError: true,
        };
      }
      const cwd = target.path;

      // Normalize: convert backslashes, collapse segments, strip trailing slash
      const segments = relPath
        .replace(/\\/g, '/')
        .split('/')
        .filter((s) => s.length > 0 && s !== '.');
      const normalized = segments.join('/');

      // Reject empty path, absolute path, traversal, or protected directories
      if (
        normalized === '' ||
        isAbsolute(relPath) ||
        relPath.trimStart().startsWith('/') ||
        segments.includes('..') ||
        segments.some((s) => s.toLowerCase() === '.git') ||
        segments.some((s) => s.toLowerCase() === 'node_modules')
      ) {
        return {
          content: [
            {
              type: 'text',
              text: `Refused: path "${relPath}" is outside the worktree root or targets a protected directory (.git, node_modules).`,
            },
          ],
          isError: true,
        };
      }

      const absPath = join(cwd, normalized);

      // Confirm the resolved path is still inside the worktree (symlink-safe)
      let realCwd: string;
      try {
        realCwd = realpathSync(cwd);
      } catch {
        realCwd = cwd;
      }
      let realAbsPath: string;
      try {
        const lstStat = lstatSync(absPath);
        // For symlinks, check the symlink entry itself (not its target) — we only remove the link,
        // not follow it into external directories.
        realAbsPath = lstStat.isSymbolicLink()
          ? absPath
          : realpathSync(absPath);
      } catch {
        // Path doesn't exist yet — fall through to ENOENT handling below
        realAbsPath = absPath;
      }
      const relativeToWorktree = relative(realCwd, realAbsPath);
      if (
        realAbsPath !== realCwd &&
        (relativeToWorktree === '..' ||
          relativeToWorktree.startsWith(`..${sep}`) ||
          isAbsolute(relativeToWorktree))
      ) {
        return {
          content: [
            {
              type: 'text',
              text: `Refused: resolved path "${realAbsPath}" escapes worktree root "${realCwd}".`,
            },
          ],
          isError: true,
        };
      }

      try {
        const stat = lstatSync(absPath);
        if (stat.isDirectory()) {
          rmSync(absPath, { recursive: recursive === true, force: false });
        } else {
          unlinkSync(absPath);
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { success: true, path: normalized, deleted: true },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err: unknown) {
        const e = err as { code?: string; message?: string };
        if (e.code === 'ENOENT') {
          return {
            content: [{ type: 'text', text: `Path not found: "${relPath}"` }],
            isError: true,
          };
        }
        if (e.code === 'ENOTEMPTY') {
          return {
            content: [
              {
                type: 'text',
                text: `Directory "${relPath}" is not empty. Pass recursive: true to delete it and its contents.`,
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: `Failed to delete "${relPath}": ${e.message ?? String(err)}`,
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

      // Use twig worktree remove for symlink-safe removal (60s timeout).
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
          // Remove symlinks first to avoid git deleting through them.
          for (const linkName of ['node_modules', '.twig', '.github/skills']) {
            const jPath = join(targetPath, linkName);
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
                        error: `Failed to remove symlink '${linkName}' before force removal: ${linkMsg}. Aborting to avoid deleting through shared symlink.`,
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
    // worktree_remove_batch
    // -----------------------------------------------------------------------
    case 'worktree_remove_batch': {
      const { worktrees: worktreeInputs, force = false } = args as {
        worktrees: string[];
        force?: boolean;
      };

      if (!Array.isArray(worktreeInputs) || worktreeInputs.length === 0) {
        return {
          content: [
            { type: 'text', text: 'worktrees must be a non-empty array.' },
          ],
          isError: true,
        };
      }

      if (worktreeInputs.length > 100) {
        return {
          content: [
            {
              type: 'text',
              text: `Too many entries: ${worktreeInputs.length} provided, maximum is 100.`,
            },
          ],
          isError: true,
        };
      }

      const batchResults: Array<{
        worktree: string;
        success: boolean;
        message: string;
      }> = [];

      // Cache the worktree list once before the loop to avoid re-running
      // `git worktree list --porcelain` for every entry (Thread 6 fix).
      let cachedWorktrees: ReturnType<typeof getWorktrees> | null = null;
      try {
        cachedWorktrees = getWorktrees();
      } catch {
        // If we can't list worktrees, proceed with null — per-entry resolution
        // will fall back gracefully.
      }

      for (const entry of worktreeInputs) {
        const trimmed = String(entry).trim();
        if (!trimmed) {
          batchResults.push({
            worktree: String(entry),
            success: false,
            message: 'Empty or whitespace-only entry.',
          });
          continue;
        }

        // Resolve up-front so both force and non-force paths work with any
        // identifier type (ticket key, path, directory name, or branch name).
        // Wrap in a per-entry try/catch so resolution failures produce a single
        // failed result instead of aborting the whole batch (Thread 6 fix).
        let resolved: ReturnType<typeof resolveWorktreePath>;
        try {
          resolved = resolveWorktreePath(trimmed);
        } catch (resolveErr) {
          batchResults.push({
            worktree: trimmed,
            success: false,
            message: `Failed to resolve worktree '${trimmed}': ${resolveErr instanceof Error ? resolveErr.message : String(resolveErr)}`,
          });
          continue;
        }

        // Determine the branch identifier for the twig call by looking up the
        // resolved path in the cached worktree list (Thread 2 fix). This mirrors
        // how worktree_clean resolves the branch before calling twig.
        let twigIdentifier: string = trimmed;
        if (!('error' in resolved) && cachedWorktrees) {
          const matchedWt = cachedWorktrees.find((w) => {
            const a = resolve(w.path);
            const b = resolve(resolved.path);
            return process.platform === 'win32'
              ? a.toLowerCase() === b.toLowerCase()
              : a === b;
          });
          if (matchedWt?.branch) {
            twigIdentifier = matchedWt.branch;
          }
        }

        // Try twig worktree remove first
        let twigFailed = false;
        let twigTimedOut = false;
        try {
          execFileSync('twig', ['worktree', 'remove', '--', twigIdentifier], {
            cwd: MAIN_REPO,
            encoding: 'utf-8',
            timeout: 60_000,
            maxBuffer: 10 * 1024 * 1024,
          });
          // Clear active worktree state AFTER successful removal (Thread 1 fix).
          if (!('error' in resolved)) {
            if (
              activeWorktree &&
              resolve(activeWorktree) === resolve(resolved.path)
            ) {
              activeWorktree = null;
              persistActiveWorktree(null);
            }
          }
          batchResults.push({
            worktree: trimmed,
            success: true,
            message: `Removed worktree: ${trimmed}`,
          });
          continue;
        } catch (err) {
          const msg =
            err instanceof Error
              ? (err as { stderr?: string }).stderr || err.message
              : String(err);
          twigTimedOut = msg.includes('ETIMEDOUT') || msg.includes('timed out');
          twigFailed = true;

          if (!force) {
            batchResults.push({
              worktree: trimmed,
              success: false,
              message: `twig worktree remove failed: ${msg.trim()}. Retry with force=true.`,
            });
            continue;
          }
        }

        // Force fallback: resolve worktree path, remove symlinks, git worktree remove --force
        if (twigFailed && force) {
          if ('error' in resolved) {
            batchResults.push({
              worktree: trimmed,
              success: false,
              message: resolved.error,
            });
            continue;
          }
          const targetPath = resolved.path;

          let linkError: string | null = null;
          for (const linkName of ['node_modules', '.twig', '.github/skills']) {
            const jPath = join(targetPath, linkName);
            try {
              if (existsSync(jPath) && lstatSync(jPath).isSymbolicLink()) {
                rmSync(jPath, { recursive: false });
              }
            } catch (linkErr) {
              linkError = `Failed to remove symlink '${linkName}': ${linkErr instanceof Error ? linkErr.message : String(linkErr)}`;
              break;
            }
          }

          if (linkError) {
            batchResults.push({
              worktree: trimmed,
              success: false,
              message: linkError,
            });
            continue;
          }

          try {
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
            // Clear active worktree state AFTER successful removal (Thread 1 fix).
            if (
              activeWorktree &&
              resolve(activeWorktree) === resolve(targetPath)
            ) {
              activeWorktree = null;
              persistActiveWorktree(null);
            }
            batchResults.push({
              worktree: trimmed,
              success: true,
              message: `Removed via git force (twig ${twigTimedOut ? 'timed out' : 'failed'}): ${trimmed}`,
            });
          } catch (gitErr) {
            const gitStderr =
              gitErr instanceof Error
                ? (gitErr as { stderr?: string }).stderr || gitErr.message
                : String(gitErr);
            // When the worktree's .git file is missing, `git worktree remove`
            // refuses with "'.git' does not exist". Fall back to direct deletion
            // + prune (mirrors worktree_clean recovery logic).
            if (
              gitStderr.includes("'.git' does not exist") &&
              existsSync(targetPath)
            ) {
              try {
                rmSync(targetPath, { recursive: true, force: true });
                // Clear active worktree state AFTER successful removal (Thread 1 fix).
                if (
                  activeWorktree &&
                  resolve(activeWorktree) === resolve(targetPath)
                ) {
                  activeWorktree = null;
                  persistActiveWorktree(null);
                }
                batchResults.push({
                  worktree: trimmed,
                  success: true,
                  message: `Removed via direct deletion (no .git — force fallback after twig ${twigTimedOut ? 'timeout' : 'failure'}): ${trimmed}`,
                });
              } catch (rmErr) {
                const rmMsg =
                  rmErr instanceof Error ? rmErr.message : String(rmErr);
                batchResults.push({
                  worktree: trimmed,
                  success: false,
                  message: `Direct deletion fallback failed: ${rmMsg.trim()}. The worktree directory may be locked — run \`make kill-stale\` then retry.`,
                });
              } finally {
                try {
                  execFileSync('git', ['worktree', 'prune'], {
                    cwd: MAIN_REPO,
                    encoding: 'utf-8',
                    timeout: 30_000,
                  });
                } catch {
                  // prune failure is non-fatal
                }
              }
            } else {
              batchResults.push({
                worktree: trimmed,
                success: false,
                message: `git worktree remove --force failed: ${gitStderr.trim()}`,
              });
            }
          }
        }
      }

      const removedCount = batchResults.filter((r) => r.success).length;
      const failedCount = batchResults.filter((r) => !r.success).length;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                total: batchResults.length,
                removed: removedCount,
                failed: failedCount,
                results: batchResults,
              },
              null,
              2,
            ),
          },
        ],
        isError: failedCount > 0,
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

    // -----------------------------------------------------------------------
    // worktree_is_tracked
    // -----------------------------------------------------------------------
    case 'worktree_is_tracked': {
      const { paths, worktree: wtKey } = args as {
        paths: string[];
        worktree?: string;
      };

      if (!Array.isArray(paths) || paths.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: '`paths` must be a non-empty array of strings.',
            },
          ],
          isError: true,
        };
      }
      if (paths.length > 100) {
        return {
          content: [
            {
              type: 'text',
              text: `Too many paths: ${paths.length}. Max 100 per call.`,
            },
          ],
          isError: true,
        };
      }
      for (const p of paths) {
        if (typeof p !== 'string' || !p || /[\r\n\0]/.test(p)) {
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
        if (isAbsolute(p)) {
          return {
            content: [
              {
                type: 'text',
                text: `Invalid path: "${p}". Paths must be relative to the worktree root (no absolute paths).`,
              },
            ],
            isError: true,
          };
        }
        // Normalize separators before checking for '..' so that Windows-style
        // paths like 'foo\..\..\secrets.txt' are caught by the same test.
        const pNorm = p.replace(/\\/g, '/');
        if (
          pNorm.split('/').some((seg) => seg === '..') ||
          pNorm.startsWith('../')
        ) {
          return {
            content: [
              {
                type: 'text',
                text: `Invalid path: "${p}". Paths must not escape the worktree root (no '..' segments).`,
              },
            ],
            isError: true,
          };
        }
      }

      const target = resolveTargetDir(wtKey);
      if ('error' in target) {
        return {
          content: [{ type: 'text', text: target.error }],
          isError: true,
        };
      }
      const cwd = target.path;

      // Secondary containment check: even after the '..' segment check above,
      // verify that each resolved path stays within the worktree root.  This
      // catches any edge cases (e.g. symlink-induced escapes or OS-specific
      // normalisation quirks) that the segment-based check may miss.
      for (const p of paths) {
        const pNorm = p.replace(/\\/g, '/');
        const resolved = resolve(cwd, pNorm);
        if (!resolved.startsWith(cwd + sep) && resolved !== cwd) {
          return {
            content: [
              {
                type: 'text',
                text: `Invalid path: "${p}". Path escapes worktree root.`,
              },
            ],
            isError: true,
          };
        }
      }

      // Tracked check: `git ls-files -- <paths...>` returns each tracked path
      // on a line of its own. Untracked paths produce no output. We compare
      // by normalized forward-slash path so Windows backslashes work.
      const normalized = (p: string) =>
        p.replace(/\\/g, '/').replace(/^\.\//, '');
      // Normalize to forward slashes for git compatibility; preserve original
      // for result.path
      const normalizedPaths = paths.map((p) => normalized(p));
      const trackedSet = new Set<string>();
      try {
        const output = runGit(['ls-files', '--', ...normalizedPaths], cwd, {
          timeout: 15_000,
        });
        for (const line of output.split('\n')) {
          const trimmed = line.trim();
          if (trimmed) trackedSet.add(normalized(trimmed));
        }
      } catch (err: unknown) {
        const e = err as { stderr?: string; message?: string };
        return {
          content: [
            {
              type: 'text',
              text: `git ls-files failed: ${(e.stderr || e.message || String(err)).trim()}`,
            },
          ],
          isError: true,
        };
      }

      // Ignored check: uses `git check-ignore --stdin` (no -v flag; output is
      // just the path when ignored). Reuses the same flow as
      // worktree_check_ignore, but we only need the boolean.
      const ignoredSet = new Set<string>();
      let ignoredCheckFailed = false;
      try {
        await new Promise<void>((resolveFn, rejectFn) => {
          const proc = execFile(
            'git',
            ['check-ignore', '--stdin'],
            {
              cwd,
              timeout: 10_000,
              encoding: 'utf-8',
              maxBuffer: 10 * 1024 * 1024,
            },
            (err, stdout) => {
              const code = (err as NodeJS.ErrnoException & { code?: number })
                ?.code;
              // exit 1 = nothing ignored (not an error)
              if (err && code !== 1) {
                const message =
                  err instanceof Error ? err.message : 'check-ignore failed';
                rejectFn(new Error(message));
                return;
              }
              for (const line of stdout.split('\n')) {
                const trimmed = line.trim();
                if (trimmed) ignoredSet.add(normalized(trimmed));
              }
              resolveFn();
            },
          );
          if (!proc.stdin) {
            rejectFn(new Error('git check-ignore: stdin stream unavailable'));
            return;
          }
          proc.stdin.write(normalizedPaths.join('\n') + '\n');
          proc.stdin.end();
        });
      } catch {
        // Non-fatal — the tool's primary contract is the tracked flag.
        // Mark the check as failed so callers can distinguish "not ignored"
        // from "unknown" in the result entries.
        ignoredCheckFailed = true;
      }

      const results = paths.map((p, i) => {
        const key = normalized(p);
        const tracked = trackedSet.has(key);
        // `ignored` is a boolean when git check-ignore succeeds, or null when
        // the check could not be completed (e.g. git unavailable, process
        // error).  Callers should treat null as "unknown" — distinct from
        // false ("not ignored").  When ignored is null, ignoredError contains
        // a brief description of why the check failed.
        const ignored: boolean | null = ignoredCheckFailed
          ? null
          : ignoredSet.has(key);
        const ignoredError: string | undefined = ignoredCheckFailed
          ? 'git check-ignore did not complete successfully'
          : undefined;

        let sizeBytes: number | undefined;
        try {
          const pNormalized = normalizedPaths[i];
          const absolute = isAbsolute(pNormalized)
            ? pNormalized
            : resolve(cwd, pNormalized);
          if (existsSync(absolute)) {
            const stat = lstatSync(absolute);
            if (stat.isFile()) sizeBytes = stat.size;
          }
        } catch {
          // best effort
        }

        return {
          path: p,
          tracked,
          ignored,
          ...(ignoredError !== undefined ? { ignoredError } : {}),
          sizeBytes,
        };
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

    // -----------------------------------------------------------------------
    // worktree_attach
    // -----------------------------------------------------------------------
    case 'worktree_attach': {
      const {
        branch,
        path: explicitPath,
        setup = false,
      } = args as {
        branch: string;
        path?: string;
        setup?: boolean;
      };

      // Validate branch name — only safe git ref chars; reject flag injection
      if (!branch || branch.startsWith('-')) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid branch: "${branch}". Branch name must not be empty or start with '-'.`,
            },
          ],
          isError: true,
        };
      }
      if (!/^[a-zA-Z0-9_./@-]+$/.test(branch)) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid branch: "${branch}". Only alphanumeric, '_', '.', '/', '@', '-' allowed.`,
            },
          ],
          isError: true,
        };
      }

      // Reject unsafe git ref patterns: "..", "/..", ".lock" suffix, trailing "."
      if (/(\.\.|\/\.|\.lock$|\.$)/.test(branch)) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid branch: "${branch}". Contains unsafe git ref characters (e.g. "..", "/..", ".lock", trailing ".").`,
            },
          ],
          isError: true,
        };
      }

      // Derive default worktree path from MAIN_REPO parent so it's platform-agnostic
      const WORKTREES_ROOT = join(
        dirname(MAIN_REPO),
        'legacy-sports-worktrees',
      );
      const slug = branch.replace(/\//g, '-');
      const worktreePath = explicitPath ?? join(WORKTREES_ROOT, slug);

      // Validate explicit path if provided
      if (explicitPath) {
        if (!isAbsolute(explicitPath)) {
          return {
            content: [
              {
                type: 'text',
                text: `Invalid path: "${explicitPath}". Must be an absolute path.`,
              },
            ],
            isError: true,
          };
        }
        const resolvedExplicit = resolve(explicitPath);
        const resolvedMain = resolve(MAIN_REPO);
        if (
          resolvedExplicit === resolvedMain ||
          resolvedExplicit.startsWith(resolvedMain + sep)
        ) {
          return {
            content: [
              {
                type: 'text',
                text: 'Cannot create a worktree inside or at the main repo directory.',
              },
            ],
            isError: true,
          };
        }
      }

      const log: string[] = [];

      try {
        // Fetch origin so branch is available locally even if not yet checked out
        log.push('$ git fetch origin');
        try {
          runGit(['fetch', 'origin'], MAIN_REPO, { timeout: 30_000 });
          log.push('Fetch complete.');
        } catch (fetchErr) {
          // Non-fatal — branch may already be local
          log.push(
            `Fetch warning (continuing): ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`,
          );
        }

        // Run git worktree add — if the branch exists locally use it directly;
        // otherwise create a local tracking branch from origin/<branch>.
        const localRef = runGit(['branch', '--list', branch], MAIN_REPO).trim();
        if (localRef) {
          log.push(`$ git worktree add "${worktreePath}" "${branch}"`);
          runGit(['worktree', 'add', worktreePath, branch], MAIN_REPO, {
            timeout: 60_000,
          });
        } else {
          log.push(
            `$ git worktree add --track -b "${branch}" "${worktreePath}" "origin/${branch}"`,
          );
          runGit(
            [
              'worktree',
              'add',
              '--track',
              '-b',
              branch,
              worktreePath,
              `origin/${branch}`,
            ],
            MAIN_REPO,
            { timeout: 60_000 },
          );
        }
        log.push('Worktree created.');

        // Set as active worktree
        activeWorktree = resolve(worktreePath);
        persistActiveWorktree(activeWorktree);
        log.push(`Active worktree set to: ${activeWorktree}`);

        // Optionally run wt-setup (Windows-only)
        if (setup) {
          if (process.platform !== 'win32') {
            log.push(
              'setup=true ignored on non-Windows platform. Run `make install` manually.',
            );
          } else {
            log.push(`$ make wt-setup WT=${worktreePath}`);
            try {
              const makeOutput = execFileSync(
                'cmd',
                ['/c', 'make', 'wt-setup', `WT=${worktreePath}`],
                {
                  cwd: MAIN_REPO,
                  encoding: 'utf-8',
                  timeout: 300_000,
                  maxBuffer: 10 * 1024 * 1024,
                },
              );
              log.push(makeOutput);
              log.push('wt-setup complete.');
            } catch (setupErr) {
              log.push(
                `wt-setup warning: ${setupErr instanceof Error ? setupErr.message : String(setupErr)}`,
              );
            }
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
                  worktreePath: activeWorktree,
                  log: log.join('\n'),
                  nextSteps: [
                    `Worktree is now active — run worktree_set({ key: "${branch}" }) to re-activate after server restart`,
                    setup
                      ? 'Setup complete'
                      : 'Symlink node_modules if needed: worktree_setup_node_modules()',
                  ],
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        log.push(`Error: ${err instanceof Error ? err.message : String(err)}`);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: false,
                  branch,
                  worktreePath,
                  log: log.join('\n'),
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

    // -----------------------------------------------------------------------
    // worktree_rename_branch
    // -----------------------------------------------------------------------
    case 'worktree_rename_branch': {
      const { newName, worktree: wtKey } = args as {
        newName: string;
        worktree?: string;
      };

      // Validate newName contains an LS-#### key
      if (!/LS-\d+/.test(newName)) {
        return {
          content: [
            {
              type: 'text',
              text: `Refused: newName "${newName}" must contain an LS-#### Jira key (e.g. "claude/LS-2994-add-rename-tool").`,
            },
          ],
          isError: true,
        };
      }

      // Refuse renames targeting main or origin/main
      const normalized = newName.replace(/^origin\//, '');
      if (normalized === 'main') {
        return {
          content: [
            {
              type: 'text',
              text: `Refused: cannot rename branch to "main" or "origin/main".`,
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

      // Guard: refuse to operate on the main repository root. resolveTargetDir
      // does not apply this check when returning activeWorktree directly, so an
      // agent that called worktree_set with a stale path could end up here.
      if (resolve(cwd) === resolve(MAIN_REPO)) {
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

      // Read HEAD directly from the filesystem to obtain the branch name
      // independently of any GIT_DIR / GIT_WORK_TREE environment variables that
      // could cause `git branch --show-current` to report a different branch.
      const headResult = readWorktreeHead(cwd);
      if ('error' in headResult) {
        return {
          content: [{ type: 'text', text: headResult.error }],
          isError: true,
        };
      }
      const headBranch = headResult.branch;

      // Get current branch name
      let previousName: string;
      try {
        previousName = runGit(['branch', '--show-current'], cwd).trim();
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

      // Cross-check: if git disagrees with the HEAD file the process environment
      // has overridden the git directory (GIT_DIR etc.) and we are about to
      // rename the wrong branch. Refuse until the mismatch is resolved.
      if (previousName !== headBranch) {
        return {
          content: [
            {
              type: 'text',
              text:
                `State mismatch detected: git reports current branch as "${previousName}" ` +
                `but the worktree HEAD file shows "${headBranch}". ` +
                `Refusing to rename to avoid operating on the wrong branch. ` +
                `Run worktree_set to reset the active worktree, then retry.`,
            },
          ],
          isError: true,
        };
      }

      if (!previousName) {
        return {
          content: [
            {
              type: 'text',
              text: 'Refused: HEAD is detached (no branch checked out). Cannot rename.',
            },
          ],
          isError: true,
        };
      }

      if (previousName === 'main') {
        return {
          content: [
            {
              type: 'text',
              text: 'Refused: cannot rename the main branch.',
            },
          ],
          isError: true,
        };
      }

      // Validate newName is a safe git ref before passing to git (prevents
      // flag injection from values starting with '-' and rejects illegal ref
      // patterns like '..', '.lock', trailing '.', etc.).
      try {
        runGit(['check-ref-format', '--branch', newName], cwd);
      } catch (err: unknown) {
        const e = err as {
          stdout?: string;
          stderr?: string;
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
              text: `Refused: invalid branch name "${newName}".\n${output}`,
            },
          ],
          isError: true,
        };
      }

      try {
        runGit(['branch', '-m', '--', newName], cwd);
        // Verify the rename actually took effect — git branch -m can exit 0
        // while the rename is a no-op (e.g. when the worktree is in a
        // detached-but-partially-checked-out state shared across sessions).
        const actualName = runGit(['branch', '--show-current'], cwd).trim();
        if (actualName !== newName) {
          return {
            content: [
              {
                type: 'text',
                text: `Rename failed: current branch is still "${actualName}" after rename attempt. Use git -C <worktree> branch -m ${newName} manually.`,
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
                  previousName,
                  newName,
                  worktree: cwd,
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
              text: `Failed to rename branch (exit code ${e.status ?? 'unknown'}):\n${output}`,
            },
          ],
          isError: true,
        };
      }
    }

    // -----------------------------------------------------------------------
    // worktree_rename_session
    // -----------------------------------------------------------------------
    case 'worktree_rename_session': {
      const { title, worktree: wtKey } = args as {
        title: string;
        worktree?: string;
      };

      if (!title || title.trim().length === 0) {
        return {
          content: [{ type: 'text', text: 'title must be non-empty.' }],
          isError: true,
        };
      }

      // Determine the CWD that Claude Code used to create the session.
      // In a native worktree session this is the worktree path; otherwise
      // the main repo root.
      const target = resolveTargetDir(wtKey);
      if ('error' in target) {
        // If the caller explicitly passed a worktree key that couldn't be
        // resolved, return the error — don't silently fall back to MAIN_REPO
        // which would rename the wrong session.
        if (wtKey) {
          return {
            content: [{ type: 'text', text: target.error }],
            isError: true,
          };
        }
      }
      const sessionCwd: string = 'error' in target ? MAIN_REPO : target.path;

      // Claude Code encodes the CWD by replacing every non-alphanumeric
      // character with '-' to form the project directory name.
      // Verified on disk: `.claude` encodes as `-claude` (not `.claude`),
      // matching the official docs: "every non-alphanumeric → '-'".
      const encoded = sessionCwd.replace(/[^a-zA-Z0-9]/g, '-');
      const sessionsDir = join(homedir(), '.claude', 'projects', encoded);

      // Wrap filesystem operations in try/catch so failures return an
      // isError response instead of crashing the MCP server process.
      let jsonlFiles: Array<{ name: string; mtime: number }>;
      try {
        if (!existsSync(sessionsDir) || !statSync(sessionsDir).isDirectory()) {
          return {
            content: [
              {
                type: 'text',
                text: `No sessions directory found at ${sessionsDir}`,
              },
            ],
            isError: true,
          };
        }

        // Find the most recently modified .jsonl file (the active session).
        jsonlFiles = readdirSync(sessionsDir)
          .filter((f) => f.endsWith('.jsonl'))
          .map((f) => ({
            name: f,
            mtime: statSync(join(sessionsDir, f)).mtimeMs,
          }))
          .sort((a, b) => b.mtime - a.mtime);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to read session files in ${sessionsDir}: ${message}`,
            },
          ],
          isError: true,
        };
      }

      if (jsonlFiles.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No session files found in ${sessionsDir}`,
            },
          ],
          isError: true,
        };
      }

      const latest = jsonlFiles[0];
      const sessionId = latest.name.replace(/\.jsonl$/, '');
      const sessionFile = join(sessionsDir, latest.name);
      const trimmedTitle = title.trim();

      try {
        const entry = JSON.stringify({
          type: 'custom-title',
          customTitle: trimmedTitle,
          sessionId,
        });
        appendFileSync(sessionFile, '\n' + entry, 'utf8');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to write session title to ${sessionFile}: ${message}`,
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
              { success: true, sessionId, title: trimmedTitle },
              null,
              2,
            ),
          },
        ],
      };
    }

    // -----------------------------------------------------------------------
    // worktree_reset
    // -----------------------------------------------------------------------
    case 'worktree_reset': {
      const {
        sha,
        mode = 'hard',
        force = false,
        worktree: wtKeyRaw,
      } = args as {
        sha: string;
        mode?: 'hard' | 'soft' | 'mixed';
        force?: boolean;
        worktree?: unknown;
      };

      // Validate worktree param type (mirrors worktree_push pattern)
      if (wtKeyRaw !== undefined && typeof wtKeyRaw !== 'string') {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid worktree: expected string, got ${typeof wtKeyRaw}`,
            },
          ],
          isError: true,
        };
      }
      if (typeof wtKeyRaw === 'string' && wtKeyRaw.trim().length === 0) {
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
      const wtKey = typeof wtKeyRaw === 'string' ? wtKeyRaw.trim() : undefined;

      // Validate SHA format (full or abbreviated hex, 4–64 chars)
      if (!/^[0-9a-fA-F]{4,64}$/.test(sha)) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid sha: "${sha}". Must be a hex commit SHA (4–64 characters).`,
            },
          ],
          isError: true,
        };
      }

      // Validate mode
      if (!['hard', 'soft', 'mixed'].includes(mode)) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid mode: "${mode}". Must be one of: hard, soft, mixed.`,
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

      try {
        // Safety: refuse to reset on main branch or in detached HEAD state
        // (mirrors worktree_push's guard — detached HEAD may indicate mid-rebase/merge)
        const branch = run('git branch --show-current', cwd).trim();
        if (!branch) {
          const gitDir = run('git rev-parse --git-dir', cwd).trim();
          const resolvedGitDir = isAbsolute(gitDir)
            ? gitDir
            : join(cwd, gitDir);
          const inRebase =
            existsSync(join(resolvedGitDir, 'rebase-merge')) ||
            existsSync(join(resolvedGitDir, 'rebase-apply'));
          return {
            content: [
              {
                type: 'text',
                text: inRebase
                  ? `[resolvedWorktree: ${cwd}]\nRefused: rebase is in progress. Finish or abort the rebase before resetting.`
                  : `[resolvedWorktree: ${cwd}]\nRefused: HEAD is detached (no branch checked out). Aborting reset.`,
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
                text: `[resolvedWorktree: ${cwd}]\nRefused: cannot reset on main branch.`,
              },
            ],
            isError: true,
          };
        }

        // Resolve target SHA to full form (handles abbreviated SHAs)
        let targetSha: string;
        try {
          targetSha = runGit(
            ['rev-parse', '--verify', `${sha}^{commit}`],
            cwd,
          ).trim();
        } catch {
          return {
            content: [
              {
                type: 'text',
                text: `[resolvedWorktree: ${cwd}]\nCannot resolve SHA: "${sha}". Commit not found in repository.`,
              },
            ],
            isError: true,
          };
        }

        // Get current HEAD SHA
        const previousSha = run('git rev-parse HEAD', cwd).trim();

        // If already at target, nothing to do
        if (targetSha === previousSha) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    resolvedWorktree: cwd,
                    reset: false,
                    reason: 'Already at target SHA — no reset needed.',
                    previousSha,
                    currentSha: targetSha,
                    mode,
                    filesChanged: 0,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Safety: verify target SHA is an ancestor of HEAD to prevent data loss.
        // git merge-base --is-ancestor exits 0 if ancestor, 1 if not.
        try {
          runGit(['merge-base', '--is-ancestor', targetSha, 'HEAD'], cwd);
        } catch {
          return {
            content: [
              {
                type: 'text',
                text: [
                  `[resolvedWorktree: ${cwd}]`,
                  `Refused: "${sha}" (${targetSha.slice(0, 7)}) is not an ancestor of HEAD (${previousSha.slice(0, 7)}).`,
                  `worktree_reset only allows resetting to ancestor commits to prevent accidental data loss.`,
                  `If you intentionally need a non-ancestor reset, use worktree_run with git reset directly.`,
                ].join('\n'),
              },
            ],
            isError: true,
          };
        }

        // Safety: for --hard resets, refuse when the worktree is dirty unless
        // force=true is explicitly passed to opt in.
        // Use diff --quiet rather than status --porcelain so untracked files
        // (which git reset --hard leaves untouched) don't trigger a false positive.
        if (mode === 'hard' && !force) {
          const indexDirty = (() => {
            try {
              runGit(['diff', '--quiet'], cwd, { timeout: 15_000 });
              return false;
            } catch {
              return true;
            }
          })();
          const stagedDirty = (() => {
            try {
              runGit(['diff', '--cached', '--quiet'], cwd, { timeout: 15_000 });
              return false;
            } catch {
              return true;
            }
          })();
          if (indexDirty || stagedDirty) {
            return {
              content: [
                {
                  type: 'text',
                  text: [
                    `[resolvedWorktree: ${cwd}]`,
                    `Refused: git reset --hard ${targetSha.slice(0, 7)} would discard uncommitted working tree changes.`,
                    `Commit, stash, or discard local changes first, or pass force: true to override.`,
                  ].join('\n'),
                },
              ],
              isError: true,
            };
          }
        }

        // Count files affected between target and current HEAD
        let filesChanged = 0;
        try {
          const diffOut = runGit(
            ['diff', '--name-only', targetSha, previousSha],
            cwd,
            { timeout: 15_000 },
          ).trim();
          filesChanged = diffOut ? diffOut.split('\n').length : 0;
        } catch {
          // Non-fatal — proceed with reset even if diff count fails
        }

        // Perform the reset
        runGit(['reset', `--${mode}`, targetSha], cwd);

        const currentSha = run('git rev-parse HEAD', cwd).trim();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  resolvedWorktree: cwd,
                  command: `git reset --${mode} ${targetSha.slice(0, 7)}`,
                  reset: true,
                  previousSha,
                  currentSha,
                  mode,
                  filesChanged,
                  nextStep:
                    mode === 'hard'
                      ? 'worktree_push() to force-push the reset branch.'
                      : 'stage/commit your changes, then worktree_push().',
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
        return {
          content: [
            {
              type: 'text',
              text: [
                `[resolvedWorktree: ${cwd}]`,
                `worktree_reset failed`,
                output,
              ]
                .filter(Boolean)
                .join('\n'),
            },
          ],
          isError: true,
        };
      }
    }

    // -----------------------------------------------------------------------
    // worktree_delete_remote_branch
    // -----------------------------------------------------------------------
    case 'worktree_delete_remote_branch': {
      const { branch, worktree: wtKey } = args as {
        branch: string;
        worktree?: string;
      };

      // Validate branch is a non-empty string
      if (typeof branch !== 'string' || branch.trim().length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'Invalid branch: must be a non-empty string.',
            },
          ],
          isError: true,
        };
      }

      const normalizedBranch = branch.trim();

      // Reject full ref paths (refs/heads/..., refs/remotes/...) — only bare
      // short branch names are accepted (e.g. "claude/LS-1234-foo").
      // A full ref path could bypass the main-branch guard below
      // (e.g. "refs/heads/main" would not match the "origin/" strip).
      if (normalizedBranch.startsWith('refs/')) {
        return {
          content: [
            {
              type: 'text',
              text:
                `Refused: branch must be a short name, not a full ref path. ` +
                `Got "${normalizedBranch}". Strip the "refs/heads/" or "refs/remotes/" prefix before calling this tool.`,
            },
          ],
          isError: true,
        };
      }

      // Refuse to delete main or origin/main (strip origin/ prefix for comparison)
      const bareRef = normalizedBranch.replace(/^origin\//, '');
      if (bareRef === 'main') {
        return {
          content: [
            {
              type: 'text',
              text: `Refused: cannot delete "main" or "origin/main" remote branch.`,
            },
          ],
          isError: true,
        };
      }

      // Validate branch name is a safe git ref (prevents flag injection from
      // values starting with '-' and rejects illegal ref patterns like '..').
      const target = resolveTargetDir(wtKey);
      if ('error' in target) {
        return {
          content: [{ type: 'text', text: target.error }],
          isError: true,
        };
      }
      const cwd = target.path;

      try {
        runGit(['check-ref-format', '--branch', normalizedBranch], cwd);
      } catch (err: unknown) {
        const e = err as {
          stdout?: string;
          stderr?: string;
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
              text: `Refused: invalid branch name "${normalizedBranch}".\n${output}`,
            },
          ],
          isError: true,
        };
      }

      try {
        runGit(['push', 'origin', '--delete', '--', normalizedBranch], cwd, {
          timeout: 30_000,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  deleted: true,
                  branch: normalizedBranch,
                  remote: 'origin',
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
              text: `Failed to delete remote branch "${normalizedBranch}" (exit code ${e.status ?? 'unknown'}):\n${output}`,
            },
          ],
          isError: true,
        };
      }
    }

    // -----------------------------------------------------------------------
    // worktree_list_branches
    // -----------------------------------------------------------------------
    case 'worktree_list_branches': {
      const rawArgs = args as {
        filter?: string;
        remote?: unknown;
        local?: unknown;
      };

      const includeRemote = coerceBool(rawArgs.remote) !== false; // default true
      const includeLocal = coerceBool(rawArgs.local) !== false; // default true
      const filter = rawArgs.filter;

      // Compile filter as a regex (supports both plain substrings and regex patterns)
      let filterRegex: RegExp | null = null;
      if (filter) {
        try {
          filterRegex = new RegExp(filter);
        } catch {
          return {
            content: [
              {
                type: 'text',
                text:
                  `Invalid filter: "${filter}" is not a valid regular expression. ` +
                  `Use a plain substring (e.g. "LS-2955") or a valid JS regex (e.g. "^claude/").`,
              },
            ],
            isError: true,
          };
        }
      }

      if (!includeLocal && !includeRemote) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { branches: [], total: 0, filter: filter ?? null },
                null,
                2,
              ),
            },
          ],
        };
      }

      interface BranchEntry {
        name: string;
        type: 'local' | 'remote';
        current: boolean;
      }

      const branches: BranchEntry[] = [];

      try {
        // Local branches — %(HEAD) is '*' for the checked-out branch, ' ' otherwise.
        if (includeLocal) {
          const localOut = runGit(
            ['branch', '--format=%(HEAD)|%(refname:short)'],
            MAIN_REPO,
          );
          for (const line of localOut.split(/\r?\n/)) {
            if (!line.trim()) continue;
            const pipeIdx = line.indexOf('|');
            if (pipeIdx === -1) continue;
            const head = line.slice(0, pipeIdx);
            const name = line.slice(pipeIdx + 1).trim();
            if (!name) continue;
            if (filterRegex && !filterRegex.test(name)) continue;
            branches.push({
              name,
              type: 'local',
              current: head.trim() === '*',
            });
          }
        }

        // Remote-tracking branches — %(HEAD) is unused for -r listings.
        if (includeRemote) {
          const remoteOut = runGit(
            ['branch', '-r', '--format=%(refname:short)'],
            MAIN_REPO,
          );
          for (const line of remoteOut.split(/\r?\n/)) {
            const name = line.trim();
            if (!name) continue;
            // Skip the symbolic HEAD alias (e.g. "origin/HEAD -> origin/main")
            if (name.includes(' -> ') || name.endsWith('/HEAD')) continue;
            if (filterRegex && !filterRegex.test(name)) continue;
            branches.push({ name, type: 'remote', current: false });
          }
        }
      } catch (err: unknown) {
        const e = err as {
          stdout?: string;
          stderr?: string;
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
              text: `Failed to list branches:\n${output}`,
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
              { branches, total: branches.length, filter: filter ?? null },
              null,
              2,
            ),
          },
        ],
      };
    }

    // -----------------------------------------------------------------------
    // worktree_ping
    // -----------------------------------------------------------------------
    case 'worktree_ping': {
      const cmd = 'git';

      let gitVersion: string | undefined;
      let gitError: string | undefined;
      try {
        gitVersion = execFileSync(cmd, ['--version'], {
          encoding: 'utf-8',
          timeout: 5_000,
        }).trim();
      } catch (err) {
        gitError = err instanceof Error ? err.message : String(err);
      }

      let worktreeCount = 0;
      let worktreeListOk = false;
      let worktreeListError: string | undefined;
      try {
        const out = execFileSync(cmd, ['worktree', 'list', '--porcelain'], {
          encoding: 'utf-8',
          cwd: MAIN_REPO,
          timeout: 5_000,
        });
        worktreeCount = (out.match(/^worktree /gm) ?? []).length;
        worktreeListOk = true;
      } catch (err) {
        worktreeListError = err instanceof Error ? err.message : String(err);
      }

      const mainRepoExists = existsSync(MAIN_REPO);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ready: !gitError && mainRepoExists && worktreeListOk,
                gitVersion,
                mainRepo: MAIN_REPO,
                mainRepoExists,
                activeWorktree: activeWorktree ?? null,
                worktreeCount,
                ...(gitError ? { gitError } : {}),
                ...(worktreeListError ? { worktreeListError } : {}),
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    // -----------------------------------------------------------------------
    // worktree_stash
    // -----------------------------------------------------------------------
    case 'worktree_stash': {
      const { message, worktree: wtKey } = args as {
        message?: string;
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

      try {
        const gitArgs = ['stash', 'push', '-u'];
        if (message && message.trim()) {
          gitArgs.push('-m', message.trim());
        }
        const output = runGit(gitArgs, cwd);

        if (output.trim() === 'No local changes to save') {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    stashed: false,
                    message: 'No local changes to save.',
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        const stashRef = runGit(
          ['stash', 'list', '--max-count=1', '--format=%gd %s'],
          cwd,
        ).trim();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  stashed: true,
                  stashRef: stashRef.split(' ')[0] ?? 'stash@{0}',
                  output: output.trim(),
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
              text: `git stash failed (exit code ${e.status ?? 'unknown'}):\n${output}`,
            },
          ],
          isError: true,
        };
      }
    }

    // -----------------------------------------------------------------------
    // worktree_stash_pop
    // -----------------------------------------------------------------------
    case 'worktree_stash_pop': {
      const { worktree: wtKey } = args as {
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

      try {
        const output = runGit(['stash', 'pop'], cwd);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  output: output.trim(),
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
              text: `git stash pop failed (exit code ${e.status ?? 'unknown'}):\n${output}`,
            },
          ],
          isError: true,
        };
      }
    }

    case 'auth_check_all': {
      // GitHub / CI: GH_TOKEN, GITHUB_TOKEN, AGENT_AUTHOR_APP_PRIVATE_KEY, cached file, netrc
      const ghEnvToken =
        process.env.GH_TOKEN ||
        process.env.GITHUB_TOKEN ||
        process.env.AGENT_AUTHOR_APP_PRIVATE_KEY;
      const ghCacheFile = join(
        homedir(),
        '.config',
        'legacy-sports-github',
        'token.json',
      );
      const ghCached = existsSync(ghCacheFile);
      const ghNetrc = checkNetrc('github.com');
      const githubOk = !!(ghEnvToken || ghCached || ghNetrc);
      const githubMethod = ghEnvToken
        ? process.env.GH_TOKEN
          ? 'env:GH_TOKEN'
          : process.env.GITHUB_TOKEN
            ? 'env:GITHUB_TOKEN'
            : 'env:AGENT_AUTHOR_APP_PRIVATE_KEY'
        : ghCached
          ? 'cached-file'
          : ghNetrc
            ? 'netrc'
            : undefined;

      // Jira: basic (JIRA_EMAIL + JIRA_API_TOKEN) or OAuth (JIRA_CLIENT_ID + JIRA_CLIENT_SECRET + JIRA_CLOUD_ID) or netrc
      const jiraBasic = !!(
        process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN
      );
      const jiraOAuth = !!(
        process.env.JIRA_CLIENT_ID &&
        process.env.JIRA_CLIENT_SECRET &&
        process.env.JIRA_CLOUD_ID
      );
      const jiraNetrc =
        checkNetrc('atlassian.net') ||
        checkNetrc('bkrupa.atlassian.net') ||
        checkNetrc('id.atlassian.com');
      const jiraOk = jiraBasic || jiraOAuth || jiraNetrc;
      const jiraMethod = jiraBasic
        ? 'env:basic'
        : jiraOAuth
          ? 'env:oauth'
          : jiraNetrc
            ? 'netrc'
            : undefined;

      // AWS: verify SSO session is active via sts get-caller-identity
      const awsProfile = process.env.AWS_PROFILE ?? 'default';
      let awsOk = false;
      let awsUserId: string | undefined;
      try {
        const awsOut = execFileSync(
          'aws',
          [
            'sts',
            'get-caller-identity',
            '--profile',
            awsProfile,
            '--output',
            'json',
          ],
          { encoding: 'utf-8', timeout: 8_000 },
        );
        const parsed = JSON.parse(awsOut) as {
          UserId?: string;
          Account?: string;
        };
        awsOk = !!(parsed.UserId || parsed.Account);
        awsUserId = parsed.UserId;
      } catch {
        awsOk = false;
      }

      // CI uses the same GitHub token
      const ciOk = githubOk;
      const ciMethod = githubMethod;

      const allAuthenticated = githubOk && jiraOk && awsOk && ciOk;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                allAuthenticated,
                services: {
                  github: {
                    ok: githubOk,
                    ...(githubMethod !== undefined
                      ? { method: githubMethod }
                      : {}),
                    ...(!githubOk
                      ? {
                          hint: 'Set `GH_TOKEN` in `.mcp.json` env, or run `gh auth login` in your terminal, then restart the session.',
                        }
                      : {}),
                  },
                  jira: {
                    ok: jiraOk,
                    ...(jiraMethod !== undefined ? { method: jiraMethod } : {}),
                    ...(!jiraOk
                      ? {
                          hint: 'Set `JIRA_EMAIL` and `JIRA_API_TOKEN` in `.mcp.json` env (generate at https://id.atlassian.com/manage-profile/security/api-tokens), then restart the session.',
                        }
                      : {}),
                  },
                  aws: {
                    ok: awsOk,
                    profile: awsProfile,
                    ...(awsUserId !== undefined ? { userId: awsUserId } : {}),
                    ...(!awsOk
                      ? {
                          hint: `Run \`aws sso login --profile ${awsProfile}\` in your terminal to refresh your SSO session.`,
                        }
                      : {}),
                  },
                  ci: {
                    ok: ciOk,
                    ...(ciMethod !== undefined ? { method: ciMethod } : {}),
                    ...(!ciOk
                      ? {
                          hint: 'Set `GH_TOKEN` with `repo` and `actions:read` scope in `.mcp.json` env, then restart the session.',
                        }
                      : {}),
                  },
                },
              },
              null,
              2,
            ),
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
