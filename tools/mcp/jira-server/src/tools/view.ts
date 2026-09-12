import {
  markdownTable,
  minifiedJson,
  pickFields,
} from '@legacy-sports/mcp-format';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  ATTACHMENT_COLUMNS,
  type AttachmentMeta,
  viewAttachment,
} from './attachment.js';
import { isBlockerLink } from '../blockers.js';
import { jiraRequest } from '../jira-api.js';
import { searchJqlAll } from '../jql-search.js';
import { extractAdfText } from '../adf.js';
import { matchesStatus } from '../locale.js';
import { COMMENT_COLUMNS } from '../format.js';

export type IncludeOption =
  | 'comments'
  | 'transitions'
  | 'blockers'
  | 'children'
  | 'attachments';

export type ViewParams =
  | {
      key: string;
      format?: 'markdown' | 'json';
      include?: IncludeOption[];
      /**
       * Attachment id, filename, or `"latest"`. When set, the call returns that
       * attachment's content (images inline) instead of the ticket card.
       */
      attachment?: string;
    }
  | { keys: string[]; include?: IncludeOption[] };

interface JiraIssueLink {
  type: { name: string; inward: string };
  inwardIssue?: {
    key: string;
    fields?: { summary?: string; status?: { name: string } };
  };
}

interface JiraIssueResponse {
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    issuetype: { name: string };
    description: unknown;
    assignee: { displayName: string } | null;
    reporter: { displayName: string } | null;
    parent?: { key: string; fields?: { summary?: string } };
    issuelinks: JiraIssueLink[];
    labels: string[];
    priority: { name: string } | null;
    created: string;
    updated: string;
    attachment?: Array<{
      id: string | number;
      filename: string;
      mimeType?: string;
      size?: number;
      created: string;
      author?: { displayName?: string };
    }>;
  };
}

interface BlockerInfo {
  key: string;
  type: string;
  summary?: string;
  status?: string;
}

interface ChildInfo {
  key: string;
  summary: string;
  status: string;
}

interface ChildCounts {
  total: number;
  toDo: number;
  inProgress: number;
  inReview: number;
  done: number;
}

interface CommentInfo {
  [field: string]: unknown;
  id: string;
  author: string;
  created: string;
  body: string;
}

interface TransitionInfo {
  id: string;
  name: string;
  to: { name: string; statusCategory: string };
}

interface Ticket {
  key: string;
  summary: string;
  status: string;
  type: string;
  priority: string;
  description: string;
  assignee: string;
  reporter: string;
  parent: string;
  parentSummary: string;
  labels: string[];
  created: string;
  updated: string;
  blockers?: BlockerInfo[];
  children?: ChildInfo[];
  comments?: CommentInfo[];
  transitions?: TransitionInfo[];
  attachments?: AttachmentMeta[];
}

/** Extract blocker keys (and, when expanded, summary/status) from issue links. */
function extractBlockers(links: JiraIssueLink[]): BlockerInfo[] {
  return links.filter(isBlockerLink).map((link) => ({
    key: link.inwardIssue.key,
    type: 'blocked-by',
    summary: link.inwardIssue.fields?.summary,
    status: link.inwardIssue.fields?.status?.name,
  }));
}

/** Bucket children by status for the JSON shape. */
function summarizeChildren(children: ChildInfo[]): ChildCounts {
  const counts = { toDo: 0, inProgress: 0, inReview: 0, done: 0 };
  for (const child of children) {
    if (matchesStatus(child.status, 'Done')) counts.done++;
    else if (matchesStatus(child.status, 'In Review')) counts.inReview++;
    else if (matchesStatus(child.status, 'In Progress')) counts.inProgress++;
    else counts.toDo++;
  }
  return { total: children.length, ...counts };
}

async function fetchCommentsForKey(key: string): Promise<CommentInfo[]> {
  interface JiraComment {
    id: string;
    author: { displayName: string };
    body: unknown;
    created: string;
  }
  interface JiraCommentsResponse {
    comments: JiraComment[];
    total: number;
  }

  const allComments: JiraComment[] = [];
  let startAt = 0;
  const maxResults = 50;
  let total = Infinity;

  while (allComments.length < total) {
    const result = await jiraRequest<JiraCommentsResponse>({
      method: 'GET',
      path: `/rest/api/3/issue/${key}/comment`,
      query: {
        orderBy: 'created',
        startAt: String(startAt),
        maxResults: String(maxResults),
      },
    });
    total = result.total;
    allComments.push(...result.comments);
    startAt += result.comments.length;
    if (result.comments.length === 0) break;
  }

  return allComments.map((c) => ({
    id: c.id,
    author: c.author.displayName,
    created: c.created,
    body: extractAdfText(c.body),
  }));
}

