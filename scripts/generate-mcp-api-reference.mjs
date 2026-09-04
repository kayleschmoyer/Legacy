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
 * Also enforces the tool-definition budget (LS-9704): `--check` fails when a
 * server exceeds its ceiling in docs/mcp/tool-budget.json, and equally when it
 * drops well below one without the ceiling being lowered — see
 * ./mcp-api-reference/budget.mjs for why both directions matter.
 *
 * Usage:
 *   node scripts/generate-mcp-api-reference.mjs                  # write both files
 *   node scripts/generate-mcp-api-reference.mjs --check          # fail on drift + budget (CI)
 *   node scripts/generate-mcp-api-reference.mjs --update-budget  # re-seed ceilings from current measurement
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  budgetFromMeasurement,
  checkBudget,
  measureDefinitionTokens,
} from './mcp-api-reference/budget.mjs';
import { collect } from './mcp-api-reference/collect.mjs';
import { computeInlineCsp } from './mcp-api-reference/csp.mjs';
import { render } from './mcp-api-reference/render.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(REPO_ROOT, 'docs/mcp');
const HTML_PATH = join(OUT_DIR, 'api-reference.html');
const JSON_PATH = join(OUT_DIR, 'api-reference.json');
const BUDGET_PATH = join(OUT_DIR, 'tool-budget.json');
const PAGES_DIR = join(REPO_ROOT, 'lib/mcp-docs/src/pages');

/** Filename key for a server's generated page, e.g. 'db-admin'. */
function pageKey(server) {
  return server.packageDir.replace(/^tools\/mcp\//, '').replace(/-server$/, '');
}

/** Wrap a page (and its matching CSP) in a TypeScript module the Lambda bundle can import. */
function pageModule(server, html, csp) {
  return [
    '// GENERATED FILE — DO NOT EDIT.',
    '//',
    `// Single-server tool reference for \`${server.id}\`, served by its Lambda at`,
    '// GET /docs (behind the same bearer its tools require). Regenerate with',
    '// `make mcp-api-reference`; CI fails on drift.',
    '',
    `export const PAGE = ${JSON.stringify(html)};`,
    '',
    '// sha256 hash-sources for every inline <style>/<script> block in PAGE, so',
    "// the served CSP can name them exactly instead of allowing 'unsafe-inline'.",
    `export const CSP = ${JSON.stringify(csp, null, 2)};`,
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
  const updateBudget = process.argv.includes('--update-budget');

  const model = collect(REPO_ROOT);
  if (model.toolCount === 0) {
    console.error(
      'No MCP tools extracted — the extractor is out of step with the servers.',
    );
    process.exit(1);
  }

  const measured = measureDefinitionTokens(model);

  if (updateBudget) {
    const body = `${JSON.stringify(budgetFromMeasurement(measured), null, 2)}\n`;
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(BUDGET_PATH, body);
    console.log(
      `Re-seeded ${relative(REPO_ROOT, BUDGET_PATH)} at ${measured.toolCount} tools / ${measured.total} definition tokens.\n` +
        'Review the diff before committing — this overwrites every ceiling, including ones you may not have intended to raise.',
    );
    return;
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
    const csp = computeInlineCsp(html);
    outputs.push({
      path: join(PAGES_DIR, `${pageKey(server)}.generated.ts`),
      content: pageModule(server, html, csp),
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
    const budgetRaw = readIfPresent(BUDGET_PATH);
    if (budgetRaw === undefined) {
      console.error(
        `Missing ${relative(REPO_ROOT, BUDGET_PATH)}.\n\n` +
          'Seed it with `node scripts/generate-mcp-api-reference.mjs --update-budget` and commit the result.',
      );
      process.exit(1);
    }

    const { violations, lines } = checkBudget(measured, JSON.parse(budgetRaw));
    console.log(
      `MCP tool-definition budget (${measured.toolCount} tools, ${measured.total} tokens):\n${lines.join('\n')}`,
    );

    if (violations.length) {
      console.error(
        '\nMCP tool-definition budget violated:\n\n' +
          violations.map((v) => `  - ${v}`).join('\n\n') +
          '\n\nTool definitions are always-resident token cost — every registered tool bills every\n' +
          'session whether or not it is called. See .agents/skills/create/references/mcp-tool-consolidation.md.\n' +
          'To re-seed every ceiling from the current measurement:\n' +
          '  node scripts/generate-mcp-api-reference.mjs --update-budget',
      );
      process.exit(1);
    }

    console.log(
      `\nMCP API reference is up to date (${model.toolCount} tools), budget holds.`,
    );
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
