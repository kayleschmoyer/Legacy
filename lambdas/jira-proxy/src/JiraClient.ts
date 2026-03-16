import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { LOGGER } from '@legacy-sports/logging';

interface JiraCredentials {
  api_token: string;
  email: string;
  base_url: string;
}

interface JiraIssueFields {
  summary: string;
  description?: JiraDocNode;
  priority?: { name: string };
  labels?: string[];
  issuetype: { name: string };
  project: { key: string };
  parent?: { key: string };
  reporter?: { id: string };
}

interface JiraDocNode {
  type: string;
  version?: number;
  content?: JiraDocNode[];
  text?: string;
  attrs?: Record<string, unknown>;
}

export interface AttachmentInput {
  /** Original filename (sanitized on the backend before upload). */
  name: string;
  /** MIME type, e.g. "image/png" or "video/mp4". */
  type: string;
  /** Base64-encoded file content (no data-URI prefix). */
  data: string;
}

export interface CreateIssueInput {
  summary: string;
  description?: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Critical';
  labels?: string[];
  reporterEmail?: string;
  /** Username extracted from the authenticated JWT (added server-side). */
  reporterUsername?: string;
  appVersion?: string;
  environment?: string;
  /** Current page URL where the bug was reported from. */
  pageUrl?: string;
  /** User-agent string from the browser. */
  userAgent?: string;
  /** Optional screenshots or short video clips to attach to the Jira issue. */
  attachments?: AttachmentInput[];
}

export interface CreateIssueResult {
  issueKey: string;
  issueUrl: string;
}

let cachedCredentials: JiraCredentials | null = null;

async function getJiraCredentials(
  secretName: string,
): Promise<JiraCredentials> {
  if (cachedCredentials) {
    return cachedCredentials;
  }

  const client = new SecretsManagerClient({ region: 'us-east-1' });
  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await client.send(command);

  if (!response.SecretString) {
    throw new Error(`Secret ${secretName} has no string value`);
  }

  const credentials = JSON.parse(response.SecretString) as JiraCredentials;

  if (!credentials.api_token || !credentials.email || !credentials.base_url) {
    throw new Error(
      `Secret ${secretName} is missing required fields: api_token, email, base_url`,
    );
  }

  cachedCredentials = credentials;
  return credentials;
}

/**
 * Convert plain text to Atlassian Document Format (ADF) for Jira API v3
 */
function textToAdf(text: string): JiraDocNode {
  const paragraphs = text.split('\n\n').filter((p) => p.trim());

  return {
    type: 'doc',
    version: 1,
    content: paragraphs.map((paragraph) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: paragraph.trim() }],
    })),
  };
}

/**
 * Build ADF description that includes optional metadata fields
 */
function buildDescription(input: CreateIssueInput): JiraDocNode {
  const parts: string[] = [];

  if (input.description) {
    parts.push(input.description);
  }

  const metaParts: string[] = [];
  if (input.appVersion) {
    metaParts.push(`App Version: ${input.appVersion}`);
  }
  if (input.environment) {
    metaParts.push(`Environment: ${input.environment}`);
  }
  if (input.reporterEmail) {
    metaParts.push(`Reported by: ${input.reporterEmail}`);
  }
  if (input.reporterUsername) {
    metaParts.push(`Username: ${input.reporterUsername}`);
  }
  if (input.pageUrl) {
    metaParts.push(`Page URL: ${input.pageUrl}`);
  }
  if (input.userAgent) {
    metaParts.push(`User Agent: ${input.userAgent}`);
  }

  if (metaParts.length > 0) {
    parts.push(`--- Metadata ---\n${metaParts.join('\n')}`);
  }

  return textToAdf(parts.join('\n\n'));
}

/**
 * Strip path separators and other OS-forbidden characters from a filename.
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_').slice(0, 255);
}

/**
 * Attach base64-encoded files to an existing Jira issue.
 * Failures are logged as warnings — the issue is already created, so we
 * do not throw and roll back.
 */
