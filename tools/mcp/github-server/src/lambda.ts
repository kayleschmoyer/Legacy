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
import { authenticateMcpRequest } from './mcp-bearer-auth.js';

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
): Promise<APIGatewayProxyResultV2> => {
  const authError = await authenticateMcpRequest(event);
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

  const server = createServer();
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
