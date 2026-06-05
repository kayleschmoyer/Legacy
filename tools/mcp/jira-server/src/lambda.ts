import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { checkBlockers } from './tools/check-blockers.js';
import { createTicket } from './tools/create-ticket.js';
import { editTicket } from './tools/edit-ticket.js';
import { getComments } from './tools/get-comments.js';
import { linkIssues } from './tools/link-issues.js';
import { listChildren } from './tools/list-children.js';
import { deleteTicket } from './tools/delete-ticket.js';
import { search } from './tools/search.js';
import { setParent } from './tools/set-parent.js';
import { transition, VALID_STATUSES } from './tools/transition.js';
import { view } from './tools/view.js';
import { bulkTransition } from './tools/bulk-transition.js';
import { bulkCreate } from './tools/bulk-create.js';
import { getBucketEpic, setBucketEpic } from './tools/bucket-epic.js';
import { claimTicket } from './tools/claim-ticket.js';
import { getTransitions } from './tools/get-transitions.js';
import { tryGetJiraCredentials } from './netrc.js';
import {
  MCP_SCOPE,
  authenticateMcpRequest,
  handleOAuthMetadataRequest,
} from '@legacy-sports/mcp-bearer-auth';

const sm = new SecretsManagerClient({});
let credentialsInitialized = false;

async function ensureCredentials(): Promise<void> {
  if (credentialsInitialized) return;
  const secretName = process.env['JIRA_SECRET_NAME'];
  if (!secretName) throw new Error('JIRA_SECRET_NAME not configured');
  const result = await sm.send(
    new GetSecretValueCommand({ SecretId: secretName }),
  );
  const raw = result.SecretString?.trim();
  if (!raw) {
    throw new Error(
      `Secret "${secretName}" is missing SecretString or contains only whitespace`,
    );
  }
  let secret: {
    client_id?: string;
    client_secret?: string;
    cloud_id?: string;
    site_url?: string;
  };
  try {
    secret = JSON.parse(raw) as typeof secret;
  } catch {
    throw new Error(`Secret "${secretName}" is not valid JSON`);
  }
  if (!secret.client_id || !secret.client_secret) {
    throw new Error(
      `Secret "${secretName}" is missing required fields: client_id and client_secret`,
    );
  }
  process.env['JIRA_CLIENT_ID'] = secret.client_id;
  process.env['JIRA_CLIENT_SECRET'] = secret.client_secret;
  if (secret.cloud_id) process.env['JIRA_CLOUD_ID'] = secret.cloud_id;
  if (secret.site_url) process.env['JIRA_SITE_URL'] = secret.site_url;
  credentialsInitialized = true;
}