async function attachFilesToJiraIssue(
  issueKey: string,
  attachments: AttachmentInput[],
  credentials: JiraCredentials,
): Promise<void> {
  const { api_token, email, base_url } = credentials;
  const authHeader = Buffer.from(`${email}:${api_token}`).toString('base64');

  for (const attachment of attachments) {
    try {
      const buffer = Buffer.from(attachment.data, 'base64');
      const blob = new Blob([buffer], { type: attachment.type });
      const formData = new FormData();
      formData.append('file', blob, sanitizeFilename(attachment.name));

      const response = await fetch(
        `${base_url}/rest/api/3/issue/${issueKey}/attachments`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${authHeader}`,
            // Required by Jira to allow programmatic attachment uploads
            'X-Atlassian-Token': 'no-check',
            Accept: 'application/json',
          },
          body: formData,
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        LOGGER.warn(
          `Failed to attach ${attachment.name} to ${issueKey}: ${String(response.status)} ${errorBody}`,
        );
      } else {
        LOGGER.info(`Attached ${attachment.name} to ${issueKey}`);
      }
    } catch (err) {
      LOGGER.warn(
        `Error attaching ${attachment.name} to ${issueKey}: ${String(err)}`,
      );
    }
  }
}

/**
 * Look up a Jira user's accountId by their email address.
 * Returns null if no matching Jira account is found.
 */
async function findJiraUserAccountId(
  email: string,
  authHeader: string,
  baseUrl: string,
): Promise<string | null> {
  try {
    const url = `${baseUrl}/rest/api/3/user/search?query=${encodeURIComponent(email)}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${authHeader}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      LOGGER.warn(`Jira user search failed with status ${response.status}`);
      return null;
    }

    const users = (await response.json()) as Array<{
      accountId: string;
      emailAddress?: string;
    }>;

    // Find exact email match (Jira search is fuzzy)
    const match = users.find(
      (u) => u.emailAddress?.toLowerCase() === email.toLowerCase(),
    );
    return match?.accountId ?? null;
  } catch (err) {
    LOGGER.warn(`Failed to look up Jira user by email: ${String(err)}`);
    return null;
  }
}

export async function createJiraBug(
  input: CreateIssueInput,
  projectKey: string,
  secretName: string,
  epicKey?: string,
): Promise<CreateIssueResult> {
  const credentials = await getJiraCredentials(secretName);
  const { api_token, email, base_url } = credentials;

  const authHeader = Buffer.from(`${email}:${api_token}`).toString('base64');

  const fields: JiraIssueFields = {
    project: { key: projectKey },
    issuetype: { name: 'Bug' },
    summary: input.summary,
    description: buildDescription(input),
  };

  const trimmedEpicKey = epicKey?.trim();
  if (trimmedEpicKey) {
    fields.parent = { key: trimmedEpicKey };
  }

  if (input.priority) {
    fields.priority = { name: input.priority };
  }

  if (input.labels && input.labels.length > 0) {
    fields.labels = input.labels;
  }

  // Attempt to set the reporter to the actual user who filed the bug.
  // Falls back gracefully (reporter = API token owner) if email is absent or
  // the user has no Jira account.
  if (input.reporterEmail) {
    const accountId = await findJiraUserAccountId(
      input.reporterEmail,
      authHeader,
      base_url,
    );
    if (accountId) {
      fields.reporter = { id: accountId };
      LOGGER.info(`Setting Jira reporter to accountId ${accountId}`);
    } else {
      LOGGER.info(
        `No Jira account found for ${input.reporterEmail}; reporter will default to API token owner`,
      );
    }
  }

  LOGGER.info(`Creating Jira bug in project ${projectKey}: ${input.summary}`);

  const response = await fetch(`${base_url}/rest/api/3/issue`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authHeader}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ fields }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    LOGGER.error(`Jira API error ${response.status}: ${errorBody}`);
    throw new Error(
      `Jira API returned ${response.status}: ${response.statusText}`,
    );
  }

  const data = (await response.json()) as {
    id: string;
    key: string;
    self: string;
  };

  const issueKey = data.key;
  const issueUrl = `${base_url}/browse/${issueKey}`;

  LOGGER.info(`Created Jira issue: ${issueKey}`);

  if (input.attachments && input.attachments.length > 0) {
    await attachFilesToJiraIssue(issueKey, input.attachments, credentials);
  }

  return { issueKey, issueUrl };
}
