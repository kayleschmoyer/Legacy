#!/usr/bin/env node
/**
 * scripts/mcp-auth.mjs
 *
 * Manages IAM Identity Center OIDC tokens for the MCP HTTP API Gateway.
 * Replaces the local signing proxy (tools/mcp/signing-proxy) for developer
 * machines. Cloud agents continue to use Lambda Function URLs + SigV4.
 *
 * Usage:
 *   node scripts/mcp-auth.mjs           # refresh token (or re-auth if expired)
 *   node scripts/mcp-auth.mjs --setup   # first-time: register client + full auth
 *   node scripts/mcp-auth.mjs --force   # force new device flow even if refreshable
 *
 * After running --setup, add the printed mcp_oidc_issuer_url and
 * mcp_oidc_client_id values to terraform/main/terraform.tfvars, then
 * re-run terraform apply to activate the JWT authorizer.
 *
 * Writes to .env.local:
 *   MCP_AUTH_CLIENT_ID      — OIDC client ID (public, safe to commit if needed)
 *   MCP_AUTH_CLIENT_SECRET  — OIDC client secret
 *   MCP_AUTH_TOKEN          — ID token JWT (~8h TTL from IAM IC)
 *   MCP_AUTH_REFRESH_TOKEN  — refresh token
 *   MCP_AUTH_EXPIRES_AT     — Unix epoch when MCP_AUTH_TOKEN expires
 *   MCP_JIRA_URL            — API Gateway invoke URL for legacy-sports-jira
 *   MCP_GITHUB_URL          — API Gateway invoke URL for legacy-sports-github
 *   MCP_CI_URL              — API Gateway invoke URL for legacy-sports-ci
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const ENV_LOCAL_PATH = path.join(REPO_ROOT, '.env.local');

// ── CLI flags ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const SETUP_MODE = args.includes('--setup');
const FORCE_MODE = args.includes('--force') || SETUP_MODE;
const PROFILE = (() => {
  const i = args.indexOf('--profile');
  return i !== -1
    ? args[i + 1]
    : (process.env['AWS_PROFILE'] ??
        process.env['MCP_AWS_PROFILE'] ??
        undefined);
})();

// ── AWS CLI helpers ───────────────────────────────────────────────────────────

function aws(service, subcommand, extraArgs = [], region) {
  const profileArgs = PROFILE ? ['--profile', PROFILE] : [];
  const regionArgs = region ? ['--region', region] : [];
  const result = spawnSync(
    'aws',
    [
      service,
      subcommand,
      ...extraArgs,
      ...profileArgs,
      ...regionArgs,
      '--output',
      'json',
    ],
    { encoding: 'utf8', env: { ...process.env } },
  );
  if (result.error)
    throw new Error(`Failed to spawn aws: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(
      `aws ${service} ${subcommand} failed (exit ${result.status}):\n${result.stderr}`,
    );
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    return result.stdout.trim();
  }
}

// ── .env.local read/write ────────────────────────────────────────────────────

function readEnvLocal() {
  if (!fs.existsSync(ENV_LOCAL_PATH)) return {};
  const env = {};
  for (const line of fs.readFileSync(ENV_LOCAL_PATH, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function writeEnvLocal(updates) {
  let content = fs.existsSync(ENV_LOCAL_PATH)
    ? fs.readFileSync(ENV_LOCAL_PATH, 'utf8')
    : '';

  for (const [key, value] of Object.entries(updates)) {
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(content)) {
      content = content.replace(re, `${key}=${value}`);
    } else {
      // Append with a trailing newline
      if (content.length > 0 && !content.endsWith('\n')) content += '\n';
      content += `${key}=${value}\n`;
    }
  }

  fs.writeFileSync(ENV_LOCAL_PATH, content);
}

// ── JWT helpers ───────────────────────────────────────────────────────────────

function decodeJwtPayload(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Not a valid JWT');
  // base64url → base64 → JSON
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

function tokenExpiresInSeconds(token) {
  try {
    const { exp } = decodeJwtPayload(token);
    return exp - Math.floor(Date.now() / 1000);
  } catch {
    return -1;
  }
}

// ── SSO config discovery ──────────────────────────────────────────────────────

function findSsoConfig() {
  const configPath = path.join(os.homedir(), '.aws', 'config');
  if (!fs.existsSync(configPath)) {
    throw new Error(
      'AWS config not found at ~/.aws/config. Run "aws configure sso" first.',
    );
  }

  const config = fs.readFileSync(configPath, 'utf8');
  const profiles = {};
  let currentProfile = null;

  for (const raw of config.split('\n')) {
    const line = raw.trim();
    const headerMatch = line.match(/^\[(?:profile\s+)?([^\]]+)\]$/);
    if (headerMatch) {
      currentProfile = headerMatch[1];
      profiles[currentProfile] = {};
    } else if (currentProfile) {
      const kvMatch = line.match(/^([a-z_]+)\s*=\s*(.+)$/);
      if (kvMatch) profiles[currentProfile][kvMatch[1]] = kvMatch[2].trim();
    }
  }

  // Prefer the explicitly requested profile; otherwise find first SSO-enabled one
  const candidates = PROFILE
    ? [profiles[PROFILE]].filter(Boolean)
    : Object.values(profiles).filter((p) => p['sso_start_url']);

  if (candidates.length === 0) {
    const hint = PROFILE
      ? `Profile "${PROFILE}" not found or has no sso_start_url.`
      : 'No profile with sso_start_url found.';
    throw new Error(`${hint} Run "aws configure sso" to set up SSO.`);
  }

  const p = candidates[0];
  if (!p['sso_start_url']) {
    throw new Error(
      `Profile "${PROFILE ?? 'auto-detected'}" has no sso_start_url. Run "aws configure sso".`,
    );
  }

  return {
    startUrl: p['sso_start_url'],
    region: p['sso_session']
      ? getSsoSessionRegion(config, p['sso_session'])
      : (p['sso_region'] ?? p['region'] ?? 'us-east-1'),
  };
}

function getSsoSessionRegion(config, sessionName) {
  const lines = config.split('\n');
  let inSession = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === `[sso-session ${sessionName}]`) {
      inSession = true;
      continue;
    }
    if (inSession && line.startsWith('[')) break;
    if (inSession) {
      const m = line.match(/^sso_region\s*=\s*(.+)$/);
      if (m) return m[1].trim();
    }
  }
  return 'us-east-1';
}

// ── OIDC client registration ──────────────────────────────────────────────────

function registerClient(ssoRegion) {
  console.log('Registering OIDC client with IAM Identity Center…');
  return aws(
    'sso-oidc',
    'register-client',
    [
      '--client-name',
      'mcp-claude-code',
      '--client-type',
      'public',
      '--scopes',
      'sso:account:access openid',
    ],
    ssoRegion,
  );
}

// ── Device authorization flow ─────────────────────────────────────────────────

async function deviceAuthFlow(clientId, clientSecret, startUrl, ssoRegion) {
  console.log('Starting device authorization…');
  const auth = aws(
    'sso-oidc',
    'start-device-authorization',
    [
      '--client-id',
      clientId,
      '--client-secret',
      clientSecret,
      '--start-url',
      startUrl,
    ],
    ssoRegion,
  );

  const verifyUrl = auth['verificationUriComplete'] ?? auth['verificationUri'];
  console.log(
    `\nOpen this URL in your browser to authorize:\n  ${verifyUrl}\n`,
  );

  // Try to open the browser automatically
  const opener =
    process.platform === 'win32'
      ? 'start'
      : process.platform === 'darwin'
        ? 'open'
        : 'xdg-open';
  spawnSync(opener, [verifyUrl], { shell: true, stdio: 'ignore' });

  // Poll until the user authorizes
  const intervalMs = (auth['interval'] ?? 5) * 1000;
  const expiresAt = Date.now() + (auth['expiresIn'] ?? 600) * 1000;
  process.stdout.write('Waiting for authorization');

  while (Date.now() < expiresAt) {
    await sleep(intervalMs);
    process.stdout.write('.');

    try {
      const token = aws(
        'sso-oidc',
        'create-token',
        [
          '--client-id',
          clientId,
          '--client-secret',
          clientSecret,
          '--grant-type',
          'urn:ietf:params:oauth:grant-type:device_code',
          '--device-code',
          auth['deviceCode'],
        ],
        ssoRegion,
      );
      console.log('\nAuthorized.');
      return token;
    } catch (err) {
      if (!err.message.includes('AuthorizationPendingException')) {
        console.log();
        throw err;
      }
      // Still pending — keep polling
    }
  }

  console.log();
  throw new Error(
    'Device authorization timed out. Run the script again to retry.',
  );
}

// ── Token refresh ─────────────────────────────────────────────────────────────

function refreshToken(clientId, clientSecret, refreshTok, ssoRegion) {
  return aws(
    'sso-oidc',
    'create-token',
    [
      '--client-id',
      clientId,
      '--client-secret',
      clientSecret,
      '--grant-type',
      'refresh_token',
      '--refresh-token',
      refreshTok,
    ],
    ssoRegion,
  );
}

// ── SSM — read API Gateway URLs written by Terraform ─────────────────────────

function readApiUrlFromSsm(name, env) {
  const paramName = `/legacy-sports-${env}/mcp/${name}/api-url`;
  try {
    const result = aws('ssm', 'get-parameter', ['--name', paramName]);
    return result['Parameter']['Value'];
  } catch {
    return null;
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printDivider() {
  console.log('─'.repeat(60));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const env = readEnvLocal();

  // Discover SSO config
  let ssoConfig;
  try {
    ssoConfig = findSsoConfig();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
  const { startUrl, region: ssoRegion } = ssoConfig;

  // Determine terraform environment (default dev; override via MCP_TF_ENV or --env flag)
  const tfEnvArg = args.find((a, i) => args[i - 1] === '--env');
  const tfEnv = tfEnvArg ?? process.env['MCP_TF_ENV'] ?? 'dev';

  let clientId = env['MCP_AUTH_CLIENT_ID'];
  let clientSecret = env['MCP_AUTH_CLIENT_SECRET'];
  let tokenData = null;

  // ── Step 1: client registration (setup mode or no client yet) ──────────────
  if (!clientId || !clientSecret || SETUP_MODE) {
    let registration;
    try {
      registration = registerClient(ssoRegion);
    } catch (err) {
      console.error(`Failed to register OIDC client: ${err.message}`);
      process.exit(1);
    }
    clientId = registration['clientId'];
    clientSecret = registration['clientSecret'];
    writeEnvLocal({
      MCP_AUTH_CLIENT_ID: clientId,
      MCP_AUTH_CLIENT_SECRET: clientSecret,
    });
    console.log(`Client registered (clientId: ${clientId})`);
  }

  // ── Step 2: get / refresh token ────────────────────────────────────────────
  const existingToken = env['MCP_AUTH_TOKEN'];
  const existingRefresh = env['MCP_AUTH_REFRESH_TOKEN'];
  const secsLeft = existingToken ? tokenExpiresInSeconds(existingToken) : -1;

  if (!FORCE_MODE && existingToken && secsLeft > 300 && existingRefresh) {
    // Token still fresh enough — nothing to do
    const mins = Math.floor(secsLeft / 60);
    console.log(`Token is valid for ${mins} more minutes. No refresh needed.`);
    console.log('Use --force to obtain a new token anyway.');
  } else if (!FORCE_MODE && existingRefresh) {
    // Try refresh first
    console.log('Refreshing token…');
    try {
      tokenData = refreshToken(
        clientId,
        clientSecret,
        existingRefresh,
        ssoRegion,
      );
      console.log('Token refreshed.');
    } catch (err) {
      console.warn(
        `Refresh failed (${err.message.split('\n')[0]}). Falling back to device flow…`,
      );
      tokenData = await deviceAuthFlow(
        clientId,
        clientSecret,
        startUrl,
        ssoRegion,
      );
    }
  } else {
    // Full device authorization flow
    tokenData = await deviceAuthFlow(
      clientId,
      clientSecret,
      startUrl,
      ssoRegion,
    );
  }

  if (tokenData) {
    const idToken = tokenData['idToken'];
    if (!idToken) {
      console.error(
        'No idToken in response. Ensure the "openid" scope is supported by your IAM Identity Center instance.',
      );
      console.error('Got keys:', Object.keys(tokenData).join(', '));
      process.exit(1);
    }

    const payload = decodeJwtPayload(idToken);
    writeEnvLocal({
      MCP_AUTH_TOKEN: idToken,
      MCP_AUTH_REFRESH_TOKEN: tokenData['refreshToken'] ?? '',
      MCP_AUTH_EXPIRES_AT: String(payload['exp'] ?? ''),
    });

    const expiresIn = Math.floor((payload['exp'] - Date.now() / 1000) / 60);
    console.log(
      `Token written to .env.local (expires in ${expiresIn} minutes).`,
    );

    if (SETUP_MODE) {
      printDivider();
      console.log(
        'SETUP — add these to terraform/main/terraform.tfvars then re-run terraform apply:',
      );
      console.log();
      console.log(`mcp_oidc_issuer_url = "${payload['iss']}"`);
      console.log(`mcp_oidc_client_id  = "${clientId}"`);
      printDivider();
    }
  }

  // ── Step 3: populate MCP_*_URL from SSM ────────────────────────────────────
  const urlUpdates = {};
  let allUrlsFound = true;

  for (const [name, envKey] of [
    ['jira', 'MCP_JIRA_URL'],
    ['github', 'MCP_GITHUB_URL'],
    ['ci', 'MCP_CI_URL'],
  ]) {
    if (!env[envKey] || SETUP_MODE) {
      const url = readApiUrlFromSsm(name, tfEnv);
      if (url) {
        urlUpdates[envKey] = url;
        console.log(`${envKey}=${url}`);
      } else {
        console.warn(
          `${envKey}: SSM parameter not found for env "${tfEnv}". Run terraform apply first, or set ${envKey} manually in .env.local.`,
        );
        allUrlsFound = false;
      }
    }
  }

  if (Object.keys(urlUpdates).length > 0) {
    writeEnvLocal(urlUpdates);
  }

  if (!allUrlsFound && SETUP_MODE) {
    console.log(
      '\nOnce Terraform has applied, re-run this script to populate the missing URLs.',
    );
  }

  printDivider();
  console.log('Done. Restart Claude Code for the new tokens to take effect.');
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
