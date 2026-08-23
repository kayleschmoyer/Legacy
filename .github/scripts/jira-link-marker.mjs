#!/usr/bin/env node
/**
 * jira-link-marker.mjs
 *
 * Parsing, validation, and repair of the declared `jira-link` marker (RFC
 * docs/rfcs/draft-declared-ticket-linkage.md, LS-7893). Shared by
 * `jira-link-check.mjs` so the check and its self-repair path agree on what a
 * well-formed marker is.
 *
 * This mirrors `tools/mcp/github-server/src/tools/jira-link.ts`, which serves
 * the same purpose for the MCP `github_open_pr` / `github_edit_pr` tools.
 * The duplication is deliberate: `.github/scripts/*.mjs` runs on a bare
 * `node` in Actions with no workspace install, so it cannot import the
 * TypeScript module. Keep the two in sync when either changes.
 */

export const JIRA_BROWSE_URL = 'https://bkrupa.atlassian.net/browse';
export const NO_JIRA_LABEL = 'no-jira';

const KEY_RE = /^LS-\d+$/;
const KEY_SCAN_RE = /\bLS-\d+\b/g;

/**
 * The marker comment plus its optional trailing visible `**Jira:**` line.
 * Line breaks are matched as `\r?\n` throughout: GitHub stores PR bodies with
 * CRLF, and an LF-only pattern silently stops capturing the visible line
 * there — which would leave a stale `**Jira:**` link behind a repaired marker.
 */
const MARKER_BLOCK_SOURCE =
  /<!--\s*jira-link\b[\s\S]*?-->(?:[ \t]*\r?\n[ \t]*\r?\n\*\*Jira:\*\*[^\r\n]*)?[\r\n]*/
    .source;

/** True for a value acceptable as `primary:` — an LS-#### key or `none`. */
export function isValidPrimary(value) {
  return value === 'none' || KEY_RE.test(value);
}

/** Distinct LS-#### keys in `text`, in first-seen order. */
export function extractKeys(text) {
  return [...new Set(text.match(KEY_SCAN_RE) ?? [])];
}

/**
 * Blank out fenced code blocks and inline code spans. Markers quoted in code
 * are documentation, not declarations (LS-7914, observed live on PR #5093).
 * Blanking rather than deleting preserves length and line structure, so match
 * indices map 1:1 back onto the original body — the block splicing below
 * relies on that.
 */
export function maskQuotedCode(body) {
  const blank = (match) => match.replace(/[^\n]/g, ' ');
  return body.replace(/```[\s\S]*?```/g, blank).replace(/`[^`\n]*`/g, blank);
}

/** Half-open [start, end) spans of every declared marker block in `body`. */
function findMarkerBlocks(body) {
  const masked = maskQuotedCode(body);
  return [...masked.matchAll(new RegExp(MARKER_BLOCK_SOURCE, 'gi'))].map(
    (match) => ({ start: match.index, end: match.index + match[0].length }),
  );
}

/**
 * Remove every declared marker block from `body`, leaving quoted ones intact.
 * All of them, not just the first: a body carrying duplicate markers is itself
 * a check failure, so re-emitting one good block only helps if the rest are
 * gone.
 */
export function stripMarkerBlocks(body) {
  const spans = findMarkerBlocks(body);
  if (spans.length === 0) return body;
  let result = '';
  let cursor = 0;
  for (const { start, end } of spans) {
    result += body.slice(cursor, start);
    cursor = end;
  }
  return (result + body.slice(cursor)).trimStart();
}

/**
 * Structural parse of a PR body's marker.
 *
 * @returns {{
 *   present: boolean,
 *   blockCount: number,
 *   primary: string | null,
 *   related: string[],
 *   errors: string[],
 * }} `primary` is set only when exactly one well-formed `primary:` was
 * declared; `related` holds the well-formed related keys found in any block.
 */
export function parseMarker(body) {
  const masked = maskQuotedCode(body);
  const blocks = [...masked.matchAll(/<!--\s*jira-link\b([\s\S]*?)-->/gi)];
  const errors = [];
  const related = [];

  if (blocks.length === 0) {
    return {
      present: false,
      blockCount: 0,
      primary: null,
      related,
      errors: [
        'PR body has no `<!-- jira-link -->` marker. Every PR must declare ' +
          'its Jira ticket linkage in the body (emitted automatically by ' +
          '`github_open_pr`; hand-authored on the built-in GitHub tools).',
      ],
    };
  }

  for (const block of blocks) {
    for (const line of (block[1] ?? '').matchAll(
      /^[ \t]*related:[ \t]*(.*)$/gim,
    )) {
      for (const token of line[1].split(/[,\s]+/).filter(Boolean)) {
        if (KEY_RE.test(token)) {
          if (!related.includes(token)) related.push(token);
        } else {
          errors.push(
            `jira-link \`related:\` contains "${token}" — expected ` +
              'comma/space-separated uppercase LS-#### keys.',
          );
        }
      }
    }
  }

  if (blocks.length > 1) {
    errors.unshift(
      `PR body has ${blocks.length} jira-link markers — exactly one is ` +
        'allowed. Remove the duplicates.',
    );
    return {
      present: true,
      blockCount: blocks.length,
      primary: null,
      related,
      errors,
    };
  }

  let primary = null;
  const primaryLines = [
    ...(blocks[0][1] ?? '').matchAll(/^[ \t]*primary:[ \t]*(.*)$/gim),
  ];
  if (primaryLines.length === 0) {
    errors.unshift(
      'jira-link marker has no `primary:` line. Declare exactly one primary ' +
        'key (LS-####) or `primary: none`.',
    );
  } else if (primaryLines.length > 1) {
    errors.unshift(
      `jira-link marker has ${primaryLines.length} \`primary:\` lines — ` +
        'exactly one is allowed. One ticket = one PR; move extra keys to ' +
        '`related:`.',
    );
  } else {
    const value = primaryLines[0][1].trim();
    if (isValidPrimary(value)) {
      primary = value;
    } else {
      errors.unshift(
        `jira-link \`primary: ${value}\` is not a valid value — expected an ` +
          'uppercase LS-#### key or `none`.',
      );
    }
  }

  return {
    present: true,
    blockCount: 1,
    primary,
    related,
    errors,
  };
}

