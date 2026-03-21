import { execFile } from 'node:child_process';
import { getRepoRoot } from './gh.js';

const GITHUB_API = 'https://api.github.com';

/** Resolve the GitHub token from env or fall back to `gh auth token`. */
async function getToken(): Promise<string> {
  const envToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (envToken) return envToken;

  // Fall back to gh CLI token (local dev)
  return new Promise((resolve, reject) => {
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
      resolve(stdout.trim());
    });
  });
}

/** Parse owner/repo from the git remote origin URL. */
async function getRepoSlug(): Promise<string> {
  return new Promise((resolve, reject) => {
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
        resolve(match[1]);
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

/** Make a GET request to the GitHub REST API. */
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
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'legacy-sports-ci-server',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${body}`);
  }

  return (await res.json()) as T;
}

/** Make a POST request to the GitHub REST API. */
export async function githubPost<T>(path: string, body?: unknown): Promise<T> {
  const { token, slug } = await ensureAuth();
  const url = `${GITHUB_API}/repos/${slug}${path}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'legacy-sports-ci-server',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }

  // Some POST endpoints return 201 with a body, others return 204 with no body
  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}
