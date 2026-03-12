import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface NetrcCredentials {
  login: string;
  password: string;
}

/**
 * Get Atlassian credentials from environment variables or ~/.netrc.
 *
 * Priority:
 * 1. JIRA_EMAIL + JIRA_API_TOKEN env vars (cloud agents, CI)
 * 2. ~/.netrc file (local development)
 */
export async function getAtlassianCredentials(): Promise<NetrcCredentials> {
  const email = process.env['JIRA_EMAIL'];
  const token = process.env['JIRA_API_TOKEN'];

  if (email && token) {
    return { login: email, password: token };
  }

  const netrcPath = join(homedir(), '.netrc');
  let content: string;
  try {
    content = await readFile(netrcPath, 'utf-8');
  } catch {
    throw new Error(
      'No Jira credentials found. Set JIRA_EMAIL + JIRA_API_TOKEN env vars, or create ~/.netrc with Atlassian credentials.',
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

  return { login: match[1], password: match[2] };
}

/** Build a Basic Auth header value from credentials. */
export function basicAuthHeader(creds: NetrcCredentials): string {
  return `Basic ${Buffer.from(`${creds.login}:${creds.password}`).toString('base64')}`;
}
