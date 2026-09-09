export interface RebaseOntoMainOpts {
  onto: string;
  upstream?: string;
  disableRerere: boolean;
  pushTimeoutMs: number;
}

export interface RebaseDeps {
  runGit: (
    args: string[],
    cwd: string,
    opts?: { timeout?: number; env?: Record<string, string> },
  ) => string;
  runShell: (cmd: string, cwd: string) => string;
  nonInteractiveEnv: Record<string, string>;
  /**
   * Deepens `cwd` when it is a shallow clone and no merge-base exists against
   * `baseRef` yet. A shallow CCR clone rebasing onto a freshly fetched
   * `origin/<onto>` has no visible common ancestor beyond the shallow
   * boundary, so git replays every changed file as an add/add conflict
   * instead of a normal three-way merge — indistinguishable at a glance from
   * a bad rerere replay, but not actually one (LS-9967, same root cause as
   * LS-9956's `worktree_merge_main` fix). Injected so callers can reuse the
   * same deepen→verify→unshallow sequence `shallow-utils.ts` already applies
   * at worktree-creation time.
   */
  ensureSufficientDepth: (cwd: string, baseRef?: string) => string[];
  /** True when `cwd` is still a shallow clone (used to attribute conflicts correctly). */
  isShallowRepository: (cwd: string) => boolean;
}

interface ToolContent {
  type: 'text';
  text: string;
}

export interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
}

