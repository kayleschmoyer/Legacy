import { sign } from 'jsonwebtoken';
import { LOGGER } from '@legacy-sports/logging';

const GITHUB_API = 'https://api.github.com';

/** Default request timeout for GitHub API calls (15 s — well inside the 30 s Lambda timeout). */
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Generate a GitHub App JWT signed with the app's RSA private key.
 * Valid for 9 minutes (GitHub caps at 10; we use 9 to allow clock drift).
 */
function generateAppJwt(appId: number, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      iat: now - 60, // issued 60s in the past to tolerate clock skew
      exp: now + 9 * 60,
      iss: String(appId),
    },
    privateKey,
    { algorithm: 'RS256' },
  );
}

/**
 * Look up the installation ID for a GitHub App on a specific repository,
 * then exchange the App JWT for a short-lived installation access token.
 *
 * Use this when you know the app + repo but not the installation ID.
 * The token inherits the app's permissions for that installation.
 */
export async function getRepoInstallationToken(
  appId: number,
  privateKey: string,
  owner: string,
  repo: string,
): Promise<string> {
  const jwt = generateAppJwt(appId, privateKey);

  const instResp = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/installation`,
    {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );

  if (!instResp.ok) {
    const body = await instResp.text();
    throw new Error(
      `Failed to get installation for ${owner}/${repo} (${instResp.status}): ${body}`,
    );
  }

  const { id: installationId } = (await instResp.json()) as { id: number };
  return getInstallationToken(appId, privateKey, installationId);
}

/**
 * Exchange a GitHub App JWT for an installation access token.
 * The token is scoped to the given installation and inherits the app's permissions.
 */
export async function getInstallationToken(
  appId: number,
  privateKey: string,
  installationId: number,
): Promise<string> {
  const jwt = generateAppJwt(appId, privateKey);

  const resp = await fetch(
    `${GITHUB_API}/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(
      `Failed to get installation token (${resp.status}): ${body}`,
    );
  }

  const data = (await resp.json()) as { token: string };
  LOGGER.info('Obtained installation access token', { installationId });
  return data.token;
}
