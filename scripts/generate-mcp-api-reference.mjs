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
 * Also writes:
 *   .agents/skills/mcp-first/references/tool-catalog/<id>.md — one generated
 *       skill-reference file per server (LS-9701 Tier 2), so an agent loading
 *       a skill gets the CURRENT schema instead of hand-maintained prose that
 *       can drift from it (see ./mcp-api-reference/render-catalog.mjs header).
 *
 * Also enforces the tool-definition budget (LS-9704): `--check` fails when a
 * server exceeds its ceiling in docs/mcp/tool-budget.json, and equally when it
 * drops well below one without the ceiling being lowered — see
 * ./mcp-api-reference/budget.mjs for why both directions matter.
 *
 * Usage:
 *   node scripts/generate-mcp-api-reference.mjs                  # write both files
 *   node scripts/generate-mcp-api-reference.mjs --check          # fail on drift + budget (CI)
 *   node scripts/generate-mcp-api-reference.mjs --update-budget  # re-seed EVERY ceiling from current measurement
 *   node scripts/generate-mcp-api-reference.mjs --update-budget=<server-id>
 *       # raise only <server-id>'s ceiling to its current measurement, recompute `total` to
 *       # match, and leave every other server's ceiling untouched — the targeted alternative
 *       # to a full re-seed when only one server's growth is being deliberately signed off on.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  budgetFromMeasurement,
  checkBudget,
  measureDefinitionTokens,
  updateSingleServerBudget,
} from './mcp-api-reference/budget.mjs';
import { collect } from './mcp-api-reference/collect.mjs';
import { computeInlineCsp } from './mcp-api-reference/csp.mjs';
import { renderCatalog } from './mcp-api-reference/render-catalog.mjs';
import { render } from './mcp-api-reference/render.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(REPO_ROOT, 'docs/mcp');
const HTML_PATH = join(OUT_DIR, 'api-reference.html');
const JSON_PATH = join(OUT_DIR, 'api-reference.json');
const BUDGET_PATH = join(OUT_DIR, 'tool-budget.json');
const PAGES_DIR = join(REPO_ROOT, 'lib/mcp-docs/src/pages');
const CATALOG_DIR = join(
  REPO_ROOT,
  '.agents/skills/mcp-first/references/tool-catalog',
);

/** Filename for a server's generated catalog page, e.g. 'legacy-sports-jira.md'. */
function catalogPath(server) {
  return join(CATALOG_DIR, `${server.id}.md`);
}

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
  const updateBudgetArg = process.argv.find((arg) =>
    arg.startsWith('--update-budget'),
  );
  const updateBudget = updateBudgetArg === '--update-budget';
  const updateBudgetServer = updateBudgetArg?.startsWith('--update-budget=')
    ? updateBudgetArg.slice('--update-budget='.length)
    : undefined;

  const model = collect(REPO_ROOT);
  if (model.toolCount === 0) {
    console.error(
      'No MCP tools extracted — the extractor is out of step with the servers.',
    );
    process.exit(1);
  }

  const measured = measureDefinitionTokens(model);

  if (updateBudgetServer) {
    const existingRaw = readIfPresent(BUDGET_PATH);
    if (existingRaw === undefined) {
      console.error(
        `Missing ${relative(REPO_ROOT, BUDGET_PATH)}.\n\n` +
          'Seed it first with `node scripts/generate-mcp-api-reference.mjs --update-budget` (no filter).',
      );
      process.exit(1);
    }

    let updated;
    try {
      updated = updateSingleServerBudget(
        measured,
        JSON.parse(existingRaw),
        updateBudgetServer,
      );
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }

    const body = `${JSON.stringify(updated, null, 2)}\n`;
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(BUDGET_PATH, body);
    const actual = measured.servers[updateBudgetServer];
    console.log(
      `Raised ${updateBudgetServer}'s ceiling to ${actual.tools} tools / ${actual.tokens} definition tokens\n` +
        `and recomputed total to ${updated.total.tools} tools / ${updated.total.tokens} tokens.\n` +
        'Every other server ceiling is untouched. Review the diff and justify the raise in the PR description.',
    );
    return;
  }

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

  // One skill-reference catalog per server, local or hosted alike.
  for (const server of model.servers) {
    outputs.push({
      path: catalogPath(server),
      content: `${renderCatalog(server)}\n`,
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
          "To raise just one server's ceiling (leaving the others untouched):\n" +
          '  node scripts/generate-mcp-api-reference.mjs --update-budget=<server-id>\n' +
          'To re-seed every ceiling from the current measurement (a real consolidation):\n' +
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
  mkdirSync(CATALOG_DIR, { recursive: true });
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
