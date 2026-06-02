import { jiraRequest } from '../jira-api.js';
import { searchJql, searchJqlAll } from '../jql-search.js';
import { readBucketEpicKey, writeBucketEpicKey } from './bucket-epic.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// ---------------------------------------------------------------------------
// jira_rollover_sync
//
// Manages Jira bucket-epic rollovers at sprint boundaries. Ported from the
// former scripts/jira-rollover-sync.ts (LS-5230) — the script duplicated this
// server's auth/credential layer and project-property handling, so the logic
// now lives alongside jira_get_bucket_epic / jira_set_bucket_epic and reuses
// jiraRequest, searchJql, and the shared bucket-epic property helpers.
//
// Modes:
//   check     (default) Read-only report of current state + stranded tickets
//   sync      Update project properties, close old epics, re-parent stranded
//   rollover  Create new epics for a sprint (requires sprintName), then sync
//   fix       Re-parent stranded tickets only
// ---------------------------------------------------------------------------

export type RolloverMode = 'check' | 'sync' | 'rollover' | 'fix';

interface BucketConfig {
  /** Bucket name — also the project-property suffix (`bucket.<name>`). */
  name: string;
  label: string;
  summaryPrefix: string;
}

const BUCKETS: BucketConfig[] = [
  {
    name: 'client-bugs',
    label: 'bucket:client-bugs',
    summaryPrefix: 'Client Bugs',
  },
  { name: 'mcp-gaps', label: 'bucket:mcp-gaps', summaryPrefix: 'MCP Gaps' },
];

const JIRA_KEY_PATTERN = /^[A-Z][A-Z0-9_]+-\d+$/;

function validateJiraKey(key: string, context: string): void {
  if (!JIRA_KEY_PATTERN.test(key)) {
    throw new Error(
      `Invalid Jira key "${key}" (${context}). Expected format: PROJECT-123`,
    );
  }
}

// --- search field shapes ---------------------------------------------------

interface IssueFields {
  summary: string;
  status: { statusCategory: { key: string } };
  labels?: string[];
  parent?: { key: string };
}

type Issue = { key: string; fields: IssueFields };

const SEARCH_FIELDS = ['summary', 'status', 'labels', 'parent'];

async function findOpenEpicsByLabel(label: string): Promise<Issue[]> {
  const jql = `project = LS AND issuetype = Epic AND labels = "${label}" AND statusCategory != Done ORDER BY created DESC`;
  const { issues } = await searchJql<IssueFields>({
    jql,
    fields: SEARCH_FIELDS,
    maxResults: 10,
  });
  return issues;
}

async function findAllClosedBucketEpics(label: string): Promise<Issue[]> {
  const jql = `project = LS AND issuetype = Epic AND labels = "${label}" AND statusCategory = Done ORDER BY created DESC`;
  const { issues } = await searchJql<IssueFields>({
    jql,
    fields: SEARCH_FIELDS,
    maxResults: 20,
  });
  return issues;
}

async function findChildrenOf(epicKey: string): Promise<Issue[]> {
  validateJiraKey(epicKey, 'findChildrenOf');
  return searchJqlAll<IssueFields>({
    jql: `project = LS AND parent = ${epicKey}`,
    fields: SEARCH_FIELDS,
  });
}

async function findNonDoneChildren(epicKey: string): Promise<Issue[]> {
  validateJiraKey(epicKey, 'findNonDoneChildren');
  return searchJqlAll<IssueFields>({
    jql: `project = LS AND parent = ${epicKey} AND statusCategory != Done`,
    fields: SEARCH_FIELDS,
  });
}

// --- mutations -------------------------------------------------------------

async function transitionToDone(issueKey: string): Promise<void> {
  validateJiraKey(issueKey, 'transitionToDone');
  const data = await jiraRequest<{
    transitions: Array<{
      id: string;
      name: string;
      to: { name: string; statusCategory: { key: string } };
    }>;
  }>({ method: 'GET', path: `/rest/api/3/issue/${issueKey}/transitions` });

  // Match on the destination status name ("Done") rather than the transition
  // name (which varies by workflow). "Won't Do" shares statusCategory.key
  // === 'done', so fall back to it only if no literal "Done" target exists.
  const doneTransition =
    data.transitions.find((t) => t.to.name === 'Done') ??
    data.transitions.find((t) => t.to.statusCategory.key === 'done');

  if (!doneTransition) {
    throw new Error(`No 'Done' transition found for issue ${issueKey}`);
  }

  await jiraRequest({
    method: 'POST',
    path: `/rest/api/3/issue/${issueKey}/transitions`,
    body: { transition: { id: doneTransition.id } },
  });
}

