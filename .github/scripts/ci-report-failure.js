/**
 * CI Pipeline failure reporter.
 *
 * Renders the `pipeline` section of the shared CI sticky comment: a compact
 * step-status table plus, for each failed step, a collapsed <details> block
 * containing a distilled, redacted excerpt of that step's log (produced by the
 * capture-ci-failure action via extract.js and passed in as FAILURE_EXCERPTS).
 *
 * Only the `pipeline` section is touched — sections owned by other checks
 * (schema, migrations) are preserved. See ci-failure-capture/sticky-comment.js.
 */

'use strict';

const { applySection } = require('./ci-failure-capture/sticky-comment.js');
const {
  statusHeading,
  detailsBlock,
  fixLine,
} = require('./ci-failure-capture/render.js');

// Step → (tool excerpt key, human label, local fix command).
const STEP_META = {
  lint: { key: 'lint', label: 'lint', fix: 'make lint-fix' },
  format: { key: 'format', label: 'format', fix: 'make fmt' },
  test: { key: 'test', label: 'test (typecheck + unit)', fix: 'make pc' },
  build: { key: 'build', label: 'build', fix: 'make build' },
  'custom-checks': {
    key: 'custom-checks',
    label: 'custom-checks',
    fix: 'make pc',
  },
  'e2e-testing': { key: null, label: 'E2E tests', fix: 'make test-e2e' },
};

const STATUS_CELL = {
  success: '✅ pass',
  failure: '❌ fail',
  cancelled: '⛔ cancelled',
  skipped: '⏭️ skip',
};

function parseJsonEnv(name) {
  const raw = process.env[name];
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// extract.js emits "<summary>\n\n<body>"; split so the summary becomes the
// <details> sublabel and the body becomes the fenced excerpt.
function splitExcerpt(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return { sublabel: '', body: '' };
  const lines = trimmed.split('\n');
  if (lines.length >= 2 && lines[1].trim() === '') {
    return {
      sublabel: lines[0].trim(),
      body: lines.slice(2).join('\n').trim(),
    };
  }
  return { sublabel: '', body: trimmed };
}

function buildStepTable(stepResults) {
  const rows = Object.entries(stepResults)
    .filter(([, v]) => typeof v === 'string')
    .map(([step, result]) => {
      const label = STEP_META[step]?.label || step.replace(/[-_]/g, ' ');
      return `| ${label} | ${STATUS_CELL[result] || result} |`;
    });
  if (rows.length === 0) return '';
  return ['| Step | Status |', '|------|--------|', ...rows].join('\n');
}

module.exports = async ({ github, context, core }) => {
  const prNumber = parseInt(process.env.PR_NUMBER, 10);
  if (!prNumber) return { skipped: true };

  const stepResults = parseJsonEnv('STEP_RESULTS');
  const excerpts = parseJsonEnv('FAILURE_EXCERPTS');
  const runId = process.env.RUN_ID;
  const repoUrl = context.payload.repository.html_url;
  const runUrl = runId ? `${repoUrl}/actions/runs/${runId}` : '';

  const failedSteps = Object.entries(stepResults)
    .filter(([, v]) => v === 'failure' || v === 'cancelled')
    .map(([step]) => step);

  const summary =
    failedSteps.length > 0
      ? `${failedSteps.length} check${failedSteps.length === 1 ? '' : 's'} failed`
      : 'failed';

  const parts = [statusHeading('CI Pipeline', 'fail', summary), ''];

  const table = buildStepTable(stepResults);
  if (table) parts.push(table, '');

  // Per-failed-step detail blocks.
  const fixes = new Set();
  for (const step of failedSteps) {
    const meta = STEP_META[step];
    if (meta?.fix) fixes.add(meta.fix);

    if (meta && meta.key && excerpts[meta.key]) {
      const { sublabel, body } = splitExcerpt(excerpts[meta.key]);
      parts.push(
        detailsBlock({
          check: meta.key,
          label: meta.label,
          sublabel,
          excerpt: body,
        }),
        '',
      );
    } else if (step === 'e2e-testing') {
      parts.push(
        '> **E2E tests failed.** Failing specs and traces are in the ' +
          '🎭 Playwright Report comment on this PR; full output is in the ' +
          'Actions logs (credentials are used in E2E, so raw output is not ' +
          'inlined here).',
        '',
      );
    }
  }

  const fixHint = [...fixes].join(' && ') || 'make pc';
  parts.push(fixLine(fixHint, runUrl));

  const content = parts.join('\n').trim();

  const commentId = await applySection({
    github,
    context,
    prNumber,
    key: 'pipeline',
    content,
    producer: 'ci-pipeline',
  });

  if (core && commentId) core.setOutput('comment_id', commentId);
  console.log(`CI pipeline failure section written (comment #${commentId}).`);
  return { comment_id: commentId };
};
