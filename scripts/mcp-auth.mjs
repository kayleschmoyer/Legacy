#!/usr/bin/env node
/**
 * scripts/mcp-auth.mjs
 *
 * Manages IAM Identity Center OIDC tokens for the MCP HTTP API Gateway.
 * Replaces the local signing proxy (tools/mcp/signing-proxy) for developer
 * machines. Cloud agents continue to use Lambda Function URLs + SigV4.
 *
 * Prerequisites: run `terraform apply` in terraform/main first so the Customer
 * managed OIDC application and SSM parameters exist.
 *
 * Usage:
 *   node scripts/mcp-auth.mjs           # refresh token (or re-auth if expired)
 *   node scripts/mcp-auth.mjs --setup   # first-time: configure grants + full auth
 *   node scripts/mcp-auth.mjs --force   # force new auth code flow even if refreshable
 *
 * Writes to .env.local:
 *   MCP_AUTH_CLIENT_ID      — IAM Identity Center application ARN (from SSM)
 *   MCP_AUTH_TOKEN          — ID token JWT (~8h TTL from IAM IC)
 *   MCP_AUTH_REFRESH_TOKEN  — refresh token
 *   MCP_AUTH_EXPIRES_AT     — Unix epoch when MCP_AUTH_TOKEN expires
 *   MCP_JIRA_URL            — API Gateway invoke URL for legacy-sports-jira
 *   MCP_GITHUB_URL          — API Gateway invoke URL for legacy-sports-github
 *   MCP_CI_URL              — API Gateway invoke URL for legacy-sports-ci
 */

import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
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

// ── PKCE helpers ──────────────────────────────────────────────────────────────

// Fixed redirect port — must match the RedirectUris configured on the IAM
// Identity Center application via 'node scripts/mcp-auth.mjs --setup'.
const REDIRECT_PORT = 57329;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}`;

function generateCodeVerifier() {
  return randomBytes(48).toString('base64url');
}

function generateCodeChallenge(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}

// ── Authorization code flow (PKCE) ────────────────────────────────────────────

async function authCodeFlow(appArn, ssoRegion) {
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const state = randomBytes(16).toString('hex');

  // Start local HTTP server before opening the browser so the callback
  // is ready to receive the redirect.
  let resolveCode, rejectCode;
  const codePromise = new Promise((res, rej) => {
    resolveCode = res;
    rejectCode = rej;
  });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, REDIRECT_URI);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
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
      rejectCode(new Error(error ?? 'No authorization code in callback'));
    }
  });

  await new Promise((res, rej) => {
    server.listen(REDIRECT_PORT, '127.0.0.1', res);
    server.on('error', rej);
  });

  const authUrl =
    `https://oidc.${ssoRegion}.amazonaws.com/authorize` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(appArn)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=openid` +
    `&code_challenge=${challenge}` +
    `&code_challenge_method=S256` +
    `&state=${state}`;

  LOGGER.info(`\nOpening browser for authorization:\n  ${authUrl}\n`);
  const opener =
    process.platform === 'win32'
      ? 'start'
      : process.platform === 'darwin'
        ? 'open'
        : 'xdg-open';
  spawnSync(opener, [authUrl], { shell: true, stdio: 'ignore' });
  LOGGER.info('Waiting for authorization…');

  const code = await codePromise;

  LOGGER.info('Authorized — exchanging code for tokens…');
  return aws(
    'sso-oidc',
    'create-token-with-iam',
    [
      '--client-id',
      appArn,
      '--grant-type',
      'authorization_code',
      '--code',
      code,
      '--redirect-uri',
      REDIRECT_URI,
      '--code-verifier',
      verifier,
      '--scope',
      'openid',
    ],
    ssoRegion,
  );
}

// ── Grant configuration (--setup only) ───────────────────────────────────────

function configureAppGrants(appArn, ssoRegion) {
  LOGGER.info(
    'Configuring OAuth grants on the IAM Identity Center application…',
  );

  // authorization_code grant — required for the auth code + PKCE flow
  const authCodeGrant = JSON.stringify({
    AuthorizationCode: { RedirectUris: [REDIRECT_URI] },
  });
  const r1 = spawnSync(
    'aws',
    [
      'sso-admin',
      'put-application-grant',
      '--application-arn',
      appArn,
      '--grant-type',
      'authorization_code',
      '--grant',
      authCodeGrant,
      '--region',
      ssoRegion,
    ],
    { encoding: 'utf8', env: { ...process.env } },
  );
  if (r1.status !== 0)
    throw new Error(`put-application-grant (auth_code) failed:\n${r1.stderr}`);

  // refresh_token grant — allows token refresh without re-authenticating
  const r2 = spawnSync(
    'aws',
    [
      'sso-admin',
      'put-application-grant',
      '--application-arn',
      appArn,
      '--grant-type',
      'refresh_token',
      '--grant',
      '{"RefreshToken":{}}',
      '--region',
      ssoRegion,
    ],
    { encoding: 'utf8', env: { ...process.env } },
  );
  if (r2.status !== 0)
    throw new Error(
      `put-application-grant (refresh_token) failed:\n${r2.stderr}`,
    );

  LOGGER.info('OAuth grants configured.');
}

