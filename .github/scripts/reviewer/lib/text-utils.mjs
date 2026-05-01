/**
 * Extract the content of the first bare or ```json fenced block in text.
 *
 * Scans through fence occurrences, skipping non-JSON fences (e.g. ```js,
 * ```ts) until it finds one whose language tag is '' or 'json'. Returns the
 * trimmed inner content of that fence's matching close fence.
 *
 * The closing-fence search starts at `headerEnd` (not `headerEnd + 1`) so that
 * empty fenced blocks (e.g. ```json\n```) are handled correctly — the newline
 * after the header IS the newline before the closing fence in that case.
 *
 * Returns null when no eligible fence pair is found.
 *
 * @param {string} text
 * @returns {string|null}
 */
export function extractFirstJsonFencedBlock(text) {
  let searchFrom = 0;

  while (searchFrom < text.length) {
    const fenceStart = text.indexOf('```', searchFrom);
    if (fenceStart === -1) return null;

    const headerEnd = text.indexOf('\n', fenceStart);
    if (headerEnd === -1) return null;

    const header = text
      .slice(fenceStart + 3, headerEnd)
      .trim()
      .toLowerCase();

    if (header === '' || header === 'json') {
      const closeAt = text.indexOf('\n```', headerEnd);
      if (closeAt === -1) return null;
      return text.slice(headerEnd + 1, closeAt).trim();
    }

    // Non-JSON fence — skip past its closing fence and continue scanning.
    const closeAt = text.indexOf('\n```', headerEnd);
    if (closeAt === -1) return null;
    searchFrom = closeAt + 4;
  }

  return null;
}

/**
 * Normalize raw LLM text by stripping markdown code fences, returning the
 * string most likely to be valid JSON.
 *
 * Tries in order:
 *   1. Parse as-is — if valid JSON, return unchanged (preserves embedded backticks)
 *   2. Outer fence strip — when the entire trimmed response is a bare/```json block
 *   3. Embedded fence extract — scan for the first ```/```json block and return
 *      its content only when it is itself valid JSON
 *
 * Returns the original `text` unchanged when none of the above strategies
 * produce parseable JSON, so callers can still apply their own fallback logic.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeJsonFence(text) {
  try {
    JSON.parse(text);
    return text;
  } catch {
    // proceed to fence-stripping strategies
  }

  const trimmed = text.trim();

  // Outer fence: entire response is wrapped in a fenced block
  if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
    const firstNewline = trimmed.indexOf('\n');
    if (firstNewline !== -1) {
      // Multi-line fence: header is the text between ``` and the first newline.
      const header = trimmed.slice(3, firstNewline).trim().toLowerCase();
      if (header === '' || header === 'json') {
        return trimmed.slice(firstNewline + 1, -3).trim();
      }
    } else {
      // Single-line fence (no newlines): infer header as the leading word before
      // the first JSON-start character ({, [, ") or whitespace, then strip it.
      const inner = trimmed.slice(3, -3).trim();
      const sepIdx = inner.search(/[\s{["]/);
      const header =
        sepIdx === -1 ? inner : inner.slice(0, sepIdx).toLowerCase();
      if (header === '' || header === 'json') {
        return (sepIdx === -1 ? inner : inner.slice(sepIdx)).trim();
      }
    }
  }

  // Embedded fence: prose preamble + ```/```json block whose content is valid JSON
  const extracted = extractFirstJsonFencedBlock(trimmed);
  if (extracted !== null) {
    try {
      JSON.parse(extracted);
      return extracted;
    } catch {
      // not valid JSON — fall through
    }
  }

  return text;
}
