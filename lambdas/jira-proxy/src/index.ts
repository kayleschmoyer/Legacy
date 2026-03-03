import type { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { verify } from 'jsonwebtoken';
import { LOGGER } from '@legacy-sports/logging';
import { retrieveSecretParameterValue } from '@legacy-sports/aws-utils';
import {
  captureError,
  getSentryConfigFromEnv,
  initSentry,
  withSentry,
} from '@legacy-sports/rollbar';
import type { CreateIssueInput } from './JiraClient';
import { createJiraBug } from './JiraClient';

/** Verified JWT payload fields used for attribution. */
interface JwtUserPayload {
  email?: string;
  username?: string;
  id?: number;
}

const JWT_SECRET_NAME = process.env['JWT_SECRET_NAME'] ?? '';
let jwtSecretPromise: Promise<string> | null = null;

/** Fetch the JWT signing secret from Secrets Manager (cached). Local dev uses JWT_SECRET env var. */
async function getJwtSecret(): Promise<string> {
  // Read JWT_SECRET dynamically so local dev / tests can override it at any time
  const localSecret = process.env['JWT_SECRET'] ?? '';
  if (localSecret) return localSecret;
  if (!JWT_SECRET_NAME) throw new Error('JWT_SECRET_NAME is not set');
  if (!jwtSecretPromise) {
    jwtSecretPromise = retrieveSecretParameterValue(JWT_SECRET_NAME);
  }
  return jwtSecretPromise;
}

/**
 * Verify the Bearer token in the Authorization header against the JWT secret.
 * Returns the decoded payload on success, or null if the token is absent or invalid.
 */
async function verifyAuthToken(
  headers: APIGatewayEvent['headers'],
): Promise<JwtUserPayload | null> {
  const authHeader =
    headers?.['Authorization'] ?? headers?.['authorization'] ?? null;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    const secret = await getJwtSecret();
    const decoded = verify(token, secret, {
      algorithms: ['HS256'],
    }) as JwtUserPayload;
    return decoded;
  } catch {
    return null;
  }
}

// Initialize Sentry
const sentryConfig = getSentryConfigFromEnv();
if (sentryConfig) {
  initSentry(sentryConfig);
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

function jsonResponse(
  statusCode: number,
  body: unknown,
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
    body: JSON.stringify(body),
  };
}

function handleOptions(): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: '',
  };
}

/**
 * Validate and parse the incoming bug report request body.
 * Returns a typed object or throws a descriptive error.
 */
function parseBugReport(rawBody: string | null): CreateIssueInput {
  if (!rawBody) {
    throw new Error('Request body is required');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody) as unknown;
  } catch {
    throw new Error('Request body must be valid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Request body must be a JSON object');
  }

  const body = parsed as Record<string, unknown>;

  if (typeof body['summary'] !== 'string' || body['summary'].trim() === '') {
    throw new Error(
      'Field "summary" is required and must be a non-empty string',
    );
  }

  const input: CreateIssueInput = {
    summary: body['summary'].trim(),
  };

  if (body['description'] !== undefined) {
    if (typeof body['description'] !== 'string') {
      throw new Error('Field "description" must be a string');
    }
    input.description = body['description'];
  }

  if (body['priority'] !== undefined) {
    const validPriorities = ['Low', 'Medium', 'High', 'Critical'] as const;
    if (
      !validPriorities.includes(
        body['priority'] as 'Low' | 'Medium' | 'High' | 'Critical',
      )
    ) {
      throw new Error(
        `Field "priority" must be one of: ${validPriorities.join(', ')}`,
      );
    }
    input.priority = body['priority'] as CreateIssueInput['priority'];
  }

  if (body['labels'] !== undefined) {
    if (
      !Array.isArray(body['labels']) ||
      !(body['labels'] as unknown[]).every((l) => typeof l === 'string')
    ) {
      throw new Error('Field "labels" must be an array of strings');
    }
    input.labels = body['labels'] as string[];
  }

  if (body['reporterEmail'] !== undefined) {
    if (typeof body['reporterEmail'] !== 'string') {
      throw new Error('Field "reporterEmail" must be a string');
    }
    input.reporterEmail = body['reporterEmail'];
  }

  if (body['appVersion'] !== undefined) {
    if (typeof body['appVersion'] !== 'string') {
      throw new Error('Field "appVersion" must be a string');
    }
    input.appVersion = body['appVersion'];
  }

  if (body['environment'] !== undefined) {
    if (typeof body['environment'] !== 'string') {
      throw new Error('Field "environment" must be a string');
    }
    input.environment = body['environment'];
  }

  if (body['pageUrl'] !== undefined) {
    if (typeof body['pageUrl'] !== 'string') {
      throw new Error('Field "pageUrl" must be a string');
    }
    input.pageUrl = body['pageUrl'];
  }

  if (body['userAgent'] !== undefined) {
    if (typeof body['userAgent'] !== 'string') {
      throw new Error('Field "userAgent" must be a string');
    }
    input.userAgent = body['userAgent'];
  }

  return input;
}