async function fetchTransitionsForKey(key: string): Promise<TransitionInfo[]> {
  interface JiraTransition {
    id: string;
    name: string;
    to: { name: string; statusCategory: { name: string } };
  }
  interface TransitionsResponse {
    transitions: JiraTransition[];
  }

  const { transitions } = await jiraRequest<TransitionsResponse>({
    method: 'GET',
    path: `/rest/api/3/issue/${key}/transitions`,
  });

  return transitions.map((t) => ({
    id: t.id,
    name: t.name,
    to: { name: t.to.name, statusCategory: t.to.statusCategory.name },
  }));
}

/** Render the ticket as the markdown card defined in LS-8173. */
export function renderMarkdown(ticket: Ticket): string {
  const lines: string[] = [];
  lines.push(`## [${ticket.key}] ${ticket.summary}`);
  lines.push('');

  const metaParts = [
    `**Status:** ${ticket.status}`,
    `**Type:** ${ticket.type}`,
    `**Priority:** ${ticket.priority || 'None'}`,
    `**Assignee:** ${ticket.assignee || 'Unassigned'}`,
  ];
  lines.push(metaParts.join(' · '));

  if (ticket.parent) {
    const parentLabel = ticket.parentSummary
      ? `${ticket.parent} (${ticket.parentSummary})`
      : ticket.parent;
    lines.push(`**Parent:** ${parentLabel}`);
  }

  if (ticket.labels.length > 0) {
    lines.push(`**Labels:** ${ticket.labels.join(', ')}`);
  }

  lines.push('');
  lines.push('### Description');
  lines.push(ticket.description.trim() || '_No description._');

  if (ticket.blockers !== undefined) {
    lines.push('');
    lines.push('### Blockers');
    if (ticket.blockers.length === 0) {
      lines.push('_None._');
    } else {
      for (const b of ticket.blockers) {
        const summary = b.summary ? ` — ${b.summary}` : '';
        const status = b.status ? ` [${b.status}]` : '';
        lines.push(`- ${b.key}${summary}${status}`);
      }
    }
  }

  if (ticket.children !== undefined) {
    lines.push('');
    lines.push('### Children');
    if (ticket.children.length === 0) {
      lines.push('_None._');
    } else {
      for (const c of ticket.children) {
        lines.push(`- ${c.key} — ${c.summary} [${c.status}]`);
      }
    }
  }

  if (ticket.transitions !== undefined) {
    lines.push('');
    lines.push('### Transitions');
    if (ticket.transitions.length === 0) {
      lines.push('_None._');
    } else {
      for (const t of ticket.transitions) {
        lines.push(`- ${t.id}: ${t.name} → ${t.to.name}`);
      }
    }
  }

  if (ticket.attachments !== undefined) {
    lines.push('');
    lines.push('### Attachments');
    if (ticket.attachments.length === 0) {
      lines.push('_None._');
    } else {
      lines.push(
        markdownTable(pickFields(ticket.attachments, ATTACHMENT_COLUMNS), {
          columns: ATTACHMENT_COLUMNS,
        }),
      );
      lines.push('');
      lines.push(
        `_Read one with jira_view({ key: "${ticket.key}", attachment: "<id|filename>" })._`,
      );
    }
  }

  if (ticket.comments !== undefined) {
    lines.push('');
    lines.push('### Comments');
    if (ticket.comments.length === 0) {
      lines.push('_No comments._');
    } else {
      lines.push(
        markdownTable(pickFields(ticket.comments, COMMENT_COLUMNS), {
          columns: COMMENT_COLUMNS,
        }),
      );
    }
  }

  return lines.join('\n');
}

/** Project the internal Ticket into the legacy JSON output shape. */
function ticketToJson(ticket: Ticket): Record<string, unknown> {
  const json: Record<string, unknown> = {
    key: ticket.key,
    summary: ticket.summary,
    status: ticket.status,
    type: ticket.type,
    priority: ticket.priority,
    description: ticket.description,
    assignee: ticket.assignee,
    reporter: ticket.reporter,
    parent: ticket.parent,
    labels: ticket.labels,
    created: ticket.created,
    updated: ticket.updated,
  };
  if (ticket.blockers !== undefined) {
    json.blockers = ticket.blockers.map((b) => ({ key: b.key, type: b.type }));
  }
  if (ticket.children !== undefined && ticket.children.length > 0) {
    json.children = summarizeChildren(ticket.children);
  }
  if (ticket.comments !== undefined) {
    json.comments = pickFields(ticket.comments, COMMENT_COLUMNS);
  }
  if (ticket.transitions !== undefined) {
    json.transitions = ticket.transitions;
  }
  if (ticket.attachments !== undefined) {
    json.attachments = pickFields(ticket.attachments, ATTACHMENT_COLUMNS);
  }
  return json;
}

