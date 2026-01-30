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

  // Parse quality gates subsection results
  let qualityGatesSubsections = {};
  try {
    const qualityGatesInput = process.env.QUALITY_GATES_SUBSECTIONS
      ? JSON.parse(process.env.QUALITY_GATES_SUBSECTIONS)
      : null;
    if (qualityGatesInput && Object.keys(qualityGatesInput).length > 0) {
      qualityGatesSubsections = qualityGatesInput;
    }
  } catch (e) {
    console.log('No quality gates subsections provided or parsing failed');
  }

  // Parse project-level failures
  let projectFailures = {};
  try {
    const projectFailuresInput = process.env.PROJECT_FAILURES
      ? JSON.parse(process.env.PROJECT_FAILURES)
      : null;
    if (projectFailuresInput && Object.keys(projectFailuresInput).length > 0) {
      projectFailures = projectFailuresInput;
    }
  } catch (e) {
    console.log('No project failures provided or parsing failed');
  }

  // Find existing CI comment to update
  const prNumber = parseInt(process.env.PR_NUMBER);
  const comments = await github.rest.issues.listComments({
    issue_number: prNumber,
    owner: context.repo.owner,
    repo: context.repo.repo,
  });

  let existingComment = comments.data.find(
    (comment) => comment.body && comment.body.includes(commentMarker),
  );

  // Determine specific failure context and provide targeted guidance
  let failureReason = 'CI pipeline failure detected';
  let reproCommand =
    'pnpm exec nx affected -t lint,typecheck,test,build --parallel=4';
  let debugSection =
    'A CI step failed. Run the reproduction command to identify the specific issue.';

  // Step analysis for targeted guidance
  const stepAnalysis = {
    'format-check': {
      reason: 'Code formatting check failed',
      command: 'pnpm exec nx format:write',
      debug:
        'Code formatting issues detected. Run the command above to auto-fix formatting, then commit the changes.',
    },
    'quality-gates': {
      reason: 'Code quality validation failed',
      command: 'pnpm exec nx affected -t lint,typecheck,test --parallel=4',
      debug:
        'Quality gates failed. This typically means ESLint errors, TypeScript compilation issues, or failing tests.',
      subsections: {
        formatting: {
          reason: 'Code formatting check failed',
          command: 'pnpm exec nx format:write',
          debug:
            'Code is not properly formatted. Run the command above to auto-fix formatting issues.',
        },
        lint: {
          reason: 'ESLint validation failed',
          command: 'pnpm exec nx affected -t lint --fix',
          debug:
            'ESLint found code quality issues. Run the command above to attempt automatic fixes.',
        },
        typecheck: {
          reason: 'TypeScript type checking failed',
          command: 'pnpm exec nx affected -t typecheck',
          debug:
            'TypeScript compilation errors detected. Fix type errors in the affected files.',
        },
        test: {
          reason: 'Unit tests failed',
          command: 'pnpm exec nx affected -t test',
          debug:
            'One or more unit tests are failing. Review test output and fix the failing tests.',
        },
      },
    },
    'build-validation': {
      reason: 'Build validation failed',
      command: 'pnpm exec nx affected -t build --parallel=4',
      debug:
        'Build validation failed. Check for compilation errors, missing dependencies, or configuration issues.',
    },
    'e2e-testing': {
      reason: 'End-to-end tests failed',
      command: 'cd apps/web-e2e && pnpm exec playwright test --ui',
      debug:
        'E2E tests are failing. Check for UI changes, API issues, or test environment problems.',
    },
  };

  // Analyze step results for specific guidance
  let failedSteps = [];
  let failedQualityGatesSections = [];
  let detailedFailureReason = failureReason;

  Object.entries(stepResults).forEach(([step, result]) => {
    if (result === 'failure') {
      failedSteps.push(step);

      // Check for quality-gates failure and drill down into subsections
      if (
        step === 'quality-gates' &&
        Object.keys(qualityGatesSubsections).length > 0
      ) {
        Object.entries(qualityGatesSubsections).forEach(
          ([subsection, subResult]) => {
            if (subResult === 'failure') {
              failedQualityGatesSections.push(subsection);

              // Use specific subsection guidance if available
              if (stepAnalysis['quality-gates'].subsections[subsection]) {
                const subsectionInfo =
                  stepAnalysis['quality-gates'].subsections[subsection];
                failureReason = subsectionInfo.reason;
                reproCommand = subsectionInfo.command;
                debugSection = subsectionInfo.debug;
                detailedFailureReason = failureReason;

                // Add project-specific information if available
                if (
                  projectFailures[subsection] &&
                  projectFailures[subsection].length > 0
                ) {
                  const failedProjects = projectFailures[subsection];
                  failureReason += ` in ${failedProjects.length} project${failedProjects.length > 1 ? 's' : ''}`;
                  detailedFailureReason = failureReason;

                  // Update repro command to target specific projects
                  const target =
                    subsection === 'formatting' ? 'format:check' : subsection;
                  reproCommand = `pnpm exec nx run-many -t ${target} --projects=${failedProjects.join(',')}`;

                  debugSection += `\n\n**Failed Projects**: ${failedProjects.map((p) => '`' + p + '`').join(', ')}`;
                }
              }
            }
          },
        );
      } else if (stepAnalysis[step] && !reproCommand.includes('format')) {
        failureReason = stepAnalysis[step].reason;
        detailedFailureReason = failureReason;
        reproCommand = stepAnalysis[step].command;
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

      // Add subsection details for quality-gates
      if (
        step === 'quality-gates' &&
        Object.keys(qualityGatesSubsections).length > 0
      ) {
        Object.entries(qualityGatesSubsections).forEach(
          ([subsection, subResult]) => {
            if (subResult) {
              const subIcon =
                subResult === 'success'
                  ? 'PASS'
                  : subResult === 'failure'
                    ? 'FAIL'
                    : subResult === 'skipped'
                      ? 'SKIP'
                      : 'UNKNOWN';
              const subName =
                subsection.charAt(0).toUpperCase() + subsection.slice(1);

              // Add project count if available
              let projectInfo = '';
              if (
                subResult === 'failure' &&
                projectFailures[subsection] &&
                projectFailures[subsection].length > 0
              ) {
                projectInfo = ` (${projectFailures[subsection].length} project${projectFailures[subsection].length > 1 ? 's' : ''})`;
              }

              stepStatusTable += `| &nbsp;&nbsp;&nbsp;> ${subName}${projectInfo} | ${subIcon} ${subResult} |\n`;

              // List failed projects under subsection
              if (
                subResult === 'failure' &&
                projectFailures[subsection] &&
                projectFailures[subsection].length > 0
              ) {
                projectFailures[subsection].forEach((project) => {
                  stepStatusTable += `| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- \`${project}\` | FAIL failed |\n`;
                });
              }
            }
          },
        );
      }
    });
    stepStatusTable += '\n';
  }

  // Build execution context
  const executionMode = process.env.EXECUTION_MODE;
  const agents = process.env.OPTIMAL_AGENTS;
  const fallbackReason = process.env.FALLBACK_REASON;
  const quotaStatus = process.env.QUOTA_STATUS;
  const quotaExceeded = process.env.QUOTA_EXCEEDED;
  const runId = process.env.RUN_ID;

  let executionContext = '### Execution Context\n';
  executionContext +=
    '- **Mode**: ' +
    (executionMode === 'distributed'
      ? 'Distributed Task Execution (DTE)'
      : 'Local GitHub Actions') +
    '\n';

  // Add quota status
  if (quotaExceeded === 'true') {
    executionContext +=
      '- **DTE Quota (Exhausted)**: Fell back to local runners\n';
  } else if (quotaStatus) {
    if (quotaStatus === 'available') {
      executionContext += '- **DTE Quota**: Available\n';
    } else if (quotaStatus === 'limited') {
      executionContext += '- **DTE Quota**: Limited\n';
    } else if (quotaStatus === 'exhausted') {
      executionContext += '- **DTE Quota**: Exhausted\n';
    }
  }

  if (fallbackReason) {
    executionContext += '- **Fallback Reason**: ' + fallbackReason + '\n';
  }
  executionContext += '- **Agents/Processes**: ' + agents + '\n';
  if (failedSteps.length > 0) {
    executionContext += '- **Failed Steps**: ' + failedSteps.join(', ') + '\n';
  }
  if (failedQualityGatesSections.length > 0) {
    executionContext +=
      '- **Failed Quality Gates**: ' +
      failedQualityGatesSections.join(', ') +
      '\n';
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
    '### How to Fix Locally\n' +
    '```bash\n' +
    '# Reproduce the failure:\n' +
    reproCommand +
    '\n\n' +
    '# Full local CI simulation:\n' +
    'pnpm run ci:local  # Run full CI pipeline locally\n' +
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
    await github.rest.issues.updateComment({
      comment_id: existingComment.id,
      owner: context.repo.owner,
      repo: context.repo.repo,
      body: comment,
    });
    console.log('Updated existing CI failure comment #' + existingComment.id);
    core.setOutput('comment_id', existingComment.id);
    return { comment_id: existingComment.id };
  } else {
    const newComment = await github.rest.issues.createComment({
      issue_number: prNumber,
      owner: context.repo.owner,
      repo: context.repo.repo,
      body: comment,
    });
    console.log('Created new CI failure comment #' + newComment.data.id);
    core.setOutput('comment_id', newComment.data.id);
    return { comment_id: newComment.data.id };
  }
};
