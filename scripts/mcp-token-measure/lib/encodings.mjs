/**
 * scripts/mcp-token-measure/lib/encodings.mjs
 *
 * Encoders that render the SAME response payload three ways so their token
 * costs can be compared apples-to-apples:
 *   - prettyJson:  JSON.stringify(payload, null, 2)   (status quo for most tools)
 *   - minifiedJson: JSON.stringify(payload)            (cheapest lossless JSON)
 *   - markdownTable: list-shaped sub-arrays become Markdown tables (headers
 *     written once), scalars/objects become inline key/value lines.
 *
 * The Markdown encoder embodies the epic's guiding principle: flat uniform
 * lists -> table (the big win); scalars / nested objects -> compact JSON. It is
 * lossless — every key in the payload is represented.
 */

/** @param {unknown} payload */
export function prettyJson(payload) {
  return JSON.stringify(payload, null, 2);
}

/** @param {unknown} payload */
export function minifiedJson(payload) {
  return JSON.stringify(payload);
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** An array of plain objects renders cleanly as a table. */
function isTabular(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((row) => isPlainObject(row))
  );
}

/** Render a single table cell value, keeping it on one line. */
function cell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return escapeCell(value);
  if (typeof value === 'object') return escapeCell(JSON.stringify(value));
  return escapeCell(String(value));
}

function escapeCell(text) {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/** Union of keys across rows, preserving first-seen order. */
function columnsOf(rows) {
  const cols = [];
  const seen = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        cols.push(key);
      }
    }
  }
  return cols;
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @returns {string}
 */
export function tableForRows(rows) {
  const cols = columnsOf(rows);
  const lines = [];
  lines.push(`| ${cols.join(' | ')} |`);
  lines.push(`| ${cols.map(() => '---').join(' | ')} |`);
  for (const row of rows) {
    lines.push(`| ${cols.map((c) => cell(row[c])).join(' | ')} |`);
  }
  return lines.join('\n');
}

/**
 * Render a value as inline Markdown (used for non-tabular scalar/object fields).
 * @param {unknown} value
 */
function inlineValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return '`' + JSON.stringify(value) + '`';
  return String(value);
}

/**
 * Encode an arbitrary response payload as Markdown.
 *
 * - Top-level array of objects -> a single table.
 * - Top-level object -> tabular array fields become `## key` + table; everything
 *   else becomes `- **key**: value` lines.
 * - Anything else -> inline JSON (Markdown can't beat compact JSON here).
 *
 * @param {unknown} payload
 * @returns {string}
 */
export function markdownTable(payload) {
  if (isTabular(payload)) {
    return tableForRows(payload);
  }

  if (!isPlainObject(payload)) {
    return minifiedJson(payload);
  }

  const scalarLines = [];
  const tableSections = [];

  for (const [key, value] of Object.entries(payload)) {
    if (isTabular(value)) {
      tableSections.push(`## ${key}\n\n${tableForRows(value)}`);
    } else {
      scalarLines.push(`- **${key}**: ${inlineValue(value)}`);
    }
  }

  const parts = [];
  if (scalarLines.length > 0) parts.push(scalarLines.join('\n'));
  parts.push(...tableSections);
  return parts.join('\n\n');
}

export const ENCODINGS = {
  'pretty JSON': prettyJson,
  'minified JSON': minifiedJson,
  'Markdown table': markdownTable,
};
