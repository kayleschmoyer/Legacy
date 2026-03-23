import type { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { verify } from 'jsonwebtoken';
import { LOGGER } from '@legacy-sports/logging';
import { retrieveSecretParameterValue } from '@legacy-sports/aws-utils';
import {
  captureError,
  captureWarning,
  getRollbarConfigFromEnv,
  initRollbar,
  withRollbar,
} from '@legacy-sports/rollbar';
import type { AttachmentInput, CreateIssueInput } from './JiraClient';
import { createJiraBug, searchJiraBugs } from './JiraClient';

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

/** Cookie name for the HttpOnly JWT cookie set by the OAuth proxy. */
const JWT_COOKIE = 'ls_jwt';

/**
 * Parse the JWT from the Cookie header string.
 * Returns null if the ls_jwt cookie is not present.
 */
function parseJwtFromCookies(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const cookie of cookieHeader.split(';')) {
    const [name, ...valueParts] = cookie.trim().split('=');
    if (name === JWT_COOKIE) {
      return valueParts.join('=') || null;
    }
  }
  return null;
}

/**
 * Verify the JWT from the Authorization Bearer header or HttpOnly cookie.
 * Returns the decoded payload on success, or null if the token is absent or invalid.
 */
async function verifyAuthToken(
  headers: APIGatewayEvent['headers'],
): Promise<JwtUserPayload | null> {
  // Prefer Authorization header (used by admin impersonation & CLI)
  const authHeader =
    headers?.['Authorization'] ?? headers?.['authorization'] ?? null;
  let token: string | null = null;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    // Fall back to HttpOnly cookie (normal browser sessions)
    const cookieHeader = headers?.['Cookie'] ?? headers?.['cookie'];
    token = parseJwtFromCookies(cookieHeader);
  }

  if (!token) return null;

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

// Initialize Rollbar
const rollbarConfig = getRollbarConfigFromEnv();
if (rollbarConfig) {
  initRollbar(rollbarConfig);
}

/**
 * Origins permitted to make cross-origin requests.
 * Reads from CORS_ALLOWED_ORIGINS env var (comma-separated list).
 * Defaults to the production web domain when not set.
 */
function getAllowedOrigins(): Set<string> {
  const raw = process.env.CORS_ALLOWED_ORIGINS ?? 'https://legacy-fantasy.com';
  return new Set(
    raw
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  );
}

const BASE_CORS_HEADERS = {
  'Access-Control-Allow-Headers':
    'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-CSRF-Token',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  // Security headers
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'none'",
};

function getCorsHeaders(event: APIGatewayEvent): Record<string, string> {
  const origin = event.headers?.Origin ?? event.headers?.origin;
  const allowed = getAllowedOrigins();
  const headers: Record<string, string> = { ...BASE_CORS_HEADERS };
  if (origin && allowed.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Vary'] = 'Origin';
  } else if (origin) {
    LOGGER.warn(
      'CORS: rejected unrecognized origin — check CORS_ALLOWED_ORIGINS env var',
      { origin },
    );
    captureWarning(new Error('CORS: rejected unrecognized origin'), {
      origin,
      allowedOrigins: [...allowed],
    });
  }
  return headers;
}

function jsonResponse(
  statusCode: number,
  body: unknown,
  event: APIGatewayEvent,
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(event),
    },
    body: JSON.stringify(body),
  };
}

function handleOptions(event: APIGatewayEvent): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: getCorsHeaders(event),
    body: '',
  };
}

const MAX_ATTACHMENTS = 3;
/** Max decoded file size per attachment: 2 MB */
const MAX_ATTACHMENT_SIZE_BYTES = 2 * 1024 * 1024;
/** Allowed attachment MIME type prefix/values */
const ALLOWED_ATTACHMENT_TYPES =
  /^(image\/|video\/(mp4|webm|quicktime|x-msvideo)$)/;

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

  if (body['attachments'] !== undefined) {
    if (!Array.isArray(body['attachments'])) {
      throw new Error('Field "attachments" must be an array');
    }
    const rawAttachments = body['attachments'] as unknown[];
    if (rawAttachments.length > MAX_ATTACHMENTS) {
      throw new Error(`Maximum ${String(MAX_ATTACHMENTS)} attachments allowed`);
    }
    const attachments: AttachmentInput[] = [];
    for (const item of rawAttachments) {
      if (typeof item !== 'object' || item === null) {
        throw new Error('Each attachment must be an object');
      }
      const att = item as Record<string, unknown>;
      if (typeof att['name'] !== 'string' || !att['name']) {
        throw new Error('Each attachment must have a non-empty "name" string');
      }
      if (
        typeof att['type'] !== 'string' ||
        !ALLOWED_ATTACHMENT_TYPES.test(att['type'])
      ) {
        throw new Error(
          `Attachment type "${String(att['type'])}" is not allowed`,
        );
      }
      if (typeof att['data'] !== 'string' || !att['data']) {
        throw new Error(
          'Each attachment must have a non-empty "data" base64 string',
        );
      }
      // Estimate decoded size: base64 encodes 3 bytes as 4 chars
      const estimatedBytes = Math.ceil((att['data'].length * 3) / 4);
      if (estimatedBytes > MAX_ATTACHMENT_SIZE_BYTES) {
        throw new Error(
          `Attachment "${att['name']}" exceeds the 2 MB size limit`,
        );
      }
      attachments.push({
        name: att['name'],
        type: att['type'],
        data: att['data'],
      });
    }
    input.attachments = attachments;
  }

  return input;
}

