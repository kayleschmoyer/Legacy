#!/usr/bin/env node
/**
 * scripts/mcp-cursor-bearers.mjs
 *
 * Cursor helper: mint the three short-lived hosted-MCP bearer tokens and print
 * shell `export`/`$env:` statements so they can be loaded into the shell that
 * launches Cursor.
 *
 * WHY THIS EXISTS
 * ---------------
 * Claude Code mints these tokens automatically via a per-server `headersHelper`
 * (scripts/mcp-mint-token.mjs) at every (re)connect. Cursor has no headersHelper
 * mechanism — its `.cursor/mcp.json` can only inject a static header value via
 * `${env:VAR}` substitution, which is read from the OS/shell environment that
 * launched Cursor. So for Cursor we mint all three tokens up front and export
 * them as MCP_CI_BEARER / MCP_JIRA_BEARER / MCP_GITHUB_BEARER, which
 * `.cursor/mcp.json` references in each hosted server's Authorization header.
 *
 * The minted tokens are short-lived (Cognito access_token TTL, ~24h). When they
 * expire, re-run this helper and relaunch Cursor (or reload the MCP servers).
 * This is the documented trade-off vs. Claude Code's auto-refresh; see
 * docs/dev-process/cursor-setup.md and the human-review note on LS-7802.
 *
 * USAGE
 * -----
 *   PowerShell (Windows, default on win32):
 *     node scripts/mcp-cursor-bearers.mjs | Invoke-Expression
 *   bash/zsh (macOS/Linux, default elsewhere):
 *     eval "$(node scripts/mcp-cursor-bearers.mjs --bash)"
 *
 * Force a flavor with --powershell or --bash. With no eval/Invoke-Expression the
 * statements are simply printed so you can inspect or copy them.
 *
 * Requires the same machine credential as scripts/mcp-mint-token.mjs:
 *   MCP_MACHINE_CLIENT_ID, MCP_MACHINE_CLIENT_SECRET, MCP_AUTH_COGNITO_DOMAIN
 * (in your OS keychain export wrapper or .env.local). Tokens are printed to
 * stdout as export statements; the long-lived secret is never printed.
 */

import { SERVER_SCOPES, readConfig, mintToken } from './mcp-mint-token.mjs';

// Cursor env var name per hosted server (matches .cursor/mcp.json headers).
const BEARER_ENV = Object.freeze({
  'legacy-sports-ci': 'MCP_CI_BEARER',
  'legacy-sports-jira': 'MCP_JIRA_BEARER',
  'legacy-sports-github': 'MCP_GITHUB_BEARER',
});

function pickFlavor(argv) {
  if (argv.includes('--bash')) return 'bash';
  if (argv.includes('--powershell')) return 'powershell';
  return process.platform === 'win32' ? 'powershell' : 'bash';
}

function formatExport(flavor, name, value) {
  // Tokens are opaque JWT-ish strings (no shell metacharacters), but quote
  // defensively so a stray '=' or '/' never breaks the statement.
  return flavor === 'powershell'
    ? `$env:${name} = "${value}"`
    : `export ${name}="${value}"`;
}

async function main() {
  const flavor = pickFlavor(process.argv.slice(2));
  const config = readConfig();
  const missing = [];
  if (!config.clientId) missing.push('MCP_MACHINE_CLIENT_ID');
  if (!config.clientSecret) missing.push('MCP_MACHINE_CLIENT_SECRET');
  if (!config.cognitoDomain) missing.push('MCP_AUTH_COGNITO_DOMAIN');
  if (missing.length > 0) {
    process.stderr.write(
      `mcp-cursor-bearers: missing machine credential(s): ${missing.join(', ')}.\n` +
        `Store them in your OS keychain export wrapper or .env.local, then run ` +
        `'node scripts/mcp-auth.mjs' to populate MCP_AUTH_COGNITO_DOMAIN. ` +
        `See docs/dev-process/cursor-setup.md.\n`,
    );
    process.exit(1);
  }

  const lines = [];
  for (const [serverName, scope] of Object.entries(SERVER_SCOPES)) {
    const envName = BEARER_ENV[serverName];
    if (!envName) continue;
    const token = await mintToken({
      cognitoDomain: config.cognitoDomain,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      scope,
    });
    lines.push(formatExport(flavor, envName, token));
  }
  // stdout is reserved for the export statements so the output can be piped into
  // Invoke-Expression / eval. Diagnostics go to stderr only.
  process.stdout.write(lines.join('\n') + '\n');
}

main().catch((err) => {
  process.stderr.write(
    `mcp-cursor-bearers: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
