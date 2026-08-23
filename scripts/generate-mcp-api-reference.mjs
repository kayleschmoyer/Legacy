#!/usr/bin/env node
/**
 * Generate the MCP API reference — a browsable index of every tool exposed by
 * the servers under tools/mcp/, in the spirit of a Swagger/OpenAPI explorer.
 *
 * Writes:
 *   docs/mcp/api-reference.html  — the page (also publishable as an Artifact)
 *   docs/mcp/api-reference.json  — the same model as machine-readable data
 *
 * Usage:
 *   node scripts/generate-mcp-api-reference.mjs           # write both files
 *   node scripts/generate-mcp-api-reference.mjs --check    # fail on drift (CI)
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect } from './mcp-api-reference/collect.mjs';
import { render } from './mcp-api-reference/render.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(REPO_ROOT, 'docs/mcp');
const HTML_PATH = join(OUT_DIR, 'api-reference.html');
const JSON_PATH = join(OUT_DIR, 'api-reference.json');

function shortCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    }).trim();
  } catch {
    return undefined;
  }
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

  // The commit is stamped into the page footer but deliberately kept out of the
  // JSON model, so --check compares content rather than provenance.
  const json = `${JSON.stringify(model, null, 2)}\n`;
  const html = render(model, { commit: check ? undefined : shortCommit() });

  if (check) {
    const currentJson = readIfPresent(JSON_PATH);
    if (currentJson !== json) {
      console.error(
        'docs/mcp/api-reference.json is out of date. Run `make mcp-api-reference` and commit the result.',
      );
      process.exit(1);
    }
    console.log(`MCP API reference is up to date (${model.toolCount} tools).`);
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(JSON_PATH, json);
  writeFileSync(HTML_PATH, html);

  const summary = model.servers
    .map(
      (s) =>
        `  ${s.id.padEnd(26)} ${String(s.toolCount).padStart(3)} tools  [${s.transports.join(', ')}]`,
    )
    .join('\n');
  console.log(
    `Wrote ${model.toolCount} tools across ${model.serverCount} servers:\n${summary}`,
  );
  console.log(`\n  ${JSON_PATH}\n  ${HTML_PATH}`);
}

main();
