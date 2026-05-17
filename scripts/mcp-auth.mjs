#!/usr/bin/env node
/**
 * scripts/mcp-auth.mjs
 *
 * Fetches & refreshes Cognito-issued OIDC ID tokens for the MCP HTTP API
 * Gateway. This is the auth path for developer machines (historically a
 * local SigV4 signing proxy under tools/mcp/signing-proxy filled that role;
 * that package was removed in LS-4472). Cloud agents continue to use
 * Lambda Function URLs + SigV4.
 *
 * Prerequisites:
 *   1. terraform apply in terraform/main (creates the Cognito user pool,
 *      hosted UI domain, and OAuth client; publishes the identifiers to
 *      SSM).
 *   2. Either:
 *      (a) An admin has invited you via the Cognito console (a Cognito
 *          email with a temporary password). You set a real password on
 *          first sign-in via the hosted UI. — or —
 *      (b) An admin has registered an IAM Identity Center SAML application
 *          for the Cognito user pool and set mcp_ic_saml_metadata_url in
 *          terraform/main/infra.auto.tfvars (LS-4473). The hosted UI then
 *          shows a "Sign in with IAM Identity Center" button alongside the
 *          Cognito password form; clicking it bounces through IC and lands
 *          back on the Cognito callback with an idToken issued by Cognito.
 *      Both options coexist during the rollout — the OAuth flow this
 *      script drives is identical either way.
 *
 * Usage:
 *   node scripts/mcp-auth.mjs           # refresh token (or re-auth if expired)
 *   node scripts/mcp-auth.mjs --setup   # first-time setup: full auth flow
 *   node scripts/mcp-auth.mjs --force   # force a fresh auth code flow
 *
 * Writes to .env.local:
 *   MCP_AUTH_CLIENT_ID       — Cognito user pool client ID (from SSM)
 *   MCP_AUTH_COGNITO_DOMAIN  — Cognito hosted UI domain (from SSM)
 *   MCP_AUTH_TOKEN           — Cognito ID token JWT (~8h TTL)
 *   MCP_AUTH_REFRESH_TOKEN   — Cognito refresh token (~30d TTL)
 *   MCP_AUTH_EXPIRES_AT      — Unix epoch when MCP_AUTH_TOKEN expires
 *   MCP_JIRA_URL             — API Gateway invoke URL for legacy-sports-jira
 *   MCP_GITHUB_URL           — API Gateway invoke URL for legacy-sports-github
 *   MCP_CI_URL               — API Gateway invoke URL for legacy-sports-ci
 *
 * Why Cognito (and not IAM Identity Center direct)?
 *   See terraform/main/lambda-mcp-api-gateway.tf header comment. Short
 *   version: IC's idToken `aud` claim is AWS-internal, so API Gateway's
 *   JWT authorizer always rejected it. Cognito issues a proper OIDC
 *   token with a controllable aud.
 */

import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const ENV_LOCAL_PATH = path.join(REPO_ROOT, '.env.local');

// Local LOGGER stub. The project rule (AGENTS.md) is to use LOGGER from
// @legacy-sports/logging, but this is a standalone `.mjs` script run via
// `node scripts/mcp-auth.mjs` ahead of any TS build/codegen — it cannot
// import workspace packages. This stub mirrors the LOGGER.{info,error,warn}
// interface so new diagnostics in this file stay consistent with that rule.
const LOGGER = {
  info: (...args) => process.stdout.write(args.join(' ') + '\n'),
  error: (...args) => process.stderr.write(args.join(' ') + '\n'),
  warn: (...args) => process.stderr.write(args.join(' ') + '\n'),
};

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

// ── AWS CLI helpers (used only for SSM reads) ─────────────────────────────────

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

// ── PKCE helpers ──────────────────────────────────────────────────────────────