const ticketSchema = z.object({
  summary: z.string().describe('Ticket summary / title'),
  type: z.enum(['Task', 'Bug', 'Story', 'Epic']).default('Task'),
  description: z.string().optional(),
  context: z.string().optional(),
  risk: z.string().optional(),
  planningNotes: z.string().optional(),
  parent: z.string().optional(),
  sprint: z
    .string()
    .regex(/^(?:current|\d+)$/)
    .optional(),
});

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'legacy-sports-jira',
    version: '1.0.0',
  });

  server.tool(
    'jira_auth_status',
    'Check if Jira API credentials are configured.',
    {},
    async () => {
      const creds = await tryGetJiraCredentials();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                configured: creds !== null,
                authMethod: creds?.type ?? null,
                source: creds ? 'env (OAuth 2.0)' : null,
                fallback: creds ? null : 'Use built-in Atlassian MCP tools.',
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    'jira_check_blockers',
    '3-way dependency check for a ticket.',
    { key: z.string() },
    async (p) => checkBlockers(p),
  );
  server.tool(
    'jira_create_ticket',
    'Create a Jira ticket.',
    {
      summary: z.string(),
      type: z.enum(['Task', 'Bug', 'Story', 'Epic']).default('Task'),
      description: z.string().optional(),
      context: z.string().optional(),
      risk: z.string().optional(),
      planningNotes: z.string().optional(),
      parent: z.string().optional(),
      sprint: z
        .string()
        .regex(/^(?:current|\d+)$/)
        .optional(),
    },
    async (p) => createTicket(p),
  );
  server.tool(
    'jira_bulk_create_tickets',
    'Create up to 50 Jira tickets.',
    {
      tickets: z.preprocess((v) => {
        if (typeof v === 'string' && v.trimStart().startsWith('[')) {
          try {
            return JSON.parse(v);
          } catch {
            return v;
          }
        }
        return v;
      }, z.array(ticketSchema).min(1).max(50)),
    },
    async (p) => bulkCreate(p),
  );
  server.tool(
    'jira_edit_ticket',
    'Update fields on a ticket.',
    {
      key: z.string(),
      summary: z.string().optional(),
      description: z.string().optional(),
      type: z.enum(['Task', 'Bug', 'Story', 'Epic']).optional(),
      sprint: z
        .string()
        .regex(/^(?:current|\d+)$/)
        .optional(),
    },
    async (p) => editTicket(p),
  );
  server.tool(
    'jira_get_comments',
    'Fetch all comments on a ticket.',
    { key: z.string() },
    async (p) => getComments(p),
  );
  server.tool(
    'jira_link_issues',
    'Create a link between two tickets.',
    {
      inwardKey: z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/),
      outwardKey: z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/),
      linkType: z.string().min(1),
    },
    async (p) => linkIssues(p),
  );
  server.tool(
    'jira_list_children',
    'List child tickets of an epic or story.',
    {
      key: z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/),
      status: z.string().optional(),
      limit: z.coerce.number().int().positive().max(100).default(25),
      pageToken: z.string().optional(),
    },
    async (p) => listChildren(p),
  );
  server.tool(
    'jira_search',
    'Search Jira issues using JQL. Returns compact results — no metadata blobs. Use compact=true for large result sets to get { issues: [{key, summary, status}], nextPageToken? }. When the response includes nextPageToken, pass it as pageToken to fetch the next page.',
    {
      jql: z.string(),
      maxResults: z.coerce.number().int().positive().max(50).default(15),
      compact: z.boolean().default(false),
      pageToken: z.string().min(1).optional(),
    },
    async (p) => search(p),
  );
  server.tool(
    'jira_set_parent',
    'Set the parent epic of a ticket.',
    { key: z.string(), parent: z.string() },
    async (p) => setParent(p),
  );
  server.tool(
    'jira_transition',
    'Transition ticket(s) to a new status.',
    {
      key: z.preprocess(
        (v) => {
          if (typeof v === 'string') {
            try {
              const p = JSON.parse(v);
              if (Array.isArray(p)) return p;
            } catch {
              /* not json */
            }
          }
          return v;
        },
        z.union([
          z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/),
          z
            .array(z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/))
            .min(1)
            .max(50),
        ]),
      ),
      status: z.enum(VALID_STATUSES),
      cascade: z.boolean().default(false),
    },
    async (params) => {
      if (Array.isArray(params.key)) {
        if (params.cascade)
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: 'cascade=true not supported for multiple keys.',
              },
            ],
          };
        return bulkTransition({ keys: params.key, status: params.status });
      }
      return transition({
        key: params.key,
        status: params.status,
        cascade: params.cascade,
      });
    },
  );
  server.tool(
    'jira_get_transitions',
    'List available transitions for a Jira issue.',
    { key: z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/) },
    async (p) => getTransitions(p),
  );
  server.tool(
    'jira_claim_ticket',
    'Atomically read, validate, and claim a Jira ticket. ' +
      'Fetches ticket details, checks blockers, warns on open children, then transitions to "In Progress". ' +
      'Returns action: "PROCEED" (claimed), "STOP" (blocked/done/in-review/no-transition), or "ALREADY_CLAIMED" (already In Progress). ' +
      'On a successful claim the ticket is assigned to the `assignee` email if provided, else the JIRA_ASSIGNEE_EMAIL env var, else the authenticated service account. ' +
      'Use this instead of separate jira_view + jira_transition calls at the start of a ticket workflow.',
    {
      key: z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/),
      assignee: z
        .string()
        .email()
        .optional()
        .describe(
          'Email of the user to assign the ticket to. Overrides the JIRA_ASSIGNEE_EMAIL env var. Defaults to the service account when neither is set.',
        ),
    },
    async (p) => claimTicket(p),
  );
  server.tool(
    'jira_view',
    'View ticket details including linked blockers.',
    { key: z.string() },
    async (p) => view(p),
  );
  server.tool(
    'jira_delete_ticket',
    "Close a Jira ticket by transitioning to Won't Do.",
    {
      key: z.string(),
      confirm: z.literal(true),
      reason: z.string().optional(),
    },
    async (p) => deleteTicket(p),
  );
  server.tool(
    'jira_get_bucket_epic',
    'Get the current bucket epic key.',
    { bucket: z.enum(['client-bugs', 'mcp-gaps']) },
    async (p) => getBucketEpic(p),
  );
  server.tool(
    'jira_set_bucket_epic',
    'Set the current bucket epic key.',
    { bucket: z.enum(['client-bugs', 'mcp-gaps']), epicKey: z.string() },
    async (p) => setBucketEpic(p),
  );

  return server;
}

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  // Public OAuth discovery endpoint — served before auth so a tokenless client
  // can fetch it (MCP Authorization spec / RFC 9728).
  const metadataResponse = handleOAuthMetadataRequest(event, {
    requiredScope: MCP_SCOPE.jira,
  });
  if (metadataResponse) return metadataResponse;

  const authError = await authenticateMcpRequest(event, {
    requiredScope: MCP_SCOPE.jira,
  });
  if (authError) return authError;

  await ensureCredentials();

  const domainName = event.requestContext.domainName ?? 'localhost';
  const qs = event.rawQueryString ? `?${event.rawQueryString}` : '';
  const url = `https://${domainName}${event.rawPath}${qs}`;
  const bodyText = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString('utf-8')
    : (event.body ?? undefined);

  const request = new Request(url, {
    method: event.requestContext.http.method,
    headers: new Headers(event.headers as Record<string, string>),
    body: ['GET', 'HEAD'].includes(event.requestContext.http.method)
      ? undefined
      : bodyText,
  });

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const server = createMcpServer();
  await server.connect(transport);

  const response = await transport.handleRequest(request);
  await server.close();

  const responseBody = await response.text();
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return { statusCode: response.status, headers, body: responseBody };
};
