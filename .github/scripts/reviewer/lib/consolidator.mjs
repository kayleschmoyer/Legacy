/**
 * Split a review text into individual finding blocks.
 *
 * A block is any non-empty paragraph (text separated by blank lines). Blocks
 * that contain no alphabetic content (e.g. horizontal rules) are discarded.
 *
 * @param {string} text
 * @returns {string[]}
 */
function extractBlocks(text) {
  const blocks = [];
  let current = [];
  let inFence = false;

  for (const line of text.split('\n')) {
    if (/^(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
      current.push(line);
    } else if (!inFence && line.trim() === '') {
      const block = current.join('\n').trim();
      if (block && /[a-z]/i.test(block)) blocks.push(block);
      current = [];
    } else {
      current.push(line);
    }
  }

  const last = current.join('\n').trim();
  if (last && /[a-z]/i.test(last)) blocks.push(last);

  return blocks;
}

/**
 * Produce a stable fingerprint for a finding block used to detect duplicates.
 *
 * Strips leading list markers, lowercases, and collapses whitespace so that
 * near-identical findings from different passes match.
 *
 * @param {string} block
 * @returns {string}
 */
function fingerprintBlock(block) {
  return block
    .replace(/^[\s#*\-\d.)+]+/, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Consolidate findings from multiple review passes into a single review body.
 *
 * Two modes, picked automatically:
 *
 *   1. **Structured-JSON mode** — every pass.text parses as a JSON object with
 *      a `findings` array (the shape produced by tool-use providers like
 *      Gemini and Anthropic). Findings are merged across passes by
 *      `file:line:title` fingerprint and emitted as a single canonical
 *      `{"findings":[...]}` JSON object that `parseFindingsFromText` can
 *      consume directly. Each finding's `body` is prefixed with the
 *      originating pass label (e.g. `[correctness] …` or
 *      `[correctness + security] …`).
 *
 *   2. **Free-form text mode** (fallback) — if any pass.text is not parseable
 *      as a `{findings: [...]}` JSON object, fall back to the legacy
 *      paragraph-fingerprint approach: split each pass into paragraphs and
 *      deduplicate by content. Used by providers that emit free-form prose.
 *
 * Findings whose fingerprints match across passes are emitted once with a
 * combined pass label (e.g. `[correctness + security]`). Pass-unique findings
 * carry their originating pass label. The insertion order of first appearance
 * is preserved.
 *
 * @param {Array<{passName: string, text: string}>} passResults
 * @returns {string}
 */
export function consolidate(passResults) {
  const structured = _tryConsolidateStructured(passResults);
  if (structured !== null) return structured;
  return _consolidateFreeForm(passResults);
}

/**
 * Attempt the structured-JSON consolidation path. Returns null if any pass is
 * not a parseable `{findings: [...]}` JSON object — caller falls back to
 * free-form mode.
 *
 * @param {Array<{passName: string, text: string}>} passResults
 * @returns {string|null}
 */
function _tryConsolidateStructured(passResults) {
  const parsedPasses = [];
  for (const { passName, text } of passResults) {
    let obj;
    try {
      obj = JSON.parse(text);
    } catch {
      return null;
    }
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.findings)) {
      return null;
    }
    parsedPasses.push({ passName, findings: obj.findings });
  }

  // Merge findings by fingerprint while preserving first-seen order.
  // Each entry collects the passes it appeared in plus a representative copy
  // of the finding (the first one seen).
  const byFingerprint = new Map();
  const order = [];
  for (const { passName, findings } of parsedPasses) {
    for (const f of findings) {
      if (!f || typeof f !== 'object') continue;
      const fp = _findingFingerprint(f);
      if (!fp) continue;
      if (byFingerprint.has(fp)) {
        const entry = byFingerprint.get(fp);
        if (!entry.passes.includes(passName)) entry.passes.push(passName);
      } else {
        byFingerprint.set(fp, { passes: [passName], finding: f });
        order.push(fp);
      }
    }
  }

  // Emit one canonical findings array. Each finding gets its body prefixed
  // with the pass label so reviewers can see which pass surfaced it.
  //
  // If the source body is missing or empty, leave it empty (do NOT prefix to
  // produce `[correctness] ` which would masquerade as content and bypass
  // parseFindingsFromText's `body.trim() !== ''` filter — surfacing
  // incomplete findings as if they were real reviews).
  const merged = [];
  for (const fp of order) {
    const { passes, finding } = byFingerprint.get(fp);
    const sourceBody =
      typeof finding.body === 'string' ? finding.body.trim() : '';
    const prefixedBody = sourceBody
      ? `[${passes.join(' + ')}] ${sourceBody}`
      : '';
    merged.push({ ...finding, body: prefixedBody });
  }
  return JSON.stringify({ findings: merged });
}

/**
 * Stable fingerprint for a structured finding — `file:line:title` lowercased.
 * Findings that touch the same line and have the same title across passes
 * are treated as the same issue.
 *
 * @param {object} finding
 * @returns {string|null}
 */
function _findingFingerprint(finding) {
  const file = (finding.file ?? '').toString().trim().toLowerCase();
  const line = finding.line ?? '';
  const title = (finding.title ?? '').toString().trim().toLowerCase();
  if (!title) return null;
  return `${file}:${line}:${title}`;
}

/**
 * Legacy paragraph-fingerprint consolidation. Used when at least one pass
 * emits free-form text rather than structured JSON.
 *
 * @param {Array<{passName: string, text: string}>} passResults
 * @returns {string}
 */
function _consolidateFreeForm(passResults) {
  // fingerprint -> { passes: string[], content: string }
  const byFingerprint = new Map();
  const order = [];

  for (const { passName, text } of passResults) {
    for (const block of extractBlocks(text)) {
      const fp = fingerprintBlock(block);
      if (!fp) continue;

      if (byFingerprint.has(fp)) {
        const entry = byFingerprint.get(fp);
        if (!entry.passes.includes(passName)) {
          entry.passes.push(passName);
        }
      } else {
        byFingerprint.set(fp, { passes: [passName], content: block });
        order.push(fp);
      }
    }
  }

  if (order.length === 0) {
    const passNames = passResults.map((p) => p.passName).join(', ');
    return `No significant findings from ${passNames} review passes.`;
  }

  const lines = [];
  for (const fp of order) {
    const { passes, content } = byFingerprint.get(fp);
    const label =
      passes.length > 1 ? `**[${passes.join(' + ')}]**` : `**[${passes[0]}]**`;
    lines.push(`${label}\n\n${content}`);
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}