// Fixed redirect port — must match the callback_urls configured on the
// Cognito user pool client in terraform/main/lambda-mcp-api-gateway.tf.
const REDIRECT_PORT = 57329;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}`;

function generateCodeVerifier() {
  return randomBytes(48).toString('base64url');
}

function generateCodeChallenge(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}

// ── Cognito OAuth flow ────────────────────────────────────────────────────────
//
// Cognito's hosted UI exposes standard OIDC endpoints at <domain>/oauth2/*.
// Public clients (no secret) authenticate via PKCE. Token requests are plain
// HTTPS form-encoded POSTs — no AWS SigV4 needed.

async function authCodeFlow(cognitoDomain, clientId) {
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const state = randomBytes(16).toString('hex');

  let resolveCode, rejectCode;
  const codePromise = new Promise((res, rej) => {
    resolveCode = res;
    rejectCode = rej;
  });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, REDIRECT_URI);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');
    const returnedState = url.searchParams.get('state');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      '<html><body style="font-family:sans-serif;padding:2rem">' +
        '<h2>Authorization complete</h2>' +
        '<p>You may close this tab and return to the terminal.</p>' +
        '</body></html>',
    );
    server.close();
    if (returnedState !== state) {
      rejectCode(
        new Error(
          `OAuth state mismatch — possible CSRF; expected ${state}, got ${returnedState}`,
        ),
      );
    } else if (code) {
      resolveCode(code);
    } else {
      rejectCode(
        new Error(
          errorDescription ?? error ?? 'No authorization code in callback',
        ),
      );
    }
  });

  await new Promise((res, rej) => {
    server.listen(REDIRECT_PORT, '127.0.0.1', res);
    server.on('error', rej);
  });

  const authUrl =
    `${cognitoDomain}/oauth2/authorize` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=openid` +
    `&code_challenge=${challenge}` +
    `&code_challenge_method=S256` +
    `&state=${state}`;

  LOGGER.info(`\nOpening browser for authorization:\n  ${authUrl}\n`);
  // On Windows, `start` invoked via cmd has a long-standing quoting trap:
  // cmd treats `&` as a command separator, so a bare authorize URL gets
  // truncated after the first `&` and the browser lands on
  // /error?error=Required+parameters+missing. Node's default arg-escape
  // function does NOT add quotes for `&` either, so passing the URL as a
  // separate argv element isn't enough — cmd still sees it bare.
  //
  // The reliable fix is to use windowsVerbatimArguments:true and wrap the
  // URL ourselves in double quotes so cmd treats it as a single token.
  // Pre-escape any literal double-quotes in the URL (none normally appear
  // in OAuth URLs, but be defensive).
  if (process.platform === 'win32') {
    const quoted = `"${authUrl.replace(/"/g, '\\"')}"`;
    spawnSync('cmd', ['/c', `start "" ${quoted}`], {
      stdio: 'ignore',
      windowsVerbatimArguments: true,
    });
  } else {
    const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
    spawnSync(opener, [authUrl], { stdio: 'ignore' });
  }
  LOGGER.info('Waiting for authorization…');

  const code = await codePromise;

  LOGGER.info('Authorized — exchanging code for tokens…');
  return exchangeCodeForTokens(cognitoDomain, clientId, code, verifier);
}

async function exchangeCodeForTokens(cognitoDomain, clientId, code, verifier) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });

  const res = await fetch(`${cognitoDomain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Cognito /oauth2/token failed (HTTP ${res.status}): ${text}`,
    );
  }
  return JSON.parse(text);
}

async function refreshTokenViaCognito(cognitoDomain, clientId, refreshTok) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshTok,
  });

  const res = await fetch(`${cognitoDomain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Cognito /oauth2/token (refresh) failed (HTTP ${res.status}): ${text}`,
    );
  }
  return JSON.parse(text);
}

// ── SSM — read Cognito identifiers + API URLs written by Terraform ───────────

function readSsmParameter(paramName) {
  try {
    const result = aws('ssm', 'get-parameter', ['--name', paramName]);
    return result['Parameter']['Value'];
  } catch {
    return null;
  }
}

function readApiUrlFromSsm(name, env) {
  return readSsmParameter(`/legacy-sports-${env}/mcp/${name}/api-url`);
}

