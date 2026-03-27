import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const GITHUB_API = 'https://api.github.com';

/** Truncate API error bodies and redact potential auth tokens. */
function sanitizeErrorBody(text: string, maxLen = 500): string {
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

/** Resolve the GitHub token from env or fall back to `gh auth token`. */
async function getToken(): Promise<string> {
  const envToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (envToken) return envToken;

  // Fall back to gh CLI token (local dev)
  return new Promise((resolvePromise, reject) => {
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
}

/** Parse owner/repo from the git remote origin URL. */
async function getRepoSlug(): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const cmd = process.platform === 'win32' ? 'git.exe' : 'git';
    execFile(
      cmd,
      ['remote', 'get-url', 'origin'],
      { cwd: getRepoRoot(), timeout: 5_000 },
      (err, stdout) => {
        if (err) {
          reject(new Error('Failed to get git remote URL'));
          return;
        }
        const url = stdout.trim();
        // Match both HTTPS and SSH formats
        const match =
          url.match(/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/) ?? [];
        if (!match[1]) {
          reject(
            new Error(`Could not parse owner/repo from remote URL: ${url}`),
          );
          return;
        }
        resolvePromise(match[1]);
      },
    );
  });
}

// Cache token and slug for the lifetime of the server process
let cachedToken: string | undefined;
let cachedSlug: string | undefined;

async function ensureAuth(): Promise<{ token: string; slug: string }> {
  if (!cachedToken) cachedToken = await getToken();
  if (!cachedSlug) cachedSlug = await getRepoSlug();
  return { token: cachedToken, slug: cachedSlug };
}

function buildHeaders(token: string): Record<string, string> {
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
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${sanitizeErrorBody(body)}`);
  }

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

  return res.arrayBuffer();
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

  // Some POST endpoints return 201 with a body, others return 204 with no body
  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}