/**
 * Jira Proxy Lambda handler.
 *
 * Routes:
 *   POST /jira/bug   — Create a bug report in Jira
 *   OPTIONS  /jira/* — CORS preflight
 */
export const baseHandler = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  LOGGER.info(`Jira Proxy - Method: ${event.httpMethod}, Path: ${event.path}`);

  if (event.httpMethod === 'OPTIONS') {
    return handleOptions();
  }

  const path = event.path.replace(/\/$/, '');

  if (
    event.httpMethod === 'POST' &&
    (path === '/jira/bug' || path === '/bug')
  ) {
    return handleCreateBug(event);
  }

  if (
    event.httpMethod === 'GET' &&
    (path === '/jira/health' || path === '/health')
  ) {
    return jsonResponse(200, { status: 'ok', service: 'jira-proxy' });
  }

  if (
    event.httpMethod === 'GET' &&
    (path === '/jira/badge' || path === '/badge')
  ) {
    // shields.io endpoint badge — returns live health JSON consumed directly by the README badge
    return jsonResponse(200, {
      schemaVersion: 1,
      label: 'Jira Proxy Lambda',
      message: 'healthy',
      color: 'brightgreen',
      cacheSeconds: 60,
      style: 'flat',
    });
  }

  return jsonResponse(404, {
    error: `Route ${event.httpMethod} ${event.path} not found`,
  });
};

async function handleCreateBug(
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> {
  const jiraSecretName = process.env['JIRA_SECRET_NAME'];
  const jiraProjectKey = process.env['JIRA_PROJECT_KEY'];

  if (!jiraSecretName) {
    LOGGER.error('JIRA_SECRET_NAME environment variable is not set');
    return jsonResponse(500, { error: 'Server configuration error' });
  }

  if (!jiraProjectKey) {
    LOGGER.error('JIRA_PROJECT_KEY environment variable is not set');
    return jsonResponse(500, { error: 'Server configuration error' });
  }

  // Verify the JWT — reject unauthenticated / tampered tokens.
  const authUser = await verifyAuthToken(event.headers ?? {});
  if (!authUser) {
    return jsonResponse(401, {
      error: 'Unauthorized: valid authentication token required',
    });
  }

  let input: CreateIssueInput;
  try {
    input = parseBugReport(event.body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid request';
    return jsonResponse(400, { error: message });
  }

  // Prefer the server-decoded email over whatever the client sent (trusted source).
  if (authUser?.email) {
    input.reporterEmail = authUser.email;
  }
  if (authUser?.username) {
    input.reporterUsername = authUser.username;
  }

  LOGGER.info(
    `Bug report from ${input.reporterEmail ?? 'unauthenticated'} (user id: ${String(authUser?.id ?? 'unknown')})`,
  );

  try {
    const result = await createJiraBug(input, jiraProjectKey, jiraSecretName);
    return jsonResponse(201, result);
  } catch (err) {
    LOGGER.error(`Failed to create Jira bug: ${String(err)}`);
    captureError(err instanceof Error ? err : new Error(String(err)));
    return jsonResponse(500, { error: 'Failed to create bug report' });
  }
}

export const handler = withSentry(baseHandler);
