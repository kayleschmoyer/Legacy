/**
 * Computes CSP hash-sources for the inline <style>/<script> blocks in a
 * rendered MCP docs page, so the page's Content-Security-Policy can name
 * each block by its sha256 digest instead of allowing 'unsafe-inline'.
 *
 * The generator calls this once per hosted page and embeds the result
 * alongside the page HTML (see generate-mcp-api-reference.mjs); the Lambda
 * handler just plugs the pre-computed hashes into the response header.
 */
import { createHash } from 'node:crypto';

const STYLE_BLOCK_RE = /<style>([\s\S]*?)<\/style>/g;
const SCRIPT_BLOCK_RE = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g;

/** `sha256-<base64>`, the CSP hash-source format (without surrounding quotes). */
function hashSource(content) {
  return `sha256-${createHash('sha256').update(content, 'utf-8').digest('base64')}`;
}

function allMatches(html, pattern) {
  return [...html.matchAll(pattern)].map((match) => match[1]);
}

/**
 * @param {string} html a rendered page, as produced by render()
 * @returns {{ styleSrc: string[], scriptSrc: string[] }} hash-sources for
 *   every inline style/script block found, in document order.
 */
export function computeInlineCsp(html) {
  const styleSrc = allMatches(html, STYLE_BLOCK_RE).map(hashSource);
  const scriptSrc = allMatches(html, SCRIPT_BLOCK_RE).map(hashSource);

  if (styleSrc.length === 0) {
    throw new Error('computeInlineCsp: no inline <style> block found in page');
  }
  if (scriptSrc.length === 0) {
    throw new Error('computeInlineCsp: no inline <script> block found in page');
  }

  return { styleSrc, scriptSrc };
}
