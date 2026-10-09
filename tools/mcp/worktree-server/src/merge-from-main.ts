import { getConflictInfo } from './conflict-markers';

// Conservative branch-name allowlist: git ref-safe characters, and — critically —
// must not start with "-" (would otherwise be interpreted as a git CLI flag when
// passed as a bare argument to `git fetch origin <from>`, e.g. "--upload-pack=...").
const SAFE_BRANCH_NAME = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export interface MergeFromMainOpts {
  from: string;
  pushTimeoutMs: number;
  /**
   * Report mergeability without merging: fetch, then run
   * `git merge-tree --write-tree --name-only` and report the result. Never
   * touches the working tree or index (no checkout, no merge commit, no
   * push) — safe to call from a clean or dirty worktree at any time.
   */
  dryRun?: boolean;
  /**
   * Push the merge commit after a successful merge (default true). `false`
   * merges locally and leaves the push to `worktree_push`, so the merge can be
   * validated (tests/lint/typecheck) before it is published.
   */
  push?: boolean;
}

export interface MergeDeps {
  runGit: (
    args: string[],
    cwd: string,
    opts?: { timeout?: number; env?: Record<string, string> },
  ) => string;
  runShell: (cmd: string, cwd: string) => string;
  nonInteractiveEnv: Record<string, string>;
  /**
   * Deepens `cwd` when it is a shallow clone and no merge-base exists against
   * `baseRef` yet. A shallow CCR clone has no visible common ancestor with a
   * freshly fetched `origin/<from>` beyond the shallow boundary, so `git
   * merge` fails outright with "refusing to merge unrelated histories" even
   * though the histories are not actually unrelated (LS-9956). Injected so
   * callers can reuse the same deepen→verify→unshallow sequence
   * `shallow-utils.ts` already applies at worktree-creation time.
   */
  ensureSufficientDepth: (cwd: string, baseRef?: string) => string[];
}

interface ToolContent {
  type: 'text';
  text: string;
}

export interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
}

/**
 * Semantic one-shot merge: fetch origin/<from> → merge it into the current
 * branch → push. The merge counterpart to `rebaseOntoMain` for the
 * merge-resolution path AGENTS.md sanctions for PR merge-conflict notices.
 *
 * Unlike a rebase, a failed merge is left in progress on conflict (aborting
 * would discard the merge attempt a caller may want to resolve in place) —
 * callers get the same structured conflict info `worktree_conflict_info`
 * returns, then resolve + `worktree_commit` + `worktree_push`, or
 * `git merge --abort` to back out.
 */
