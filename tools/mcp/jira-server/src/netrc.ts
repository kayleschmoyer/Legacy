import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface NetrcCredentials {
  login: string;
  password: string;
}

/**
 * Parse ~/.netrc for Atlassian credentials.
 * Looks for machine entries matching atlassian.net.
 */
export async function getAtlassianCredentials(): Promise<NetrcCredentials> {
  const netrcPath = join(homedir(), '.netrc');
  let content: string;
  try {
    content = await readFile(netrcPath, 'utf-8');
  } catch {
    throw new Error(
      `Cannot read ~/.netrc at ${netrcPath}. Ensure it exists with Atlassian credentials.`,
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

/** Build a Basic Auth header value from netrc credentials. */
export function basicAuthHeader(creds: NetrcCredentials): string {
  return `Basic ${Buffer.from(`${creds.login}:${creds.password}`).toString('base64')}`;
}