/** Fetch and assemble a single ticket, with optional sub-resources. */
async function fetchTicket(
  key: string,
  include: IncludeOption[] = [],
): Promise<Ticket> {
  const wantChildren = include.includes('children');
  const wantBlockers = include.includes('blockers');
  const wantComments = include.includes('comments');
  const wantTransitions = include.includes('transitions');
  const wantAttachments = include.includes('attachments');

  const [issue, childResult, commentResult, transitionResult] =
    await Promise.all([
      jiraRequest<JiraIssueResponse>({
        method: 'GET',
        path: `/rest/api/3/issue/${key}`,
        query: {
          // `attachment` rides along on the issue fetch — no extra request.
          fields:
            'summary,status,issuetype,description,assignee,reporter,parent,issuelinks,labels,priority,created,updated' +
            (wantAttachments ? ',attachment' : ''),
        },
      }),
      wantChildren
        ? searchJqlAll<{ summary: string; status: { name: string } }>({
            jql: `parent = ${JSON.stringify(key)}`,
            fields: ['summary', 'status'],
            maxResults: 100,
          }).catch(() => undefined)
        : Promise.resolve(undefined),
      wantComments
        ? fetchCommentsForKey(key).catch(() => undefined)
        : Promise.resolve(undefined),
      wantTransitions
        ? fetchTransitionsForKey(key).catch(() => undefined)
        : Promise.resolve(undefined),
    ]);

  const children: ChildInfo[] | undefined = wantChildren
    ? (childResult ?? []).map((c) => ({
        key: c.key,
        summary: c.fields.summary,
        status: c.fields.status.name,
      }))
    : undefined;

  return {
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status.name,
    type: issue.fields.issuetype.name,
    priority: issue.fields.priority?.name ?? '',
    description: extractAdfText(issue.fields.description),
    assignee: issue.fields.assignee?.displayName ?? '',
    reporter: issue.fields.reporter?.displayName ?? '',
    parent: issue.fields.parent?.key ?? '',
    parentSummary: issue.fields.parent?.fields?.summary ?? '',
    labels: issue.fields.labels,
    created: issue.fields.created,
    updated: issue.fields.updated,
    blockers: wantBlockers
      ? extractBlockers(issue.fields.issuelinks)
      : undefined,
    children,
    comments: commentResult,
    transitions: transitionResult,
    attachments: wantAttachments
      ? (issue.fields.attachment ?? []).map((a) => ({
          id: String(a.id),
          filename: a.filename,
          mimeType: a.mimeType ?? 'application/octet-stream',
          size: a.size ?? 0,
          created: a.created,
          author: a.author?.displayName ?? '',
        }))
      : undefined,
  };
}

/**
 * View ticket details via REST API.
 *
 * Single-key mode (`{ key, format?, include? }`): returns the markdown card by
 * default, or the legacy JSON shape when `format: 'json'`.
 *
 * Batch mode (`{ keys, include? }`): fetches up to 50 tickets in parallel and
 * returns `{ tickets: { [key]: <ticket-json> }, missing: [key, ...] }`.
 *
 * `include` controls which sub-resources are fetched alongside base fields:
 * - `'blockers'` — linked blocker issues (extracted from issue links, no extra API call)
 * - `'children'` — child issues (one JQL query per key)
 * - `'comments'` — all comments ordered by creation date (one API call per key)
 * - `'transitions'` — available workflow transitions (one API call per key)
 * - `'attachments'` — attachment metadata (rides along on the issue fetch, no extra API call)
 *
 * Attachment mode (`{ key, attachment }`): downloads that attachment through
 * this server's credentials and returns it inline — an image content block for
 * screenshots, decoded text for text files. This is the only path that works
 * from a session whose egress proxy blocks Atlassian media URLs (LS-10016).
 *
 * Default (include omitted) returns base fields only.
 * Each key in batch mode resolves the same include[].
 * Per-key failures are isolated to `missing[]`; the call as a whole succeeds.
 */
export async function view(params: ViewParams): Promise<CallToolResult> {
  const include = params.include ?? [];

  if ('keys' in params) {
    const { keys } = params;
    const results = await Promise.allSettled(
      keys.map((k) => fetchTicket(k, include)),
    );
    const tickets: Record<string, Record<string, unknown>> = {};
    const missing: string[] = [];
    keys.forEach((key, i) => {
      const r = results[i];
      if (r.status === 'fulfilled') {
        tickets[key] = ticketToJson(r.value);
      } else {
        missing.push(key);
      }
    });
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({ tickets, missing }),
        },
      ],
    };
  }

  const { key, format = 'markdown' } = params;

  if (params.attachment !== undefined) {
    return viewAttachment(key, params.attachment);
  }

  try {
    const ticket = await fetchTicket(key, include);
    const text =
      format === 'json'
        ? minifiedJson(ticketToJson(ticket))
        : renderMarkdown(ticket);
    return { content: [{ type: 'text', text }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to fetch Jira issue ${key}: ${message}`,
        },
      ],
    };
  }
}
