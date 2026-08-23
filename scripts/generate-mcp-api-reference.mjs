#!/usr/bin/env node
/**
 * Generate the MCP API reference — a browsable index of every tool exposed by
 * the servers under tools/mcp/, in the spirit of a Swagger/OpenAPI explorer.
 *
 * Writes:
 *   docs/mcp/api-reference.html          — the full index (also publishable as an Artifact)
 *   docs/mcp/api-reference.json          — the same model as machine-readable data
 *   lib/mcp-docs/src/pages/<id>.generated.ts — one single-server page per hosted
 *       server, embedded in its Lambda bundle and served from `GET /docs`
 *
 * Usage:
 *   node scripts/generate-mcp-api-reference.mjs           # write both files
 *   node scripts/generate-mcp-api-reference.mjs --check    # fail on drift (CI)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect } from './mcp-api-reference/collect.mjs';
import { render } from './mcp-api-reference/render.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(REPO_ROOT, 'docs/mcp');
const HTML_PATH = join(OUT_DIR, 'api-reference.html');
const JSON_PATH = join(OUT_DIR, 'api-reference.json');
const PAGES_DIR = join(REPO_ROOT, 'lib/mcp-docs/src/pages');

/** Filename key for a server's generated page, e.g. 'db-admin'. */
function pageKey(server) {
  return server.packageDir.replace(/^tools\/mcp\//, '').replace(/-server$/, '');
}

/** Wrap a page in a TypeScript module the Lambda bundle can import. */
function pageModule(server, html) {
  return [
    '// GENERATED FILE — DO NOT EDIT.',
    '//',
    `// Single-server tool reference for \`${server.id}\`, served by its Lambda at`,
    '// GET /docs (behind the same bearer its tools require). Regenerate with',
    '// `make mcp-api-reference`; CI fails on drift.',
    '',
    `export const PAGE = ${JSON.stringify(html)};`,
    '',
  ].join('\n');
}

function readIfPresent(path) {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return undefined;
  }
}

function main() {
  const check = process.argv.includes('--check');

  const model = collect(REPO_ROOT);
  if (model.toolCount === 0) {
    console.error(
      'No MCP tools extracted — the extractor is out of step with the servers.',
    );
    process.exit(1);
  }

  const outputs = [
    { path: JSON_PATH, content: `${JSON.stringify(model, null, 2)}\n` },
    { path: HTML_PATH, content: render(model) },
  ];

  // One page per hosted server, for its own GET /docs route.
  const hosted = model.servers.filter((server) =>
    server.transports.includes('hosted'),
  );
  for (const server of hosted) {
    const scopedModel = {
      ...model,
      serverCount: 1,
      toolCount: server.toolCount,
      servers: [server],
    };
    const html = render(scopedModel, {
      scope: { label: server.label, totalServers: model.serverCount },
    });
    outputs.push({
      path: join(PAGES_DIR, `${pageKey(server)}.generated.ts`),
      content: pageModule(server, html),
    });
  }

  if (check) {
    const stale = outputs.filter(
      (output) => readIfPresent(output.path) !== output.content,
    );
    if (stale.length) {
      console.error(
        'The MCP API reference is out of date:\n' +
          stale
            .map((output) => `  ${relative(REPO_ROOT, output.path)}`)
            .join('\n') +
          '\n\nRun `make mcp-api-reference` and commit the result.',
      );
      process.exit(1);
    }
    console.log(`MCP API reference is up to date (${model.toolCount} tools).`);
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(PAGES_DIR, { recursive: true });
  for (const output of outputs) writeFileSync(output.path, output.content);

  const summary = model.servers
    .map(
      (s) =>
        `  ${s.id.padEnd(26)} ${String(s.toolCount).padStart(3)} tools  [${s.transports.join(', ')}]`,
    )
    .join('\n');
  console.log(
    `Wrote ${model.toolCount} tools across ${model.serverCount} servers:\n${summary}`,
  );
  console.log(
    '\n' + outputs.map((o) => `  ${relative(REPO_ROOT, o.path)}`).join('\n'),
  );
}

main();
