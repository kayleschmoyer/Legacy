#!/usr/bin/env node
/**
 * Generate a short-lived GitHub App installation token from a private key.
 *
 * Uses only Node.js built-ins (`node:crypto`, `node:fs`, global `fetch`) — no external dependencies.
 *
 * Required env vars:
 *   AGENT_AUTHOR_APP_PRIVATE_KEY  — PEM-encoded RSA private key (or path to .pem file)
 *
 * Optional env vars (defaults match the Agent Author app):
 *   GITHUB_APP_ID           — GitHub App ID (default: 3158619)
 *   GITHUB_INSTALLATION_ID  — Installation ID (default: 118260223)
 *
 * Output: prints the installation token to stdout.
 *
 * Usage:
 *   export GH_TOKEN=$(node scripts/generate-github-app-token.mjs)
 */

import { createSign } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

const APP_ID = process.env.GITHUB_APP_ID || '3158619';
const INSTALLATION_ID = process.env.GITHUB_INSTALLATION_ID || '118260223';

/**
 * Resolve the private key from the environment variable.
 * Accepts either the PEM content directly or a file path.
 */
function getPrivateKey() {
  const raw = process.env.AGENT_AUTHOR_APP_PRIVATE_KEY;
  if (!raw) {
    throw new Error(
      'AGENT_AUTHOR_APP_PRIVATE_KEY is not set. ' +
        'Set it in Claude Code cloud environment settings (Settings > Environment).',
    );
  }

  // If it looks like a file path and the file exists, read it
  if (!raw.includes('-----BEGIN') && existsSync(raw)) {
    return readFileSync(raw, 'utf-8');
  }

  // Otherwise treat as PEM content (may need newline restoration)
  // Cloud env vars often store PEMs with literal \n instead of actual newlines
  return raw.replace(/\\n/g, '\n');
}

/**
 * Create a JWT signed with the app's private key.
 * GitHub requires RS256 (RSA + SHA-256) with specific claims.
 */
function createJWT(privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iat: now - 60, // issued 60s ago (clock skew tolerance)
    exp: now + 600, // expires in 10 minutes (GitHub max)
    iss: APP_ID,
  };

  const segments = [
    base64url(JSON.stringify(header)),
    base64url(JSON.stringify(payload)),
  ];
  const signingInput = segments.join('.');

  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(privateKey, 'base64url');

  return `${signingInput}.${signature}`;
}

/** Base64url encode a string (no padding). */
function base64url(str) {
  return Buffer.from(str).toString('base64url');
}

/**
 * Make an HTTPS request and return the parsed JSON response.
 */
async function githubAPI(method, path, token, tokenType = 'Bearer') {
  const url = `https://api.github.com${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `${tokenType} ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(
      `GitHub API ${method} ${path} failed (${res.status}): ${body}`,
    );
  }
  return JSON.parse(body);
}

async function main() {
  const privateKey = getPrivateKey();
  const jwt = createJWT(privateKey);

  // Exchange JWT for an installation access token
  const data = await githubAPI(
    'POST',
    `/app/installations/${INSTALLATION_ID}/access_tokens`,
    jwt,
  );

  if (!data.token) {
    throw new Error(
      `No token in response: ${JSON.stringify(data).slice(0, 200)}`,
    );
  }

  // Print token to stdout (only the token, no extra output)
  process.stdout.write(data.token);
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
