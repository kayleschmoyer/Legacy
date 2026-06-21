// Token-efficient response formatting for worktree-server (epic LS-8018,
// ticket LS-8024). The shared standard + helper live in
// `@legacy-sports/mcp-format` (`lib/mcp-format`, LS-8019); this module only
// holds the worktree-server-specific column selections and the small glue that
// turns each tool's data into the standard's per-shape encoding:
//
//   - Flat, uniform lists (worktree list, branch lists, the flat commit log,
//     diff stat summaries) -> Markdown table (column headers written once
//     instead of repeating JSON keys on every row).
//   - Single objects / nested data (worktree status, --stat commit log with
//     per-file children) -> minified JSON (a table would be lossy or larger).
//
// Field selection is the first-order token lever, so each table prunes to the
// columns agents actually consume; format is second-order.

import { markdownTable, minifiedJson } from '@legacy-sports/mcp-format';

/**
 * Render a single italic metadata footer line for list responses (counts,
 * filters, pagination flags) that don't belong in the table body. Mirrors the
 * `_..._` hint convention used by the rollbar-server migration. Omits keys
 * whose value is `undefined` or `null` so the line stays compact.
 */
export function metaLine(fields: Record<string, unknown>): string {
  const parts = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}: ${String(value)}`);
  return parts.length === 0 ? '' : `_${parts.join(' · ')}_`;
}

/** Join a table with an optional trailing metadata/footer line. */
function withFooter(table: string, footer: string): string {
  if (!footer) return table || '';
  return table ? `${table}\n\n${footer}` : footer;
}

// ---------------------------------------------------------------------------
// worktree_list — local worktrees
// ---------------------------------------------------------------------------

/** A local worktree as surfaced by `getWorktrees()`, narrowed to what we list. */
export interface WorktreeListEntry {
  // Index signature lets rows flow into @legacy-sports/mcp-format's FlatRecord
  // helpers (markdownTable) while keeping the named fields typed.
  [key: string]: unknown;
  key: string;
  path: string;
  branch?: string;
  hasLinkedNodeModules?: boolean;
  nodeModulesTarget?: string;
  /** Pre-rendered node_modules status (caller resolves the on-disk check). */
  nodeModules: string;
  /** Pre-rendered lock status string. */
  lock: string;
}

/** Columns surfaced for the local worktree list (flat -> Markdown table). */
export const WORKTREE_LIST_COLUMNS = [
  'key',
  'branch',
  'path',
  'nodeModules',
  'lock',
] as const;

/**
 * Format the local worktree list as a Markdown table plus an active-worktree
 * footer. The caller pre-renders the `nodeModules` and `lock` cells (they
 * depend on on-disk checks the formatter shouldn't perform).
 */
export function formatWorktreeList(
  rows: readonly WorktreeListEntry[],
  activeFooter: string,
): string {
  const table = markdownTable(rows, {
    columns: WORKTREE_LIST_COLUMNS,
    headers: { nodeModules: 'node_modules' },
  });
  return withFooter(table, activeFooter);
}

// ---------------------------------------------------------------------------
// worktree_list (remote mode) — ahead/behind per remote branch
// ---------------------------------------------------------------------------

export interface RemoteBranchRow {
  [key: string]: unknown;
  branch: string;
  ahead: number;
  behind: number;
  lastCommitDate: string;
}

/** Columns surfaced for the remote-branch ahead/behind list. */
export const REMOTE_BRANCH_COLUMNS = [
  'branch',
  'ahead',
  'behind',
  'lastCommitDate',
] as const;

/** Format the remote-branch ahead/behind list as a table + metadata footer. */
export function formatRemoteBranches(args: {
  rows: readonly RemoteBranchRow[];
  count: number;
  totalRemote: number;
  truncated: boolean;
  compareBase: string;
  mergedInto?: string;
}): string {
  const { rows, count, totalRemote, truncated, compareBase, mergedInto } = args;
  const footer = metaLine({
    count,
    totalRemote,
    truncated,
    mergedInto,
    compareBase,
  });
  if (rows.length === 0) return footer;
  return withFooter(
    markdownTable(rows, { columns: REMOTE_BRANCH_COLUMNS }),
    footer,
  );
}

// ---------------------------------------------------------------------------
// worktree_list_branches — local + remote branch names
// ---------------------------------------------------------------------------

export interface BranchEntry {
  [key: string]: unknown;
  name: string;
  type: 'local' | 'remote';
  current: boolean;
}

/** Columns surfaced for the branch list. */
export const BRANCH_LIST_COLUMNS = ['name', 'type', 'current'] as const;

/** Format the branch list as a Markdown table + total/filter footer. */
export function formatBranchList(
  branches: readonly BranchEntry[],
  filter: string | undefined,
): string {
  const footer = metaLine({ total: branches.length, filter });
  if (branches.length === 0) return footer;
  return withFooter(
    markdownTable(branches, { columns: BRANCH_LIST_COLUMNS }),
    footer,
  );
}

// ---------------------------------------------------------------------------
// worktree_log — flat commit list (no --stat)
// ---------------------------------------------------------------------------

/**
 * Columns surfaced for the flat commit log. The full 40-char `sha` is dropped:
 * `shortSha` is a valid git ref accepted by every worktree_* tool, so keeping
 * both repeats ~33 redundant chars on every row for no agent-consumable gain.
 */
export const COMMIT_LOG_COLUMNS = [
  'shortSha',
  'date',
  'author',
  'message',
  'refs',
] as const;

/** Format a flat commit list (no per-commit file children) as a table. */
export function formatCommitLog(
  commits: readonly Record<string, unknown>[],
): string {
  if (commits.length === 0) return metaLine({ commits: 0 });
  return markdownTable(commits, { columns: COMMIT_LOG_COLUMNS });
}

// ---------------------------------------------------------------------------
// worktree_diff — stat summary
// ---------------------------------------------------------------------------

export interface DiffStatRow {
  [key: string]: unknown;
  path: string;
  /** Insertions, or `-` for binary files. */
  insertions: number | string;
  /** Deletions, or `-` for binary files. */
  deletions: number | string;
}

/** Columns surfaced for the diff stat summary. */
export const DIFF_STAT_COLUMNS = ['path', 'insertions', 'deletions'] as const;

/**
 * Parse `git diff --numstat` output into stat rows. Each line is
 * `insertions\tdeletions\tpath`, with `-` for binary files. Rename lines of the
 * form `old => new` keep git's textual path (we surface it verbatim).
 */
export function parseNumstat(output: string): DiffStatRow[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
      if (!match) return null;
      const [, ins, del, path] = match;
      return {
        path,
        insertions: ins === '-' ? '-' : Number.parseInt(ins, 10),
        deletions: del === '-' ? '-' : Number.parseInt(del, 10),
      } satisfies DiffStatRow;
    })
    .filter((row): row is DiffStatRow => row !== null);
}

/**
 * Format a diff stat summary as a Markdown table + a totals footer
 * (`N files changed, +X -Y`). Binary files (`-` counts) are excluded from the
 * insertion/deletion totals but still counted as changed files.
 */
export function formatDiffStat(rows: readonly DiffStatRow[]): string {
  const footer = metaLine({
    'files changed': rows.length,
    insertions:
      '+' +
      rows.reduce(
        (sum, r) => sum + (typeof r.insertions === 'number' ? r.insertions : 0),
        0,
      ),
    deletions:
      '-' +
      rows.reduce(
        (sum, r) => sum + (typeof r.deletions === 'number' ? r.deletions : 0),
        0,
      ),
  });
  if (rows.length === 0) return footer;
  return withFooter(
    markdownTable(rows, { columns: DIFF_STAT_COLUMNS }),
    footer,
  );
}

// ---------------------------------------------------------------------------
// Minified-JSON shapes (single object / nested data)
// ---------------------------------------------------------------------------

/** Serialize a single-object or nested response as minified JSON. */
export function formatObject(value: unknown): string {
  return minifiedJson(value);
}
