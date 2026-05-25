/**
 * CI Pipeline success reporter.
 *
 * Collapses the `pipeline` section of the shared CI sticky comment down to a
 * one-line pass summary. Sections owned by other checks (schema, migrations)
 * are left untouched — if one of those is still failing, its section remains
 * and the agent can see CI Pipeline is green but, say, schema is not.
 */

'use strict';

const { applySection } = require('./ci-failure-capture/sticky-comment.js');
const { statusHeading } = require('./ci-failure-capture/render.js');

function durationNote(workflowDuration) {
  if (!workflowDuration || workflowDuration === 'unknown') return '';
  const duration = parseInt(workflowDuration, 10);
  if (!Number.isFinite(duration)) return '';
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  return `Completed in ${minutes}m ${seconds}s.`;
}

module.exports = async ({ github, context, core }) => {
  const prNumber = parseInt(process.env.PR_NUMBER, 10);
  if (!prNumber) return { skipped: true };

  const note = durationNote(process.env.WORKFLOW_DURATION);
  const content = [
    statusHeading('CI Pipeline', 'pass'),
    note ? `\n${note}` : '',
  ]
    .join('')
    .trim();

  const commentId = await applySection({
    github,
    context,
    prNumber,
    key: 'pipeline',
    content,
    producer: 'ci-pipeline',
  });

  if (core && commentId) core.setOutput('comment_id', commentId);
  console.log(`CI pipeline success section written (comment #${commentId}).`);
  return { comment_id: commentId };
};
