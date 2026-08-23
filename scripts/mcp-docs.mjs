#!/usr/bin/env node
/**
 * Fetch a hosted MCP server's own tool reference from its `GET /docs` route.
 *
 * The route is bearer-gated — tool descriptions name internal buckets,
 * workflows, and ticket keys, so the page requires the same Cognito token the
 * tools do, which a browser cannot supply on its own. This mints a short-lived
 * token with scripts/mcp-mint-token.mjs, fetches the page, and saves it locally
 * so it can be opened like any other file.
 *
 * Usage:
 *   node scripts/mcp-docs.mjs <server>     # ci | github | jira | db-admin | rollbar
 *   make mcp-docs SERVER=ci
 *
 * For the offline copy covering every server (hosted and local), open
 * docs/mcp/api-reference.html — no token needed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  mintToken,
  readConfig,
  readEnvValue,
  resolveScope,
} from './mcp-mint-token.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Server key → { the Cognito server name, the env var holding its URL }. */
const SERVERS = {
  ci: { name: 'legacy-sports-ci', urlVar: 'MCP_CI_URL' },
  github: { name: 'legacy-sports-github', urlVar: 'MCP_GITHUB_URL' },
  jira: { name: 'legacy-sports-jira', urlVar: 'MCP_JIRA_URL' },
  'db-admin': { name: 'legacy-sports-db-admin', urlVar: 'MCP_DB_URL' },
  rollbar: { name: 'legacy-sports-rollbar', urlVar: 'MCP_ROLLBAR_URL' },
};

const FETCH_TIMEOUT_MS = 15_000;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

async function main() {
  const key = process.argv[2];
  if (!key || !SERVERS[key]) {
    fail(
      `Usage: node scripts/mcp-docs.mjs <server>\n` +
        `Servers: ${Object.keys(SERVERS).join(', ')}`,
    );
  }

  const { name, urlVar } = SERVERS[key];

  const baseUrl = readEnvValue(urlVar);
  if (!baseUrl) {
    fail(
      `${urlVar} is not set. Run 'node scripts/mcp-auth.mjs' to populate ` +
        `.env.local with the hosted MCP server URLs, then retry.`,
    );
  }

  const { clientId, clientSecret, cognitoDomain } = readConfig();
  if (!clientId || !clientSecret || !cognitoDomain) {
    fail(
      `Missing MCP machine credentials. Run 'node scripts/mcp-auth.mjs' to ` +
        `populate .env.local, then retry.`,
    );
  }

  const token = await mintToken({
    cognitoDomain,
    clientId,
    clientSecret,
    // Single source of truth for the per-server scope.
    scope: resolveScope(name),
  });

  const url = `${baseUrl.replace(/\/$/, '')}/docs`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  const body = await response.text();
  if (!response.ok) {
    fail(`GET ${url} returned ${response.status}:\n${body.slice(0, 500)}`);
  }
  // A valid token that lacks this server's scope comes back as a 200 carrying a
  // JSON-RPC error envelope, not an HTTP error — catch that rather than saving
  // it as if it were the page.
  if (!body.startsWith('<title>')) {
    fail(
      `GET ${url} did not return the docs page. First 500 bytes:\n${body.slice(0, 500)}`,
    );
  }

  const outPath = join(REPO_ROOT, 'scratch', `mcp-docs-${key}.html`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, body);

  process.stdout.write(
    `Fetched ${name} tool reference from ${url}\n  ${outPath}\n`,
  );
}

main().catch((error) => fail(error?.message ?? String(error)));
