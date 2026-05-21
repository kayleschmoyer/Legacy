import { execFile } from 'node:child_process';
import { createSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { chmod, readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIG_DIR = join(homedir(), '.config', 'legacy-sports-github');
const TOKEN_PATH = join(CONFIG_DIR, 'token.json');

/**
 * GitHub OAuth App client ID (public, safe to commit).
 * Device flow does not require client_secret.
 */
const OAUTH_CLIENT_ID = 'Ov23liYQljVEXzJsFCl5';
const OAUTH_SCOPE = 'repo';

/**
 * GitHub App defaults — Agent Author app.
 * Overridable via GITHUB_APP_ID / GITHUB_INSTALLATION_ID env vars.
 */
const DEFAULT_APP_ID = '3158619';
const DEFAULT_INSTALLATION_ID = '118260223';

/** Buffer before expiry when we regenerate the app token (5 minutes). */
const APP_TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

let cachedToken: string | null = null;
let cachedTokenSource: TokenSource | null = null;
let cachedRepo: { owner: string; name: string } | null = null;

/**
 * True when the server is running inside AWS Lambda (URL-based MCP deployment).
 * Interactive sources (.netrc, gh CLI, OAuth device flow) are never valid in
 * Lambda — there is no user terminal and no shell tools — so we short-circuit
 * those branches to produce an honest error instead of timing out on
 * `https://github.com/login/device/code` (which can 404 from inside Lambda
 * regardless of the underlying app-token failure).
 */
function isLambda(): boolean {
  return !!process.env['AWS_LAMBDA_FUNCTION_NAME'];
}

/** Resolve the repository root from this script's location (tools/mcp/github-server/src/). */
export function getRepoRoot(): string {
  const thisDir = resolve(fileURLToPath(import.meta.url), '..');
  return resolve(thisDir, '..', '..', '..', '..');
}

// ---------------------------------------------------------------------------
// Token resolution
// ---------------------------------------------------------------------------

interface CachedTokenFile {
  token: string;
  createdAt: string;
  /** ISO date string — if set, the token is treated as expired after this time. */
  expiresAt?: string;
}

async function readCachedToken(): Promise<string | null> {
  try {
    const raw = await readFile(TOKEN_PATH, 'utf-8');
    const data = JSON.parse(raw) as CachedTokenFile;
    if (!data.token) return null;

    // Check expiry with buffer — regenerate early to avoid mid-request failures
    if (data.expiresAt) {
      const expiresAt = new Date(data.expiresAt).getTime();
      if (Number.isNaN(expiresAt)) {
        return null;
      }
      if (Date.now() >= expiresAt - APP_TOKEN_EXPIRY_BUFFER_MS) {
        return null;
      }
    }

    return data.token;
  } catch {
    return null;
  }
}

async function writeCachedToken(
  token: string,
  expiresAt?: string,
): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const data: CachedTokenFile = {
    token,
    createdAt: new Date().toISOString(),
    ...(expiresAt ? { expiresAt } : {}),
  };
  await writeFile(TOKEN_PATH, JSON.stringify(data, null, 2), 'utf-8');
  // Restrict file permissions to owner-only (no-op on Windows, but safe to call)
  if (process.platform !== 'win32') {
    await chmod(TOKEN_PATH, 0o600);
  }
}

async function invalidateCachedToken(): Promise<void> {
  cachedToken = null;
  cachedTokenSource = null;
  try {
    const { unlink } = await import('node:fs/promises');
    await unlink(TOKEN_PATH);
  } catch {
    // File may not exist
  }
}

/**
 * Invalidate the in-memory and file-cached token.
 * Called by github-api.ts on 401 before retrying.
 */
export async function invalidateToken(): Promise<void> {
  await invalidateCachedToken();
}

// ---------------------------------------------------------------------------
// .netrc parsing
// ---------------------------------------------------------------------------

/**
 * Read a token for github.com from ~/.netrc (Unix) or ~/_netrc (Windows).
 * Supports both multi-line and single-line machine entries.
 * Returns null if the file doesn't exist or has no github.com entry.
 */
async function readNetrcToken(): Promise<string | null> {
  const candidates =
    process.platform === 'win32'
      ? [join(homedir(), '_netrc'), join(homedir(), '.netrc')]
      : [join(homedir(), '.netrc')];

  for (const netrcPath of candidates) {
    try {
      const content = await readFile(netrcPath, 'utf-8');
      const token = parseNetrcPassword(content, 'github.com');
      if (token) return token;
    } catch {
      // File doesn't exist or isn't readable
    }
  }
  return null;
}

/**
 * Parse a .netrc file and return the password for the given machine.
 * Handles both multi-line and single-line formats.
 */
function parseNetrcPassword(content: string, machine: string): string | null {
  // Tokenize: split on whitespace, ignoring comments.
  // - Ignore full-line comments (optionally indented) starting with '#'.
  // - Strip inline comments beginning with '#'.
  const sanitizedLines = content.split(/\r?\n/).map((line) => {
    const leftTrimmed = line.replace(/^\s+/, '');
    if (!leftTrimmed || leftTrimmed.startsWith('#')) {
      return '';
    }
    const hashIndex = leftTrimmed.indexOf('#');
    const withoutComment =
      hashIndex === -1 ? leftTrimmed : leftTrimmed.slice(0, hashIndex);
    return withoutComment.trimEnd();
  });
  const tokens = sanitizedLines.join(' ').split(/\s+/).filter(Boolean);

  let inMachine = false;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === 'machine' && tokens[i + 1]) {
      inMachine = tokens[i + 1] === machine;
      i++; // skip machine name
      continue;
    }

    if (tokens[i] === 'default') {
      inMachine = false;
      continue;
    }

    if (inMachine && tokens[i] === 'password' && tokens[i + 1]) {
      return tokens[i + 1];
    }
  }
  return null;
}

