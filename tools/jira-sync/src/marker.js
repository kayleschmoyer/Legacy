'use strict';

/**
 * Parsing for the structured `jira-link` marker declared in PR bodies
 * (RFC: docs/rfcs/draft-declared-ticket-linkage.md):
 *
 *   <!-- jira-link
 *   primary: LS-7523
 *   related: LS-7520, LS-7521
 *   -->
 *
 * The HTML comment is the parse target; only keys inside it count.
 * Decoy LS-#### keys elsewhere in the body are never picked up.
 */

const MARKER_BLOCK = /<!--\s*jira-link\b([\s\S]*?)-->/i;
const SINGLE_KEY = /^LS-\d+$/i;

/**
 * @typedef {Object} MarkerResult
 * @property {boolean} present  Whether a jira-link comment block exists at all.
 * @property {boolean} valid    Whether the block parsed cleanly (false implies present).
 * @property {string | null} primary  Uppercased primary key, or null when `primary: none`
 *                                    was declared or the marker is absent/invalid.
 * @property {string[]} related  Uppercased related keys (informational only).
 * @property {string} [error]    Parse error description when valid is false.
 */

/**
 * Parse the jira-link marker out of a PR body.
 *
 * @param {string | null | undefined} body
 * @returns {MarkerResult}
 */
function parseMarker(body) {
  const absent = { present: false, valid: false, primary: null, related: [] };
  if (!body) {
    return absent;
  }
  const match = MARKER_BLOCK.exec(body);
  if (!match) {
    return absent;
  }

  /** @param {string} error */
  const invalid = (error) => ({
    present: true,
    valid: false,
    primary: null,
    related: [],
    error,
  });

  const primaries = [];
  /** @type {string[]} */
  const related = [];

  for (const rawLine of match[1].split('\n')) {
    const line = rawLine.trim();
    if (line === '') {
      continue;
    }
    const fieldMatch = /^([A-Za-z][A-Za-z-]*)\s*:\s*(.*)$/.exec(line);
    if (!fieldMatch) {
      return invalid(`unparseable line in jira-link marker: "${line}"`);
    }
    const field = fieldMatch[1].toLowerCase();
    const value = fieldMatch[2].trim();

    if (field === 'primary') {
      primaries.push(value);
    } else if (field === 'related') {
      for (const token of value.split(/[\s,]+/)) {
        if (token === '') {
          continue;
        }
        if (!SINGLE_KEY.test(token)) {
          return invalid(`invalid related key in jira-link marker: "${token}"`);
        }
        related.push(token.toUpperCase());
      }
    } else {
      return invalid(`unknown field in jira-link marker: "${field}"`);
    }
  }

  if (primaries.length === 0) {
    return invalid('jira-link marker has no primary field');
  }
  if (primaries.length > 1) {
    return invalid('jira-link marker declares more than one primary');
  }

  const primaryValue = primaries[0];
  if (primaryValue.toLowerCase() === 'none') {
    return {
      present: true,
      valid: true,
      primary: null,
      related: [...new Set(related)],
    };
  }
  if (!SINGLE_KEY.test(primaryValue)) {
    return invalid(
      `invalid primary key in jira-link marker: "${primaryValue}"`,
    );
  }

  return {
    present: true,
    valid: true,
    primary: primaryValue.toUpperCase(),
    related: [...new Set(related)],
  };
}

module.exports = { parseMarker };
