import { getConflictInfo } from './conflict-markers';

// Conservative branch-name allowlist: git ref-safe characters, and — critically —
// must not start with "-" (would otherwise be interpreted as a git CLI flag when
// passed as a bare argument to `git fetch origin <from>`, e.g. "--upload-pack=...").
const SAFE_BRANCH_NAME = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export interface MergeFromMainOpts {
  from: string;
  pushTimeoutMs: number;
}

export interface MergeDeps {
  runGit: (
    args: string[],
    cwd: string,
    opts?: { timeout?: number; env?: Record<string, string> },
  ) => string;
  runShell: (cmd: string, cwd: string) => string;
  nonInteractiveEnv: Record<string, string>;
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
  const { from, pushTimeoutMs } = opts;
  const { runGit, runShell, nonInteractiveEnv } = deps;
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

  const beforeSha = runGit(['rev-parse', 'HEAD'], cwd).trim();

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
