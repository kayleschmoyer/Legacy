import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createServer } from './index.js';
import {
  MCP_SCOPE,
  authenticateMcpRequest,
  handleOAuthMetadataRequest,
} from '@legacy-sports/mcp-bearer-auth';

const sm = new SecretsManagerClient({});
let credentialsInitialized = false;

/**
 * Fetch the Preview/Deploy App's credentials (PREVIEW_APP_TOKEN_SECRET_NAME)
 * so `getDeploysToken()` in github-api.ts mints a token scoped to the private
 * `bkrupa/legacy-sports-deploys` repo, instead of falling back to the Agent
 * Author token, which cannot read that repo and produces a deterministic 404
 * from `ci_get_playwright_report`/`ci_get_playwright_test_result` (LS-8322).
 *
 * Non-fatal by design: skips gracefully with a stderr warning when the env
 * var is unset (keeps local/non-Lambda invocations working) or when the
 * secret fetch/parse fails — a broken Preview App secret must not take down
 * every other tool this Lambda serves.
 */
async function ensurePreviewAppCredentials(): Promise<void> {
  const secretName = process.env['PREVIEW_APP_TOKEN_SECRET_NAME'];
  if (!secretName) {
    process.stderr.write(
      'PREVIEW_APP_TOKEN_SECRET_NAME not configured — getDeploysToken() will ' +
        'fall back to the Agent Author token, which cannot read the private ' +
        'bkrupa/legacy-sports-deploys repo.\n',
    );
    return;
  }
  try {
    const result = await sm.send(
      new GetSecretValueCommand({ SecretId: secretName }),
    );
    const raw = result.SecretString?.trim();
    if (!raw) {
      throw new Error('missing SecretString or contains only whitespace');
    }
    const secret = JSON.parse(raw) as {
      app_id?: string;
      private_key?: string;
    };
    if (!secret.app_id || !secret.private_key) {
      throw new Error('missing required fields: app_id, private_key');
    }
    process.env['PREVIEW_APP_PRIVATE_KEY'] = secret.private_key;
    process.env['PREVIEW_APP_ID'] = secret.app_id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `Failed to load Preview App credentials from secret "${secretName}": ${msg} — ` +
        'getDeploysToken() will fall back to the Agent Author token.\n',
    );
  }
}

export async function ensureCredentials(): Promise<void> {
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

  await ensurePreviewAppCredentials();

  credentialsInitialized = true;
}

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  // Public OAuth discovery endpoint — served before auth so a tokenless client
  // can fetch it (MCP Authorization spec / RFC 9728).
  const metadataResponse = handleOAuthMetadataRequest(event, {
    requiredScope: MCP_SCOPE.ci,
  });
  if (metadataResponse) return metadataResponse;

  const authError = await authenticateMcpRequest(event, {
    requiredScope: MCP_SCOPE.ci,
  });
  if (authError) return authError;

  try {
    await ensureCredentials();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32603, message: `CI server credential error: ${msg}` },
        id: null,
      }),
    };
  }

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
  await server.connect(transport);

  try {
    const response = await transport.handleRequest(request);
    const responseBody = await response.text();
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return { statusCode: response.status, headers, body: responseBody };
  } finally {
    // Always close the server, even on errors, to avoid resource leaks.
    await server.close().catch(() => undefined);
  }
};