/**
 * Try `gh auth token` with a 5-second timeout. Returns null on any failure.
 *
 * Exported because some operations (e.g. requesting Copilot as a PR reviewer)
 * require a **user** OAuth token — GitHub App installation tokens (`ghs_*`)
 * are silently ignored by the `requestReviewers` API for Copilot. The `gh` CLI
 * stores the user's OAuth token from `gh auth login`, which is the only token
 * type that works for Copilot review requests.
 */
export function tryGhAuthToken(): Promise<string | null> {
  const cmd = process.platform === 'win32' ? 'gh.exe' : 'gh';
  return new Promise((res) => {
    execFile(
      cmd,
      ['auth', 'token'],
      { timeout: 5_000, shell: false },
      (err, stdout) => {
        if (err || !stdout.trim()) {
          res(null);
        } else {
          res(stdout.trim());
        }
      },
    );
  });
}

// ---------------------------------------------------------------------------
// GitHub App token generation
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

/**
 * Create a JWT signed with the GitHub App's private key.
 * GitHub requires RS256 (RSA + SHA-256).
 */
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
 * Throws on API/signing errors so callers can fall through to other methods.
 */
async function generateGitHubAppToken(): Promise<{
  token: string;
  expiresAt: string;
} | null> {
  const privateKey = getAppPrivateKey();
  if (!privateKey) return null;

  const appId = process.env['GITHUB_APP_ID'] || DEFAULT_APP_ID;
  const installationId =
    process.env['GITHUB_INSTALLATION_ID'] || DEFAULT_INSTALLATION_ID;

  const jwt = createAppJWT(privateKey, appId);

  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `GitHub App token exchange failed (${res.status}): ${body}`,
    );
  }

  const data = (await res.json()) as { token?: string; expires_at?: string };
  if (!data.token) {
    throw new Error(
      `No token in GitHub App response: ${JSON.stringify(data).slice(0, 200)}`,
    );
  }

  // GitHub returns expires_at as ISO 8601 (typically 1 hour from now)
  const expiresAt =
    data.expires_at || new Date(Date.now() + 60 * 60 * 1000).toISOString();

  return { token: data.token, expiresAt };
}

