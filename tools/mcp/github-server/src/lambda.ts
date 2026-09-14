import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from 'aws-lambda';
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {
  authenticateMcpRequest,
  handleOAuthMetadataRequest,
  MCP_SCOPE,
  runMcpTransport,
} from '@legacy-sports/mcp-bearer-auth';
import { handleMcpDocsRequest } from '@legacy-sports/mcp-docs';
import {
  CSP as DOCS_CSP,
  PAGE as DOCS_PAGE,
} from '@legacy-sports/mcp-docs/pages/github';
import { setLambdaContext } from './lambda-budget.js';
import { createServer } from './index.js';

const sm = new SecretsManagerClient({});
let credentialsInitialized = false;

async function ensureCredentials(): Promise<void> {
  if (credentialsInitialized) return;
  const secretName = process.env['GITHUB_TOKEN_SECRET_NAME'];
  if (!secretName) throw new Error('GITHUB_TOKEN_SECRET_NAME not configured');
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
    app_id?: string;
    installation_id?: string;
    private_key?: string;
  };
  try {
    secret = JSON.parse(raw) as typeof secret;
  } catch {
    throw new Error(`Secret "${secretName}" is not valid JSON`);
  }
  if (!secret.private_key) {
    throw new Error(
      `Secret "${secretName}" is missing required field: private_key`,
    );
  }
  process.env['AGENT_AUTHOR_APP_PRIVATE_KEY'] = secret.private_key;
  if (secret.app_id) process.env['GITHUB_APP_ID'] = secret.app_id;
  if (secret.installation_id)
    process.env['GITHUB_INSTALLATION_ID'] = secret.installation_id;
  credentialsInitialized = true;
}

export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyResultV2> => {
  // Record the real remaining execution time before any pre-handler work
  // (auth, credential fetch) runs, so github_retrigger_check's
  // waitForCompletion can size its internal poll window against what's
  // actually left rather than a hardcoded guess (LS-9988, same pattern as
  // ci-server's LS-8429 fix).
  setLambdaContext(context);

  // Public OAuth discovery endpoint — served before auth so a tokenless client
  // can fetch it (MCP Authorization spec / RFC 9728).
  const metadataResponse = handleOAuthMetadataRequest(event, {
    requiredScope: MCP_SCOPE.github,
  });
  if (metadataResponse) return metadataResponse;

  const authError = await authenticateMcpRequest(event, {
    requiredScope: MCP_SCOPE.github,
  });
  if (authError) return authError;

  // Human-readable tool reference for this server, served to a browser at
  // GET /docs. Placed after the auth check on purpose: tool descriptions
  // name internal buckets, workflows, and ticket keys, so the page needs the
  // same bearer the tools do. Fetch it with `make mcp-docs SERVER=github`.
  const docsResponse = handleMcpDocsRequest(event, DOCS_PAGE, DOCS_CSP);
  if (docsResponse) return docsResponse;

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

  const server = createServer();

  return runMcpTransport(
    async () => {
      await server.connect(transport);
      return transport.handleRequest(request);
    },
    () => server.close(),
  );
};
