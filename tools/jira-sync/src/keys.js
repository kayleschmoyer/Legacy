'use strict';

const KEY_PATTERN = /LS-\d+/gi;

/**
 * Extract all Jira ticket keys (LS-####) from a piece of text,
 * uppercased, deduplicated, and sorted for deterministic output.
 *
 * @param {string | null | undefined} text
 * @returns {string[]}
 */
function extractKeys(text) {
  if (!text) {
    return [];
  }
  const matches = text.match(KEY_PATTERN) ?? [];
  return [...new Set(matches.map((key) => key.toUpperCase()))].sort();
}

module.exports = { extractKeys };
