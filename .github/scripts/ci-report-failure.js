/**
 * CI Failure Report Generator
 *
 * Generates comprehensive failure reports for PR comments with:
 * - Detailed step-by-step status
 * - Quality gates subsection breakdown
 * - Project-level failure tracking
 * - Targeted debugging guidance
 * - Reproduction commands
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

  // Parse step results from environment
  let stepResults = {};
  try {
    const stepResultsInput = process.env.STEP_RESULTS
      ? JSON.parse(process.env.STEP_RESULTS)
      : null;
    if (stepResultsInput && Object.keys(stepResultsInput).length > 0) {
      stepResults = stepResultsInput;
    }
  } catch (e) {
    console.log('No step results provided or parsing failed');
  }

  // Find existing CI comment to update
  const prNumber = parseInt(process.env.PR_NUMBER);
  const comments = await withRetry(() =>
    github.rest.issues.listComments({
      issue_number: prNumber,
      owner: context.repo.owner,
      repo: context.repo.repo,
    }),
  );

  let existingComment = comments.data.find(
    (comment) => comment.body && comment.body.includes(commentMarker),
  );

  // Determine specific failure context and provide targeted guidance
  let failureReason = 'CI pipeline failure detected';
  let reproCommand = 'make pc';
  let agentCommand = 'make_run({ target: "pc" })';
  let debugSection =
    'A CI step failed. Run the reproduction command to identify the specific issue.';

  // Step analysis for targeted guidance
  const stepAnalysis = {
    lint: {
      reason: 'ESLint validation failed',
      command: 'make lint-fix',
      agentCommand:
        'nx_run_affected({ target: "lint", fix: true })  // or: make lint-fix',
      debug:
        'ESLint found code quality issues. Run the command above to attempt automatic fixes.',
    },
    format: {
      reason: 'Code formatting check failed',
      command: 'make fmt',
      agentCommand: 'make_run({ target: "fmt" })',
      debug:
        'Code is not properly formatted. Run the command above to auto-fix formatting issues.',
    },
    test: {
      reason: 'TypeScript typecheck or unit tests failed',
      command: 'make pc',
      agentCommand:
        'nx_run_affected({ target: "typecheck" }) && nx_run_affected({ target: "test" })  // or: make pc',
      debug:
        'TypeScript type errors or failing unit tests detected. Run typecheck and test to identify the issue.',
    },
    build: {
      reason: 'Build validation failed',
      command: 'make build',
      agentCommand: 'nx_run_affected({ target: "build" })  // or: make build',
      debug:
        'Build validation failed. Check for compilation errors, missing dependencies, or configuration issues.',
    },
    'custom-checks': {
      reason: 'Custom checks failed (migration immutability or check scripts)',
      command: 'node scripts/check-migration-immutability.js --branch',
      agentCommand:
        'make_run({ target: "pc" })  // custom-checks run as part of make pc',
      debug:
        'Migration immutability check or a custom check script failed. Check which script failed in the CI logs.',
    },
    'e2e-testing': {
      reason: 'End-to-end tests failed',
      command: 'make test-e2e',
      agentCommand: 'make_run({ target: "test-e2e" })',
      debug:
        'E2E tests are failing. Check for UI changes, API issues, or test environment problems.',
    },
  };

  // Analyze step results for specific guidance
  let failedSteps = [];
  let detailedFailureReason = failureReason;

  Object.entries(stepResults).forEach(([step, result]) => {
    if (result === 'failure') {
      failedSteps.push(step);

      if (stepAnalysis[step] && !reproCommand.includes('make fmt')) {
        failureReason = stepAnalysis[step].reason;
        detailedFailureReason = failureReason;
        reproCommand = stepAnalysis[step].command;
        agentCommand = stepAnalysis[step].agentCommand;
        debugSection = stepAnalysis[step].debug;
      }
    }
  });

  // Create step status table
  let stepStatusTable = '';
  if (Object.keys(stepResults).length > 0) {
    stepStatusTable =
      '\n### Step Status Details\n' +
      '| Step | Status |\n' +
      '|------|--------|\n';
    Object.entries(stepResults).forEach(([step, result]) => {
      // Skip non-string entries (e.g., metadata object injected by collect-results)
      if (typeof result !== 'string') return;

      const icon =
        result === 'success'
          ? 'PASS'
          : result === 'failure'
            ? 'FAIL'
            : result === 'skipped'
              ? 'SKIP'
              : 'UNKNOWN';
      const stepName = step
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase());
      stepStatusTable += `| ${stepName} | ${icon} ${result || 'unknown'} |\n`;
    });
    stepStatusTable += '\n';
  }

  // Build execution context
  const executionMode = process.env.EXECUTION_MODE;
  const agents = process.env.OPTIMAL_AGENTS;
  const runId = process.env.RUN_ID;

  let executionContext = '### Execution Context\n';
  executionContext += '- **Mode**: Local GitHub Actions\n';
  executionContext += '- **Agents/Processes**: ' + agents + '\n';
  if (failedSteps.length > 0) {
    executionContext += '- **Failed Steps**: ' + failedSteps.join(', ') + '\n';
  }

  // Build comment
  const comment =
    commentMarker +
    '\n' +
    '## CI Pipeline Failed\n\n' +
    '**Failure**: ' +
    detailedFailureReason +
    '\n\n' +
    '### Quick Debug\n' +
    debugSection +
    '\n\n' +
    stepStatusTable +
    '### How to Fix\n' +
    '**Humans** (shell):\n' +
    '```bash\n' +
    '# Reproduce the failure:\n' +
    reproCommand +
    '\n\n' +
    '# Full local CI simulation:\n' +
    'make pc\n' +
    '```\n\n' +
    '**Agents** (use MCP tools — do not run raw `pnpm exec nx` commands):\n' +
    '```\n' +
    agentCommand +
    '\n\n' +
    '# Full pre-commit check:\n' +
    'make_run({ target: "pc" })\n' +
    '```\n\n' +
    executionContext +
    '\n' +
    '### Next Steps\n' +
    '1. **Run the reproduction command** above to identify the specific issue\n' +
    '2. **Fix the failing tests/lint/build** issues\n' +
    '3. **Push your changes** - CI will automatically re-run\n' +
    '4. **Check our [troubleshooting guide](./docs/troubleshooting.md)** for common issues\n\n' +
    '### Useful Links\n' +
    (runId
      ? '- [Workflow Run Details](' +
        context.payload.repository.html_url +
        '/actions/runs/' +
        runId +
        ')\n'
      : '') +
    '- [CI Documentation](' +
    context.payload.repository.html_url +
    '/blob/main/README.md#ci-pipeline)\n' +
    '- [Troubleshooting Guide](' +
    context.payload.repository.html_url +
    '/blob/main/docs/troubleshooting.md)\n\n' +
    '---\n' +
    '*This comment is automatically updated by CI on each run.*\n';

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
    console.log('Updated existing CI failure comment #' + existingComment.id);
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
    console.log('Created new CI failure comment #' + newComment.data.id);
    core.setOutput('comment_id', newComment.data.id);
    return { comment_id: newComment.data.id };
  }
};
