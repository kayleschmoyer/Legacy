import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getRepoRoot, runCommand } from '../run-command.js';
import type { ToolResult } from '../types.js';

// ── .env.local helpers ────────────────────────────────────────────────────────

function readEnvLocal(repoRoot: string): Record<string, string> {
  const envPath = path.join(repoRoot, '.env.local');
  if (!fs.existsSync(envPath)) return {};
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function writeEnvLocal(
  repoRoot: string,
  updates: Record<string, string>,
): void {
  const envPath = path.join(repoRoot, '.env.local');
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  for (const [key, value] of Object.entries(updates)) {
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(content)) {
      content = content.replace(re, `${key}=${value}`);
    } else {
      if (content.length > 0 && !content.endsWith('\n')) content += '\n';
      content += `${key}=${value}\n`;
    }
  }
  fs.writeFileSync(envPath, content);
}

// ── JWT helpers ───────────────────────────────────────────────────────────────

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Not a valid JWT');
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<
    string,
    unknown
  >;
}

function tokenSecondsRemaining(token: string): number {
  try {
    const payload = decodeJwtPayload(token);
    const exp = payload['exp'];
    if (typeof exp !== 'number') return -1;
    return exp - Math.floor(Date.now() / 1000);
  } catch {
    return -1;
  }
}

// ── SSO region discovery ──────────────────────────────────────────────────────

function discoverSsoRegion(): string {
  const configPath = path.join(os.homedir(), '.aws', 'config');
  if (!fs.existsSync(configPath)) return 'us-east-1';

  const config = fs.readFileSync(configPath, 'utf8');

  // Check sso-session blocks first (newer config format)
  const ssoSessionMatch = config.match(
    /\[sso-session [^\]]+\][^[]*sso_region\s*=\s*([^\s]+)/,
  );
  if (ssoSessionMatch) return ssoSessionMatch[1];

  // Fall back to any profile with sso_region
  const profileMatch = config.match(/sso_region\s*=\s*([^\s]+)/);
  if (profileMatch) return profileMatch[1];

  return (
    process.env['AWS_DEFAULT_REGION'] ??
    process.env['AWS_REGION'] ??
    'us-east-1'
  );
}

// ── Tool ─────────────────────────────────────────────────────────────────────

export async function mcpAuthRefresh(): Promise<ToolResult> {
  const repoRoot = getRepoRoot();

  // ── Gate: AWS SSO must be authenticated ────────────────────────────────────
  try {
    await runCommand(
      'aws',
      ['sts', 'get-caller-identity', '--output', 'json'],
      repoRoot,
    );
  } catch {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error:
              'AWS SSO session is not active. Run `aws sso login` first, then retry.',
            remedy: 'aws sso login',
          }),
        },
      ],
      isError: true,
    };
  }

  // ── Read stored OIDC credentials from .env.local ───────────────────────────
  const env = readEnvLocal(repoRoot);
  const clientId = env['MCP_AUTH_CLIENT_ID'];
  const clientSecret = env['MCP_AUTH_CLIENT_SECRET'];
  const refreshToken = env['MCP_AUTH_REFRESH_TOKEN'];
  const currentToken = env['MCP_AUTH_TOKEN'];

  if (!clientId || !clientSecret) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error:
              'MCP_AUTH_CLIENT_ID / MCP_AUTH_CLIENT_SECRET not found in .env.local.',
            remedy:
              'Run `node scripts/mcp-auth.mjs --setup` to complete first-time setup.',
          }),
        },
      ],
      isError: true,
    };
  }

  // ── Short-circuit if token is still fresh (> 15 min remaining) ────────────
  if (currentToken) {
    const secsLeft = tokenSecondsRemaining(currentToken);
    if (secsLeft > 900) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: true,
              refreshed: false,
              message: `Token is still valid (${Math.floor(secsLeft / 60)} minutes remaining). No refresh needed.`,
              expiresInMinutes: Math.floor(secsLeft / 60),
            }),
          },
        ],
      };
    }
  }

  if (!refreshToken) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: 'MCP_AUTH_REFRESH_TOKEN not found in .env.local.',
            remedy:
              'Run `node scripts/mcp-auth.mjs` to perform a new device-flow authorization.',
          }),
        },
      ],
      isError: true,
    };
  }

  // ── Attempt token refresh via sso-oidc ────────────────────────────────────
  const ssoRegion = discoverSsoRegion();

  let tokenData: Record<string, unknown>;
  try {
    const output = await runCommand(
      'aws',
      [
        'sso-oidc',
        'create-token',
        '--client-id',
        clientId,
        '--client-secret',
        clientSecret,
        '--grant-type',
        'refresh_token',
        '--refresh-token',
        refreshToken,
        '--region',
        ssoRegion,
        '--output',
        'json',
      ],
      repoRoot,
    );
    tokenData = JSON.parse(output) as Record<string, unknown>;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isExpired = /invalid_grant|expired|not_authorized/i.test(message);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: isExpired
              ? 'Refresh token has expired. A new device-flow authorization is required.'
              : `sso-oidc create-token failed: ${message}`,
            remedy:
              'Run `node scripts/mcp-auth.mjs` to re-authorize via device flow.',
          }),
        },
      ],
      isError: true,
    };
  }

  const idToken = tokenData['idToken'];
  if (typeof idToken !== 'string') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error:
              'No idToken in sso-oidc response. Ensure the "openid" scope is enabled on your IAM Identity Center OIDC client.',
            remedy:
              'Run `node scripts/mcp-auth.mjs --setup` to re-register the client with the openid scope.',
          }),
        },
      ],
      isError: true,
    };
  }

  // ── Write new token to .env.local ─────────────────────────────────────────
  let payload: Record<string, unknown>;
  try {
    payload = decodeJwtPayload(idToken);
  } catch (err) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: `Failed to decode idToken JWT: ${err instanceof Error ? err.message : String(err)}`,
          }),
        },
      ],
      isError: true,
    };
  }

  const updates: Record<string, string> = {
    MCP_AUTH_TOKEN: idToken,
    MCP_AUTH_EXPIRES_AT: String(payload['exp'] ?? ''),
  };
  if (
    typeof tokenData['refreshToken'] === 'string' &&
    tokenData['refreshToken']
  ) {
    updates['MCP_AUTH_REFRESH_TOKEN'] = tokenData['refreshToken'];
  }
  writeEnvLocal(repoRoot, updates);

  const exp = typeof payload['exp'] === 'number' ? payload['exp'] : 0;
  const expiresInMinutes = Math.floor((exp - Date.now() / 1000) / 60);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ok: true,
          refreshed: true,
          expiresInMinutes,
          note: 'Token written to .env.local. Restart Claude Code for the new token to take effect.',
        }),
      },
    ],
  };
}
