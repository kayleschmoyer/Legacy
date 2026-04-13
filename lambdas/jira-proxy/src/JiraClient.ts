import { LOGGER } from '@legacy-sports/logging';
import { getAccessToken, getApiBaseUrl, getSiteUrl } from './oauth';

// Module-scope cache — survives warm invocations, reset on cold start.
// Keyed by "<apiBaseUrl>:<projectKey>" so different tenants/projects don't collide.
const bugEpicCache = new Map<string, { key: string; expiresAt: number }>();
const BUG_EPIC_CACHE_TTL_MS = 5 * 60 * 1000;

const BUG_BUCKET_LABEL = 'bucket:client-bugs';

/**
 * Last-resort fallback: search Jira for the most-recently-created open epic
 * labelled `bucket:client-bugs`. This makes epic resolution self-healing when
 * the project property is unset and the env-var fallback is stale.
 */
async function findCurrentBugEpicViaJql(
  accessToken: string,
  apiBaseUrl: string,
  projectKey: string,
): Promise<string | undefined> {
  try {
    const jql = `project = "${projectKey}" AND issuetype = Epic AND labels = "${BUG_BUCKET_LABEL}" AND statusCategory != Done ORDER BY created DESC`;
    const params = new URLSearchParams({
      jql,
      maxResults: '1',
      fields: 'none',
    });
    const response = await fetch(
      `${apiBaseUrl}/rest/api/3/search?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      },
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as {
      issues: Array<{ key: string }>;
    };
    return data.issues[0]?.key ?? undefined;
  } catch (err) {
    LOGGER.warn('Failed to find bug epic via JQL fallback', { err });
    return undefined;
  }
}

/**
 * Resolve the current bug epic key from Jira project property bucket.client-bugs.
 *
 * Fallback chain:
 *   1. Jira project property `bucket.client-bugs`
 *   2. `BUG_EPIC_FALLBACK_KEY` env var
 *   3. JQL search for the latest open epic labelled `bucket:client-bugs`
 */
export async function resolveCurrentBugEpicKey(
  accessToken: string,
  apiBaseUrl: string,
  projectKey: string,
): Promise<string | undefined> {
  const cacheKey = `${apiBaseUrl}:${projectKey}`;
  const now = Date.now();
  const cached = bugEpicCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.key;
  }
  try {
    const response = await fetch(
      `${apiBaseUrl}/rest/api/3/project/${projectKey}/properties/bucket.client-bugs`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      },
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as { value: { key: string } };
    const key = data.value?.key?.trim();
    if (!key) throw new Error('Property exists but has no key value');
    bugEpicCache.set(cacheKey, { key, expiresAt: now + BUG_EPIC_CACHE_TTL_MS });
    return key;
  } catch (err) {
    LOGGER.warn(
      `Failed to resolve current bug epic from project property: ${String(err)}`,
    );
  }

  // Fallback 1: env var
  const envKey = process.env['BUG_EPIC_FALLBACK_KEY']?.trim();
  if (envKey) return envKey;

  // Fallback 2: JQL search for the latest open bucket epic
  LOGGER.info(
    'Project property and env-var fallback both unavailable; trying JQL search',
  );
  const jqlKey = await findCurrentBugEpicViaJql(
    accessToken,
    apiBaseUrl,
    projectKey,
  );
  if (jqlKey) {
    bugEpicCache.set(cacheKey, {
      key: jqlKey,
      expiresAt: now + BUG_EPIC_CACHE_TTL_MS,
    });
    return jqlKey;
  }

  return undefined;
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

export interface SearchResult {
  issueKey: string;
  issueUrl: string;
  summary: string;
  status: string;
}

export interface SearchBugsResult {
  issues: SearchResult[];
  total: number;
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
  accessToken: string,
  apiBaseUrl: string,
): Promise<void> {
  for (const attachment of attachments) {
    try {
      const buffer = Buffer.from(attachment.data, 'base64');
      const blob = new Blob([buffer], { type: attachment.type });
      const formData = new FormData();
      formData.append('file', blob, sanitizeFilename(attachment.name));

      const response = await fetch(
        `${apiBaseUrl}/rest/api/3/issue/${issueKey}/attachments`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
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
  accessToken: string,
  apiBaseUrl: string,
): Promise<string | null> {
  try {
    const url = `${apiBaseUrl}/rest/api/3/user/search?query=${encodeURIComponent(email)}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
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
  prefetchedAccessToken?: string,
  prefetchedApiBaseUrl?: string,
): Promise<CreateIssueResult> {
  const accessToken =
    prefetchedAccessToken ?? (await getAccessToken(secretName));
  const apiBaseUrl = prefetchedApiBaseUrl ?? (await getApiBaseUrl(secretName));
  const siteUrl = await getSiteUrl(secretName);

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
  // Falls back gracefully (reporter = service account) if email is absent or
  // the user has no Jira account.
  if (input.reporterEmail) {
    const accountId = await findJiraUserAccountId(
      input.reporterEmail,
      accessToken,
      apiBaseUrl,
    );
    if (accountId) {
      fields.reporter = { id: accountId };
      LOGGER.info(`Setting Jira reporter to accountId ${accountId}`);
    } else {
      LOGGER.info(
        `No Jira account found for ${input.reporterEmail}; reporter will default to service account`,
      );
    }
  }

  LOGGER.info(`Creating Jira bug in project ${projectKey}: ${input.summary}`);

  const response = await fetch(`${apiBaseUrl}/rest/api/3/issue`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
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
  const issueUrl = `${siteUrl}/browse/${issueKey}`;

  LOGGER.info(`Created Jira issue: ${issueKey}`);

  if (input.attachments && input.attachments.length > 0) {
    await attachFilesToJiraIssue(
      issueKey,
      input.attachments,
      accessToken,
      apiBaseUrl,
    );
  }

  return { issueKey, issueUrl };
}

/**
 * Search for existing bug reports in Jira whose summary or description
 * contains the given query text.  Returns up to `maxResults` issues
 * (capped at 10) ordered by most-recently created.
 */
export async function searchJiraBugs(
  query: string,
  projectKey: string,
  secretName: string,
  maxResults = 5,
): Promise<SearchBugsResult> {
  const accessToken = await getAccessToken(secretName);
  const apiBaseUrl = await getApiBaseUrl(secretName);
  const siteUrl = await getSiteUrl(secretName);

  const cap = Math.min(Math.max(maxResults, 1), 10);

  // Escape double-quotes in the user query to prevent JQL injection
  const sanitized = query.replace(/"/g, '\\"');
  const jql = `project = "${projectKey}" AND type = Bug AND text ~ "${sanitized}" ORDER BY created DESC`;

  const params = new URLSearchParams({
    jql,
    maxResults: String(cap),
    fields: 'summary,status',
  });

  const response = await fetch(
    `${apiBaseUrl}/rest/api/3/search?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    LOGGER.warn(`Jira search API error ${response.status}: ${errorBody}`);
    return { issues: [], total: 0 };
  }

  const data = (await response.json()) as {
    total: number;
    issues: Array<{
      key: string;
      fields: { summary: string; status: { name: string } };
    }>;
  };

  return {
    total: data.total,
    issues: data.issues.map((issue) => ({
      issueKey: issue.key,
      issueUrl: `${siteUrl}/browse/${issue.key}`,
      summary: issue.fields.summary,
      status: issue.fields.status.name,
    })),
  };
}
