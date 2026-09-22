/**
 * CI health analysis for ci-health-report.yml (LS-1121).
 *
 * Fetches the last N runs of the CI orchestrator workflow, computes the
 * failure rate (excluding cancelled/skipped runs, which are neither a pass
 * nor a fail signal), and renders a "CI Health Report" GitHub Issue body —
 * flagging an alert when the rate exceeds the configured threshold.
 *
 * Pure functions (computeStats, renderBody) are unit-tested directly;
 * `run` is the actions/github-script entry point and does the API I/O.
 */

'use strict';

const WORKFLOW_FILE = 'ci-orchestrator.yml';
const DEFAULT_RUN_LIMIT = 50;
const DEFAULT_ALERT_THRESHOLD = 0.2; // 20%, per LS-1121 acceptance criteria

// Neither a pass nor a fail signal — a cancelled/skipped run says nothing
// about pipeline health, so it's excluded from the failure-rate denominator.
const UNCOUNTED_CONCLUSIONS = new Set(['cancelled', 'skipped']);

function computeStats(runs, { alertThreshold = DEFAULT_ALERT_THRESHOLD } = {}) {
  const byConclusion = {};
  for (const run of runs) {
    const key = run.conclusion || 'in_progress';
    byConclusion[key] = (byConclusion[key] || 0) + 1;
  }

  const counted = runs.filter(
    (run) => run.conclusion && !UNCOUNTED_CONCLUSIONS.has(run.conclusion),
  );
  const failed = counted.filter((run) => run.conclusion === 'failure');
  const failureRate = counted.length ? failed.length / counted.length : 0;

  return {
    total: runs.length,
    counted: counted.length,
    failed: failed.length,
    failureRate,
    byConclusion,
    alert: failureRate > alertThreshold,
    alertThreshold,
  };
}

function formatPct(fraction) {
  return `${(fraction * 100).toFixed(1)}%`;
}

function renderBody({
  stats,
  runs,
  generatedAt,
  workflowFile = WORKFLOW_FILE,
}) {
  const conclusionRows = Object.entries(stats.byConclusion)
    .sort((a, b) => b[1] - a[1])
    .map(([conclusion, count]) => `| ${conclusion} | ${count} |`)
    .join('\n');

  const recentFailures = runs
    .filter((run) => run.conclusion === 'failure')
    .slice(0, 10)
    .map((run) => `- [#${run.id}](${run.html_url}) — ${run.created_at}`)
    .join('\n');

  const headline = stats.alert
    ? `## 🚨 Alert: failure rate ${formatPct(stats.failureRate)} exceeds the ${formatPct(
        stats.alertThreshold,
      )} threshold`
    : `## ✅ Failure rate ${formatPct(stats.failureRate)} is within the ${formatPct(
        stats.alertThreshold,
      )} threshold`;

  return [
    `_Generated ${generatedAt} from the last ${stats.total} \`${workflowFile}\` runs._`,
    '',
    headline,
    '',
    `**Runs counted** (excludes cancelled/skipped): ${stats.counted}`,
    `**Failed:** ${stats.failed}`,
    `**Failure rate:** ${formatPct(stats.failureRate)}`,
    '',
    '### Runs by conclusion',
    '| Conclusion | Count |',
    '|---|---|',
    conclusionRows || '| _(no runs)_ | — |',
    '',
    '### Recent failures',
    recentFailures || '_None in this window._',
  ].join('\n');
}

async function run({ github, context, core }) {
  const { owner, repo } = context.repo;
  const runLimit = parseInt(process.env.RUN_LIMIT, 10) || DEFAULT_RUN_LIMIT;
  const alertThreshold =
    parseFloat(process.env.ALERT_THRESHOLD) || DEFAULT_ALERT_THRESHOLD;

  const { data } = await github.rest.actions.listWorkflowRuns({
    owner,
    repo,
    workflow_id: WORKFLOW_FILE,
    per_page: Math.min(runLimit, 100),
  });

  const runs = data.workflow_runs.slice(0, runLimit).map((r) => ({
    id: r.id,
    conclusion: r.conclusion,
    status: r.status,
    created_at: r.created_at,
    html_url: r.html_url,
  }));

  const stats = computeStats(runs, { alertThreshold });
  const generatedAt = new Date().toISOString().slice(0, 10);
  const body = renderBody({ stats, runs, generatedAt });
  const title = `CI Health Report - ${generatedAt}`;

  const labels = ['ci-health'];
  if (stats.alert) labels.push('ci-health-alert');

  const issue = await github.rest.issues.create({
    owner,
    repo,
    title,
    body,
    labels,
  });

  if (core) {
    core.setOutput('failure-rate', stats.failureRate.toFixed(4));
    core.setOutput('alert', String(stats.alert));
    core.setOutput('issue-number', String(issue.data.number));
    core.summary
      .addRaw(`## CI Health Report\n\n${body}\n\nIssue: ${issue.data.html_url}`)
      .write();
  }

  return {
    failureRate: stats.failureRate,
    alert: stats.alert,
    issueNumber: issue.data.number,
  };
}

module.exports = run;
module.exports.computeStats = computeStats;
module.exports.renderBody = renderBody;
module.exports.formatPct = formatPct;
module.exports.WORKFLOW_FILE = WORKFLOW_FILE;
module.exports.DEFAULT_ALERT_THRESHOLD = DEFAULT_ALERT_THRESHOLD;
