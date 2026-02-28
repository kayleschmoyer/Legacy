import type { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import {
  captureError,
  getSentryConfigFromEnv,
  initSentry,
  withSentry,
} from '@legacy-sports/sentry';
import type { CreateIssueInput } from './JiraClient';
import { createJiraBug } from './JiraClient';

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

  let input: CreateIssueInput;
  try {
    input = parseBugReport(event.body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid request';
    return jsonResponse(400, { error: message });
  }

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