/** The HTML comment alone — the machine parse target. */
export function buildMarkerComment({ primary, related = [] }) {
  const lines = ['<!-- jira-link', `primary: ${primary}`];
  if (related.length > 0) lines.push(`related: ${related.join(', ')}`);
  lines.push('-->');
  return lines.join('\n');
}

/**
 * The full marker block: HTML comment (parse target) plus the visible
 * **Jira:** line. `primary: none` emits the comment only — there is no ticket
 * to link for humans.
 */
export function buildMarkerBlock({ primary, related = [] }) {
  const comment = buildMarkerComment({ primary, related });
  if (primary === 'none') return comment;
  return `${comment}\n\n**Jira:** [${primary}](${JIRA_BROWSE_URL}/${primary})`;
}

/**
 * Prepend a well-formed marker to `body`, replacing any existing marker
 * blocks. When the body already carries a visible **Jira:** line (the standard
 * PR-body template does) only the HTML comment is prepended, to avoid
 * duplicating the human-facing link.
 */
export function applyMarker(body, { primary, related = [] }) {
  const rest = stripMarkerBlocks(body);
  const block = rest.includes('**Jira:**')
    ? buildMarkerComment({ primary, related })
    : buildMarkerBlock({ primary, related });
  return rest.length > 0 ? `${block}\n\n${rest}` : `${block}\n`;
}

/**
 * Decide whether a body whose marker failed validation can be repaired
 * without guessing, and produce the repaired body.
 *
 * Repair derives the primary key from the PR title, which the check already
 * requires to carry it (assertion 4) — the same fallback the RFC's rollout
 * plan names for unmarked PRs, and the same source `github_open_pr` uses when
 * no `jiraKey` is passed. It never invents linkage the PR does not already
 * assert, and never overrules a human: a marker that declares a different
 * valid key than the title, or a deliberate `primary: none` opt-out, is left
 * alone for the author to resolve.
 *
 * @returns {{ repairable: boolean, primary?: string, body?: string, reason: string }}
 */
export function planRepair(body, title) {
  const marker = parseMarker(body);
  const keys = extractKeys(title);

  if (marker.primary === 'none') {
    return {
      repairable: false,
      reason:
        'the marker declares `primary: none` — an opt-out is deliberate, so ' +
        'the fix (adding the `no-jira` label, or declaring a real key) is ' +
        "the author's call.",
    };
  }

  if (marker.primary && !keys.includes(marker.primary)) {
    return {
      repairable: false,
      reason:
        `the marker declares \`primary: ${marker.primary}\` but the title ` +
        `carries ${keys.length === 0 ? 'no key' : keys.join(', ')} — which ` +
        'one is right is a judgement call, so the body and title are left ' +
        'as they are.',
    };
  }

  if (keys.length === 0) {
    return {
      repairable: false,
      reason:
        'the PR title carries no LS-#### key, so there is nothing to derive ' +
        'the linkage from.',
    };
  }

  if (keys.length > 1) {
    return {
      repairable: false,
      reason:
        `the PR title carries ${keys.length} keys (${keys.join(', ')}), so ` +
        'the primary is ambiguous.',
    };
  }

  const primary = keys[0];
  const related = marker.related.filter((key) => key !== primary);
  return {
    repairable: true,
    primary,
    related,
    body: applyMarker(body, { primary, related }),
    reason: `derived \`primary: ${primary}\` from the PR title.`,
  };
}