// ---------------------------------------------------------------------------
// Device flow
// ---------------------------------------------------------------------------

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface DeviceTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
}

async function deviceFlow(): Promise<string> {
  // Step 1: Request device code (form-encoded per GitHub OAuth spec)
  const codeRes = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: OAUTH_CLIENT_ID,
      scope: OAUTH_SCOPE,
    }),
  });

  if (!codeRes.ok) {
    const text = await codeRes.text();
    throw new Error(`Device code request failed (${codeRes.status}): ${text}`);
  }

  const codeData = (await codeRes.json()) as DeviceCodeResponse;

  // Print instructions to stderr (visible to user but not captured as tool output)
  process.stderr.write(
    `\nTo authenticate with GitHub, visit ${codeData.verification_uri} and enter code: ${codeData.user_code}\n\n`,
  );

  // Step 2: Poll for token
  let interval = codeData.interval * 1000;
  const deadline = Date.now() + codeData.expires_in * 1000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));

    const tokenRes = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: OAUTH_CLIENT_ID,
          device_code: codeData.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      },
    );

    const tokenData = (await tokenRes.json()) as DeviceTokenResponse;

    if (tokenData.access_token) {
      process.stderr.write('GitHub authentication successful.\n');
      return tokenData.access_token;
    }

    switch (tokenData.error) {
      case 'authorization_pending':
        // Keep polling
        break;
      case 'slow_down':
        interval += 5_000;
        break;
      case 'expired_token':
        throw new Error(
          'Device flow expired. Please re-run and complete authorization within the time limit.',
        );
      case 'access_denied':
        throw new Error('Authorization was denied by the user.');
      default:
        throw new Error(
          `Unexpected device flow error: ${tokenData.error ?? 'unknown'}`,
        );
    }
  }

  throw new Error('Device flow timed out.');
}

// ---------------------------------------------------------------------------
// Token validation
// ---------------------------------------------------------------------------

