import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

// --- Credential types ---

export interface OAuthCredentials {
  type: 'oauth';
  clientId: string;
  clientSecret: string;
  cloudId: string;
  /** Site URL for browse links (e.g. https://bkrupa.atlassian.net). */
  siteUrl: string;
}

export interface BasicAuthCredentials {
  type: 'basic';
  login: string;
  password: string;
}

export type JiraCredentials = OAuthCredentials | BasicAuthCredentials;

// --- Legacy types (backward compat) ---

export interface NetrcCredentials {
  login: string;
  password: string;
}

// --- Credential resolution ---

/** Default Jira site URL used for browse links and Basic Auth base URL. */
export const JIRA_SITE_URL_DEFAULT = 'https://bkrupa.atlassian.net';

/**
 * Resolve Jira credentials with fallback chain:
 *
 * 1. OAuth 2.0 env vars: JIRA_CLIENT_ID + JIRA_CLIENT_SECRET + JIRA_CLOUD_ID
 * 2. Basic Auth env vars: JIRA_EMAIL + JIRA_API_TOKEN
 * 3. ~/.netrc file (Basic Auth)
 */
export async function getJiraCredentials(): Promise<JiraCredentials> {
  // 1. OAuth env vars
  const clientId = process.env['JIRA_CLIENT_ID'];
  const clientSecret = process.env['JIRA_CLIENT_SECRET'];
  const cloudId = process.env['JIRA_CLOUD_ID'];

  if (clientId && clientSecret && cloudId) {
    return {
      type: 'oauth',
      clientId,
      clientSecret,
      cloudId,
      siteUrl: process.env['JIRA_SITE_URL'] || JIRA_SITE_URL_DEFAULT,
    };
  }

  // 2. Basic Auth env vars
  const email = process.env['JIRA_EMAIL'];
  const token = process.env['JIRA_API_TOKEN'];

  if (email && token) {
    return { type: 'basic', login: email, password: token };
  }

  // 3. ~/.netrc
  const netrcPath = join(homedir(), '.netrc');
  let content: string;
  try {
    content = await readFile(netrcPath, 'utf-8');
  } catch {
    throw new Error(
      'No Jira credentials found. Set JIRA_CLIENT_ID + JIRA_CLIENT_SECRET + JIRA_CLOUD_ID env vars (OAuth 2.0), ' +
        'or JIRA_EMAIL + JIRA_API_TOKEN (Basic Auth), or create ~/.netrc with Atlassian credentials.',
    );
  }

  const machinePattern =
    /machine\s+[\w.-]*atlassian[\w.-]*\s+login\s+(\S+)\s+password\s+(\S+)/i;
  const match = machinePattern.exec(content);

  if (!match) {
    throw new Error(
      'No Atlassian credentials found in ~/.netrc. Expected: machine <host>.atlassian.net login <email> password <api-token>',
    );
  }

  return { type: 'basic', login: match[1], password: match[2] };
}

/**
 * Non-throwing version of getJiraCredentials.
 * Returns credentials if available, or null if not configured.
 */
export async function tryGetJiraCredentials(): Promise<JiraCredentials | null> {
  try {
    return await getJiraCredentials();
  } catch (error) {
    process.stderr.write(
      `[legacy-sports-jira] Credential lookup failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return null;
  }
}

// --- Legacy exports (backward compat for existing callers) ---

/** @deprecated Use getJiraCredentials() instead. */
export async function getAtlassianCredentials(): Promise<NetrcCredentials> {
  const creds = await getJiraCredentials();
  if (creds.type === 'basic') {
    return { login: creds.login, password: creds.password };
  }
  // OAuth callers must not use this deprecated function; it intentionally
  // throws when OAuth credentials are configured to enforce migration.
  throw new Error(
    'getAtlassianCredentials() cannot be used with OAuth credentials. Use getJiraCredentials() instead.',
  );
}

/** @deprecated Use tryGetJiraCredentials() instead. */
export async function tryGetAtlassianCredentials(): Promise<NetrcCredentials | null> {
  const creds = await tryGetJiraCredentials();
  if (!creds) return null;
  if (creds.type === 'basic') {
    return { login: creds.login, password: creds.password };
  }
  // OAuth credentials are configured; this legacy API cannot represent them as Basic Auth.
  process.stderr.write(
    '[legacy-sports-jira] OAuth credentials are configured; tryGetAtlassianCredentials() cannot return Basic Auth credentials. Use tryGetJiraCredentials() instead.\n',
  );
  return null;
}

/** Build a Basic Auth header value from credentials. */
export function basicAuthHeader(creds: NetrcCredentials): string {
  return `Basic ${Buffer.from(`${creds.login}:${creds.password}`).toString('base64')}`;
}