/**
 * Jira Proxy Lambda handler.
 *
 * Routes:
 *   POST /jira/bug    — Create a bug report in Jira
 *   POST /jira/search — Search for existing bug reports
 *   OPTIONS  /jira/*  — CORS preflight
 */
export const baseHandler = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  LOGGER.info(`Jira Proxy - Method: ${event.httpMethod}, Path: ${event.path}`);

  if (event.httpMethod === 'OPTIONS') {
    return handleOptions(event);
  }

  const path = event.path.replace(/\/$/, '');

  if (
    event.httpMethod === 'POST' &&
    (path === '/jira/bug' || path === '/bug')
  ) {
    return handleCreateBug(event);
  }

  if (
    event.httpMethod === 'POST' &&
    (path === '/jira/search' || path === '/search')
  ) {
    return handleSearchBugs(event);
  }

  if (
    event.httpMethod === 'GET' &&
    (path === '/jira/health' || path === '/health')
  ) {
    return jsonResponse(200, { status: 'ok', service: 'jira-proxy' }, event);
  }

  if (
    event.httpMethod === 'GET' &&
    (path === '/jira/badge' || path === '/badge')
  ) {
    // shields.io endpoint badge — returns live health JSON consumed directly by the README badge
    return jsonResponse(
      200,
      {
        schemaVersion: 1,
        label: 'Jira Proxy Lambda',
        message: 'healthy',
        color: 'brightgreen',
        cacheSeconds: 60,
        style: 'flat',
      },
      event,
    );
  }

  return jsonResponse(
    404,
    {
      error: `Route ${event.httpMethod} ${event.path} not found`,
    },
    event,
  );
};

/** Minimum query length to avoid overly broad Jira searches. */
const MIN_SEARCH_QUERY_LENGTH = 3;
/** Maximum query length — queries longer than this are silently truncated to prevent abuse. */
const MAX_SEARCH_QUERY_LENGTH = 200;

async function handleSearchBugs(
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> {
  const jiraSecretName = process.env['JIRA_SECRET_NAME'];
  const jiraProjectKey = process.env['JIRA_PROJECT_KEY'];

  if (!jiraSecretName || !jiraProjectKey) {
    return jsonResponse(500, { error: 'Server configuration error' }, event);
  }

  const authUser = await verifyAuthToken(event.headers ?? {});
  if (!authUser) {
    return jsonResponse(
      401,
      { error: 'Unauthorized: valid authentication token required' },
      event,
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(event.body ?? '');
    if (typeof parsed !== 'object' || parsed === null) {
      return jsonResponse(
        400,
        { error: 'Request body must be a JSON object' },
        event,
      );
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return jsonResponse(
      400,
      { error: 'Request body must be valid JSON' },
      event,
    );
  }

  const rawQuery =
    typeof body['query'] === 'string' ? body['query'].trim() : '';
  if (rawQuery.length < MIN_SEARCH_QUERY_LENGTH) {
    return jsonResponse(
      400,
      {
        error: `Query must be at least ${String(MIN_SEARCH_QUERY_LENGTH)} characters`,
      },
      event,
    );
  }
  const query = rawQuery.slice(0, MAX_SEARCH_QUERY_LENGTH);

  try {
    const result = await searchJiraBugs(query, jiraProjectKey, jiraSecretName);
    return jsonResponse(200, result, event);
  } catch (err) {
    LOGGER.error(`Failed to search Jira bugs: ${String(err)}`);
    return jsonResponse(
      500,
      { error: 'Failed to search for existing bugs' },
      event,
    );
  }
}

async function handleCreateBug(
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> {
  const jiraSecretName = process.env['JIRA_SECRET_NAME'];
  const jiraProjectKey = process.env['JIRA_PROJECT_KEY'];
  const bugEpicKey = (process.env['BUG_EPIC_KEY'] ?? '').trim();

  if (!jiraSecretName) {
    LOGGER.error('JIRA_SECRET_NAME environment variable is not set');
    return jsonResponse(500, { error: 'Server configuration error' }, event);
  }

  if (!jiraProjectKey) {
    LOGGER.error('JIRA_PROJECT_KEY environment variable is not set');
    return jsonResponse(500, { error: 'Server configuration error' }, event);
  }

  // Verify the JWT — reject unauthenticated / tampered tokens.
  const authUser = await verifyAuthToken(event.headers ?? {});
  if (!authUser) {
    return jsonResponse(
      401,
      {
        error: 'Unauthorized: valid authentication token required',
      },
      event,
    );
  }

  let input: CreateIssueInput;
  try {
    input = parseBugReport(event.body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid request';
    return jsonResponse(400, { error: message }, event);
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
    const result = await createJiraBug(
      input,
      jiraProjectKey,
      jiraSecretName,
      bugEpicKey || undefined,
    );
    return jsonResponse(201, result, event);
  } catch (err) {
    LOGGER.error(`Failed to create Jira bug: ${String(err)}`);
    captureError(err instanceof Error ? err : new Error(String(err)));
    return jsonResponse(500, { error: 'Failed to create bug report' }, event);
  }
}

export const handler = withRollbar(baseHandler);
