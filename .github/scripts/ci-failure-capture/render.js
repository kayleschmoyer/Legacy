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

/**
 * Truncate a full commit SHA to the short form shown in GitHub's UI.
 */
function shortSha(sha) {
  return String(sha).slice(0, 7);
}

/**
 * @param {string} title
 * @param {'pass'|'fail'|'skip'} status
 * @param {string} [summary]
 * @param {string} [sha]  commit SHA this report is for, shown inline so a
 *   reader can tell — without cross-referencing the linked run — whether an
 *   in-place comment edit still reflects the PR's current HEAD or a
 *   superseded commit (LS-8403).
 */
function statusHeading(title, status, summary, sha) {
  const icon = STATUS_ICON[status] || '•';
  const tail =
    status === 'pass'
      ? 'passed'
      : status === 'skip'
        ? 'skipped'
        : summary || 'failed';
  const commitSuffix = sha ? ` (commit ${shortSha(sha)})` : '';
  return `### ${title} — ${icon} ${tail}${commitSuffix}`;
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

// Matches the `(commit <sha>)` suffix a statusHeading may carry, capturing the
// heading line itself (group 1) and the SHA (group 2).
const HEADING_SHA_RE = /^(### .+\(commit ([0-9a-f]{7,40})\))$/m;

// Matches a previously-inserted staleness note (see markStale below) plus the
// blank line that precedes it, so re-running markStale is idempotent instead
// of stacking notes on every edit.
const STALE_NOTE_RE =
  /\n\n> ⚠️ \*\*Superseded\*\* — this result is for commit `[0-9a-f]+`; the PR head is now `[0-9a-f]+`\.(?=\n|$)/;

/**
 * Re-derive a section's staleness note from scratch (LS-10100).
 *
 * A section's heading names the commit it was rendered for (LS-8403), but
 * nothing previously compared that commit to the PR's actual current head —
 * so an in-place edit from an unrelated section (e.g. `check-migrations`
 * touching its own section) bumped the comment's "Last update" footer
 * without correcting, or flagging as stale, a sibling section still showing
 * a superseded commit's result. Called on every section on every write (see
 * sticky-comment.js's applySection) so staleness is re-evaluated against the
 * head SHA known at write time, regardless of which section actually
 * changed.
 *
 * @param {string} content  a section's inner markdown (no section markers)
 * @param {string} currentHeadSha  the PR's head SHA as of this write
 * @returns {string} content with a stale note inserted, updated, or removed
 */
function markStale(content, currentHeadSha) {
  const stripped = String(content).replace(STALE_NOTE_RE, '');
  if (!currentHeadSha) return stripped;

  const match = stripped.match(HEADING_SHA_RE);
  if (!match) return stripped; // no per-commit heading to compare against

  const [, heading, sectionSha] = match;
  if (shortSha(sectionSha) === shortSha(currentHeadSha)) return stripped;

  const note =
    `\n\n> ⚠️ **Superseded** — this result is for commit ` +
    `\`${shortSha(sectionSha)}\`; the PR head is now \`${shortSha(currentHeadSha)}\`.`;
  return stripped.replace(heading, heading + note);
}

module.exports = {
  statusHeading,
  detailsBlock,
  fixLine,
  markStale,
  shortSha,
  STATUS_ICON,
};