export function mergeFromMain(
  cwd: string,
  opts: MergeFromMainOpts,
  deps: MergeDeps,
): ToolResult {
  const { from, pushTimeoutMs, dryRun, push = true } = opts;
  const { runGit, runShell, nonInteractiveEnv, ensureSufficientDepth } = deps;
  const log: string[] = [`[cwd: ${cwd}]`];

  if (!SAFE_BRANCH_NAME.test(from)) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Invalid "from" branch name: "${from}". Must match ${SAFE_BRANCH_NAME} (git ref-safe characters, cannot start with "-").`,
        },
      ],
    };
  }

  // Refuse to merge on the main branch itself
  const currentBranch = runGit(
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    cwd,
  ).trim();
  if (currentBranch === 'main' || currentBranch === from) {
    return {
      content: [
        {
          type: 'text',
          text: `Refusing to merge: current branch is "${currentBranch}". This tool only operates on feature branches.`,
        },
      ],
      isError: true,
    };
  }

  // Step 1: Fetch the source branch
  log.push(`$ git fetch origin ${from}`);
  const fetchOut = runGit(['fetch', 'origin', from], cwd, { timeout: 60_000 });
  if (fetchOut.trim()) log.push(fetchOut.trim());

  // Shallow clones (CCR sessions) have no visible common ancestor with the
  // fetched origin/<from>, which makes both the merge below and the dryRun's
  // merge-tree fail as though the histories were genuinely unrelated. Deepen
  // first — a no-op on a full clone or one that already has a merge-base.
  const depthLog = ensureSufficientDepth(cwd, `origin/${from}`);
  if (depthLog.length) log.push(...depthLog);

  const beforeSha = runGit(['rev-parse', 'HEAD'], cwd).trim();

  if (dryRun) {
    return mergeTreeDryRun(cwd, from, beforeSha, runGit, log);
  }

  // Step 2: Merge origin/<from> into the current branch
  log.push(`$ git merge origin/${from} --no-edit`);
  try {
    const mergeOut = runGit(['merge', `origin/${from}`, '--no-edit'], cwd, {
      timeout: 120_000,
      env: nonInteractiveEnv,
    });
    if (mergeOut.trim()) log.push(mergeOut.trim());
  } catch (mergeErr: unknown) {
    const e = mergeErr as { stdout?: string; stderr?: string };
    const output = [e.stdout, e.stderr].filter(Boolean).join('\n');
    const hasConflicts =
      output.includes('CONFLICT') || output.includes('Automatic merge failed');

    if (!hasConflicts) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              conflictDetected: false,
              merged: false,
              head: beforeSha,
              message: `Merge failed: ${output}`,
            }),
          },
        ],
      };
    }

    let conflictInfoError: string | undefined;
    const conflictInfo = (() => {
      try {
        return getConflictInfo(cwd, runShell);
      } catch (infoErr: unknown) {
        const ie = infoErr as { message?: string };
        conflictInfoError = ie.message || String(infoErr);
        return { files: [] };
      }
    })();

    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              conflictDetected: true,
              merged: false,
              pushed: false,
              head: beforeSha,
              message:
                `Merge of origin/${from} encountered conflicts. The merge is left in progress — ` +
                'resolve the conflicts below, then worktree_commit + worktree_push, ' +
                'or worktree_run(command: "git merge --abort") to back out.',
              files: conflictInfo.files,
              ...(conflictInfoError
                ? {
                    conflictInfoError: `Failed to retrieve conflict details: ${conflictInfoError}. The files list above may be incomplete — inspect the working tree directly (git status / worktree_conflict_info).`,
                  }
                : {}),
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  const afterSha = runGit(['rev-parse', 'HEAD'], cwd).trim();

  // Nothing to merge — no new commit, nothing to push.
  if (afterSha === beforeSha) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            conflictDetected: false,
            merged: true,
            alreadyUpToDate: true,
            pushed: false,
            head: afterSha,
            from: `origin/${from}`,
            log: log.join('\n'),
          }),
        },
      ],
    };
  }

  // push: false — leave the merge commit local for validation before publishing.
  if (!push) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            conflictDetected: false,
            merged: true,
            pushed: false,
            pushSkipped: true,
            head: afterSha,
            from: `origin/${from}`,
            message:
              'Merged locally; push skipped (push: false). Validate, then publish with worktree_push.',
            log: log.join('\n'),
          }),
        },
      ],
    };
  }

  // Step 3: Push (plain push — a merge commit doesn't rewrite existing history)
  log.push('$ git push');
  let pushed = false;
  let pushError: string | undefined;
  try {
    const pushOut = runGit(['push'], cwd, { timeout: pushTimeoutMs });
    if (pushOut.trim()) log.push(pushOut.trim());
    pushed = true;
  } catch (pushErr: unknown) {
    const e = pushErr as { stderr?: string; message?: string };
    pushError = e.stderr?.trim() || e.message || String(pushErr);
    log.push(`Push failed: ${pushError}`);
  }

  return {
    isError: !pushed,
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          conflictDetected: false,
          merged: true,
          pushed,
          head: afterSha,
          from: `origin/${from}`,
          ...(pushError ? { pushError } : {}),
          log: log.join('\n'),
        }),
      },
    ],
  };
}

/**
 * Side-effect-free mergeability check: `git merge-tree --write-tree
 * --name-only HEAD origin/<from>` computes the merge purely against the
 * object database — it never touches the working tree or the index (no
 * checkout, no index update), so it's safe to call at any time, including
 * mid-conflict or against a dirty worktree. Exits 0 with just the written
 * tree's OID when the merge is clean; exits 1 with the tree OID, a blank
 * line, and the newline-separated list of conflicted paths otherwise
 * (followed by human-readable `Auto-merging`/`CONFLICT` lines we don't need).
 */
function mergeTreeDryRun(
  cwd: string,
  from: string,
  head: string,
  runGit: MergeDeps['runGit'],
  log: string[],
): ToolResult {
  const args = [
    'merge-tree',
    '--write-tree',
    '--name-only',
    'HEAD',
    `origin/${from}`,
  ];
  log.push(`$ git ${args.join(' ')}`);

  let mergeable: boolean;
  let stdout: string;
  try {
    stdout = runGit(args, cwd);
    mergeable = true;
  } catch (err: unknown) {
    const e = err as {
      status?: number;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    if (e.status !== 1) {
      // Not a conflict result (exit 1) — a real failure (bad ref, etc.).
      const detail =
        e.stderr?.trim() || e.stdout?.trim() || e.message || String(err);
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `worktree_merge_main dryRun failed: ${detail}`,
          },
        ],
      };
    }
    stdout = e.stdout ?? '';
    mergeable = false;
  }

  const files = mergeable ? [] : parseMergeTreeConflictedPaths(stdout);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            dryRun: true,
            mergeable,
            conflictDetected: !mergeable,
            head,
            from: `origin/${from}`,
            files,
            message: mergeable
              ? `origin/${from} would merge cleanly into the current branch. No changes made (dry run).`
              : `origin/${from} would conflict with the current branch in ${files.length} file(s). No changes made (dry run).`,
            log: log.join('\n'),
          },
          null,
          2,
        ),
      },
    ],
  };
}

/**
 * Parses `git merge-tree --write-tree --name-only` stdout into the list of
 * conflicted file paths. Format: the written tree's OID on line 1, then one
 * conflicted path per line, then a blank line, then human-readable
 * `Auto-merging`/`CONFLICT (...)` messages we ignore.
 */
function parseMergeTreeConflictedPaths(stdout: string): string[] {
  const lines = stdout.split('\n');
  const paths: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '') break;
    paths.push(lines[i]);
  }
  return paths;
}