function readCognitoConfig(env) {
  return {
    clientId: readSsmParameter(`/legacy-sports-${env}/mcp/cognito/client-id`),
    domain: readSsmParameter(`/legacy-sports-${env}/mcp/cognito/domain`),
  };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function printDivider() {
  LOGGER.info('─'.repeat(60));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const env = readEnvLocal();

  // Terraform environment (default dev; override via MCP_TF_ENV or --env flag)
  const tfEnvArg = args.find((a, i) => args[i - 1] === '--env');
  const tfEnv = tfEnvArg ?? process.env['MCP_TF_ENV'] ?? 'dev';

  // ── Step 1: resolve Cognito client id + hosted UI domain from SSM ────────
  let clientId = env['MCP_AUTH_CLIENT_ID'];
  let cognitoDomain = env['MCP_AUTH_COGNITO_DOMAIN'];
  if (!clientId || !cognitoDomain || SETUP_MODE) {
    LOGGER.info('Reading Cognito config from SSM…');
    const cfg = readCognitoConfig(tfEnv);
    if (!cfg.clientId || !cfg.domain) {
      LOGGER.error(
        'Could not read Cognito config from SSM',
        new Error(
          `Expected /legacy-sports-${tfEnv}/mcp/cognito/client-id and /legacy-sports-${tfEnv}/mcp/cognito/domain — run terraform apply in terraform/main first`,
        ),
      );
      process.exit(1);
    }
    clientId = cfg.clientId;
    cognitoDomain = cfg.domain;
    writeEnvLocal({
      MCP_AUTH_CLIENT_ID: clientId,
      MCP_AUTH_COGNITO_DOMAIN: cognitoDomain,
    });
    LOGGER.info(`Client ID:      ${clientId}`);
    LOGGER.info(`Cognito domain: ${cognitoDomain}`);
  }

  // ── Step 2: get / refresh token ──────────────────────────────────────────
  let tokenData = null;
  const existingToken = env['MCP_AUTH_TOKEN'];
  const existingRefresh = env['MCP_AUTH_REFRESH_TOKEN'];
  const secsLeft = existingToken ? tokenExpiresInSeconds(existingToken) : -1;

  if (!FORCE_MODE && existingToken && secsLeft > 300 && existingRefresh) {
    const mins = Math.floor(secsLeft / 60);
    LOGGER.info(`Token is valid for ${mins} more minutes. No refresh needed.`);
    LOGGER.info('Use --force to obtain a new token anyway.');
  } else if (!FORCE_MODE && existingRefresh) {
    LOGGER.info('Refreshing token…');
    try {
      tokenData = await refreshTokenViaCognito(
        cognitoDomain,
        clientId,
        existingRefresh,
      );
      LOGGER.info('Token refreshed.');
    } catch (err) {
      LOGGER.warn(
        `Refresh failed — falling back to authorization code flow`,
        err,
      );
      tokenData = await authCodeFlow(cognitoDomain, clientId);
    }
  } else {
    tokenData = await authCodeFlow(cognitoDomain, clientId);
  }

  if (tokenData) {
    // Cognito's OAuth /oauth2/token returns snake_case: id_token,
    // refresh_token, access_token, expires_in, token_type.
    const idToken = tokenData['id_token'];
    if (!idToken) {
      LOGGER.error(
        'Cognito token response did not include an id_token',
        new Error(
          `Verify the user pool client has 'openid' in allowed_oauth_scopes. Response keys: ${Object.keys(tokenData).join(', ') || '<none>'}`,
        ),
      );
      process.exit(1);
    }

    const payload = decodeJwtPayload(idToken);
    writeEnvLocal({
      MCP_AUTH_TOKEN: idToken,
      // Cognito's refresh-token grant doesn't return a new refresh_token —
      // re-use the existing one, only overwriting if Cognito gave us a
      // fresh one (it does on the initial auth-code exchange).
      MCP_AUTH_REFRESH_TOKEN:
        tokenData['refresh_token'] ?? existingRefresh ?? '',
      MCP_AUTH_EXPIRES_AT: String(payload['exp'] ?? ''),
    });

    const expiresIn = Math.floor((payload['exp'] - Date.now() / 1000) / 60);
    LOGGER.info(
      `Token written to .env.local (expires in ${expiresIn} minutes).`,
    );
  }

  // ── Step 3: populate MCP_*_URL from SSM ──────────────────────────────────
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
        LOGGER.info(`${envKey}=${url}`);
      } else {
        LOGGER.warn(
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
    LOGGER.info(
      'Once Terraform has applied, re-run this script to populate the missing URLs.',
    );
  }

  // ── Step 4: post-write self-check ─────────────────────────────────────────
  const REQUIRED_VARS = [
    'MCP_AUTH_TOKEN',
    'MCP_JIRA_URL',
    'MCP_GITHUB_URL',
    'MCP_CI_URL',
  ];
  const finalEnv = readEnvLocal();
  const missing = REQUIRED_VARS.filter((k) => !finalEnv[k]);

  if (missing.length > 0) {
    printDivider();
    const hints = [
      `MCP servers will fail to connect until these are set.`,
      ...(missing.some((k) => k.endsWith('_URL'))
        ? [
            `For MCP_*_URL: run terraform apply in terraform/main for env "${tfEnv}" so SSM params exist.`,
          ]
        : []),
      ...(missing.includes('MCP_AUTH_TOKEN')
        ? [
            'For MCP_AUTH_TOKEN: re-run with --force to redo the authorization flow.',
          ]
        : []),
    ].join(' ');
    LOGGER.error(
      `.env.local is missing required MCP var(s) after auth: ${missing.join(', ')}`,
      new Error(hints),
    );
    process.exit(1);
  }

  printDivider();
  LOGGER.info(
    `.env.local has MCP_AUTH_TOKEN + MCP_JIRA_URL + MCP_GITHUB_URL + MCP_CI_URL.`,
  );
  LOGGER.info('Done. Restart Claude Code for the new tokens to take effect.');
}

main().catch((err) => {
  LOGGER.error(
    'mcp-auth failed',
    err instanceof Error ? err : new Error(String(err)),
  );
  process.exit(1);
});