export function rebaseOntoMain(
  cwd: string,
  opts: RebaseOntoMainOpts,
  deps: RebaseDeps,
): ToolResult {
  const { onto, upstream, disableRerere, pushTimeoutMs } = opts;
  const {
    runGit,
    runShell,
    nonInteractiveEnv,
    ensureSufficientDepth,
    isShallowRepository,
  } = deps;
  const log: string[] = [`[cwd: ${cwd}]`];

  // Refuse to rebase on the main branch itself
  const currentBranch = runGit(
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    cwd,
  ).trim();
  if (currentBranch === 'main' || currentBranch === onto) {
    return {
      content: [
        {
          type: 'text',
          text: `Refusing to rebase: current branch is "${currentBranch}". This tool only operates on feature branches.`,
        },
      ],
      isError: true,
    };
  }

  // Step 1: Fetch the target branch
  log.push(`$ git fetch origin ${onto}`);
  const fetchOut = runGit(['fetch', 'origin', onto], cwd, { timeout: 60_000 });
  if (fetchOut.trim()) log.push(fetchOut.trim());

  // Shallow clones (CCR sessions) have no visible common ancestor with the
  // freshly fetched origin/<onto>, which makes git replay the rebase as a
  // wall of add/add conflicts rather than a real three-way merge. Deepen
  // first — a no-op on a full clone or one that already has a merge-base.
  const depthLog = ensureSufficientDepth(cwd, `origin/${onto}`);
  if (depthLog.length) log.push(...depthLog);

  // Get commit count before rebase for reporting. When `upstream` is given,
  // that's the true exclusion boundary for what gets replayed; otherwise fall
  // back to counting commits ahead of the target branch.
  const beforeSha = runGit(['rev-parse', 'HEAD'], cwd).trim();
  const commitsAhead = (() => {
    try {
      const range = upstream ? `${upstream}..HEAD` : `origin/${onto}..HEAD`;
      return runGit(['rev-list', '--count', range], cwd).trim();
    } catch {
      return '?';
    }
  })();

  // Step 2: Rebase onto origin/<onto>
  const rebaseEnv: Record<string, string> = { ...nonInteractiveEnv };
  if (disableRerere) {
    rebaseEnv['GIT_CONFIG_COUNT'] = '1';
    rebaseEnv['GIT_CONFIG_KEY_0'] = 'rerere.enabled';
    rebaseEnv['GIT_CONFIG_VALUE_0'] = 'false';
  }

  // Three-arg `--onto` form when `upstream` is given: replays only commits
  // after `upstream`, dropping commits that became duplicate ancestors when
  // a stacked PR's base was squash-merged (LS-9731). Two-arg form otherwise.
  const rebaseArgs = upstream
    ? ['rebase', '--onto', `origin/${onto}`, upstream]
    : ['rebase', `origin/${onto}`];
  log.push(`$ git ${rebaseArgs.join(' ')}`);
  try {
    const rebaseOut = runGit(rebaseArgs, cwd, {
      timeout: 120_000,
      env: rebaseEnv,
    });
    if (rebaseOut.trim()) log.push(rebaseOut.trim());
  } catch (rebaseErr: unknown) {
    const e = rebaseErr as { stdout?: string; stderr?: string };
    const output = [e.stdout, e.stderr].filter(Boolean).join('\n');
    const hasConflicts =
      output.includes('CONFLICT') || output.includes('could not apply');

    // Abort the rebase to leave the tree clean
    try {
      runGit(['rebase', '--abort'], cwd, { env: nonInteractiveEnv });
    } catch {
      // Ignore abort failure
    }

    const conflictedFiles = (() => {
      try {
        return runShell('git diff --name-only --diff-filter=U', cwd)
          .trim()
          .split('\n')
          .filter(Boolean);
      } catch {
        return [];
      }
    })();

    // A wide add/add conflict spread (near-every-file) after fetch+deepen is
    // the shallow-history signature, not a bad rerere replay (LS-9967). Flag
    // it when the repo is still shallow so the message points at the real
    // cause instead of leaving the caller to suspect rerere.
    const stillShallowAfterDeepen =
      hasConflicts && isShallowRepository(cwd) && conflictedFiles.length > 10;

    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            conflictDetected: true,
            pushed: false,
            head: beforeSha,
            message: hasConflicts
              ? stillShallowAfterDeepen
                ? `Rebase onto origin/${onto} encountered conflicts in ${conflictedFiles.length} files. ` +
                  'This worktree is still a shallow clone with insufficient history — that (not a bad ' +
                  'rerere resolution) is the likely cause of this many simultaneous add/add-style ' +
                  'conflicts. The automatic `git fetch --unshallow` attempted before this rebase did not ' +
                  'resolve it; retry once the deepen succeeds, or run `git fetch --unshallow origin` manually.'
                : `Rebase onto origin/${onto} encountered conflicts. Rebase aborted — resolve conflicts manually then use worktree_rebase + worktree_push.`
              : `Rebase failed: ${output.slice(0, 500)}`,
            conflictedFiles,
          }),
        },
      ],
    };
  }

  // Check for conflict markers that may have been silently committed (rerere issue)
  const afterSha = runGit(['rev-parse', 'HEAD'], cwd).trim();
  const hasMarkers = (() => {
    try {
      const diffOut = runGit(
        ['diff', `${beforeSha}..HEAD`, '--', '-G', '<<<<<<<'],
        cwd,
      );
      return diffOut.includes('<<<<<<<');
    } catch {
      return false;
    }
  })();

  if (hasMarkers) {
    try {
      runGit(['reset', '--hard', beforeSha], cwd);
    } catch {
      // Best-effort reset
    }
    const stillShallow = isShallowRepository(cwd);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            conflictDetected: true,
            pushed: false,
            head: beforeSha,
            message: stillShallow
              ? 'Conflict markers detected in rebase output. Reset to pre-rebase state. ' +
                'This worktree is still a shallow clone with insufficient history against ' +
                `origin/${onto} — that (not a bad rerere resolution) is the likely cause of ` +
                'spurious conflicts across many files. The automatic `git fetch --unshallow` ' +
                'attempted before this rebase did not resolve it; retry once the deepen ' +
                'succeeds, or run `git fetch --unshallow origin` manually.'
              : 'Conflict markers detected in rebase output. Reset to pre-rebase state. ' +
                'Pass disableRerere: true if a bad rr-cache entry is causing this.',
          }),
        },
      ],
    };
  }

  // Step 3: Push with --force-with-lease
  log.push('$ git push --force-with-lease');
  let pushed = false;
  let pushError: string | undefined;
  try {
    const pushOut = runGit(['push', '--force-with-lease'], cwd, {
      timeout: pushTimeoutMs,
    });
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
          commitsRebased: commitsAhead,
          conflictDetected: false,
          pushed,
          head: afterSha,
          onto: `origin/${onto}`,
          ...(pushError ? { pushError } : {}),
          log: log.join('\n'),
        }),
      },
    ],
  };
}