async function addComment(issueKey: string, text: string): Promise<void> {
  await jiraRequest({
    method: 'POST',
    path: `/rest/api/3/issue/${issueKey}/comment`,
    body: {
      body: {
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      },
    },
  });
}

async function reparentIssue(
  issueKey: string,
  newParentKey: string,
): Promise<void> {
  await jiraRequest({
    method: 'PUT',
    path: `/rest/api/3/issue/${issueKey}`,
    body: { fields: { parent: { key: newParentKey } } },
  });
}

async function createEpic(summary: string, labels: string[]): Promise<Issue> {
  return jiraRequest<Issue>({
    method: 'POST',
    path: '/rest/api/3/issue',
    body: {
      fields: {
        project: { key: 'LS' },
        issuetype: { name: 'Epic' },
        summary,
        labels,
      },
    },
  });
}

// --- mode: check -----------------------------------------------------------

async function runCheck(
  report: string[],
): Promise<{ strandedTickets: number }> {
  report.push('=== Bucket Epic Check ===');
  let totalStranded = 0;

  for (const bucket of BUCKETS) {
    const propertyEpicKey = await readBucketEpicKey(bucket.name);
    const openEpics = await findOpenEpicsByLabel(bucket.label);
    const newestOpenEpic = openEpics[0];

    const propDisplay = propertyEpicKey ?? '(not set)';
    const epicDisplay = newestOpenEpic?.key ?? '(none found)';
    const match =
      !!propertyEpicKey &&
      !!newestOpenEpic &&
      propertyEpicKey === newestOpenEpic.key;

    report.push(
      `${bucket.name.padEnd(12)} property=${propDisplay}, open epic=${epicDisplay} ${match ? '✓' : '✗ MISMATCH'}`,
    );

    if (!match) {
      if (propertyEpicKey && propertyEpicKey !== newestOpenEpic?.key) {
        report.push(
          `  → Property points to ${propertyEpicKey} but newest open epic is ${epicDisplay}`,
        );
      }
      if (!propertyEpicKey) {
        report.push(`  → Project property not set for bucket.${bucket.name}`);
      }
    }

    // Surface stranded (non-Done) tickets still parented to a stale property epic.
    if (propertyEpicKey && propertyEpicKey !== newestOpenEpic?.key) {
      const stranded = await findNonDoneChildren(propertyEpicKey);
      if (stranded.length > 0) {
        totalStranded += stranded.length;
        report.push(`  Stranded tickets under ${propertyEpicKey}:`);
        for (const ticket of stranded) {
          report.push(`    ${ticket.key}: ${ticket.fields.summary}`);
        }
      }
    }
  }

  report.push(`Stranded tickets: ${totalStranded}`);
  return { strandedTickets: totalStranded };
}

// --- mode: sync ------------------------------------------------------------

interface SyncResult {
  bucket: string;
  previousKey: string | null;
  newKey: string;
  propertyUpdated: boolean;
  epicClosed: boolean;
  strandedFixed: number;
}

