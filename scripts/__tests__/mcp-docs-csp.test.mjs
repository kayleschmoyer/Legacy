/**
 * Tests for scripts/mcp-api-reference/csp.mjs (LS-9595).
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/mcp-docs-csp.test.mjs
 *
 * The hosted /docs page's CSP must name its inline <style>/<script> blocks by
 * exact sha256 hash instead of allowing 'unsafe-inline'. These tests render a
 * real hosted-server page the same way the generator does, then verify the
 * computed digests are both correct (recomputed independently with
 * node:crypto) and match what's actually committed to the generated page
 * module the Lambda ships.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect } from '../mcp-api-reference/collect.mjs';
import { computeInlineCsp } from '../mcp-api-reference/csp.mjs';
import { render } from '../mcp-api-reference/render.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function independentHashSource(content) {
  return `sha256-${createHash('sha256').update(content, 'utf-8').digest('base64')}`;
}

function ciServerPage() {
  const model = collect(REPO_ROOT);
  const server = model.servers.find((s) => s.id === 'legacy-sports-ci');
  assert.ok(
    server,
    'expected a legacy-sports-ci server in the collected model',
  );

  const html = render(
    {
      ...model,
      serverCount: 1,
      toolCount: server.toolCount,
      servers: [server],
    },
    { scope: { label: server.label, totalServers: model.serverCount } },
  );
  return html;
}

test('computeInlineCsp finds exactly one inline style block and two inline script blocks', () => {
  const html = computeInlineCsp(ciServerPage());

  assert.equal(html.styleSrc.length, 1);
  assert.equal(html.scriptSrc.length, 2);
});

test('computeInlineCsp digests match the inline blocks actually present in the page', () => {
  const page = ciServerPage();
  const csp = computeInlineCsp(page);

  const [styleContent] = [...page.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(
    (m) => m[1],
  );
  const scriptContents = [
    ...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g),
  ].map((m) => m[1]);

  assert.deepEqual(csp.styleSrc, [independentHashSource(styleContent)]);
  assert.deepEqual(csp.scriptSrc, scriptContents.map(independentHashSource));
});

test('a CSP header built from the computed hashes carries no unsafe-inline', () => {
  const csp = computeInlineCsp(ciServerPage());
  const header =
    `default-src 'none'; style-src ${csp.styleSrc.map((h) => `'${h}'`).join(' ')} https://fonts.googleapis.com; ` +
    `font-src https://fonts.gstatic.com; script-src ${csp.scriptSrc.map((h) => `'${h}'`).join(' ')}; img-src data:`;

  assert.ok(!header.includes('unsafe-inline'));
});

test('the committed generated page ships a CSP matching its own inline blocks', async () => {
  const generatedPath = join(
    REPO_ROOT,
    'lib/mcp-docs/src/pages/ci.generated.ts',
  );
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(generatedPath, 'utf-8'),
  );

  const pageMatch = source.match(/export const PAGE = (".*");/);
  const cspMatch = source.match(/export const CSP = (\{[\s\S]*?\n\});/);
  assert.ok(
    pageMatch && cspMatch,
    'expected PAGE and CSP exports in the generated file',
  );

  const page = JSON.parse(pageMatch[1]);
  const committedCsp = JSON.parse(cspMatch[1]);

  assert.deepEqual(computeInlineCsp(page), committedCsp);
});
