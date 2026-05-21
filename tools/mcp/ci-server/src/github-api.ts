import { execFile } from 'node:child_process';
import { createSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readGitRemoteUrl } from './git-config.js';

const GITHUB_API = 'https://api.github.com';
const DEFAULT_APP_ID = '3158619';
const DEFAULT_INSTALLATION_ID = '118260223';

/** Truncate API error bodies and redact potential auth tokens. */
export function sanitizeErrorBody(text: string, maxLen = 500): string {
  let sanitized = text
    .replace(/Bearer\s+[A-Za-z0-9_\-.]+/gi, 'Bearer ***')
    .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, 'Basic ***')
    .replace(/token\s+[A-Za-z0-9_\-.]+/gi, 'token ***')
    .replace(/ghp_[A-Za-z0-9_]+/g, 'ghp_***')
    .replace(/gho_[A-Za-z0-9_]+/g, 'gho_***')
    .replace(/ghs_[A-Za-z0-9_]+/g, 'ghs_***')
    .replace(/ghu_[A-Za-z0-9_]+/g, 'ghu_***')
    .replace(/github_pat_[A-Za-z0-9_]+/g, 'github_pat_***');
  if (sanitized.length > maxLen) {
    const suffix = '... (truncated)';
    sanitized = sanitized.slice(0, maxLen - suffix.length) + suffix;
  }
  return sanitized;
}

/** Resolve the repository root from this script's location (tools/mcp/ci-server/src/). */
export function getRepoRoot(): string {
  const thisDir = resolve(fileURLToPath(import.meta.url), '..');
  return resolve(thisDir, '..', '..', '..', '..');
}

// ---------------------------------------------------------------------------
// GitHub App token generation (cloud environments)
// ---------------------------------------------------------------------------

/**
 * Resolve the GitHub App private key from the AGENT_AUTHOR_APP_PRIVATE_KEY env var.
 * Accepts PEM content directly or a file path. Returns null if not configured.
 */
function getAppPrivateKey(): string | null {
  const raw = process.env['AGENT_AUTHOR_APP_PRIVATE_KEY'];
  if (!raw) return null;

  // If it looks like a file path and the file exists, read it
  if (!raw.includes('-----BEGIN') && existsSync(raw)) {
    return readFileSync(raw, 'utf-8');
  }

  // Otherwise treat as PEM content (cloud env vars often store PEMs with literal \n)
  return raw.replace(/\\n/g, '\n');
}

/** Base64url encode a string (no padding). */
function base64url(str: string): string {
  return Buffer.from(str).toString('base64url');
}

