/**
 * stale-draft-pr-sweep.js — decide what to do with an agent PR that has been
 * left in draft (LS-10975).
 *
 * Agents open PRs as drafts (a durable checkpoint) and are supposed to promote
 * them once validation and self-review are green. When they don't, the PR sits
 * in draft: the full CI pipeline does not run, it cannot enter the merge queue,
 * and nothing wakes anyone up. AGENTS.md says "draft is a working state, not an
 * ending state"; this is the mechanical backstop for when that is ignored.
 *
 * Staleness is measured from the head commit's date (the last push), not
 * `updated_at`, because our own nudge comment bumps `updated_at`.
 *
 *   - Not a draft, not an agent PR, or opted out         -> skip
 *   - idle < NUDGE_AFTER_MS                              -> skip (still working)
 *   - idle >= NUDGE_AFTER_MS, no nudge posted yet        -> nudge (comment)
 *   - idle >= PROMOTE_AFTER_MS                           -> promote
 *
 * Fails CLOSED: anything unparseable means "skip". Opt out with `keep-draft`.
 *
 * Run tests via: node --test .github/scripts/__tests__/stale-draft-pr-sweep.test.mjs
 */

const AGENT_LABEL = 'agent-in-progress';
const OPT_OUT_LABELS = Object.freeze(['keep-draft', 'sweep-claimed']);
const NUDGE_MARKER = '<!-- stale-draft-nudge -->';
const NUDGE_AFTER_MS = 2 * 60 * 60 * 1000;
const PROMOTE_AFTER_MS = 6 * 60 * 60 * 1000;

function labelNames(pr) {
  return (pr.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
}

/**
 * @param {{ pr: object, lastPushAt: string|number|Date|null, comments: string[], now: number }} input
 * @returns {{ action: 'skip'|'nudge'|'promote', reason: string }}
 */
function decideStaleDraft({ pr, lastPushAt, comments = [], now }) {
  if (!pr || pr.draft !== true)
    return { action: 'skip', reason: 'not a draft' };
  const labels = labelNames(pr);
  if (!labels.includes(AGENT_LABEL))
    return { action: 'skip', reason: `no ${AGENT_LABEL} label` };
  const optOut = OPT_OUT_LABELS.find((l) => labels.includes(l));
  if (optOut) return { action: 'skip', reason: `opted out via ${optOut}` };

  const pushedMs = lastPushAt ? new Date(lastPushAt).getTime() : NaN;
  if (!Number.isFinite(pushedMs) || !Number.isFinite(now)) {
    return { action: 'skip', reason: 'last push time unknown' };
  }
  const idle = now - pushedMs;
  if (idle < NUDGE_AFTER_MS)
    return { action: 'skip', reason: 'recent activity' };
  if (idle >= PROMOTE_AFTER_MS) {
    return {
      action: 'promote',
      reason: `draft idle ${Math.floor(idle / 3600000)}h`,
    };
  }
  if (comments.some((c) => typeof c === 'string' && c.includes(NUDGE_MARKER))) {
    return { action: 'skip', reason: 'already nudged' };
  }
  return {
    action: 'nudge',
    reason: `draft idle ${Math.floor(idle / 3600000)}h`,
  };
}

function nudgeBody(promoteAfterHours = PROMOTE_AFTER_MS / 3600000) {
  return [
    NUDGE_MARKER,
    '**This PR has been in draft with no pushes for 2+ hours.**',
    '',
    'Draft PRs do not run the full CI pipeline and cannot merge. If validation and self-review are green, call `github_mark_pr_ready` now (then verify `isDraft: false`).',
    `If it is genuinely still in progress, add the \`keep-draft\` label. Otherwise this PR is promoted automatically after ${promoteAfterHours}h of inactivity.`,
  ].join('\n');
}

module.exports = {
  AGENT_LABEL,
  OPT_OUT_LABELS,
  NUDGE_MARKER,
  NUDGE_AFTER_MS,
  PROMOTE_AFTER_MS,
  decideStaleDraft,
  nudgeBody,
};