async function validateToken(token: string): Promise<boolean> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  try {
    // Try GET /user first (works for PATs, OAuth tokens, and gh CLI tokens)
    const res = await fetch('https://api.github.com/user', {
      headers,
      signal: AbortSignal.timeout(5_000),
    });

    if (res.ok) return true;
    if (res.status === 401) return false;

    // Rate limiting — token may still be valid
    if (
      res.status === 429 ||
      (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0')
    ) {
      process.stderr.write(
        'Warning: GitHub API rate-limited during token validation; assuming token is valid.\n',
      );
      return true;
    }

    // Server errors (5xx) — don't invalidate a potentially good token
    if (res.status >= 500) {
      process.stderr.write(
        `Warning: GitHub API returned ${res.status} during token validation; assuming token is valid.\n`,
      );
      return true;
    }

    // 403 without rate-limit: may be a GitHub App installation token (ghs_*).
    // App tokens return 403 for /user because they represent an app, not a user.
    // Fall back to a repo-scoped endpoint that works for both token types.
    if (res.status === 403) {
      try {
        const { owner, name } = await getRepoOwnerName();
        const repoRes = await fetch(
          `https://api.github.com/repos/${owner}/${name}`,
          { headers, signal: AbortSignal.timeout(5_000) },
        );
        if (repoRes.ok) return true;
        if (repoRes.status === 401) return false;

        // Rate limiting on repo endpoint — token may still be valid
        if (
          repoRes.status === 429 ||
          (repoRes.status === 403 &&
            repoRes.headers.get('x-ratelimit-remaining') === '0')
        ) {
          process.stderr.write(
            'Warning: GitHub API rate-limited during repo token validation; assuming token is valid.\n',
          );
          return true;
        }

        // 403/404 means no access to this repo — treat as invalid
        if (repoRes.status === 403 || repoRes.status === 404) return false;

        // Server errors (5xx) — don't invalidate a potentially good token
        if (repoRes.status >= 500) {
          process.stderr.write(
            `Warning: GitHub API returned ${repoRes.status} during repo token validation; assuming token is valid.\n`,
          );
          return true;
        }

        // Any other 4xx — treat as invalid
        return false;
      } catch {
        // Can't determine repo — assume token is valid (don't invalidate on infra issues)
        process.stderr.write(
          'Warning: Could not validate app token against repo endpoint; assuming valid.\n',
        );
        return true;
      }
    }

    return false;
  } catch (err) {
    // Network or timeout errors — don't invalidate token, assume it might be valid
    const reason =
      err instanceof DOMException && err.name === 'TimeoutError'
        ? 'timeout'
        : 'network error';
    process.stderr.write(
      `Warning: ${reason} during token validation; assuming token is valid.\n`,
    );
    return true;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Source of the resolved GitHub token. */
export type TokenSource =
  | 'env'
  | 'github-app'
  | 'cached-file'
  | 'netrc'
  | 'gh-cli'
  | 'device-flow';

/**
 * Non-interactive token resolution — tries all passive sources (env, cached
 * file, GitHub App, .netrc, gh CLI) but does NOT trigger the interactive
 * device flow. Returns the token and its source, or null if no valid token
 * is found.
 *
 * This is used by `github_auth_status` to report auth state. Note: if an expired
 * cached token file is detected, it will be deleted to prevent re-validating the
 * same bad token on subsequent calls. Validated tokens from .netrc or gh CLI are
 * written to the cache file for performance.
 */
export async function tryResolveToken(): Promise<{
  token: string;
  source: TokenSource;
} | null> {
  // Validate in-memory cached token — it may have expired since it was first resolved
  // (e.g. GitHub App tokens expire after 1 hour, PATs can be revoked mid-session).
  // Without this check, an expired in-memory token causes github_auth_status to
  // report configured:false without ever trying downstream sources (LS-1845).
  if (cachedToken && cachedTokenSource) {
    if (await validateToken(cachedToken)) {
      return { token: cachedToken, source: cachedTokenSource };
    }
    process.stderr.write(
      `Warning: Previously cached ${cachedTokenSource} token is no longer valid — re-resolving.\n`,
    );
    cachedToken = null;
    cachedTokenSource = null;
  }

  // 1. Environment variables (skip empty/whitespace — LS-1822)
  const envToken = (
    process.env['GH_TOKEN'] ||
    process.env['GITHUB_TOKEN'] ||
    ''
  ).trim();
  if (envToken) {
    if (await validateToken(envToken)) {
      cachedToken = envToken;
      cachedTokenSource = 'env';
      return { token: envToken, source: 'env' };
    }
    process.stderr.write(
      'Warning: GH_TOKEN/GITHUB_TOKEN is set but invalid — trying other sources.\n',
    );
  }

  // 2. Cached token file (respects expiry for GitHub App tokens)
  const fileToken = await readCachedToken();
  if (fileToken) {
    if (await validateToken(fileToken)) {
      cachedToken = fileToken;
      cachedTokenSource = 'cached-file';
      return { token: fileToken, source: 'cached-file' };
    }
    // Stale file token — remove it so downstream sources can cache a fresh
    // token and we don't re-validate the same bad token on subsequent calls.
    await invalidateCachedToken();
  }

  // 3. GitHub App token (AGENT_AUTHOR_APP_PRIVATE_KEY env var)
  //    Skip validation for freshly-generated app tokens — they are created from
  //    a valid private key + installation exchange and would fail GET /user (403)
  //    because app installation tokens represent an app, not a user.
  try {
    const appResult = await generateGitHubAppToken();
    if (appResult) {
      cachedToken = appResult.token;
      cachedTokenSource = 'github-app';
      await writeCachedToken(appResult.token, appResult.expiresAt);
      return { token: appResult.token, source: 'github-app' };
    }
  } catch (err) {
    process.stderr.write(
      `Warning: GitHub App token generation failed: ${err instanceof Error ? err.message : err}\n`,
    );
  }

  // Steps 4-5 (.netrc, gh CLI) are skipped in Lambda — neither is configured
  // there, and probing them only delays the inevitable failure.
  if (!isLambda()) {
    // 4. .netrc file
    const netrcToken = await readNetrcToken();
    if (netrcToken) {
      if (await validateToken(netrcToken)) {
        cachedToken = netrcToken;
        cachedTokenSource = 'netrc';
        // Cache to file so subsequent calls (and restarts) don't re-parse .netrc
        await writeCachedToken(netrcToken).catch((err) => {
          process.stderr.write(
            `Warning: Failed to cache netrc token to file: ${err instanceof Error ? err.message : err}\n`,
          );
        });
        return { token: netrcToken, source: 'netrc' };
      }
    }

    // 5. gh auth token
    const ghToken = await tryGhAuthToken();
    if (ghToken) {
      if (await validateToken(ghToken)) {
        cachedToken = ghToken;
        cachedTokenSource = 'gh-cli';
        // Cache to file so subsequent calls don't shell out to `gh` again
        await writeCachedToken(ghToken).catch((err) => {
          process.stderr.write(
            `Warning: Failed to cache gh-cli token to file: ${err instanceof Error ? err.message : err}\n`,
          );
        });
        return { token: ghToken, source: 'gh-cli' };
      }
    }
  }

  return null;
}

/**
 * Get a valid GitHub token. Resolution order:
 * 1. GH_TOKEN or GITHUB_TOKEN env var
 * 2. Cached token from ~/.config/legacy-sports-github/token.json (expiry-aware)
 * 3. GitHub App installation token (AGENT_AUTHOR_APP_PRIVATE_KEY env var)
 * 4. ~/.netrc or ~/_netrc (password for machine github.com)
 * 5. `gh auth token` shell command (5s timeout, silent fallback)
 * 6. GitHub OAuth device flow (interactive via stderr)
 *
 * On first use, validates the token with GET /user. If invalid, invalidates
 * the cache and re-resolves.
 */
export async function getToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  // 1. Environment variables (skip empty/whitespace — LS-1822)
  const envToken = (
    process.env['GH_TOKEN'] ||
    process.env['GITHUB_TOKEN'] ||
    ''
  ).trim();
  if (envToken) {
    if (await validateToken(envToken)) {
      cachedToken = envToken;
      return envToken;
    }
    process.stderr.write(
      'Warning: GH_TOKEN/GITHUB_TOKEN env var is set but invalid (401). Trying other methods.\n',
    );
  }

  // 2. Cached token file (respects expiry for GitHub App tokens)
  const fileToken = await readCachedToken();
  if (fileToken) {
    if (await validateToken(fileToken)) {
      cachedToken = fileToken;
      return fileToken;
    }
    await invalidateCachedToken();
  }

  // 3. GitHub App token (AGENT_AUTHOR_APP_PRIVATE_KEY env var)
  try {
    const appResult = await generateGitHubAppToken();
    if (appResult) {
      if (await validateToken(appResult.token)) {
        cachedToken = appResult.token;
        await writeCachedToken(appResult.token, appResult.expiresAt);
        return appResult.token;
      }
      process.stderr.write(
        'Warning: Generated GitHub App token failed validation. Trying other methods.\n',
      );
    }
  } catch (err) {
    process.stderr.write(
      `Warning: GitHub App token generation failed: ${err instanceof Error ? err.message : err}. Trying other methods.\n`,
    );
  }

  // Steps 4-6 (.netrc, gh CLI, OAuth device flow) require either a developer
  // machine (for the cached credentials) or an interactive terminal (for the
  // device-flow handshake). None of those are available in Lambda — falling
  // through there guarantees a misleading "Device code request failed (404)"
  // when the underlying problem is really that the GitHub App token chain
  // failed. Short-circuit with an honest error instead.
  if (isLambda()) {
    throw new Error(
      'GitHub MCP server (Lambda): no valid token from env, cached file, or ' +
        'AGENT_AUTHOR_APP_PRIVATE_KEY. Interactive sources (.netrc, gh CLI, ' +
        'device flow) are not available in Lambda. Check the GITHUB_TOKEN_SECRET_NAME ' +
        'secret and the GitHub App installation.',
    );
  }

  // 4. .netrc file
  const netrcToken = await readNetrcToken();
  if (netrcToken) {
    if (await validateToken(netrcToken)) {
      cachedToken = netrcToken;
      // Cache it so we don't re-parse .netrc every time
      await writeCachedToken(netrcToken);
      return netrcToken;
    }
  }

  // 5. gh auth token
  const ghToken = await tryGhAuthToken();
  if (ghToken) {
    if (await validateToken(ghToken)) {
      cachedToken = ghToken;
      // Cache it so we don't need `gh` next time
      await writeCachedToken(ghToken);
      return ghToken;
    }
  }

  // 6. Device flow
  const deviceToken = await deviceFlow();
  cachedToken = deviceToken;
  await writeCachedToken(deviceToken);
  return deviceToken;
}

/**
 * Parse git remote URL to extract owner and repo name.
 * Caches the result in memory (doesn't change during a session).
 */
export async function getRepoOwnerName(): Promise<{
  owner: string;
  name: string;
}> {
  if (cachedRepo) return cachedRepo;

  // Explicit env var override — highest priority, set in cloud-setup.sh to
  // bypass proxy remote URLs that don't expose the real GitHub owner/repo.
  const envOwner = process.env['GITHUB_REPO_OWNER']?.trim();
  const envName = process.env['GITHUB_REPO_NAME']?.trim();
  if (envOwner && envName) {
    cachedRepo = { owner: envOwner, name: envName };
    return cachedRepo;
  }

  // In cloud sessions (GitHub Actions, Claude Code on the web), the git remote
  // URL may be a proxied URL that doesn't contain "github.com". Check the
  // standard GITHUB_REPOSITORY env var ("owner/repo") first.
  const ghRepo = process.env.GITHUB_REPOSITORY?.trim();
  if (ghRepo) {
    const slashIdx = ghRepo.indexOf('/');
    if (slashIdx > 0) {
      const owner = ghRepo.slice(0, slashIdx).trim();
      const name = ghRepo.slice(slashIdx + 1).trim();
      if (owner && name) {
        cachedRepo = { owner, name };
        return cachedRepo;
      }
    }
  }

  const remoteUrl = await new Promise<string>((res, reject) => {
    execFile(
      'git',
      ['remote', 'get-url', 'origin'],
      { cwd: getRepoRoot(), timeout: 5_000 },
      (err, stdout) => {
        if (err) {
          reject(new Error(`Failed to get git remote URL: ${err.message}`));
        } else {
          res(stdout.trim());
        }
      },
    );
  });

  // Standard github.com SSH and HTTPS patterns. Explicitly strip a trailing
  // ".git" so that repo names containing dots (e.g. "my.repo") are preserved.
  const match = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/.exec(remoteUrl);
  if (match) {
    cachedRepo = { owner: match[1], name: match[2] };
    return cachedRepo;
  }

  // Fallback for proxied remote URLs. Normalize SCP-style remotes
  // (git@proxy:owner/repo.git) to slash-delimited paths, strip a trailing
  // ".git", then extract the last two path segments as owner/repo.
  const normalizedRemoteUrl = remoteUrl
    .replace(/\.git$/, '')
    .replace(/^([^/]+):([^/].*\/[^/]+)$/, '$1/$2');
  const remoteSegments = normalizedRemoteUrl.split('/').filter(Boolean);
  if (remoteSegments.length >= 2) {
    cachedRepo = {
      owner: remoteSegments[remoteSegments.length - 2],
      name: remoteSegments[remoteSegments.length - 1],
    };
    return cachedRepo;
  }

  throw new Error(
    `Could not parse GitHub owner/repo from remote URL: ${remoteUrl}`,
  );
}
