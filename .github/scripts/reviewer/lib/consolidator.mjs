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
 * Findings whose fingerprints match across passes are emitted once with a
 * combined pass label (e.g. `[correctness + security]`). Pass-unique findings
 * carry their originating pass label. The insertion order of first appearance
 * is preserved.
 *
 * @param {Array<{passName: string, text: string}>} passResults
 * @returns {string}
 */
export function consolidate(passResults) {
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
