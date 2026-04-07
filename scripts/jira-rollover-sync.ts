// scripts/jira-rollover-sync.ts
// Usage:
//   pnpm exec tsx scripts/jira-rollover-sync.ts [--check | --sync | --rollover | --fix] [--sprint "Sprint N"]
//
// Manages Jira bucket epic rollovers for two long-lived bucket epics:
//   - LS-1322  Client-Reported Bugs  (label: bucket:client-bugs)
//   - LS-1455  MCP Gaps              (label: bucket:mcp-gaps)
//
// Modes:
//   --check     (default) Read-only report of current state
//   --sync      Update project properties, close old epics, re-parent stranded tickets
//   --rollover  Create new epics for a sprint, then run --sync
//   --fix       Re-parent stranded tickets only

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as readline from 'node:readline';

// ---------------------------------------------------------------------------
// Credential types (mirrored from tools/mcp/jira-server/src/netrc.ts)
// ---------------------------------------------------------------------------

interface OAuthCredentials {
  type: 'oauth';
  clientId: string;
  clientSecret: string;
  cloudId: string;
  siteUrl: string;
}

interface BasicAuthCredentials {
  type: 'basic';
  login: string;
  password: string;
}

type JiraCredentials = OAuthCredentials | BasicAuthCredentials;

const JIRA_SITE_URL = 'https://bkrupa.atlassian.net';

async function getJiraCredentials(): Promise<JiraCredentials> {
  const clientId = process.env['JIRA_CLIENT_ID'];
  const clientSecret = process.env['JIRA_CLIENT_SECRET'];
  const cloudId = process.env['JIRA_CLOUD_ID'];

  if (clientId && clientSecret && cloudId) {
    return {
      type: 'oauth',
      clientId,
      clientSecret,
      cloudId,
      siteUrl: process.env['JIRA_SITE_URL'] ?? JIRA_SITE_URL,
    };
  }

  const email = process.env['JIRA_EMAIL'];
  const token = process.env['JIRA_API_TOKEN'];

  if (email && token) {
    return { type: 'basic', login: email, password: token };
  }

  const netrcPath = join(homedir(), '.netrc');
  let content: string;
  try {
    content = await readFile(netrcPath, 'utf-8');
  } catch {
    throw new Error(
      'No Jira credentials found. Set JIRA_CLIENT_ID + JIRA_CLIENT_SECRET + JIRA_CLOUD_ID (OAuth), ' +
        'or JIRA_EMAIL + JIRA_API_TOKEN (Basic Auth), or create ~/.netrc with Atlassian credentials.',
    );
  }

  const pattern =
    /machine\s+[\w.-]*atlassian[\w.-]*\s+login\s+(\S+)\s+password\s+(\S+)/i;
  const match = pattern.exec(content);
  if (!match) {
    throw new Error(
      'No Atlassian credentials found in ~/.netrc. ' +
        'Expected: machine <host>.atlassian.net login <email> password <api-token>',
    );
  }

  return { type: 'basic', login: match[1]!, password: match[2]! };
}

// ---------------------------------------------------------------------------
// OAuth token cache
// ---------------------------------------------------------------------------

let _oauthToken: string | null = null;
let _oauthExpiry = 0;

async function getOAuthToken(creds: OAuthCredentials): Promise<string> {
  if (_oauthToken && Date.now() < _oauthExpiry - 30_000) return _oauthToken;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  });

  const resp = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OAuth token request failed ${resp.status}: ${text}`);
  }

  const data = (await resp.json()) as {
    access_token: string;
    expires_in: number;
  };
  _oauthToken = data.access_token;
  _oauthExpiry = Date.now() + data.expires_in * 1000;
  return _oauthToken;
}

// ---------------------------------------------------------------------------
// Minimal jiraFetch helper
// ---------------------------------------------------------------------------

let _creds: JiraCredentials | null = null;

async function getCreds(): Promise<JiraCredentials> {
  if (!_creds) _creds = await getJiraCredentials();
  return _creds;
}

function baseUrl(creds: JiraCredentials): string {
  if (creds.type === 'oauth') {
    return `https://api.atlassian.com/ex/jira/${creds.cloudId}`;
  }
  return JIRA_SITE_URL;
}

async function authHeader(creds: JiraCredentials): Promise<string> {
  if (creds.type === 'oauth') {
    const token = await getOAuthToken(creds);
    return `Bearer ${token}`;
  }
  return `Basic ${Buffer.from(`${creds.login}:${creds.password}`).toString('base64')}`;
}

