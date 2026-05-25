/**
 * Markdown rendering helpers for CI sticky-comment sections.
 *
 * Failure details are wrapped in a collapsed <details> block (so the comment
 * stays scannable for humans) AND in a <ci-failure …> fence (so a cloud agent
 * reading the comment body via the API can reliably extract each excerpt). The
 * fenced content lives in the DOM either way — collapsing only hides it
 * visually, it does not remove it from the comment body.
 */

'use strict';

const STATUS_ICON = { pass: '✅', fail: '❌', skip: '⏭️' };

function statusHeading(title, status, summary) {
  const icon = STATUS_ICON[status] || '•';
  const tail =
    status === 'pass'
      ? 'passed'
      : status === 'skip'
        ? 'skipped'
        : summary || 'failed';
  return `### ${title} — ${icon} ${tail}`;
}

/**
 * One collapsible details block for a single failing check/job.
 *
 * @param {object} p
 * @param {string} p.check  stable id for agents (e.g. 'lint', 'schema')
 * @param {string} p.label  human label shown in the summary line
 * @param {string} [p.sublabel]  short suffix (e.g. '3 type errors')
 * @param {string} p.excerpt  distilled, already-redacted log excerpt
 */
function detailsBlock({ check, label, sublabel, excerpt }) {
  return [
    `<details><summary><b>${label}</b>${sublabel ? ` — ${sublabel}` : ''}</summary>`,
    '',
    `<ci-failure check="${check}">`,
    '',
    '```text',
    (excerpt || '').trim(),
    '```',
    '',
    '</ci-failure>',
    '</details>',
  ].join('\n');
}

function fixLine(fixHint, runUrl) {
  const parts = [];
  if (fixHint) parts.push(`**Fix:** \`${fixHint}\``);
  if (runUrl) parts.push(`[Logs](${runUrl})`);
  return parts.join(' · ');
}

module.exports = { statusHeading, detailsBlock, fixLine, STATUS_ICON };