/** Create a JWT signed with the GitHub App's private key (RS256). */
function createAppJWT(privateKey: string, appId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iat: now - 60, // clock skew tolerance
    exp: now + 600, // 10 minutes (GitHub max)
    iss: appId,
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

/**
 * Generate a short-lived GitHub App installation token from AGENT_AUTHOR_APP_PRIVATE_KEY.
 * Returns the token and its expiry time, or null if the env var is not set.
 */
async function generateGitHubAppToken(): Promise<{
  token: string;
  expiresAt: Date;
} | null> {
  const privateKey = getAppPrivateKey();
  if (!privateKey) return null;

  // Trim env values; cloud secrets managers often append newlines/whitespace
  // that silently invalidate the JWT `iss` claim or the installation path.
  const appId = process.env['GITHUB_APP_ID']?.trim() || DEFAULT_APP_ID;
  const installationId =
    process.env['GITHUB_INSTALLATION_ID']?.trim() || DEFAULT_INSTALLATION_ID;

  const jwt = createAppJWT(privateKey, appId);

  const res = await fetch(
    `${GITHUB_API}/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'legacy-sports-ci-server',
      },
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `GitHub App token exchange failed (${res.status}): ${sanitizeErrorBody(body)}`,
    );
  }

  const data = (await res.json()) as { token?: string; expires_at?: string };
  if (!data.token) {
    throw new Error(
      `No token in GitHub App response: ${JSON.stringify(data).slice(0, 200)}`,
    );
  }

  const expiresAt = data.expires_at
    ? new Date(data.expires_at)
    : new Date(Date.now() + 60 * 60 * 1000);

  return { token: data.token, expiresAt };
}

// ---------------------------------------------------------------------------
// Token resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the GitHub token, returning the token and its expiry if known.
 *
 * Precedence when multiple env vars are set:
 *   1. GH_TOKEN (matches `gh` CLI convention and `github-server/src/auth.ts`)
 *   2. GITHUB_TOKEN
 *   3. GitHub App token from AGENT_AUTHOR_APP_PRIVATE_KEY (cloud sessions)
 *   4. `gh auth token` CLI (local dev fallback)
 *
 * Env values are trimmed; whitespace-only is treated as unset so that empty
 * GITHUB_TOKEN doesn't silently shadow a valid GH_TOKEN (and vice versa).
 */
async function resolveToken(): Promise<{ token: string; expiresAt?: Date }> {
  const envToken =
    process.env.GH_TOKEN?.trim() ||
    process.env.GITHUB_TOKEN?.trim() ||
    undefined;
  if (envToken) return { token: envToken };

  // Try GitHub App token (cloud environments with AGENT_AUTHOR_APP_PRIVATE_KEY)
  try {
    const appResult = await generateGitHubAppToken();
    if (appResult)
      return { token: appResult.token, expiresAt: appResult.expiresAt };
  } catch (err) {
    process.stderr.write(
      `Warning: GitHub App token generation failed: ${err instanceof Error ? err.message : err}. Trying gh CLI.\n`,
    );
  }

  // Fall back to gh CLI token (local dev)
  const token = await new Promise<string>((resolvePromise, reject) => {
    const cmd = process.platform === 'win32' ? 'gh.exe' : 'gh';
    execFile(cmd, ['auth', 'token'], { timeout: 5_000 }, (err, stdout) => {
      if (err) {
        reject(
          new Error(
            'No GITHUB_TOKEN env var and `gh auth token` failed. ' +
              'Set GITHUB_TOKEN or run `gh auth login`.',
          ),
        );
        return;
      }
      resolvePromise(stdout.trim());
    });
  });
  return { token };
}

/** Resolve the GitHub token from env, GitHub App key, or fall back to `gh auth token`. */
export async function getToken(): Promise<string> {
  return (await resolveToken()).token;
}

/** Parse owner/repo from the git remote origin URL. */
async function getRepoSlug(): Promise<string> {
  // Prefer reading `.git/config` directly — avoids `spawn git ENOENT` when
  // the MCP server process is launched without Git on PATH (LS-4599).
  const repoRoot = getRepoRoot();
  let url = readGitRemoteUrl(repoRoot);
  if (!url) {
    url = await new Promise<string>((resolvePromise, reject) => {
      const cmd = process.platform === 'win32' ? 'git.exe' : 'git';
      execFile(
        cmd,
        ['remote', 'get-url', 'origin'],
        { cwd: repoRoot, timeout: 5_000 },
        (err, stdout) => {
          if (err) {
            reject(new Error(`Failed to get git remote URL: ${err.message}`));
            return;
          }
          resolvePromise(stdout.trim());
        },
      );
    });
  }

  // Match github.com HTTPS/SSH formats and local proxy format (/git/owner/repo)
  const match =
    url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/) ??
    url.match(/\/git\/([^/]+\/[^/]+?)(?:\.git)?$/) ??
    [];
  if (!match[1]) {
    throw new Error(`Could not parse owner/repo from remote URL: ${url}`);
  }
  return match[1];
}

// Cache token and slug for the lifetime of the server process (with expiry for App tokens)
let cachedToken: string | undefined;
let cachedTokenExpiry: Date | undefined;
let cachedSlug: string | undefined;

async function ensureAuth(): Promise<{ token: string; slug: string }> {
  const now = new Date();
  if (!cachedToken || (cachedTokenExpiry && cachedTokenExpiry <= now)) {
    cachedToken = undefined;
    cachedTokenExpiry = undefined;
    const result = await resolveToken();
    cachedToken = result.token;
    if (result.expiresAt) {
      // Apply a 5-minute safety buffer before the real expiry so we
      // re-generate before GitHub's 1-hour window closes.
      cachedTokenExpiry = new Date(result.expiresAt.getTime() - 5 * 60 * 1000);
    }
    // Env-var and gh-cli tokens have no known expiry; they last the process lifetime.
  }
  if (!cachedSlug) cachedSlug = await getRepoSlug();
  return { token: cachedToken, slug: cachedSlug };
}

/**
 * Log GitHub rate-limit headers for observability.
 * Writes to stderr to avoid polluting MCP stdout (JSON protocol).
 */
function logRateLimit(res: Response, label: string): void {
  const remaining = res.headers.get('x-ratelimit-remaining');
  const used = res.headers.get('x-ratelimit-used');
  const limit = res.headers.get('x-ratelimit-limit');
  if (remaining !== null) {
    process.stderr.write(
      `[ci-server:rate-limit] ${label} remaining=${remaining}/${limit} used=${used}\n`,
    );
  }
}

export function buildHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'legacy-sports-ci-server',
  };
}

/** Make a GET request to the GitHub REST API, returning parsed JSON. */
export async function githubGet<T>(
  path: string,
  params?: Record<string, string>,
  options?: { signal?: AbortSignal },
): Promise<T> {
  const { token, slug } = await ensureAuth();
  const url = new URL(`${GITHUB_API}/repos/${slug}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    headers: buildHeaders(token),
    signal: options?.signal,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${sanitizeErrorBody(body)}`);
  }

  logRateLimit(res, `GET ${path}`);
  return (await res.json()) as T;
}

/**
 * Make a GET request to the GitHub REST API, returning the response as plain text.
 * Used for endpoints that return raw content (e.g., job logs).
 */
export async function githubGetText(path: string): Promise<string> {
  const { token, slug } = await ensureAuth();
  const url = `${GITHUB_API}/repos/${slug}${path}`;

  const res = await fetch(url, {
    headers: {
      ...buildHeaders(token),
      Accept: 'application/vnd.github+json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${sanitizeErrorBody(body)}`);
  }

  logRateLimit(res, `GET ${path} (text)`);
  return res.text();
}

