/**
 * scripts/mcp-token-measure/lib/tokenize.mjs
 *
 * Token estimation for MCP response payloads.
 *
 * Two backends:
 *   - "estimate" (default): a deterministic, offline, dependency-free BPE
 *     approximation. Good enough to RANK encodings of the same data (pretty
 *     JSON vs minified JSON vs Markdown table) and to compute relative deltas.
 *     Use this in CI and for quick before/after comparisons.
 *   - "anthropic": authoritative counts from the Claude API
 *     (client.messages.countTokens). Requires ANTHROPIC_API_KEY and network
 *     access. Use this when a PR needs exact, citable numbers.
 *
 * The estimator is intentionally simple and transparent. It mirrors the
 * pre-tokenization step shared by modern BPE tokenizers (cl100k_base /
 * o200k_base): split the text into word / number / symbol / whitespace runs,
 * then approximate how many sub-word tokens each run becomes. This captures the
 * dominant cost difference we care about — JSON's structural punctuation and
 * repeated keys vs a Markdown table's write-headers-once layout.
 */

// cl100k_base-style pre-tokenization pattern: contractions, optional-leading-
// space letter runs, number runs, symbol runs, and whitespace runs.
const PRETOKEN_RE =
  /'(?:[sdmt]|ll|ve|re)| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;

/**
 * Estimate how many BPE tokens a single pre-token piece becomes.
 * @param {string} piece
 * @returns {number}
 */
function tokensForPiece(piece) {
  if (piece.length === 0) return 0;

  // Whitespace runs. A single space folds into the following word piece, but
  // standalone runs (indentation, newlines in pretty JSON) cost real tokens —
  // roughly one token per ~3 whitespace chars, minimum one.
  if (/^\s+$/u.test(piece)) {
    return Math.max(1, Math.ceil(piece.length / 3));
  }

  const lead = piece.startsWith(' ') ? 1 : 0;
  const body = piece.slice(lead);

  // Letter runs: BPE merges common sub-words; ~4 chars per token is a good
  // average for English-ish identifiers and prose. The leading space rides
  // along for free (it merges into the first sub-word token).
  if (/^\p{L}+$/u.test(body)) {
    return Math.max(1, Math.round(body.length / 4));
  }

  // Digit runs: modern tokenizers cap numeric merges at ~3 digits per token.
  if (/^\p{N}+$/u.test(body)) {
    return Math.ceil(body.length / 3);
  }

  // Symbol / punctuation runs (the JSON structural tax: {}[]":,). Some adjacent
  // pairs merge ("," "":" "},"), so ~1 token per ~1.5 punctuation chars.
  return Math.max(1, Math.ceil(body.length / 1.5));
}

/**
 * Deterministic, offline token estimate for a string.
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  if (!text) return 0;
  const pieces = text.match(PRETOKEN_RE);
  if (!pieces) return 0;
  let total = 0;
  for (const piece of pieces) total += tokensForPiece(piece);
  return total;
}

/**
 * Authoritative token count via the Claude API. Lazily imports the SDK so the
 * estimate path never depends on it.
 * @param {string} text
 * @param {{ model?: string }} [opts]
 * @returns {Promise<number>}
 */
export async function anthropicTokens(text, opts = {}) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'anthropic backend requires ANTHROPIC_API_KEY (set it or use the default estimate backend)',
    );
  }
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  const res = await client.messages.countTokens({
    model: opts.model ?? 'claude-opus-4-8',
    messages: [{ role: 'user', content: text }],
  });
  return res.input_tokens;
}

/**
 * Count tokens with the selected backend.
 * @param {string} text
 * @param {{ backend?: 'estimate'|'anthropic', model?: string }} [opts]
 * @returns {Promise<number>}
 */
export async function countTokens(text, opts = {}) {
  const backend = opts.backend ?? 'estimate';
  if (backend === 'anthropic') return anthropicTokens(text, opts);
  return estimateTokens(text);
}