// ── Token refresh ─────────────────────────────────────────────────────────────

function refreshToken(appArn, refreshTok, ssoRegion) {
  return aws(
    'sso-oidc',
    'create-token-with-iam',
    [
      '--client-id',
      appArn,
      '--grant-type',
      'refresh_token',
      '--refresh-token',
      refreshTok,
      '--scope',
      'openid',
    ],
    ssoRegion,
  );
}

// ── SSM — read API Gateway URLs written by Terraform ─────────────────────────

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

function readAppArnFromSsm(env) {
  return readSsmParameter(`/legacy-sports-${env}/mcp/oidc/app-arn`);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function printDivider() {
  LOGGER.info('─'.repeat(60));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const env = readEnvLocal();

  // Discover SSO config — we need ssoRegion for the OIDC endpoint URL.
  let ssoConfig;
  try {
    ssoConfig = findSsoConfig();
  } catch (err) {
    LOGGER.error('Error discovering SSO config', err);
    process.exit(1);
  }
  const { region: ssoRegion } = ssoConfig;

  // Terraform environment (default dev; override via MCP_TF_ENV or --env flag)
  const tfEnvArg = args.find((a, i) => args[i - 1] === '--env');
  const tfEnv = tfEnvArg ?? process.env['MCP_TF_ENV'] ?? 'dev';

  // ── Step 1: resolve application ARN ──────────────────────────────────────
  // The ARN is the client_id for create-token-with-iam. It comes from the
  // aws_ssoadmin_application Terraform resource, published to SSM.
  let appArn = env['MCP_AUTH_CLIENT_ID'];
  if (!appArn || SETUP_MODE) {
    LOGGER.info('Reading application ARN from SSM…');
    appArn = readAppArnFromSsm(tfEnv);
    if (!appArn) {
      LOGGER.error(
        `Could not read application ARN from SSM`,
        new Error(
          `Expected /legacy-sports-${tfEnv}/mcp/oidc/app-arn — run terraform apply in terraform/main first`,
        ),
      );
      process.exit(1);
    }
    writeEnvLocal({ MCP_AUTH_CLIENT_ID: appArn });
    LOGGER.info(`Application ARN: ${appArn}`);
  }

  // ── Step 2: configure OAuth grants (setup mode only) ─────────────────────
  // Terraform has no aws_ssoadmin_application_grant resource, so grants are
  // configured here via the AWS CLI on first setup.
  if (SETUP_MODE) {
    try {
      configureAppGrants(appArn, ssoRegion);
    } catch (err) {
      LOGGER.error('Failed to configure OAuth grants', err);
      process.exit(1);
    }
  }

  // ── Step 3: get / refresh token ───────────────────────────────────────────
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
      tokenData = refreshToken(appArn, existingRefresh, ssoRegion);
      LOGGER.info('Token refreshed.');
    } catch (err) {
      LOGGER.warn(
        `Refresh failed — falling back to authorization code flow`,
        err,
      );
      tokenData = await authCodeFlow(appArn, ssoRegion);
    }
  } else {
    tokenData = await authCodeFlow(appArn, ssoRegion);
  }

  if (tokenData) {
    const idToken = tokenData['idToken'];
    if (!idToken) {
      LOGGER.error(
        'SSO token response did not include an idToken',
        new Error(
          `IAM Identity Center did not grant the openid scope. Verify aws_ssoadmin_application_access_scope "openid" in Terraform and re-run terraform apply. Response keys: ${Object.keys(tokenData).join(', ') || '<none>'}`,
        ),
      );
      process.exit(1);
    }

    const payload = decodeJwtPayload(idToken);
    writeEnvLocal({
      MCP_AUTH_TOKEN: idToken,
      MCP_AUTH_REFRESH_TOKEN: tokenData['refreshToken'] ?? '',
      MCP_AUTH_EXPIRES_AT: String(payload['exp'] ?? ''),
    });

    const expiresIn = Math.floor((payload['exp'] - Date.now() / 1000) / 60);
    LOGGER.info(
      `Token written to .env.local (expires in ${expiresIn} minutes).`,
    );
  }

  // ── Step 4: populate MCP_*_URL from SSM ──────────────────────────────────
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

  // ── Step 5: post-write self-check ─────────────────────────────────────────
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