async function jiraFetch<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const creds = await getCreds();
  const url = `${baseUrl(creds)}${path}`;
  const auth = await authHeader(creds);

  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Jira API ${method} ${path} → ${resp.status}: ${text}`);
  }

  // 204 No Content
  if (resp.status === 204) return undefined as unknown as T;

  return resp.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Bucket configuration
// ---------------------------------------------------------------------------

interface BucketConfig {
  name: string;
  label: string;
  propertyKey: string;
  summaryPrefix: string;
}

const BUCKETS: BucketConfig[] = [
  {
    name: 'client-bugs',
    label: 'bucket:client-bugs',
    propertyKey: 'bucket.client-bugs',
    summaryPrefix: 'Client Bugs',
  },
  {
    name: 'mcp-gaps',
    label: 'bucket:mcp-gaps',
    propertyKey: 'bucket.mcp-gaps',
    summaryPrefix: 'MCP Gaps',
  },
];

// ---------------------------------------------------------------------------
// Jira API helpers
// ---------------------------------------------------------------------------

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    status: {
      statusCategory: {
        key: string; // 'done' | 'indeterminate' | 'new'
      };
    };
    labels?: string[];
    parent?: { key: string };
  };
}

interface JiraSearchResult {
  issues: JiraIssue[];
  total: number;
}

interface ProjectProperty {
  value: {
    key: string;
    updatedAt: string;
  };
}

async function getProjectProperty(propertyKey: string): Promise<string | null> {
  try {
    const data = await jiraFetch<ProjectProperty>(
      'GET',
      `/rest/api/3/project/LS/properties/${propertyKey}`,
    );
    return data.value?.key ?? null;
  } catch (err: unknown) {
    // 404 means not set yet
    if (err instanceof Error && err.message.includes('404')) return null;
    throw err;
  }
}

async function setProjectProperty(
  propertyKey: string,
  epicKey: string,
): Promise<void> {
  await jiraFetch('PUT', `/rest/api/3/project/LS/properties/${propertyKey}`, {
    key: epicKey,
    updatedAt: new Date().toISOString(),
  });
}

async function searchIssues(
  jql: string,
  maxResults = 50,
): Promise<JiraIssue[]> {
  const data = await jiraFetch<JiraSearchResult>('POST', '/rest/api/3/search', {
    jql,
    maxResults,
    fields: ['summary', 'status', 'labels', 'parent'],
  });
  return data.issues;
}

async function findOpenEpicsByLabel(label: string): Promise<JiraIssue[]> {
  const jql = `project = LS AND issuetype = Epic AND labels = "${label}" AND statusCategory != Done ORDER BY created DESC`;
  return searchIssues(jql, 10);
}

const JIRA_KEY_PATTERN = /^[A-Z][A-Z0-9_]+-\d+$/;

function validateJiraKey(key: string, context: string): void {
  if (!JIRA_KEY_PATTERN.test(key)) {
    throw new Error(
      `Invalid Jira key "${key}" (${context}). Expected format: PROJECT-123`,
    );
  }
}

async function findNonDoneChildren(epicKey: string): Promise<JiraIssue[]> {
  validateJiraKey(epicKey, 'findNonDoneChildren');
  const jql = `project = LS AND parent = ${epicKey} AND statusCategory != Done`;
  return searchIssues(jql, 200);
}

async function findAllClosedBucketEpics(label: string): Promise<JiraIssue[]> {
  const jql = `project = LS AND issuetype = Epic AND labels = "${label}" AND statusCategory = Done ORDER BY created DESC`;
  return searchIssues(jql, 20);
}

async function findChildrenOf(epicKey: string): Promise<JiraIssue[]> {
  validateJiraKey(epicKey, 'findChildrenOf');
  const jql = `project = LS AND parent = ${epicKey}`;
  return searchIssues(jql, 200);
}

async function transitionToDone(issueKey: string): Promise<void> {
  validateJiraKey(issueKey, 'transitionToDone');
  // First, get available transitions
  const data = await jiraFetch<{
    transitions: Array<{
      id: string;
      name: string;
      to: { statusCategory: { key: string } };
    }>;
  }>('GET', `/rest/api/3/issue/${issueKey}/transitions`);

  const doneTransition = data.transitions.find(
    (t) => t.to.statusCategory.key === 'done',
  );

  if (!doneTransition) {
    throw new Error(`No 'Done' transition found for issue ${issueKey}`);
  }

  await jiraFetch('POST', `/rest/api/3/issue/${issueKey}/transitions`, {
    transition: { id: doneTransition.id },
  });
}

async function addComment(issueKey: string, text: string): Promise<void> {
  await jiraFetch('POST', `/rest/api/3/issue/${issueKey}/comment`, {
    body: {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text }],
        },
      ],
    },
  });
}

async function reparentIssue(
  issueKey: string,
  newParentKey: string,
): Promise<void> {
  await jiraFetch('PUT', `/rest/api/3/issue/${issueKey}`, {
    fields: {
      parent: { key: newParentKey },
    },
  });
}

async function createEpic(
  summary: string,
  labels: string[],
): Promise<JiraIssue> {
  const data = await jiraFetch<JiraIssue>('POST', '/rest/api/3/issue', {
    fields: {
      project: { key: 'LS' },
      issuetype: { name: 'Epic' },
      summary,
      labels,
    },
  });
  return data;
}

// ---------------------------------------------------------------------------
// Mode: --check
// ---------------------------------------------------------------------------

async function runCheck(): Promise<void> {
  console.log('=== Bucket Epic Check ===');

  let totalStranded = 0;

  for (const bucket of BUCKETS) {
    const propertyEpicKey = await getProjectProperty(bucket.propertyKey);
    const openEpics = await findOpenEpicsByLabel(bucket.label);
    const newestOpenEpic = openEpics[0];

    const propDisplay = propertyEpicKey ?? '(not set)';
    const epicDisplay = newestOpenEpic?.key ?? '(none found)';

    const match =
      propertyEpicKey &&
      newestOpenEpic &&
      propertyEpicKey === newestOpenEpic.key;
    const status = match ? '✓' : '✗ MISMATCH';

    const paddedName = bucket.name.padEnd(12);
    console.log(
      `${paddedName} property=${propDisplay}, open epic=${epicDisplay} ${status}`,
    );

    if (!match) {
      if (propertyEpicKey && propertyEpicKey !== newestOpenEpic?.key) {
        console.log(
          `  → Property points to ${propertyEpicKey} but newest open epic is ${epicDisplay}`,
        );
      }
      if (!propertyEpicKey) {
        console.log(`  → Project property not set for ${bucket.propertyKey}`);
      }
    }

    // Check for stranded tickets on any closed bucket epics (that aren't the current open one)
    if (propertyEpicKey && propertyEpicKey !== newestOpenEpic?.key) {
      const stranded = await findStrandedTickets(propertyEpicKey);
      if (stranded.length > 0) {
        totalStranded += stranded.length;
        console.log(`  Stranded tickets under ${propertyEpicKey}:`);
        for (const ticket of stranded) {
          console.log(`    ${ticket.key}: ${ticket.fields.summary}`);
        }
      }
    }
  }

  console.log(`Stranded tickets: ${totalStranded}`);
}

// ---------------------------------------------------------------------------
// Mode: --sync
// ---------------------------------------------------------------------------

interface SyncResult {
  bucket: string;
  previousKey: string | null;
  newKey: string;
  propertyUpdated: boolean;
  epicClosed: boolean;
  strandedFixed: number;
}

async function syncBucket(
  bucket: BucketConfig,
  dryRun = false,
): Promise<SyncResult> {
  const previousKey = await getProjectProperty(bucket.propertyKey);
  const openEpics = await findOpenEpicsByLabel(bucket.label);
  const newestEpic = openEpics[0];

  if (!newestEpic) {
    throw new Error(
      `No open epic found for bucket "${bucket.name}" (label: ${bucket.label})`,
    );
  }

  const newKey = newestEpic.key;
  let propertyUpdated = false;
  let epicClosed = false;
  let strandedFixed = 0;

  // Update project property if stale or unset
  if (previousKey !== newKey) {
    if (!dryRun) {
      await setProjectProperty(bucket.propertyKey, newKey);
    }
    propertyUpdated = true;
  }

  // Move non-Done children from old epic to new one, then close the old epic
  if (previousKey && previousKey !== newKey) {
    validateJiraKey(previousKey, 'syncBucket previousKey');
    const openChildren = await findNonDoneChildren(previousKey);
    for (const ticket of openChildren) {
      if (!dryRun) {
        await reparentIssue(ticket.key, newKey);
      }
      strandedFixed++;
    }

    if (!dryRun) {
      await transitionToDone(previousKey);
      await addComment(previousKey, `Rolled over to ${newKey}`);
    }
    epicClosed = true;
  }

  return {
    bucket: bucket.name,
    previousKey,
    newKey,
    propertyUpdated,
    epicClosed,
    strandedFixed,
  };
}

async function runSync(): Promise<void> {
  console.log('=== Syncing Bucket Epics ===');

  for (const bucket of BUCKETS) {
    console.log(`\nProcessing bucket: ${bucket.name}`);
    const result = await syncBucket(bucket);

    if (
      !result.propertyUpdated &&
      !result.epicClosed &&
      result.strandedFixed === 0
    ) {
      console.log(`  ✓ Already up to date (${result.newKey})`);
    } else {
      if (result.propertyUpdated) {
        console.log(
          `  ✓ Updated property ${bucket.propertyKey}: ${result.previousKey ?? '(unset)'} → ${result.newKey}`,
        );
      }
      if (result.epicClosed) {
        console.log(
          `  ✓ Closed old epic ${result.previousKey} (comment: Rolled over to ${result.newKey})`,
        );
      }
      if (result.strandedFixed > 0) {
        console.log(
          `  ✓ Re-parented ${result.strandedFixed} stranded ticket(s) to ${result.newKey}`,
        );
      }
    }
  }

  console.log('\n✓ Sync complete');
}

// ---------------------------------------------------------------------------
// Mode: --rollover
// ---------------------------------------------------------------------------

async function promptSprintName(): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question('Enter sprint name (e.g. "Sprint 7"): ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function runRollover(sprintName: string): Promise<void> {
  console.log(`=== Rolling Over Bucket Epics for ${sprintName} ===`);

  for (const bucket of BUCKETS) {
    const summary = `${bucket.summaryPrefix} — ${sprintName}`;
    const labels = [bucket.label, 'pinned-status'];

    console.log(`\nCreating epic: "${summary}"`);
    const epic = await createEpic(summary, labels);
    console.log(`  ✓ Created ${epic.key}`);
  }

  console.log('\nRunning sync to update properties and close old epics...');
  await runSync();
}

// ---------------------------------------------------------------------------
// Mode: --fix
// ---------------------------------------------------------------------------

async function runFix(): Promise<void> {
  console.log('=== Fixing Stranded Tickets ===');

  let totalFixed = 0;

  for (const bucket of BUCKETS) {
    const propertyEpicKey = await getProjectProperty(bucket.propertyKey);

    if (!propertyEpicKey) {
      console.log(
        `  ${bucket.name}: no property set, skipping stranded ticket check`,
      );
      continue;
    }

    const openEpics = await findOpenEpicsByLabel(bucket.label);
    const currentEpic = openEpics[0];

    if (!currentEpic) {
      console.log(`  ${bucket.name}: no open epic found, skipping`);
      continue;
    }

    // Collect all closed bucket epics (historical) and any older open epics
    // so we can scan all of them for non-Done children to re-parent.
    const closedEpics = await findAllClosedBucketEpics(bucket.label);
    const olderOpenEpics = openEpics.slice(1); // open epics that aren't the current one
    const epicsToScan = [...olderOpenEpics, ...closedEpics].filter(
      (e) => e.key !== currentEpic.key,
    );

    if (propertyEpicKey !== currentEpic.key) {
      console.log(
        `  ${bucket.name}: property is stale (${propertyEpicKey} → ${currentEpic.key})`,
      );
    } else {
      console.log(
        `  ${bucket.name}: property is current (${currentEpic.key}), scanning historical epics for stranded tickets`,
      );
    }

    for (const olderEpic of epicsToScan) {
      const children = await findChildrenOf(olderEpic.key);
      const nonDone = children.filter(
        (t) => t.fields.status.statusCategory.key !== 'done',
      );
      for (const ticket of nonDone) {
        await reparentIssue(ticket.key, currentEpic.key);
        console.log(
          `  ✓ Re-parented ${ticket.key} from ${olderEpic.key} → ${currentEpic.key}`,
        );
        totalFixed++;
      }
    }
  }

  console.log(`\n✓ Fixed ${totalFixed} stranded ticket(s)`);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

function getFlagValue(flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1] ?? null;
}

async function main(): Promise<void> {
  const mode = hasFlag('--sync')
    ? 'sync'
    : hasFlag('--rollover')
      ? 'rollover'
      : hasFlag('--fix')
        ? 'fix'
        : 'check';

  switch (mode) {
    case 'check':
      await runCheck();
      break;

    case 'sync':
      await runSync();
      break;

    case 'rollover': {
      let sprintName = getFlagValue('--sprint');
      if (!sprintName) {
        sprintName = await promptSprintName();
      }
      if (!sprintName) {
        console.error('Error: sprint name is required for --rollover');
        process.exit(1);
      }
      await runRollover(sprintName);
      break;
    }

    case 'fix':
      await runFix();
      break;
  }
}

main().catch((err: unknown) => {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
