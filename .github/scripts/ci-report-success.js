/**
 * CI Success Report Generator
 *
 * Generates success reports for PR comments with:
 * - Execution summary (DTE/local, agents used)
 * - Performance metrics and duration analysis
 * - Quota status tracking
 * - List of validated checks
 */

/**
 * Retry a GitHub API call up to `retries` times on transient 5xx errors.
 */
async function withRetry(fn, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err.status || err.response?.status || 0;
      if (attempt < retries && status >= 500) {
        const delay = attempt * 2000;
        console.log(
          `GitHub API error (${status}), retrying in ${delay}ms (attempt ${attempt}/${retries})...`,
        );
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
}

module.exports = async ({ github, context, core }) => {
  const commentMarker = '<!-- CI-PIPELINE-STATUS -->';

  // Get environment variables
  const prNumber = parseInt(process.env.PR_NUMBER);
  const executionMode = process.env.EXECUTION_MODE;
  const agents = process.env.OPTIMAL_AGENTS;
  const fallbackReason = process.env.FALLBACK_REASON;
  const quotaStatus = process.env.QUOTA_STATUS;
  const quotaExceeded = process.env.QUOTA_EXCEEDED;
  const workflowDuration = process.env.WORKFLOW_DURATION;

  // Build performance note
  let performanceNote = '';
  if (executionMode === 'distributed') {
    performanceNote =
      '**Performance**: 60-80% faster with Distributed Task Execution';
  } else {
    performanceNote = '**Performance**: Standard GitHub Actions';
    if (!fallbackReason) {
      performanceNote += ' (add NX_CLOUD_ACCESS_TOKEN for 60-80% speedup)';
    }
  }

  // Add duration context if available
  let durationNote = '';
  if (workflowDuration && workflowDuration !== 'unknown') {
    const duration = parseInt(workflowDuration);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;

    if (duration < 300) {
      durationNote = `**Duration**: ${minutes}m ${seconds}s (Excellent!)`;
    } else if (duration < 600) {
      durationNote = `**Duration**: ${minutes}m ${seconds}s (Good)`;
    } else {
      durationNote = `**Duration**: ${minutes}m ${seconds}s (Consider optimization)`;
    }
  }

  // Build quota information
  let quotaInfo = '';
  if (quotaExceeded === 'true') {
    quotaInfo = '- **DTE Quota (Exhausted)**: Fell back to local runners\n';
  } else if (quotaStatus) {
    if (quotaStatus === 'available') {
      quotaInfo = '- **DTE Quota**: Available\n';
    } else if (quotaStatus === 'limited') {
      quotaInfo = '- **DTE Quota**: Limited (consider optimization)\n';
    } else if (quotaStatus === 'exhausted') {
      quotaInfo = '- **DTE Quota**: Exhausted\n';
    }
  }

  // Build comment
  const comment =
    commentMarker +
    '\n' +
    '## CI Pipeline Passed\n\n' +
    'All checks completed successfully! This PR is ready for review and merge.\n\n' +
    '### Execution Summary\n' +
    '- **Mode**: ' +
    (executionMode === 'distributed'
      ? 'Distributed Task Execution (DTE)'
      : 'Local GitHub Actions') +
    '\n' +
    '- **Agents/Processes**: ' +
    agents +
    '\n' +
    '- ' +
    performanceNote +
    '\n' +
    (durationNote ? '- ' + durationNote + '\n' : '') +
    quotaInfo +
    (fallbackReason ? '- **Note**: ' + fallbackReason + '\n' : '') +
    '\n### What Was Validated\n' +
    '- Code formatting and style\n' +
    '- ESLint rules and best practices\n' +
    '- TypeScript type checking\n' +
    '- Unit tests and coverage\n' +
    '- Build validation for all affected projects\n' +
    '- End-to-end tests (if web changes detected)\n\n' +
    'Ready for review!\n\n' +
    '---\n' +
    '*This comment is automatically updated by CI on each run.*\n';

  // Find existing CI comment
  const { data: comments } = await withRetry(() =>
    github.rest.issues.listComments({
      issue_number: prNumber,
      owner: context.repo.owner,
      repo: context.repo.repo,
    }),
  );

  const existingComment = comments.find(
    (comment) => comment.body && comment.body.includes(commentMarker),
  );

  // Update or create comment
  if (existingComment) {
    await withRetry(() =>
      github.rest.issues.updateComment({
        comment_id: existingComment.id,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: comment,
      }),
    );
    console.log('Updated existing CI comment #' + existingComment.id);
    core.setOutput('comment_id', existingComment.id);
    return { comment_id: existingComment.id };
  } else {
    const newComment = await withRetry(() =>
      github.rest.issues.createComment({
        issue_number: prNumber,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: comment,
      }),
    );
    console.log('Created new CI comment #' + newComment.data.id);
    core.setOutput('comment_id', newComment.data.id);
    return { comment_id: newComment.data.id };
  }
};
