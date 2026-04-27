/**
 * @typedef {'critical'|'high'|'medium'|'low'|'trivia'} Severity
 *
 * @typedef {{ severity: Severity, file: string|null, line: number|null, title: string, body: string }} Finding
 */

const BLOCKING_SEVERITIES = new Set(['critical', 'high']);
const NON_BLOCKING_SEVERITIES = new Set(['medium', 'low']);
const VALID_SEVERITIES = new Set([
  'critical',
  'high',
  'medium',
  'low',
  'trivia',
]);

/**
 * Parse findings from raw LLM output.
 *
 * The system prompt instructs the model to output a JSON array directly (no
 * fencing required), but also accepts fenced ```json blocks in case the model
 * wraps output anyway. Tries parsing the full candidate first, then retries
 * from the first '[' to handle a prose preamble the model may prepend.
 *
 * Returns `{ ok: false }` when the text cannot be parsed as a JSON array at
 * all — distinct from `{ ok: true, findings: [] }` which means the model
 * legitimately found nothing. Callers should handle the `ok: false` case
 * explicitly (e.g. fall back to posting the raw model output).
 *
 * @param {string} text
 * @returns {{ ok: true, findings: Finding[] } | { ok: false, findings: [] }}
 */
export function parseFindingsFromText(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();

  // Attempt 1: the candidate is exactly a JSON array.
  let parsed = _tryParseJsonArray(candidate);

  // Attempt 2: candidate has a prose preamble — retry from the first '['.
  if (parsed === null) {
    const start = candidate.indexOf('[');
    if (start > 0) {
      parsed = _tryParseJsonArray(candidate.slice(start));
    }
  }

  if (parsed === null) return { ok: false, findings: [] };

  const findings = parsed.filter(
    (f) =>
      f !== null &&
      typeof f === 'object' &&
      VALID_SEVERITIES.has(f.severity) &&
      typeof f.title === 'string' &&
      f.title.trim() !== '' &&
      typeof f.body === 'string' &&
      f.body.trim() !== '' &&
      (f.file === null || typeof f.file === 'string') &&
      (f.line === null ||
        (typeof f.line === 'number' &&
          Number.isInteger(f.line) &&
          f.line >= 1)),
  );

  return { ok: true, findings };
}

/**
 * Try to parse `s` as a JSON array. Returns the array or null on failure.
 *
 * @param {string} s
 * @returns {unknown[]|null}
 */
function _tryParseJsonArray(s) {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Split findings into blocking (critical/high), nonBlocking (medium/low),
 * and dropped (trivia) groups.
 *
 * @param {Finding[]} findings
 * @returns {{ blocking: Finding[], nonBlocking: Finding[], dropped: Finding[] }}
 */
export function gateFindingsBySeverity(findings) {
  const blocking = [];
  const nonBlocking = [];
  const dropped = [];

  for (const finding of findings) {
    if (BLOCKING_SEVERITIES.has(finding.severity)) {
      blocking.push(finding);
    } else if (NON_BLOCKING_SEVERITIES.has(finding.severity)) {
      nonBlocking.push(finding);
    } else {
      dropped.push(finding);
    }
  }

  return { blocking, nonBlocking, dropped };
}

/**
 * Format a shadow PR comment body from gated findings.
 * Shows what the reviewer would post in live mode, grouped by gate.
 *
 * @param {{ blocking: Finding[], nonBlocking: Finding[], dropped: Finding[] }} gated
 * @returns {string}
 */
export function formatShadowBody({ blocking, nonBlocking, dropped }) {
  const parts = [];

  if (blocking.length > 0) {
    parts.push('### 🔴 Blocking (would REQUEST_CHANGES)');
    for (const f of blocking) {
      parts.push(_formatFinding(f));
    }
  }

  if (nonBlocking.length > 0) {
    parts.push('### 🟡 Non-blocking (would post on APPROVE)');
    for (const f of nonBlocking) {
      parts.push(_formatFinding(f));
    }
  }

  if (parts.length === 0) {
    parts.push(
      '_No findings after self-critique and severity gating. Would APPROVE._',
    );
  }

  const counts =
    `${blocking.length} blocking · ` +
    `${nonBlocking.length} non-blocking · ` +
    `${dropped.length} trivia dropped`;
  parts.push(`---\n_Severity gating: ${counts}_`);

  return parts.join('\n\n');
}

/**
 * @param {Finding} f
 * @returns {string}
 */
function _formatFinding(f) {
  const loc = f.file
    ? f.line != null
      ? `\`${f.file}:${f.line}\``
      : `\`${f.file}\``
    : '_PR-level_';
  return `**[${f.severity.toUpperCase()}]** ${f.title} — ${loc}\n\n${f.body}`;
}