async function syncBucket(bucket: BucketConfig): Promise<SyncResult> {
  const previousKey = await readBucketEpicKey(bucket.name);
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

  if (previousKey !== newKey) {
    await writeBucketEpicKey(bucket.name, newKey);
    propertyUpdated = true;
  }

  // Move non-Done children off the old epic, then close it.
  if (previousKey && previousKey !== newKey) {
    validateJiraKey(previousKey, 'syncBucket previousKey');
    const openChildren = await findNonDoneChildren(previousKey);
    for (const ticket of openChildren) {
      await reparentIssue(ticket.key, newKey);
      strandedFixed++;
    }
    await transitionToDone(previousKey);
    await addComment(previousKey, `Rolled over to ${newKey}`);
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

async function runSync(report: string[]): Promise<SyncResult[]> {
  report.push('=== Syncing Bucket Epics ===');
  const results: SyncResult[] = [];

  for (const bucket of BUCKETS) {
    report.push(`Processing bucket: ${bucket.name}`);
    const result = await syncBucket(bucket);
    results.push(result);

    if (
      !result.propertyUpdated &&
      !result.epicClosed &&
      result.strandedFixed === 0
    ) {
      report.push(`  ✓ Already up to date (${result.newKey})`);
    } else {
      if (result.propertyUpdated) {
        report.push(
          `  ✓ Updated property bucket.${bucket.name}: ${result.previousKey ?? '(unset)'} → ${result.newKey}`,
        );
      }
      if (result.epicClosed) {
        report.push(
          `  ✓ Closed old epic ${result.previousKey} (comment: Rolled over to ${result.newKey})`,
        );
      }
      if (result.strandedFixed > 0) {
        report.push(
          `  ✓ Re-parented ${result.strandedFixed} stranded ticket(s) to ${result.newKey}`,
        );
      }
    }
  }

  report.push('✓ Sync complete');
  return results;
}

// --- mode: rollover --------------------------------------------------------

async function runRollover(
  sprintName: string,
  report: string[],
): Promise<{ createdEpics: string[]; sync: SyncResult[] }> {
  report.push(`=== Rolling Over Bucket Epics for ${sprintName} ===`);
  const createdEpics: string[] = [];

  for (const bucket of BUCKETS) {
    const summary = `${bucket.summaryPrefix} — ${sprintName}`;
    const openEpics = await findOpenEpicsByLabel(bucket.label);
    const existingSprintEpic = openEpics.find(
      (e) => e.fields.summary === summary,
    );
    if (existingSprintEpic) {
      report.push(
        `Skipping epic creation for "${bucket.name}": ${existingSprintEpic.key} already exists for this sprint`,
      );
      continue;
    }

    report.push(`Creating epic: "${summary}"`);
    const epic = await createEpic(summary, [bucket.label, 'pinned-status']);
    createdEpics.push(epic.key);
    report.push(`  ✓ Created ${epic.key}`);
  }

  report.push('Running sync to update properties and close old epics...');
  const sync = await runSync(report);
  return { createdEpics, sync };
}

// --- mode: fix -------------------------------------------------------------

async function runFix(report: string[]): Promise<{ strandedFixed: number }> {
  report.push('=== Fixing Stranded Tickets ===');
  let totalFixed = 0;

  for (const bucket of BUCKETS) {
    const propertyEpicKey = await readBucketEpicKey(bucket.name);
    if (!propertyEpicKey) {
      report.push(
        `  ${bucket.name}: no property set, skipping stranded ticket check`,
      );
      continue;
    }

    const openEpics = await findOpenEpicsByLabel(bucket.label);
    const currentEpic = openEpics[0];
    if (!currentEpic) {
      report.push(`  ${bucket.name}: no open epic found, skipping`);
      continue;
    }

    // Scan every historical epic (older open + closed) for non-Done children.
    const closedEpics = await findAllClosedBucketEpics(bucket.label);
    const olderOpenEpics = openEpics.slice(1);
    const epicsToScan = [...olderOpenEpics, ...closedEpics].filter(
      (e) => e.key !== currentEpic.key,
    );

    if (propertyEpicKey !== currentEpic.key) {
      report.push(
        `  ${bucket.name}: property is stale (${propertyEpicKey} → ${currentEpic.key})`,
      );
    } else {
      report.push(
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
        report.push(
          `  ✓ Re-parented ${ticket.key} from ${olderEpic.key} → ${currentEpic.key}`,
        );
        totalFixed++;
      }
    }
  }

  report.push(`✓ Fixed ${totalFixed} stranded ticket(s)`);
  return { strandedFixed: totalFixed };
}

// --- entry point -----------------------------------------------------------

export async function rolloverSync(params: {
  mode?: RolloverMode;
  sprintName?: string;
}): Promise<CallToolResult> {
  const mode: RolloverMode = params.mode ?? 'check';
  const report: string[] = [];

  try {
    let details: Record<string, unknown> = {};

    switch (mode) {
      case 'check':
        details = await runCheck(report);
        break;
      case 'sync':
        details = { buckets: await runSync(report) };
        break;
      case 'rollover': {
        const sprintName = params.sprintName?.trim();
        if (!sprintName) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error:
                    'sprintName is required for mode "rollover" (e.g. "Sprint 8").',
                }),
              },
            ],
          };
        }
        details = await runRollover(sprintName, report);
        break;
      }
      case 'fix':
        details = await runFix(report);
        break;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { success: true, mode, report, ...details },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            mode,
            report,
            error: message,
          }),
        },
      ],
    };
  }
}
