/**
 * Enhanced Merge Queue processor — extracted from merge-queue.yml to stay
 * under GitHub Actions' 21,000-character inline expression limit.
 *
 * Called from the "Process Enhanced Merge Queue" step via:
 *   await require('./.github/scripts/merge-queue-processor.js')({ github, context, isDryRun, forceCheck, isRetry });
 */
module.exports = async ({ github, context, isDryRun, forceCheck, isRetry }) => {
  const { owner, repo } = context.repo;
  const isTriggeredByWorkflow = context.eventName === 'workflow_run';

  // Cache of required check names per base branch, populated lazily.
  // null means branch protection is absent or has no required checks — fall back to evaluating all.
  const requiredChecksCache = Object.create(null);

  console.log(
    `🔄 Starting merge queue processing (${isDryRun ? 'DRY RUN' : 'LIVE'})...`,
  );
  if (isTriggeredByWorkflow) {
    console.log(
      `⚡ Triggered by CI Orchestrator completion - checking merge-ready PRs`,
    );
  }

  // Get PRs with merge-when-ready label (or all if force_check is true)
  // Use paginate to fetch ALL open PRs (default page size is 30)
  const allPRs = await github.paginate(github.rest.pulls.list, {
    owner,
    repo,
    state: 'open',
    per_page: 100,
  });

  const mergeReadyPRs = forceCheck
    ? allPRs
    : allPRs.filter((pr) =>
        pr.labels.some((label) => label.name === 'merge-when-ready'),
      );

  console.log(
    `📋 Found ${mergeReadyPRs.length} PRs with merge-when-ready label (from ${allPRs.length} open)`,
  );

  let hasPendingPRs = false;

  for (const pr of mergeReadyPRs) {
    console.log(`\n🔍 Processing PR #${pr.number}: ${pr.title}`);

    try {
      // Get fresh PR details
      const prDetails = await github.rest.pulls.get({
        owner,
        repo,
        pull_number: pr.number,
      });

      // validatePRForMerge returns the (possibly refreshed) PR object so that
      // performMerge always uses the same data that was validated, including
      // the head SHA that will be pinned in the merge API call.
      const validationResult = await validatePRForMerge(prDetails.data);

      if (validationResult.canMerge) {
        console.log(`✅ PR #${pr.number} is ready for merge`);

        if (!isDryRun) {
          await performMerge(validationResult.pr);
        } else {
          console.log(`🏃 DRY RUN: Would merge PR #${pr.number}`);
        }
      } else {
        console.log(
          `❌ PR #${pr.number} cannot be merged: ${validationResult.reason}`,
        );
        await reportMergeBlocker(prDetails.data, validationResult);
      }
    } catch (error) {
      console.error(`💥 Error processing PR #${pr.number}: ${error.message}`);
      await reportProcessingError(pr, error);
    }
  }

  console.log(`\n🏁 Merge queue processing complete`);

  // Self-dispatch one retry if checks were pending and this wasn't triggered by CI completion.
  // Covers the race where the queue fires (label/review event) before CI registers check runs.
  // One retry only (is_retry flag) to prevent cascading. Skipped for workflow_run triggers
  // (CI just completed) and dry-run mode.
  if (
    hasPendingPRs &&
    !isDryRun &&
    !isRetry &&
    context.eventName !== 'workflow_run'
  ) {
    console.log(
      `⏰ Pending checks detected — scheduling self-retry to re-evaluate after CI settles...`,
    );
    try {
      // Use GITHUB_TOKEN (not the App token) — `actions: write` only covers GITHUB_TOKEN.
      await github.request(
        'POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches',
        {
          owner,
          repo,
          workflow_id: 'merge-queue.yml',
          ref: 'main',
          inputs: {
            is_retry: 'true',
            dry_run: isDryRun ? 'true' : 'false',
            force_check: forceCheck ? 'true' : 'false',
          },
          headers: {
            authorization: `token ${process.env.GITHUB_TOKEN}`,
          },
        },
      );
      console.log(`✅ Self-retry dispatched`);
    } catch (retryError) {
      console.warn(`⚠️ Could not dispatch self-retry: ${retryError.message}`);
    }
  }

  // ── Helper Functions ──────────────────────────────────────────────────────

  async function validatePRForMerge(pr) {
    if (pr.draft) {
      return { canMerge: false, reason: 'PR is in draft state' };
    }

    // For non-main targets, require the merge-to-parent label
    if (pr.base.ref !== 'main') {
      const hasMergeToParent = pr.labels.some(
        (l) => l.name === 'merge-to-parent',
      );
      if (!hasMergeToParent) {
        return {
          canMerge: false,
          reason: `PR targets \`${pr.base.ref}\` (non-main). Add the \`merge-to-parent\` label in addition to \`merge-when-ready\` to allow merging into a non-main branch.`,
        };
      }
    }

    // Check mergeable state — poll if GitHub hasn't computed it yet
    // (this commonly happens for all PRs immediately after a merge in the same run)
    if (pr.mergeable === null) {
      console.log(
        `⏳ PR #${pr.number}: mergeable=null, polling for up to 60s...`,
      );
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const refreshed = await github.rest.pulls.get({
          owner,
          repo,
          pull_number: pr.number,
        });
        pr = refreshed.data;
        if (pr.mergeable !== null) {
          console.log(
            `✅ PR #${pr.number}: mergeable resolved to ${pr.mergeable} after ${(i + 1) * 5}s`,
          );
          break;
        }
        console.log(`⏳ PR #${pr.number}: still null after ${(i + 1) * 5}s...`);
      }
    }

    if (pr.mergeable === false) {
      return {
        canMerge: false,
        reason: 'PR has merge conflicts that must be resolved',
      };
    }

    if (pr.mergeable === null) {
      return {
        canMerge: false,
        pr,
        reason:
          'GitHub is still calculating mergeable state after 60s, will retry next cycle',
      };
    }

    // Check for unresolved review threads (including Copilot)
    const unresolvedResult = await checkUnresolvedReviewThreads(pr.number);
    if (unresolvedResult.hasUnresolved) {
      return {
        canMerge: false,
        reason: `PR has ${unresolvedResult.count} unresolved review comment thread(s)`,
        unresolvedThreads: unresolvedResult.threads,
      };
    }

    // Check status checks
    const checksResult = await validateStatusChecks(pr.head.sha, pr.base.ref);
    if (!checksResult.allPassing) {
      return {
        canMerge: false,
        reason:
          'Status checks failing: ' + checksResult.failingChecks.join(', '),
        failingChecks: checksResult.failingChecks,
      };
    }

    if (checksResult.inProgress) {
      return {
        canMerge: false,
        reason:
          'Waiting for status checks to complete: ' +
          checksResult.pendingChecks.join(', '),
        isPending: true,
      };
    }

    return { canMerge: true, pr };
  }

  async function checkUnresolvedReviewThreads(prNumber) {
    const query = `
      query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $number) {
            reviewThreads(first: 100) {
              nodes {
                isResolved
                isOutdated
                comments(first: 1) {
                  nodes {
                    author {
                      login
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const result = await github.graphql(query, {
      owner,
      repo,
      number: prNumber,
    });

    const allThreads = result.repository.pullRequest.reviewThreads.nodes;
    // Outdated threads (on stale diffs) don't block merge
    const unresolvedThreads = allThreads.filter(
      (t) => !t.isResolved && !t.isOutdated,
    );

    return {
      hasUnresolved: unresolvedThreads.length > 0,
      count: unresolvedThreads.length,
      threads: unresolvedThreads.map(
        (t) => t.comments.nodes[0]?.author?.login ?? 'unknown',
      ),
    };
  }

  async function getRequiredChecks(branch) {
    if (branch in requiredChecksCache) return requiredChecksCache[branch];

    try {
      const bp = await github.rest.repos.getBranchProtection({
        owner,
        repo,
        branch,
      });
      const rsc = bp.data.required_status_checks;
      if (!rsc) {
        requiredChecksCache[branch] = null;
        return null;
      }
      const names = new Set([
        ...(rsc.contexts || []),
        ...(rsc.checks || []).map((c) => c.context),
      ]);
      requiredChecksCache[branch] = names.size > 0 ? names : null;
    } catch (e) {
      const status = e && typeof e === 'object' ? e.status : undefined;
      if (status === 404) {
        console.log(
          `ℹ️ No branch protection found for '${branch}' (404) — evaluating all checks`,
        );
      } else {
        console.log(
          `⚠️ Failed to fetch branch protection for '${branch}' (${status ?? e?.message ?? 'unknown error'}) — treating as no required checks and evaluating all checks`,
        );
      }
      requiredChecksCache[branch] = null;
    }

    return requiredChecksCache[branch];
  }

  async function validateStatusChecks(sha, baseBranch) {
    // Only evaluate checks that branch protection actually requires.
    // This prevents manually dispatched or nightly workflows that post check runs
    // to the same SHA from blocking the merge queue when the PR's own CI passed.
    // Falls back to evaluating all checks when branch protection is absent or
    // has no required checks configured.
    const requiredCheckNames = await getRequiredChecks(baseBranch);

    const [checks, statuses] = await Promise.all([
      github.rest.checks.listForRef({ owner, repo, ref: sha, per_page: 100 }),
      github.rest.repos.listCommitStatusesForRef({
        owner,
        repo,
        ref: sha,
        per_page: 100,
      }),
    ]);

    const failingChecks = [];
    const pendingChecks = [];

    // Excluded from merge-blocking: process-merge-queue (circular) and delayed-recheck
    // (housekeeping job that sleeps 3min; bot-review is evaluated independently as a commit status).
    const EXCLUDED_CHECKS = new Set(['process-merge-queue', 'delayed-recheck']);

    // Build the set of check runs to evaluate:
    // - always skip EXCLUDED_CHECKS
    // - when branch protection specifies required checks, skip anything not in that set
    // - deduplicate by name, keeping the most recent completed run (prevents stale
    //   cancelled runs from blocking when a subsequent run succeeds)
    const filteredChecks = checks.data.check_runs.filter((c) => {
      if (EXCLUDED_CHECKS.has(c.name)) return false;
      if (requiredCheckNames !== null && !requiredCheckNames.has(c.name))
        return false;
      return true;
    });
    const latestByName = new Map();
    for (const c of filteredChecks) {
      const existing = latestByName.get(c.name);
      if (
        !existing ||
        new Date(c.completed_at || c.started_at) >
          new Date(existing.completed_at || existing.started_at)
      ) {
        latestByName.set(c.name, c);
      }
    }
    const relevantChecks = Array.from(latestByName.values());

    if (requiredCheckNames !== null) {
      // Detect required checks that haven't posted a run yet (CI not started).
      const postedNames = new Set([
        ...relevantChecks.map((c) => c.name),
        ...statuses.data.map((s) => s.context),
      ]);
      for (const reqName of requiredCheckNames) {
        if (!postedNames.has(reqName)) {
          pendingChecks.push(`${reqName} (not yet registered)`);
        }
      }
    } else {
      // No branch protection — guard against CI not having started at all.
      if (relevantChecks.length === 0) {
        pendingChecks.push('CI checks not yet registered for this SHA');
      }
    }

    for (const check of relevantChecks) {
      if (check.status === 'completed' && check.conclusion !== 'success') {
        if (
          check.conclusion === 'failure' ||
          check.conclusion === 'cancelled' ||
          check.conclusion === 'timed_out'
        ) {
          failingChecks.push(check.name + ' (' + check.conclusion + ')');
        }
        // skipped / action_required / neutral are not failures
      } else if (check.status !== 'completed') {
        pendingChecks.push(check.name + ' (' + check.status + ')');
      }
    }

    // Deduplicate commit statuses — keep only the latest per context
    const statusesByContext = {};
    for (const status of statuses.data) {
      if (
        !statusesByContext[status.context] ||
        new Date(status.created_at) >
          new Date(statusesByContext[status.context].created_at)
      ) {
        statusesByContext[status.context] = status;
      }
    }

    for (const [ctx, status] of Object.entries(statusesByContext)) {
      if (requiredCheckNames !== null && !requiredCheckNames.has(ctx)) continue;
      if (status.state === 'failure' || status.state === 'error') {
        failingChecks.push(ctx + ' (' + status.state + ')');
      } else if (status.state === 'pending') {
        pendingChecks.push(ctx + ' (pending)');
      }
    }

    return {
      allPassing: failingChecks.length === 0,
      failingChecks,
      inProgress: pendingChecks.length > 0,
      pendingChecks,
    };
  }

  async function findOrCreateComment(pr, commentBody) {
    const commentMarker = '<!-- MERGE-QUEUE-STATUS -->';

    if (!commentBody.includes(commentMarker)) {
      commentBody = commentMarker + '\n' + commentBody;
    }

    const comments = await github.rest.issues.listComments({
      owner,
      repo,
      issue_number: pr.number,
    });
    const existingComment = comments.data.find(
      (c) => c.body && c.body.includes(commentMarker),
    );

    if (existingComment) {
      console.log(
        `🔄 Updating existing merge queue comment #${existingComment.id}`,
      );
      await github.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existingComment.id,
        body: commentBody,
      });
      return existingComment.id;
    } else {
      console.log(`✨ Creating new merge queue comment`);
      const newComment = await github.rest.issues.createComment({
        owner,
        repo,
        issue_number: pr.number,
        body: commentBody,
      });
      return newComment.data.id;
    }
  }

  async function performMerge(pr) {
    try {
      console.log(`🚀 Merging PR #${pr.number}...`);

      // Sanitize commit message: remove null bytes and control characters that cause HTTP 500.
      const sanitize = (s) =>
        (s || '')
          .replace(/\x00/g, '')
          .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, '');

      const mergeResult = await github.rest.pulls.merge({
        owner,
        repo,
        pull_number: pr.number,
        merge_method: 'squash',
        commit_title: sanitize(pr.title + ' (#' + pr.number + ')'),
        commit_message: sanitize(
          'Merged via automated merge queue\n\n' + (pr.body || ''),
        ),
        // Pin to the validated SHA — prevents merging an unvalidated commit if the branch advanced.
        sha: pr.head.sha,
      });

      console.log(`✅ Successfully merged PR #${pr.number}`);

      await retargetDependentPRs(pr);
      await deleteBranch(pr);

      const successComment =
        '## 🎉 Successfully Merged!\n\n' +
        'This PR has been automatically merged via the merge queue.\n\n' +
        '**Merge Details:**\n' +
        '- Method: Squash merge\n' +
        '- Commit SHA: `' +
        mergeResult.data.sha +
        '`\n' +
        '- Merged at: ' +
        new Date().toISOString() +
        '\n\n' +
        'Thank you for your contribution! 🚀\n\n' +
        '---\n*Automated message from merge queue system*';

      await findOrCreateComment(pr, successComment);
    } catch (error) {
      console.error(`❌ Failed to merge PR #${pr.number}: ${error.message}`);

      if (
        error.message.includes('Resource not accessible') ||
        error.status === 403
      ) {
        console.error(
          '🔒 PERMISSION ERROR: GitHub Actions does not have permission to merge PRs',
        );
        console.error(
          '📋 Fix: Settings → Actions → General → Workflow permissions → Read and write + allow PR creation',
        );
      }

      throw error;
    }
  }

  async function reportMergeBlocker(pr, validation) {
    if (validation.isPending) {
      console.log(
        `⏳ Checks still in progress for PR #${pr.number}, will retry in next cycle`,
      );
      hasPendingPRs = true;
      return;
    }

    let comment =
      '## 🚫 Merge Queue: Cannot Merge\n\n' +
      '**Reason:** ' +
      validation.reason +
      '\n\n' +
      '### 🛠️ How to Fix:';

    if (validation.reason.includes('merge conflicts')) {
      comment +=
        '\n1. Sync your branch with the latest main:\n' +
        '   ```bash\n' +
        '   git checkout main\n' +
        '   git pull origin main\n' +
        '   git checkout ' +
        pr.head.ref +
        '\n' +
        '   git merge main  # Resolve any conflicts\n' +
        '   git push origin ' +
        pr.head.ref +
        '\n' +
        '   ```';
    } else if (validation.reason.includes('merge-to-parent')) {
      comment +=
        '\n1. Add the `merge-to-parent` label to this PR\n' +
        '2. This PR targets `' +
        pr.base.ref +
        '` (non-main), so both `merge-when-ready` and `merge-to-parent` labels are required';
    } else if (validation.unresolvedThreads) {
      comment +=
        '\n1. Resolve all open review comment threads on the PR\n' +
        '2. Threads from the following reviewer(s) are unresolved:\n' +
        [...new Set(validation.unresolvedThreads)]
          .map((a) => '   - @' + a)
          .join('\n') +
        '\n' +
        '3. Open each thread on the **Files changed** tab and click **Resolve conversation**';
    } else if (validation.failingChecks) {
      comment +=
        '\n1. Fix the failing checks:\n' +
        validation.failingChecks.map((check) => '   - ' + check).join('\n') +
        '\n' +
        '2. Push your fixes to trigger CI re-run';
    } else {
      comment +=
        '\n1. Check the PR status and resolve any issues\n' +
        '2. Ensure all requirements are met';
    }

    comment +=
      '\n\nThe merge queue will automatically retry once the issues are resolved.\n\n' +
      '---\n*Automated message from merge queue system*';

    await findOrCreateComment(pr, comment);
  }

  async function reportProcessingError(pr, error) {
    console.error('Processing error for PR #' + pr.number + ':', error);

    let errorComment =
      '## ⚠️ Merge Queue Processing Error\n\n' +
      'An error occurred while processing this PR for automatic merge:\n\n' +
      '**Error:** ' +
      error.message +
      '\n\n';

    if (
      error.message.includes('Resource not accessible') ||
      error.status === 403
    ) {
      errorComment +=
        '### 🔒 Permission Issue Detected\n\n' +
        'This appears to be a GitHub Actions permissions issue.\n\n' +
        '**Administrator Action Required:**\n' +
        '1. Go to **Settings** → **Actions** → **General**\n' +
        '2. Scroll to **Workflow permissions**\n' +
        '3. Select **"Read and write permissions"**\n' +
        '4. Check **"Allow GitHub Actions to create and approve pull requests"**\n' +
        '5. Click **Save**\n\n';
    } else {
      errorComment +=
        '### 🔧 Next Steps:\n' +
        '1. This may be a temporary issue - the merge queue will retry in the next cycle\n' +
        '2. If the error persists, you can manually merge this PR\n' +
        '3. Contact the team if you believe this is a system issue\n\n';
    }

    errorComment += '---\n*Automated message from merge queue system*';

    await findOrCreateComment(pr, errorComment);
  }

  async function retargetDependentPRs(mergedPR) {
    const mergedBranch = mergedPR.head.ref;
    const targetBase = mergedPR.base.ref;

    console.log(
      `\n🔀 Checking for open PRs based on merged branch '${mergedBranch}'...`,
    );

    const openPRs = await github.rest.pulls.list({
      owner,
      repo,
      state: 'open',
      base: mergedBranch,
    });

    if (openPRs.data.length === 0) {
      console.log(`   No dependent PRs found for '${mergedBranch}'`);
      return;
    }

    console.log(
      `   Found ${openPRs.data.length} dependent PR(s) to re-target → '${targetBase}'`,
    );

    for (const dependentPR of openPRs.data) {
      try {
        await github.rest.pulls.update({
          owner,
          repo,
          pull_number: dependentPR.number,
          base: targetBase,
        });
        console.log(
          `   ✅ PR #${dependentPR.number} (${dependentPR.title}) re-targeted to '${targetBase}'`,
        );

        const waitingLabel = 'Waiting on Parent';
        if (dependentPR.labels.some((label) => label.name === waitingLabel)) {
          try {
            await github.rest.issues.removeLabel({
              owner,
              repo,
              issue_number: dependentPR.number,
              name: waitingLabel,
            });
            console.log(
              `   🏷️ Removed '${waitingLabel}' label from PR #${dependentPR.number}`,
            );
          } catch (labelError) {
            console.warn(
              `   ⚠️ Could not remove '${waitingLabel}' label: ${labelError.message}`,
            );
          }
        }

        await github.rest.issues.createComment({
          owner,
          repo,
          issue_number: dependentPR.number,
          body:
            `🔀 **Base branch updated automatically**\n\n` +
            `PR #${mergedPR.number} (\`${mergedBranch}\`) was merged into \`${targetBase}\`. ` +
            `This PR's base has been re-targeted from \`${mergedBranch}\` → \`${targetBase}\`.\n\n` +
            `If you have merge conflicts, rebase onto \`${targetBase}\`:\n` +
            '```bash\n' +
            `git fetch origin\n` +
            `git rebase origin/${targetBase}\n` +
            `git push --force-with-lease\n` +
            '```\n\n' +
            `---\n*Automated message from merge queue system*`,
        });
      } catch (error) {
        console.error(
          `   ❌ Failed to re-target PR #${dependentPR.number}: ${error.message}`,
        );
      }
    }
  }

  async function deleteBranch(pr) {
    const branchName = pr.head.ref;

    if (
      branchName === 'main' ||
      branchName === 'master' ||
      branchName === 'develop'
    ) {
      console.log(`🛡️ Skipping deletion of protected branch '${branchName}'`);
      return;
    }

    try {
      await github.rest.git.deleteRef({
        owner,
        repo,
        ref: `heads/${branchName}`,
      });
      console.log(`🗑️ Deleted branch '${branchName}' after merge`);
    } catch (error) {
      console.warn(
        `⚠️ Could not delete branch '${branchName}': ${error.message}`,
      );
    }
  }
};