/**
 * Make a GET request to the GitHub REST API, returning the response as an ArrayBuffer.
 * Used for binary endpoints like Actions log downloads that return ZIP archives.
 * Follows redirects automatically (e.g., 302 from job log endpoints).
 */
export async function githubGetArrayBuffer(path: string): Promise<ArrayBuffer> {
  const { token, slug } = await ensureAuth();
  const url = `${GITHUB_API}/repos/${slug}${path}`;

  const res = await fetch(url, {
    headers: {
      ...buildHeaders(token),
      Accept: 'application/vnd.github+json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${sanitizeErrorBody(body)}`);
  }

  logRateLimit(res, `GET ${path} (arraybuffer)`);
  return res.arrayBuffer();
}

/** Make a PUT request to the GitHub REST API. Used for state-toggling endpoints (e.g. workflow enable/disable). */
export async function githubPut<T>(path: string, body?: unknown): Promise<T> {
  const { token, slug } = await ensureAuth();
  const url = `${GITHUB_API}/repos/${slug}${path}`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      ...buildHeaders(token),
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${sanitizeErrorBody(text)}`);
  }

  logRateLimit(res, `PUT ${path}`);
  // Workflow enable/disable returns 204 No Content
  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}

/** Make a POST request to the GitHub REST API. */
export async function githubPost<T>(path: string, body?: unknown): Promise<T> {
  const { token, slug } = await ensureAuth();
  const url = `${GITHUB_API}/repos/${slug}${path}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...buildHeaders(token),
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${sanitizeErrorBody(text)}`);
  }

  logRateLimit(res, `POST ${path}`);
  // Some POST endpoints return 201 with a body, others return 204 with no body
  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}
