#!/usr/bin/env node
/**
 * scripts/mcp-mint-token.mjs
 *
 * Claude Code `headersHelper` for the three hosted MCP servers
 * (legacy-sports-{github,jira,ci}). Claude Code invokes this command at every
 * (re)connect, passing the server name/URL in the environment; the command
 * mints a SHORT-LIVED bearer token locally and prints the resulting
 * `Authorization` header as JSON to stdout. It runs and exits — there is no
 * daemon and no resident process (RFC G5 / AC-G2).
 *
 * This is "Track A — local minting + server-side validation" from
 * docs/rfcs/draft-seamless-mcp-auth.md (GAP-8, AC-A2/A3/A5):
 *
 *   - The LONG-LIVED machine secret (Cognito confidential client secret) is
 *     read from secure local storage and is exchanged with Cognito's token
 *     endpoint for a short-lived access token. The secret is NEVER printed and
 *     NEVER sent to the MCP servers on the wire — only the short-lived token
 *     reaches them (the secret only ever transits TLS to Cognito itself, which
 *     is unavoidable for the `client_credentials` grant). See AC-A4.
 *   - Minting requests ONLY the single scope the calling server needs
 *     (`mcp/jira` | `mcp/github` | `mcp/ci`), so a leaked minted token is
 *     contained to one server and revoking one scope denies just that server
 *     (least privilege, AC-A5 / OQ-4).
 *
 * Contract with the provisioning ticket (LS-5090, not yet merged):
 *   A Cognito resource server exposes the per-server scopes below, and a
 *   confidential app client (`generate_secret = true`,
 *   `allowed_oauth_flows = ["client_credentials"]`) is provisioned. Its
 *   id/secret are published to SSM/Secrets Manager and land in local secure
 *   storage under these keys. This command depends only on that documented
 *   contract; until LS-5090 lands, tests mock the token endpoint.
 *
 * Secure local storage (resolution order, first non-empty wins):
 *   1. process.env  — covers an OS-keychain export wrapper (local) and the
 *      environment secret on Copilot Coding Agent (same shape both places,
 *      RFC G2). Also how Claude Code's merged settings#/env reach the helper.
 *   2. .env.local   — the gitignored local store written by mcp-auth.mjs;
 *      holds MCP_AUTH_COGNITO_DOMAIN already. Path overridable via
 *      MCP_MINT_ENV_FILE (used by the unit tests for hermeticity).
 *
 * Required config:
 *   MCP_MACHINE_CLIENT_ID      — Cognito confidential client id    (LS-5090)
 *   MCP_MACHINE_CLIENT_SECRET  — Cognito confidential client secret (LS-5090; long-lived machine secret)
 *   MCP_AUTH_COGNITO_DOMAIN    — Cognito hosted-UI domain (token endpoint base; written by mcp-auth.mjs)
 *
 * Invoked by Claude Code with:
 *   CLAUDE_CODE_MCP_SERVER_NAME — e.g. "legacy-sports-jira"
 *   CLAUDE_CODE_MCP_SERVER_URL  — the server's URL (unused; name drives scope)
 *
 * Output (stdout, the ONLY thing written there on success):
 *   {"Authorization":"Bearer <short-lived access token>"}
 *
 * Exit codes: 0 on success; non-zero with an actionable message on stderr for
 * a missing/unknown server name, missing secret, or a failed Cognito exchange.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const ENV_LOCAL_PATH = process.env['MCP_MINT_ENV_FILE']
  ? path.resolve(process.env['MCP_MINT_ENV_FILE'])
  : path.join(REPO_ROOT, '.env.local');

// How long to wait for Cognito before giving up. Claude Code applies a 10s
// hard timeout to the helper, so fail with a clear message a touch sooner.
const COGNITO_TIMEOUT_MS = 8000;

// Per-server scopes (RFC OQ-4 / AC-A1). Each Lambda accepts ONLY its own
// scope, so a token minted for one server is useless against the others.
export const SERVER_SCOPES = Object.freeze({
  'legacy-sports-jira': 'mcp/jira',
  'legacy-sports-github': 'mcp/github',
  'legacy-sports-ci': 'mcp/ci',
});

// stderr-only diagnostics. stdout is reserved exclusively for the header JSON,
// so anything Claude Code parses stays clean. (AGENTS.md mandates LOGGER from
// @legacy-sports/logging, but this is a standalone .mjs run via bare `node`
// ahead of any TS build — it cannot import workspace packages. Mirrors the
// same stub used by scripts/mcp-auth.mjs.)
const LOGGER = {
  error: (...args) => process.stderr.write(args.join(' ') + '\n'),
  warn: (...args) => process.stderr.write(args.join(' ') + '\n'),
};

/** Thrown for an expected failure — message is actionable, secret-free. */
class MintError extends Error {}

// ── .env.local read (mirrors scripts/mcp-auth.mjs) ──────────────────────────

function readEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

/**
 * Resolve config from process.env first (keychain/Copilot/settings env), then
 * .env.local. Empty strings are treated as absent so a blank var falls through.
 */
export function readConfig() {
  const fileEnv = readEnvFile(ENV_LOCAL_PATH);
  const get = (key) => {
    const fromProc = process.env[key];
    if (fromProc !== undefined && fromProc !== '') return fromProc;
    const fromFile = fileEnv[key];
    return fromFile !== undefined && fromFile !== '' ? fromFile : undefined;
  };
  return {
    clientId: get('MCP_MACHINE_CLIENT_ID'),
    clientSecret: get('MCP_MACHINE_CLIENT_SECRET'),
    cognitoDomain: get('MCP_AUTH_COGNITO_DOMAIN'),
  };
}

/** Map a Claude Code MCP server name to its Cognito scope. */
export function resolveScope(serverName) {
  if (!serverName) {
    throw new MintError(
      'CLAUDE_CODE_MCP_SERVER_NAME is not set. This command is a Claude Code ' +
        'headersHelper and must be invoked by Claude Code, not run directly.',
    );
  }
  const scope = SERVER_SCOPES[serverName];
  if (!scope) {
    throw new MintError(
      `No MCP scope is defined for server "${serverName}". Expected one of: ` +
        `${Object.keys(SERVER_SCOPES).join(', ')}.`,
    );
  }
  return scope;
}

/**
 * Exchange the machine client_credentials for a short-lived access token
 * scoped to a single MCP server. The secret is sent only to Cognito over TLS
 * via HTTP Basic auth and never reaches the MCP servers.
 */
export async function mintToken({
  cognitoDomain,
  clientId,
  clientSecret,
  scope,
}) {
  const tokenUrl = `${cognitoDomain.replace(/\/+$/, '')}/oauth2/token`;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COGNITO_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
      },
      body: body.toString(),
      signal: controller.signal,
    });
  } catch (err) {
    const reason =
      err instanceof Error && err.name === 'AbortError'
        ? `timed out after ${COGNITO_TIMEOUT_MS}ms`
        : err instanceof Error
          ? err.message
          : String(err);
    throw new MintError(
      `Could not reach the Cognito token endpoint (${tokenUrl}): ${reason}.`,
    );
  } finally {
    clearTimeout(timer);
  }

  // Cognito error bodies are like {"error":"invalid_client"} — they never echo
  // the secret back, so it is safe to surface the body for diagnosis.
  const text = await res.text();
  if (!res.ok) {
    throw new MintError(
      `Cognito client_credentials exchange failed for scope "${scope}" ` +
        `(HTTP ${res.status}): ${text}`,
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new MintError(
      `Cognito returned a non-JSON token response (HTTP ${res.status}).`,
    );
  }

  const accessToken = parsed['access_token'];
  if (!accessToken) {
    throw new MintError(
      `Cognito token response did not include an access_token ` +
        `(keys: ${Object.keys(parsed).join(', ') || '<none>'}).`,
    );
  }
  return accessToken;
}

export async function main() {
  const scope = resolveScope(process.env['CLAUDE_CODE_MCP_SERVER_NAME']);

  const { clientId, clientSecret, cognitoDomain } = readConfig();
  const missing = [];
  if (!clientId) missing.push('MCP_MACHINE_CLIENT_ID');
  if (!clientSecret) missing.push('MCP_MACHINE_CLIENT_SECRET');
  if (!cognitoDomain) missing.push('MCP_AUTH_COGNITO_DOMAIN');
  if (missing.length > 0) {
    throw new MintError(
      `Missing required MCP machine credential(s): ${missing.join(', ')}. ` +
        `Provision the Cognito client_credentials client (LS-5090) and store ` +
        `MCP_MACHINE_CLIENT_ID / MCP_MACHINE_CLIENT_SECRET in your OS keychain ` +
        `or ${ENV_LOCAL_PATH}; run 'node scripts/mcp-auth.mjs' to populate ` +
        `MCP_AUTH_COGNITO_DOMAIN. The secret is never printed.`,
    );
  }

  const token = await mintToken({
    cognitoDomain,
    clientId,
    clientSecret,
    scope,
  });
  // The ONLY thing written to stdout — Claude Code parses this as the headers.
  process.stdout.write(
    JSON.stringify({ Authorization: `Bearer ${token}` }) + '\n',
  );
}

// Run only when executed directly (not when imported by the unit tests).
const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try {
    return (
      pathToFileURL(fs.realpathSync(process.argv[1])).href ===
      pathToFileURL(fs.realpathSync(fileURLToPath(import.meta.url))).href
    );
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch((err) => {
    if (err instanceof MintError) {
      LOGGER.error(`mcp-mint-token: ${err.message}`);
    } else {
      LOGGER.error(
        `mcp-mint-token: unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    process.exit(1);
  });
}
