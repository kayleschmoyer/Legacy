import { execFile } from 'node:child_process';
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

let cachedToken: string | null = null;
let cachedRepo: { owner: string; name: string } | null = null;

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
}

async function readCachedToken(): Promise<string | null> {
  try {
    const raw = await readFile(TOKEN_PATH, 'utf-8');
    const data = JSON.parse(raw) as CachedTokenFile;
    return data.token ?? null;
  } catch {
    return null;
  }
}

async function writeCachedToken(token: string): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const data: CachedTokenFile = { token, createdAt: new Date().toISOString() };
  await writeFile(TOKEN_PATH, JSON.stringify(data, null, 2), 'utf-8');
  // Restrict file permissions to owner-only (no-op on Windows, but safe to call)
  if (process.platform !== 'win32') {
    await chmod(TOKEN_PATH, 0o600);
  }
}

async function invalidateCachedToken(): Promise<void> {
  cachedToken = null;
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

/** Try `gh auth token` with a 5-second timeout. Returns null on any failure. */
function tryGhAuthToken(): Promise<string | null> {
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
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (res.ok) return true;

    // 401/403 with no rate-limit issue means truly invalid token
    if (res.status === 401) return false;

    // Rate limiting (403 with rate-limit headers or 429) — token may still be valid
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

    // Other 4xx (e.g. 403 without rate-limit) — treat as invalid
    return false;
  } catch {
    // Network errors — don't invalidate token, assume it might be valid
    process.stderr.write(
      'Warning: Network error during token validation; assuming token is valid.\n',
    );
    return true;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get a valid GitHub token. Resolution order:
 * 1. GH_TOKEN or GITHUB_TOKEN env var
 * 2. Cached token from ~/.config/legacy-sports-github/token.json
 * 3. `gh auth token` shell command (5s timeout, silent fallback)
 * 4. GitHub OAuth device flow (interactive via stderr)
 *
 * On first use, validates the token with GET /user. If invalid, invalidates
 * the cache and re-resolves.
 */
export async function getToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  // 1. Environment variables
  const envToken = process.env['GH_TOKEN'] || process.env['GITHUB_TOKEN'];
  if (envToken) {
    if (await validateToken(envToken)) {
      cachedToken = envToken;
      return envToken;
    }
    process.stderr.write(
      'Warning: GH_TOKEN/GITHUB_TOKEN env var is set but invalid (401). Trying other methods.\n',
    );
  }

  // 2. Cached token file
  const fileToken = await readCachedToken();
  if (fileToken) {
    if (await validateToken(fileToken)) {
      cachedToken = fileToken;
      return fileToken;
    }
    await invalidateCachedToken();
  }

  // 3. gh auth token
  const ghToken = await tryGhAuthToken();
  if (ghToken) {
    if (await validateToken(ghToken)) {
      cachedToken = ghToken;
      // Cache it so we don't need `gh` next time
      await writeCachedToken(ghToken);
      return ghToken;
    }
  }

  // 4. Device flow
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

  const match = /github\.com[:/]([^/]+)\/([^/.]+)/.exec(remoteUrl);
  if (!match) {
    throw new Error(
      `Could not parse GitHub owner/repo from remote URL: ${remoteUrl}`,
    );
  }

  cachedRepo = { owner: match[1], name: match[2] };
  return cachedRepo;
}
