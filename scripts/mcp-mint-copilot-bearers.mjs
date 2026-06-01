#!/usr/bin/env node
/**
 * scripts/mcp-mint-copilot-bearers.mjs
 *
 * Copilot Coding Agent helper, invoked by
 * .github/workflows/copilot-setup-steps.yml. Mints one short-lived Cognito
 * machine-grant bearer per hosted MCP server scope (mcp/jira, mcp/github,
 * mcp/ci) from the long-lived `client_credentials` secret and appends
 * MCP_{JIRA,GITHUB,CI}_BEARER to $GITHUB_ENV so the Copilot MCP HTTP transports
 * send each one in its `Authorization` header. This is the Copilot half of RFC
 * AC-A6 (docs/rfcs/draft-seamless-mcp-auth.md, Track A); it replaced the retired
 * SigV4/OIDC Function-URL path (AC-A7, GAP-9; LS-5093).
 *
 * Reuses the exact `client_credentials` exchange used by the local Claude Code
 * headersHelper (scripts/mcp-mint-token.mjs, LS-5092) so both environments share
 * one tested code path. The long-lived secret is exchanged with Cognito over TLS
 * only and never reaches the MCP servers; minted tokens are masked in the log
 * (`::add-mask::`) and written only to $GITHUB_ENV, never to stdout.
 *
 * Required env (copilot environment secrets, resolved by mcp-mint-token.mjs):
 *   MCP_MACHINE_CLIENT_ID, MCP_MACHINE_CLIENT_SECRET, MCP_AUTH_COGNITO_DOMAIN
 *
 * Exit codes: 0 on success; non-zero with an actionable message on stderr for a
 * missing secret, a failed Cognito exchange, or an unset GITHUB_ENV.
 */

import fs from 'node:fs';

import { mintToken, readConfig, SERVER_SCOPES } from './mcp-mint-token.mjs';

// stderr/stdout stub mirroring scripts/mcp-mint-token.mjs — AGENTS.md mandates
// LOGGER from @legacy-sports/logging, but this is a standalone .mjs run via bare
// `node` ahead of any TS build and cannot import workspace packages.
const LOGGER = {
  info: (...args) => process.stdout.write(args.join(' ') + '\n'),
  error: (...args) => process.stderr.write(args.join(' ') + '\n'),
};

async function main() {
  const cfg = readConfig();
  const missing = Object.entries({
    MCP_MACHINE_CLIENT_ID: cfg.clientId,
    MCP_MACHINE_CLIENT_SECRET: cfg.clientSecret,
    MCP_AUTH_COGNITO_DOMAIN: cfg.cognitoDomain,
  })
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    LOGGER.error(
      `Cannot mint MCP bearers — missing copilot environment secret(s): ${missing.join(', ')}.`,
    );
    process.exit(1);
  }

  const githubEnvPath = process.env['GITHUB_ENV'];
  if (!githubEnvPath) {
    LOGGER.error(
      'GITHUB_ENV is not set — this script only runs inside copilot-setup-steps.yml. ' +
        'Refusing to write tokens to stdout.',
    );
    process.exit(1);
  }

  const lines = [];
  for (const [serverName, scope] of Object.entries(SERVER_SCOPES)) {
    const token = await mintToken({ ...cfg, scope });
    const key = `MCP_${serverName.replace('legacy-sports-', '').toUpperCase()}_BEARER`;
    // Mask the token so it never appears verbatim in the Actions run log.
    LOGGER.info(`::add-mask::${token}`);
    lines.push(`${key}=${token}`);
  }

  fs.appendFileSync(githubEnvPath, lines.join('\n') + '\n');
  LOGGER.info(`Minted ${lines.length} MCP bearer token(s) → $GITHUB_ENV.`);
}

main().catch((err) => {
  LOGGER.error(
    `mcp-mint-copilot-bearers: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});
