import { execFile } from 'node:child_process';
import { createSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { readGitRemoteUrl } from './git-config.js';
import {
  fetchWithRetry,
  formatGithubApiError,
  HttpStatusError,
  sanitizeErrorBody,
  withRetryOnAlreadyRunning,
} from './http-retry.js';
import { getRepoRoot } from './repo-root.js';

export { formatGithubApiError, sanitizeErrorBody } from './http-retry.js';
// getRepoRoot lives in ./repo-root.js so its `import.meta.url` usage stays
// out of CommonJS-compiled specs (LS-8322, mirroring the LS-5982 pattern) —
// re-exported here for the one existing consumer (audit-session-bash.ts).
export { getRepoRoot };

const GITHUB_API = 'https://api.github.com';
const DEFAULT_APP_ID = '3158619';
const DEFAULT_INSTALLATION_ID = '118260223';

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
 * Check whether a token still authenticates against the GitHub API.
 *
 * Mirrors `github-server/src/auth.ts`'s `validateToken` — only a definitive
 * 401 counts as invalid; rate limits, 5xx, and network errors assume the
 * token is still good so a transient blip doesn't discard a valid credential.
 * A 403 without an exhausted rate limit may be a GitHub App installation
 * token (`ghs_*`), which 403s on `GET /user` because it represents an app,
 * not a user — that case falls back to a repo-scoped endpoint both token
 * types can access.
 */
async function validateToken(token: string): Promise<boolean> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  try {
    const res = await fetch(`${GITHUB_API}/user`, {
      headers,
      signal: AbortSignal.timeout(5_000),
    });

    if (res.ok) return true;
    if (res.status === 401) return false;
    if (
      res.status === 429 ||
      (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0')
    ) {
      return true;
    }
    if (res.status >= 500) return true;

    if (res.status === 403) {
      try {
        const slug = await getRepoSlug();
        const repoRes = await fetch(`${GITHUB_API}/repos/${slug}`, {
          headers,
          signal: AbortSignal.timeout(5_000),
        });
        if (repoRes.ok) return true;
        if (repoRes.status === 401) return false;
        if (
          repoRes.status === 429 ||
          (repoRes.status === 403 &&
            repoRes.headers.get('x-ratelimit-remaining') === '0')
        ) {
          return true;
        }
        if (repoRes.status >= 500) return true;
        return false;
      } catch (err) {
        process.stderr.write(
          `Warning: could not validate app token against repo endpoint (${err instanceof Error ? err.message : String(err)}); assuming valid.\n`,
        );
        return true;
      }
    }

    return false;
  } catch (err) {
    const reason =
      err instanceof DOMException && err.name === 'TimeoutError'
        ? 'timeout'
        : err instanceof Error
          ? err.message
          : String(err);
    process.stderr.write(
      `Warning: ${reason} during token validation; assuming token is valid.\n`,
    );
    return true;
  }
}

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
 *
 * The env token is validated before use (LS-8551): unlike
 * `github-server/src/auth.ts`, this used to trust GH_TOKEN/GITHUB_TOKEN
 * unconditionally, so a stale/expired env token permanently broke every
 * ci_* tool call for the life of the process — even when a working
 * GitHub App key or `gh` CLI session was available as a fallback. An
 * invalid env token now falls through to the next source instead.
 */
async function resolveToken(): Promise<{ token: string; expiresAt?: Date }> {
  const envToken =
    process.env.GH_TOKEN?.trim() ||
    process.env.GITHUB_TOKEN?.trim() ||
    undefined;
  if (envToken) {
    if (await validateToken(envToken)) return { token: envToken };
    process.stderr.write(
      'Warning: GH_TOKEN/GITHUB_TOKEN is set but invalid (401 Bad credentials) — ' +
        'falling back to GitHub App auth / gh CLI (LS-8551).\n',
    );
  }

  // Try GitHub App token (cloud environments with AGENT_AUTHOR_APP_PRIVATE_KEY)
  try {
    const appResult = await generateGitHubAppToken();
    if (appResult)
      return { token: appResult.token, expiresAt: appResult.expiresAt };
  } catch (err) {
    process.stderr.write(
      `Warning: GitHub App token generation failed: ${err instanceof Error ? err.message : String(err)}. Trying gh CLI.\n`,
    );
  }

  // Fall back to gh CLI token (local dev)
  const token = await new Promise<string>((resolvePromise, reject) => {
    const cmd = process.platform === 'win32' ? 'gh.exe' : 'gh';
    execFile(
      cmd,
      ['auth', 'token'],
      { timeout: 5_000, windowsHide: true },
      (err, stdout) => {
        if (err) {
          reject(
            new Error(
              'No GitHub token available for the legacy-sports-ci-local server ' +
                '(GH_TOKEN/GITHUB_TOKEN not set, AGENT_AUTHOR_APP_PRIVATE_KEY not configured, gh CLI auth failed). ' +
                'Fix: set AGENT_AUTHOR_APP_PRIVATE_KEY or GH_TOKEN in cloud env settings ' +
                '(see .agents/skills/cloud-agent-mode/SKILL.md). ' +
                'Fallback for read-only inspection: use the built-in mcp__github__actions_list tool to inspect workflow runs. ' +
                'WARNING: actions_list returns enormous payloads (~400 KB at per_page=15, ~65 KB at per_page=3); ' +
                'always save to a temp file and extract only the fields you need ' +
                '(id, status, conclusion, head_sha, name, created_at) with python3 or jq rather than reading the full JSON inline. ' +
                'Fallback for write actions (rerun/cancel/dispatch): use the built-in mcp__github__actions_run_trigger tool instead — ' +
                'e.g. mcp__github__actions_run_trigger({ method: "rerun_failed_jobs", owner, repo, run_id }) covers ' +
                'ci_rerun, method: "cancel_workflow_run" covers ci_cancel_run, and ' +
                'method: "run_workflow" covers ci_dispatch_workflow. It authenticates via the platform\'s own ' +
                "GitHub token, independent of this server's credential resolution. " +
                'Fallback for ci_get_playwright_test_result(source: "s3"): this tool needs the same run-id-to-commit-SHA ' +
                'lookup as ci_view_run, so it fails identically. There is no direct substitute for the structured ' +
                'pass/fail/flaky report — use the already-authenticated mcp__legacy-sports-github__get_job_logs tool ' +
                "to pull the failing job's raw logs instead (LS-8887).",
            ),
          );
          return;
        }
        resolvePromise(stdout.trim());
      },
    );
  });
  return { token };
}

/** Resolve the GitHub token from env, GitHub App key, or fall back to `gh auth token`. */
export async function getToken(): Promise<string> {
  return (await resolveToken()).token;
}

/**
 * Query the GitHub App installation token's core rate limit directly (LS-9570).
 *
 * Always mints a fresh installation token via `generateGitHubAppToken()`
 * (`AGENT_AUTHOR_APP_PRIVATE_KEY`) instead of going through `resolveToken()`'s
 * GH_TOKEN/GITHUB_TOKEN-first precedence — so the result is guaranteed to be
 * the Agent Author App installation bucket, never whatever token a caller's
 * env happens to have set.
 *
 * This is NOT the budget most workflow steps draw from (LS-10491). Steps that
 * authenticate with `github.token` / `secrets.GITHUB_TOKEN` use the per-repo
 * Actions token, whose budget is separate and cannot be queried from outside a
 * running workflow; steps that mint from a different App (Reviewer Bot, the
 * runner App) use that App's own bucket. Only steps that mint from
 * `secrets.AGENT_AUTHOR_APP_PRIVATE_KEY` share this bucket — and only when the
 * mint succeeds; a failed mint silently falls back to another token. It is
 * also a different bucket from `gh api rate_limit`, which reports whatever
 * token the CLI is authenticated as (a user or PAT token).
 *
 * Throws if AGENT_AUTHOR_APP_PRIVATE_KEY isn't configured or the API call
 * fails — callers should surface this as "installation rate limit unknown",
 * not silently fall back to a different token's bucket.
 */
export async function getInstallationRateLimit(): Promise<{
  appId: string;
  limit: number;
  remaining: number;
  resetsAt: string;
}> {
  const appResult = await generateGitHubAppToken();
  if (!appResult) {
    throw new Error(
      'AGENT_AUTHOR_APP_PRIVATE_KEY is not configured — cannot mint a GitHub App ' +
        'installation token to check its rate limit. The main resolved token ' +
        '(getToken()) may come from a different source and does not substitute ' +
        'for this: it does not answer "is the installation bucket rate limited?".',
    );
  }

  const res = await fetch(`${GITHUB_API}/rate_limit`, {
    headers: buildHeaders(appResult.token),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(formatGithubApiError(res.status, body));
  }

  const data = (await res.json()) as {
    rate?: { limit: number; remaining: number; reset: number };
  };
  if (!data.rate) {
    throw new Error('GET /rate_limit response is missing the "rate" field');
  }

  return {
    appId: process.env['GITHUB_APP_ID']?.trim() || DEFAULT_APP_ID,
    limit: data.rate.limit,
    remaining: data.rate.remaining,
    resetsAt: new Date(data.rate.reset * 1000).toISOString(),
  };
}

// Cache for the deploys-repo token (generated via PREVIEW_APP credentials)
let cachedDeploysToken: string | undefined;
let cachedDeploysTokenExpiry: Date | undefined;
let lastDeploysTokenWasFallback = false;

/**
 * Whether the most recent `getDeploysToken()` call returned the broad
 * fallback token instead of a PREVIEW_APP-scoped one (LS-8540). The fallback
 * token frequently lacks read access to the private `legacy-sports-deploys`
 * repo, so a 404 immediately after a fallback is a credentials gap, not a
 * missing/undeployed report.
 */
export function deploysTokenWasFallback(): boolean {
  return lastDeploysTokenWasFallback;
}

const DEPLOYS_REPO_SLUG = 'bkrupa/legacy-sports-deploys';

/**
 * Mint an installation-access-token for `repoSlug` by signing an app-level
 * JWT with `privateKey`/`appId`, discovering that app's installation on the
 * repo, then exchanging it. Returns `{ error }` (with a stderr warning) on
 * any non-2xx response instead of throwing, so callers can fall through to
 * the next credential source. The `error` string is also surfaced by
 * `getDeploysTokenDiagnostics()` (LS-8788) so a caller can distinguish
 * *why* a tier failed without re-triggering a real report fetch and
 * re-deriving the reason from a 404.
 */
async function mintInstallationTokenForRepo(
  privateKey: string,
  appId: string,
  repoSlug: string,
  logLabel: string,
): Promise<{ token: string; expiresAt?: Date } | { error: string }> {
  const jwt = createAppJWT(privateKey, appId);

  const installRes = await fetch(
    `${GITHUB_API}/repos/${repoSlug}/installation`,
    {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'legacy-sports-ci-server',
      },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!installRes.ok) {
    const body = await installRes.text();
    const error = `installation discovery failed (${installRes.status}): ${sanitizeErrorBody(body)}`;
    process.stderr.write(`[ci-server] ${logLabel} ${error}\n`);
    return { error };
  }

  const install = (await installRes.json()) as { id: number };
  const tokenRes = await fetch(
    `${GITHUB_API}/app/installations/${install.id}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'legacy-sports-ci-server',
      },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    const error = `token exchange failed (${tokenRes.status}): ${sanitizeErrorBody(body)}`;
    process.stderr.write(`[ci-server] ${logLabel} ${error}\n`);
    return { error };
  }

  const data = (await tokenRes.json()) as {
    token?: string;
    expires_at?: string;
  };
  if (!data.token) {
    const error = 'token exchange response had no token field';
    process.stderr.write(`[ci-server] ${logLabel} ${error}\n`);
    return { error };
  }

  return {
    token: data.token,
    expiresAt: data.expires_at
      ? new Date(new Date(data.expires_at).getTime() - 5 * 60 * 1000)
      : undefined,
  };
}

/**
 * Generate or return a cached installation token for `bkrupa/legacy-sports-deploys`.
 *
 * Credential precedence:
 *   1. PREVIEW_APP_PRIVATE_KEY + PREVIEW_APP_ID — the dedicated deploy App,
 *      when its Secrets Manager wiring is provisioned (LS-8322).
 *   2. AGENT_AUTHOR_APP_PRIVATE_KEY — the agent-author App already available
 *      in every hosted Lambda and cloud agent session, once a human installs
 *      it on the deploys repo with Contents: Read (LS-8547 Option 1). This
 *      is a no-op fallback until that one-time install happens: GitHub 404s
 *      the installation-discovery call and we fall through to case 3.
 *   3. `getToken()` — the main token (works when GH_TOKEN is a broad PAT
 *      with access to both repos, e.g. local `gh` CLI dev).
 */
export async function getDeploysToken(): Promise<string> {
  const now = new Date();
  if (
    cachedDeploysToken &&
    (!cachedDeploysTokenExpiry || cachedDeploysTokenExpiry > now)
  ) {
    return cachedDeploysToken;
  }

  const rawKey = process.env['PREVIEW_APP_PRIVATE_KEY'];
  const appId = process.env['PREVIEW_APP_ID'];

  if (rawKey && appId) {
    const privateKey = rawKey.includes('-----BEGIN')
      ? rawKey
      : rawKey.replace(/\\n/g, '\n');
    const result = await mintInstallationTokenForRepo(
      privateKey,
      appId.trim(),
      DEPLOYS_REPO_SLUG,
      'PREVIEW_APP',
    );
    if ('token' in result) {
      cachedDeploysToken = result.token;
      cachedDeploysTokenExpiry = result.expiresAt;
      lastDeploysTokenWasFallback = false;
      return cachedDeploysToken;
    }
  }

  const agentAuthorKey = getAppPrivateKey();
  if (agentAuthorKey) {
    const agentAuthorAppId =
      process.env['GITHUB_APP_ID']?.trim() || DEFAULT_APP_ID;
    const result = await mintInstallationTokenForRepo(
      agentAuthorKey,
      agentAuthorAppId,
      DEPLOYS_REPO_SLUG,
      'agent-author App (deploys repo)',
    );
    if ('token' in result) {
      cachedDeploysToken = result.token;
      cachedDeploysTokenExpiry = result.expiresAt;
      lastDeploysTokenWasFallback = false;
      return cachedDeploysToken;
    }
  }

  // Fall back to the main token (works when GH_TOKEN is a PAT with access to both repos)
  lastDeploysTokenWasFallback = true;
  return getToken();
}

export type DeploysTokenTierResult = 'success' | 'not-configured' | 'failed';

export interface DeploysTokenDiagnostics {
  /** Whether PREVIEW_APP_PRIVATE_KEY + PREVIEW_APP_ID are both set in this process's env. */
  previewAppConfigured: boolean;
  previewAppResult: DeploysTokenTierResult;
  previewAppError?: string;
  /** Whether AGENT_AUTHOR_APP_PRIVATE_KEY is set in this process's env. */
  agentAuthorConfigured: boolean;
  agentAuthorResult: DeploysTokenTierResult;
  agentAuthorError?: string;
  /** Which tier getDeploysToken() would actually resolve to right now. */
  resolvedSource: 'preview-app' | 'agent-author' | 'fallback';
}

/**
 * Diagnose why `getDeploysToken()` would (or wouldn't) return a token scoped
 * to the private `bkrupa/legacy-sports-deploys` repo, without needing a real
 * `ci_get_playwright_report`/`ci_get_playwright_test_result` call to
 * indirectly discover it via a 404 (LS-8788 — the credentials gap this
 * diagnoses recurred four times across LS-8296/LS-8850/LS-9248/LS-8758
 * despite LS-8547/LS-8556 both being marked Done, because those fixes'
 * completion was never independently re-verifiable — each recurrence
 * required re-triggering a report fetch and re-deriving the same "which
 * tier is broken" answer from scratch).
 *
 * Exercises the same two credential tiers `getDeploysToken()` tries, in the
 * same order, but reports the *reason* each tier failed instead of silently
 * falling through — so a human provisioning credentials (or an agent
 * verifying the provisioning landed) gets a direct answer. Mints throwaway
 * tokens for the check; does not touch `getDeploysToken()`'s own cache.
 */
export async function getDeploysTokenDiagnostics(): Promise<DeploysTokenDiagnostics> {
  const rawKey = process.env['PREVIEW_APP_PRIVATE_KEY'];
  const appId = process.env['PREVIEW_APP_ID'];
  const previewAppConfigured = Boolean(rawKey && appId);

  let previewAppResult: DeploysTokenTierResult = 'not-configured';
  let previewAppError: string | undefined;
  if (previewAppConfigured && rawKey && appId) {
    const privateKey = rawKey.includes('-----BEGIN')
      ? rawKey
      : rawKey.replace(/\\n/g, '\n');
    const result = await mintInstallationTokenForRepo(
      privateKey,
      appId.trim(),
      DEPLOYS_REPO_SLUG,
      'PREVIEW_APP (diagnostics)',
    );
    if ('token' in result) {
      previewAppResult = 'success';
    } else {
      previewAppResult = 'failed';
      previewAppError = result.error;
    }
  }

  const agentAuthorKey = getAppPrivateKey();
  const agentAuthorConfigured = Boolean(agentAuthorKey);
  let agentAuthorResult: DeploysTokenTierResult = 'not-configured';
  let agentAuthorError: string | undefined;
  if (agentAuthorConfigured && agentAuthorKey) {
    const agentAuthorAppId =
      process.env['GITHUB_APP_ID']?.trim() || DEFAULT_APP_ID;
    const result = await mintInstallationTokenForRepo(
      agentAuthorKey,
      agentAuthorAppId,
      DEPLOYS_REPO_SLUG,
      'agent-author App (diagnostics)',
    );
    if ('token' in result) {
      agentAuthorResult = 'success';
    } else {
      agentAuthorResult = 'failed';
      agentAuthorError = result.error;
    }
  }

  const resolvedSource: DeploysTokenDiagnostics['resolvedSource'] =
    previewAppResult === 'success'
      ? 'preview-app'
      : agentAuthorResult === 'success'
        ? 'agent-author'
        : 'fallback';

  return {
    previewAppConfigured,
    previewAppResult,
    previewAppError,
    agentAuthorConfigured,
    agentAuthorResult,
    agentAuthorError,
    resolvedSource,
  };
}

/** Parse owner/repo from the git remote origin URL. */
async function getRepoSlug(): Promise<string> {
  // In Lambda environments there is no .git directory and git is not on PATH.
  // GITHUB_REPOSITORY (format: owner/repo) is the authoritative source there
  // and also aligns with the standard GitHub Actions env var (LS-5214).
  const envSlug = process.env['GITHUB_REPOSITORY'];
  if (envSlug) return envSlug;

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
        { cwd: repoRoot, timeout: 5_000, windowsHide: true },
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
 * Clear the cached token so the next `ensureAuth()` call re-resolves from
 * scratch via `resolveToken()`. Used by `fetchAuthed`/`githubGetArrayBuffer`
 * to self-heal when a token that validated fine at resolution time (or an
 * App token that was never validated) is later rejected mid-session with a
 * 401 — mirrors `github-server`'s `invalidateToken` (LS-8551).
 */
function invalidateToken(): void {
  cachedToken = undefined;
  cachedTokenExpiry = undefined;
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

/**
 * Fetch with the current auth token, retrying once with a freshly-resolved
 * token if the first attempt comes back 401. `resolveToken()` already
 * validates env tokens up front (LS-8551), but this covers the remaining gap:
 * a token that was valid when resolved (or an App/gh-cli token, neither of
 * which is pre-validated) but gets revoked or expires mid-session. Mirrors
 * `github-server/src/github-api.ts`'s `doRest` 401-retry behavior.
 */
async function fetchAuthed(
  buildUrl: (slug: string) => string,
  buildInit: (token: string) => RequestInit,
): Promise<Response> {
  const { token, slug } = await ensureAuth();
  const res = await fetch(buildUrl(slug), buildInit(token));
  if (res.status !== 401) return res;

  invalidateToken();
  const retry = await ensureAuth();
  return fetch(buildUrl(retry.slug), buildInit(retry.token));
}

/** Make a GET request to the GitHub REST API, returning parsed JSON. */
export async function githubGet<T>(
  path: string,
  params?: Record<string, string>,
  options?: { signal?: AbortSignal },
): Promise<T> {
  const res = await fetchAuthed(
    (slug) => {
      const url = new URL(`${GITHUB_API}/repos/${slug}${path}`);
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (v !== undefined && v !== '') url.searchParams.set(k, v);
        }
      }
      return url.toString();
    },
    (token) => ({ headers: buildHeaders(token), signal: options?.signal }),
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(formatGithubApiError(res.status, body));
  }

  logRateLimit(res, `GET ${path}`);
  return (await res.json()) as T;
}

/**
 * Make a GET request to the GitHub REST API, returning the response as plain text.
 * Used for endpoints that return raw content (e.g., job logs).
 */
export async function githubGetText(path: string): Promise<string> {
  const res = await fetchAuthed(
    (slug) => `${GITHUB_API}/repos/${slug}${path}`,
    (token) => ({
      headers: {
        ...buildHeaders(token),
        Accept: 'application/vnd.github+json',
      },
    }),
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(formatGithubApiError(res.status, body));
  }

  logRateLimit(res, `GET ${path} (text)`);
  return res.text();
}

/**
 * Make a GET request to the GitHub REST API, returning the response as an ArrayBuffer.
 * Used for binary endpoints like Actions log downloads that return ZIP archives.
 * Follows redirects automatically (e.g., 302 from job log endpoints).
 * Retries up to 3 times with exponential backoff on transient 5xx gateway
 * errors (502/503/504) and on 410 (a job-log archive not yet available for
 * download moments after the job completed, LS-8435).
 *
 * Also retries once on 401 with a freshly-resolved token (LS-8551) —
 * `fetchWithRetry` doesn't treat 401 as retriable (it's not transient in the
 * general case), so that self-heal is applied here rather than inside it.
 */
export async function githubGetArrayBuffer(
  path: string,
  options?: { signal?: AbortSignal },
): Promise<ArrayBuffer> {
  const { token, slug } = await ensureAuth();
  const fetchOnce = (t: string, s: string) =>
    fetchWithRetry(
      `${GITHUB_API}/repos/${s}${path}`,
      {
        headers: {
          ...buildHeaders(t),
          Accept: 'application/vnd.github+json',
        },
        signal: options?.signal,
      },
      logRateLimit,
      `GET ${path} (arraybuffer)`,
    );

  try {
    return await fetchOnce(token, slug);
  } catch (err) {
    if (!(err instanceof HttpStatusError) || err.status !== 401) throw err;
    invalidateToken();
    const retry = await ensureAuth();
    return fetchOnce(retry.token, retry.slug);
  }
}

/** Make a PUT request to the GitHub REST API. Used for state-toggling endpoints (e.g. workflow enable/disable). */
export async function githubPut<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetchAuthed(
    (slug) => `${GITHUB_API}/repos/${slug}${path}`,
    (token) => ({
      method: 'PUT',
      headers: {
        ...buildHeaders(token),
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(formatGithubApiError(res.status, text));
  }

  logRateLimit(res, `PUT ${path}`);
  // Workflow enable/disable returns 204 No Content
  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}

// This server runs on a Lambda with a 30s hard timeout (see the identical
// constraint documented in wait-run.ts / http-retry.ts). Without a
// client-side ceiling, a POST that hangs (rather than erroring) on GitHub's
// side can silently consume the entire remaining budget — especially once
// postWithRetryOnAlreadyRunning's own backoff waits are added on top — and
// the Lambda gets SIGKILLed mid-request, which surfaces to the MCP caller as
// a raw, unparseable "Service Unavailable" transport error instead of a
// clean, actionable one (LS-8704/LS-8429 shared root cause). Bounding each
// individual attempt turns that silent kill into a catchable abort error
// that rerun.ts's existing try/catch already formats cleanly.
const POST_TIMEOUT_MS = 6_000;

/** Make a POST request to the GitHub REST API. */
export async function githubPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetchAuthed(
    (slug) => `${GITHUB_API}/repos/${slug}${path}`,
    (token) => ({
      method: 'POST',
      headers: {
        ...buildHeaders(token),
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(POST_TIMEOUT_MS),
    }),
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(formatGithubApiError(res.status, text));
  }

  logRateLimit(res, `POST ${path}`);
  // Some POST endpoints return 201 with a body, others return 204 with no
  // body. The run-cancel endpoint returns 202 Accepted with an empty body —
  // read as text first and only parse as JSON when there is content, so a
  // blank 202 response doesn't throw on `res.json()`.
  if (res.status === 204) return {} as T;
  if (res.status === 202) {
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  }
  return (await res.json()) as T;
}

/**
 * POST wrapper for the GitHub Actions rerun endpoints. Retries with backoff
 * on two known-transient conditions:
 *   - the "already running" 403 race — the run-level status those endpoints
 *     gate on lags the per-job status callers already checked via
 *     ci_view_run_jobs.
 *   - a transient 502/503/504 from GitHub, most commonly the "Service
 *     Unavailable" 503 observed against large/partly-in-flight runs that
 *     clears on a bare retry with no changed arguments (LS-9646).
 * All other errors (including other 403s and non-transient statuses)
 * rethrow on the first attempt, unchanged. See withRetryOnAlreadyRunning in
 * http-retry.ts for the retry policy itself.
 */
export async function postWithRetryOnAlreadyRunning<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  return withRetryOnAlreadyRunning(() => githubPost<T>(path, body));
}
