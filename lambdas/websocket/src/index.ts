import {
  APIGatewayProxyResultV2,
  APIGatewayProxyWebsocketEventV2,
} from 'aws-lambda';
import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { verify } from 'jsonwebtoken';
import { retrieveSecretParameterValue } from '@legacy-sports/aws-utils';
import { LOGGER } from '@legacy-sports/logging';
import {
  addBreadcrumb,
  captureError,
  getRollbarConfigFromEnv,
  initRollbar,
  withRollbar,
} from '@legacy-sports/rollbar';
import { formatVersionInfo, getVersionInfo } from '@legacy-sports/utils/node';
import {
  PublicDb,
  PublicSchema,
  runWithPublicClient,
} from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';
import { and, eq } from 'drizzle-orm';

// Initialize Rollbar
const rollbarConfig = getRollbarConfigFromEnv();
if (rollbarConfig) {
  initRollbar(rollbarConfig);
}

// Log version information on cold start
const versionInfo = getVersionInfo('legacy-sports-websocket');
LOGGER.info('WebSocket Lambda initialized', {
  versionFormatted: formatVersionInfo(versionInfo),
  ...versionInfo,
});

const dynamoClient = new DynamoDBClient({});
const connectionsTable = process.env['CONNECTIONS_TABLE_NAME'];
const JWT_SECRET_NAME = process.env['JWT_SECRET_NAME'];

// Validate required environment variables
if (!connectionsTable) {
  const errorMsg = 'CONNECTIONS_TABLE_NAME environment variable is required';
  LOGGER.error(errorMsg);
  throw new Error(errorMsg);
}

if (!JWT_SECRET_NAME) {
  const errorMsg = 'JWT_SECRET_NAME environment variable is required';
  LOGGER.error(errorMsg);
  throw new Error(errorMsg);
}

// Cache JWT secret to avoid repeated Secrets Manager calls
let cachedJwtSecret: string | null = null;

interface JwtPayload {
  id: number;
  username: string;
  email?: string;
  accessLevel: string;
}

/**
 * Get JWT secret from Secrets Manager (with caching)
 */
async function getJwtSecret(): Promise<string> {
  if (cachedJwtSecret) {
    return cachedJwtSecret;
  }

  cachedJwtSecret = await retrieveSecretParameterValue(JWT_SECRET_NAME);
  return cachedJwtSecret;
}

/**
 * Extract and validate JWT token from WebSocket connection
 *
 * Supports two token sources for maximum client compatibility:
 * 1. Query string (?token=...) - Required for browser WebSocket API
 * 2. Authorization header (Bearer ...) - Preferred for CLI/native clients
 *
 * Security: Query string tokens work with browsers but may appear in logs.
 * Mitigation: API Gateway access logs are disabled (see terraform/websocket.tf)
 */
async function validateToken(
  event: APIGatewayProxyWebsocketEventV2,
): Promise<{ valid: boolean; userId?: number; payload?: JwtPayload }> {
  try {
    // Extract JWT from query string (?token=...) or Authorization header (Bearer ...)
    const queryParams = event.queryStringParameters as
      | Record<string, string | undefined>
      | undefined;
    let token: string | undefined = queryParams?.['token'];

    // If not in query string, check Authorization header
    if (!token) {
      const headers = event.headers as
        | Record<string, string | undefined>
        | undefined;
      const authHeader =
        headers?.['authorization'] || headers?.['Authorization'];

      if (typeof authHeader === 'string') {
        const match = authHeader.match(/^Bearer\s+(.+)$/i);
        if (match?.[1]) {
          token = match[1];
        }
      }
    }

    if (!token || typeof token !== 'string') {
      LOGGER.warn(
        'No token provided in query parameters or Authorization header',
      );
      return { valid: false };
    }

    // Get JWT secret and verify
    const jwtSecret = await getJwtSecret();

    try {
      const decoded = verify(token, jwtSecret, {
        algorithms: ['HS256'],
      }) as JwtPayload;

      LOGGER.info('JWT verified successfully', { userId: decoded.id });
      return { valid: true, userId: decoded.id, payload: decoded };
    } catch (error) {
      const errorName =
        error && typeof error === 'object' && 'name' in error
          ? String((error as { name?: unknown }).name)
          : 'UnknownError';
      const errorMessage =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: unknown }).message)
          : String(error);

      LOGGER.warn('JWT verification failed', { errorName, errorMessage });
      return { valid: false };
    }
  } catch (error) {
    LOGGER.error('Error validating token', { error });
    return { valid: false };
  }
}

/**
 * WebSocket Lambda Handler
 * Manages WebSocket connections and message routing
 */

/**
 * Validate user has access to a league
 */
async function validateLeagueAccess(
  userId: number,
  leagueId: number,
): Promise<boolean> {
  try {
    return await runWithPublicClient(getDbOptions(), async (db: PublicDb) => {
      const membership = await db
        .select()
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.userId, userId),
          ),
        )
        .limit(1);

      return membership.length > 0;
    });
  } catch (error) {
    LOGGER.error('Error validating league access', { error, userId, leagueId });
    captureError(error instanceof Error ? error : new Error(String(error)), {
      tags: { lambda: 'websocket', operation: 'validateLeagueAccess' },
      extra: { userId, leagueId },
    });
    throw error;
  }
}

/**
 * Validate user has access to a matchup (via league membership)
 * Optimized to perform both queries in a single DB client session
 */
async function validateMatchupAccess(
  userId: number,
  matchupId: number,
): Promise<{ hasAccess: boolean; leagueId?: number }> {
  try {
    return await runWithPublicClient(getDbOptions(), async (db: PublicDb) => {
      // Fetch matchup's league in single query
      const matchup = await db
        .select({ leagueId: PublicSchema.matchups.leagueId })
        .from(PublicSchema.matchups)
        .where(eq(PublicSchema.matchups.id, matchupId))
        .limit(1);

      if (matchup.length === 0) {
        return { hasAccess: false };
      }

      const leagueId = matchup[0].leagueId;

      // Check league membership in same DB session (avoids nested runWithPublicClient)
      const membership = await db
        .select()
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.userId, userId),
          ),
        )
        .limit(1);

      return { hasAccess: membership.length > 0, leagueId };
    });
  } catch (error) {
    LOGGER.error('Error validating matchup access', {
      error,
      userId,
      matchupId,
    });
    captureError(error instanceof Error ? error : new Error(String(error)), {
      tags: { lambda: 'websocket', operation: 'validateMatchupAccess' },
      extra: { userId, matchupId },
    });
    throw error;
  }
}

/**
 * Handle connection event - store connection ID in DynamoDB
 */
async function handleConnect(
  connectionId: string,
  event: APIGatewayProxyWebsocketEventV2,
): Promise<APIGatewayProxyResultV2> {
  addBreadcrumb('WebSocket connection request', { connectionId });

  try {
    // Validate JWT token and extract userId
    const { valid, userId, payload } = await validateToken(event);

    if (!valid || !userId) {
      LOGGER.warn('Invalid or missing JWT token');
      return { statusCode: 401, body: 'Unauthorized: Invalid token' };
    }

    LOGGER.info('Authenticated WebSocket connection', {
      userId,
      username: payload?.username,
      accessLevel: payload?.accessLevel,
    });

    // Extract optional context from query params
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- API Gateway event types are loosely typed
    const rawQueryParams = event.queryStringParameters;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- API Gateway event types are loosely typed
    const queryParams: Record<string, string> | undefined =
      rawQueryParams !== null && rawQueryParams !== undefined
        ? rawQueryParams
        : undefined;

    const leagueIdStr = queryParams?.['leagueId'];
    const matchupIdStr = queryParams?.['matchupId'];
    const viewContext = queryParams?.['viewContext'] || 'general';

    // Validate numeric parameters
    let leagueId: number | undefined;
    let matchupId: number | undefined;

    if (leagueIdStr) {
      leagueId = parseInt(leagueIdStr, 10);
      if (!Number.isFinite(leagueId)) {
        LOGGER.warn('Invalid leagueId parameter', { leagueIdStr });
        return { statusCode: 400, body: 'Bad Request: Invalid leagueId' };
      }

      // Validate user has access to this league
      const hasAccess = await validateLeagueAccess(userId, leagueId);
      if (!hasAccess) {
        LOGGER.warn('User does not have access to league', {
          userId,
          leagueId,
        });
        return {
          statusCode: 403,
          body: 'Forbidden: No access to this league',
        };
      }
    }

    if (matchupIdStr) {
      matchupId = parseInt(matchupIdStr, 10);
      if (!Number.isFinite(matchupId)) {
        LOGGER.warn('Invalid matchupId parameter', { matchupIdStr });
        return { statusCode: 400, body: 'Bad Request: Invalid matchupId' };
      }

      // Validate user has access to this matchup's league
      const { hasAccess, leagueId: matchupLeagueId } =
        await validateMatchupAccess(userId, matchupId);
      if (!hasAccess) {
        LOGGER.warn('User does not have access to matchup', {
          userId,
          matchupId,
        });
        return {
          statusCode: 403,
          body: 'Forbidden: No access to this matchup',
        };
      }

      // Consistency check: ensure matchup belongs to the league if both are provided
      if (leagueId && matchupLeagueId && leagueId !== matchupLeagueId) {
        LOGGER.warn('Matchup does not belong to specified league', {
          userId,
          leagueId,
          matchupId,
          matchupLeagueId,
        });
        return {
          statusCode: 400,
          body: 'Bad Request: Matchup does not belong to specified league',
        };
      }

      // Use matchup's league if not already set
      if (!leagueId && matchupLeagueId) {
        leagueId = matchupLeagueId;
      }
    }

    LOGGER.info('Validated WebSocket connection', {
      userId,
      leagueId: leagueId ?? null,
      matchupId: matchupId ?? null,
      viewContext,
    });

    // Build item with TTL (2 hours from now)
    const ttl = Math.floor(Date.now() / 1000) + 2 * 60 * 60; // 2 hours
    const username = payload?.username ?? '';
    const item: Record<string, { S?: string; N?: string }> = {
      connectionId: { S: connectionId },
      userId: { N: userId.toString() },
      username: { S: username },
      viewContext: { S: viewContext },
      connectedAt: { N: Date.now().toString() },
      ttl: { N: ttl.toString() },
    };

    if (leagueId) {
      item.leagueId = { N: leagueId.toString() };
    }

    if (matchupId) {
      item.matchupId = { N: matchupId.toString() };
    }

    await dynamoClient.send(
      new PutItemCommand({
        TableName: connectionsTable,
        Item: item,
      }),
    );

    LOGGER.info('WebSocket connection established', {
      connectionId,
      userId,
      leagueId: leagueId ?? null,
      matchupId: matchupId ?? null,
      viewContext,
      ttl,
    });

    // ── Presence: broadcast USER_JOINED to league peers, send USER_LIST back ──
    if (leagueId) {
      const endpoint = buildApiGatewayEndpoint(event);
      try {
        const peers = await getLeagueConnections(leagueId, connectionId);

        // Notify existing peers that this user joined
        const joinedMsg = {
          type: 'USER_JOINED',
          leagueId,
          userId,
          username,
        };
        await Promise.allSettled(
          peers.map((p) =>
            sendMessageToConnection(endpoint, p.connectionId, joinedMsg),
          ),
        );

        // Send current online list back to the newly connected client
        const userListMsg = {
          type: 'USER_LIST',
          leagueId,
          users: peers.map((p) => ({ userId: p.userId, username: p.username })),
        };
        await sendMessageToConnection(endpoint, connectionId, userListMsg);
      } catch (presenceErr) {
        // Non-fatal — presence is best-effort
        LOGGER.warn('Presence broadcast failed on connect', {
          connectionId,
          leagueId,
          error:
            presenceErr instanceof Error
              ? presenceErr.message
              : String(presenceErr),
        });
      }
    }

    return { statusCode: 200, body: 'Connected' };
  } catch (error) {
    LOGGER.error('Error handling connect', { error });
    captureError(error instanceof Error ? error : new Error(String(error)), {
      tags: { lambda: 'websocket', operation: 'connect' },
      extra: { connectionId },
    });

    return { statusCode: 500, body: 'Failed to connect' };
  }
}

/**
 * Build the API Gateway Management API endpoint from a WebSocket event.
 */
function buildApiGatewayEndpoint(
  event: APIGatewayProxyWebsocketEventV2,
): string {
  return `https://${event.requestContext.domainName}/${event.requestContext.stage}`;
}

/**
 * Query DynamoDB for all connections in a league, optionally excluding one.
 * Returns connectionId, userId, and username for each connection.
 */
async function getLeagueConnections(
  leagueId: number,
  excludeConnectionId?: string,
): Promise<Array<{ connectionId: string; userId: number; username: string }>> {
  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: connectionsTable,
      IndexName: 'LeagueIdIndex',
      KeyConditionExpression: 'leagueId = :leagueId',
      ExpressionAttributeValues: {
        ':leagueId': { N: leagueId.toString() },
      },
      ProjectionExpression: 'connectionId, userId, username',
    }),
  );

  return (result.Items ?? []).flatMap((item) => {
    const connId = item.connectionId?.S;
    // Skip items with missing connectionId or the excluded connection
    if (!connId || (excludeConnectionId && connId === excludeConnectionId)) {
      return [];
    }
    return [
      {
        connectionId: connId,
        userId: parseInt(item.userId?.N ?? '0', 10),
        username: item.username?.S ?? '',
      },
    ];
  });
}

/**
 * Handle disconnection event - remove connection ID from DynamoDB
 * and broadcast USER_LEFT to remaining league peers.
 */
async function handleDisconnect(
  connectionId: string,
  event: APIGatewayProxyWebsocketEventV2,
): Promise<APIGatewayProxyResultV2> {
  addBreadcrumb('WebSocket disconnection request', { connectionId });

  try {
    // Read connection data before deleting (needed for presence broadcast)
    let disconnectingUserId: number | null = null;
    let disconnectingLeagueId: number | null = null;

    try {
      const existing = await dynamoClient.send(
        new GetItemCommand({
          TableName: connectionsTable,
          Key: { connectionId: { S: connectionId } },
        }),
      );
      if (existing.Item) {
        disconnectingUserId = parseInt(existing.Item['userId']?.N ?? '0', 10);
        const leagueIdStr = existing.Item['leagueId']?.N;
        if (leagueIdStr) disconnectingLeagueId = parseInt(leagueIdStr, 10);
      }
    } catch (readError) {
      // Non-fatal — we still proceed with the delete, but log for visibility
      LOGGER.warn('Failed to read connection data before disconnect', {
        connectionId,
        error:
          readError instanceof Error ? readError.message : String(readError),
      });
      if (
        (readError as { name?: string }).name !==
        'ConditionalCheckFailedException'
      ) {
        captureError(
          readError instanceof Error ? readError : new Error(String(readError)),
          {
            tags: { lambda: 'websocket', operation: 'disconnect-read' },
            extra: { connectionId },
          },
        );
      }
    }

    await dynamoClient.send(
      new DeleteItemCommand({
        TableName: connectionsTable,
        Key: {
          connectionId: { S: connectionId },
        },
      }),
    );

    LOGGER.info('WebSocket connection closed', { connectionId });

    // ── Presence: broadcast USER_LEFT to remaining league peers ──
    if (disconnectingUserId && disconnectingLeagueId) {
      const endpoint = buildApiGatewayEndpoint(event);
      try {
        const remainingPeers = await getLeagueConnections(
          disconnectingLeagueId,
        );
        const leftMsg = {
          type: 'USER_LEFT',
          leagueId: disconnectingLeagueId,
          userId: disconnectingUserId,
        };
        await Promise.allSettled(
          remainingPeers.map((p) =>
            sendMessageToConnection(endpoint, p.connectionId, leftMsg),
          ),
        );
      } catch (presenceErr) {
        // Non-fatal
        LOGGER.warn('Presence broadcast failed on disconnect', {
          connectionId,
          leagueId: disconnectingLeagueId,
          error:
            presenceErr instanceof Error
              ? presenceErr.message
              : String(presenceErr),
        });
      }
    }

    return { statusCode: 200, body: 'Disconnected' };
  } catch (error) {
    LOGGER.error('Error handling disconnect', { error });
    captureError(error instanceof Error ? error : new Error(String(error)), {
      tags: { lambda: 'websocket', operation: 'disconnect' },
      extra: { connectionId },
    });

    return { statusCode: 500, body: 'Failed to disconnect' };
  }
}

/**
 * Update connection context (matchup, league, view)
 * Supports explicit clearing of leagueId and matchupId with null values
 */
async function handleUpdateContext(
  connectionId: string,
  data: {
    matchupId?: number | null;
    leagueId?: number | null;
    viewContext?: string;
  },
): Promise<APIGatewayProxyResultV2> {
  addBreadcrumb('Updating connection context', { connectionId, data });

  try {
    // Retrieve existing connection to get userId for authorization checks
    const existingConnection = await dynamoClient.send(
      new GetItemCommand({
        TableName: connectionsTable,
        Key: { connectionId: { S: connectionId } },
      }),
    );

    if (!existingConnection.Item) {
      LOGGER.warn('Connection not found', { connectionId });
      return { statusCode: 404, body: 'Connection not found' };
    }

    // Extract userId from existing connection
    const userIdStr = existingConnection.Item['userId']?.N;
    if (!userIdStr) {
      LOGGER.error('Connection missing userId', { connectionId });
      return { statusCode: 500, body: 'Invalid connection state' };
    }

    const userId = parseInt(userIdStr, 10);
    if (!Number.isFinite(userId)) {
      LOGGER.error('Invalid userId in connection', {
        connectionId,
        userIdStr,
      });
      return { statusCode: 500, body: 'Invalid connection state' };
    }

    // Re-validate access if leagueId or matchupId are being set (not cleared)
    let matchupLeagueId: number | undefined;

    if (data.leagueId !== undefined && data.leagueId !== null) {
      const hasAccess = await validateLeagueAccess(userId, data.leagueId);
      if (!hasAccess) {
        LOGGER.warn('User does not have access to league in updateContext', {
          userId,
          leagueId: data.leagueId,
          connectionId,
        });
        return {
          statusCode: 403,
          body: 'Forbidden: No access to this league',
        };
      }
    }

    if (data.matchupId !== undefined && data.matchupId !== null) {
      const { hasAccess, leagueId } = await validateMatchupAccess(
        userId,
        data.matchupId,
      );
      if (!hasAccess) {
        LOGGER.warn('User does not have access to matchup in updateContext', {
          userId,
          matchupId: data.matchupId,
          connectionId,
        });
        return {
          statusCode: 403,
          body: 'Forbidden: No access to this matchup',
        };
      }
      matchupLeagueId = leagueId;
    }

    // Consistency check: ensure matchup belongs to the league if both are provided
    if (
      data.leagueId !== undefined &&
      data.leagueId !== null &&
      data.matchupId !== undefined &&
      data.matchupId !== null &&
      matchupLeagueId &&
      data.leagueId !== matchupLeagueId
    ) {
      LOGGER.warn(
        'Matchup does not belong to specified league in updateContext',
        {
          userId,
          leagueId: data.leagueId,
          matchupId: data.matchupId,
          matchupLeagueId,
          connectionId,
        },
      );
      return {
        statusCode: 400,
        body: 'Bad Request: Matchup does not belong to specified league',
      };
    }

    // Build update expression with separate SET and REMOVE clauses
    const setExpressions: string[] = [];
    const removeExpressions: string[] = [];
    const attributeValues: Record<string, { N: string } | { S: string }> = {};

    // Handle matchupId: set value or remove attribute
    if (data.matchupId !== undefined) {
      if (data.matchupId === null) {
        removeExpressions.push('matchupId');
      } else {
        setExpressions.push('matchupId = :matchupId');
        attributeValues[':matchupId'] = { N: data.matchupId.toString() };
      }
    }

    // Handle leagueId: set value or remove attribute
    if (data.leagueId !== undefined) {
      if (data.leagueId === null) {
        removeExpressions.push('leagueId');
      } else {
        setExpressions.push('leagueId = :leagueId');
        attributeValues[':leagueId'] = { N: data.leagueId.toString() };
      }
    }

    if (data.viewContext) {
      setExpressions.push('viewContext = :viewContext');
      attributeValues[':viewContext'] = { S: data.viewContext };
    }

    if (setExpressions.length > 0 || removeExpressions.length > 0) {
      // Refresh TTL (2 hours from now)
      const ttl = Math.floor(Date.now() / 1000) + 2 * 60 * 60;
      setExpressions.push('ttl = :ttl');
      attributeValues[':ttl'] = { N: ttl.toString() };

      // Build complete update expression
      const updateParts: string[] = [];
      if (setExpressions.length > 0) {
        updateParts.push(`SET ${setExpressions.join(', ')}`);
      }
      if (removeExpressions.length > 0) {
        updateParts.push(`REMOVE ${removeExpressions.join(', ')}`);
      }

      await dynamoClient.send(
        new UpdateItemCommand({
          TableName: connectionsTable,
          Key: { connectionId: { S: connectionId } },
          UpdateExpression: updateParts.join(' '),
          ExpressionAttributeValues:
            Object.keys(attributeValues).length > 0
              ? attributeValues
              : undefined,
        }),
      );

      LOGGER.info('Context updated with authorization', {
        connectionId,
        userId,
        data,
        ttl,
        removed: removeExpressions.length > 0 ? removeExpressions : undefined,
      });
    }

    return { statusCode: 200, body: 'Context updated' };
  } catch (error) {
    LOGGER.error('Error updating context:', error as Error);
    return { statusCode: 500, body: 'Failed to update context' };
  }
}

/**
 * Handle default/message event
 */
async function handleDefault(
  connectionId: string,
  body: string,
  event: APIGatewayProxyWebsocketEventV2,
): Promise<APIGatewayProxyResultV2> {
  addBreadcrumb('WebSocket message received', { connectionId });

  try {
    // Log only action/type to avoid PII/log-noise from arbitrary client content
    const bodyLength = body.length;
    LOGGER.info('Received WebSocket message', { connectionId, bodyLength });

    // Parse message if needed
    interface WebSocketMessage {
      action?: string;
      type?: string;
      data?: { matchupId?: number; leagueId?: number; viewContext?: string };
    }

    let message: WebSocketMessage;
    try {
      message = JSON.parse(body) as WebSocketMessage;
      LOGGER.debug('Parsed WebSocket message', {
        connectionId,
        action: message.action,
        type: message.type,
      });
    } catch {
      message = { type: 'unknown', data: undefined };
      LOGGER.warn('Failed to parse WebSocket message', { connectionId });
    }

    // Handle different message types
    if (
      message.action === 'updateContext' ||
      message.type === 'updateContext'
    ) {
      return await handleUpdateContext(
        connectionId,
        message.data || { viewContext: 'general' },
      );
    }

    if (message.type === 'ping') {
      // Send pong response back to the client
      try {
        // Format endpoint for API Gateway Management API
        // Remove protocol and path, keep only domain
        const endpoint = `https://${event.requestContext.domainName}/${event.requestContext.stage}`;

        const apiGateway = new ApiGatewayManagementApiClient({
          endpoint,
        });

        await apiGateway.send(
          new PostToConnectionCommand({
            ConnectionId: connectionId,
            Data: Buffer.from(JSON.stringify({ type: 'pong' })),
          }),
        );

        LOGGER.debug('Sent pong response', { connectionId, endpoint });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        LOGGER.warn('Failed to send pong response', {
          connectionId,
          error: errorMsg,
          stack: errorStack,
          endpoint: `https://${event.requestContext.domainName}/${event.requestContext.stage}`,
        });
      }
      return { statusCode: 200, body: 'Pong sent' };
    }

    return { statusCode: 200, body: 'Message received' };
  } catch (error) {
    LOGGER.error('Error handling message', { error });
    captureError(error instanceof Error ? error : new Error(String(error)), {
      tags: { lambda: 'websocket', operation: 'default' },
      extra: { connectionId, bodyLength: body.length },
    });

    return { statusCode: 500, body: 'Failed to process message' };
  }
}

/**
 * Base WebSocket handler
 */
const baseWebSocketHandler = async (
  event: APIGatewayProxyWebsocketEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const connectionId = event.requestContext.connectionId;
  const routeKey = event.requestContext.routeKey;

  addBreadcrumb('WebSocket event received', {
    connectionId,
    routeKey,
  });

  LOGGER.info('WebSocket event', { connectionId, routeKey });

  try {
    switch (routeKey) {
      case '$connect':
        return await handleConnect(connectionId, event);
      case '$disconnect':
        return await handleDisconnect(connectionId, event);
      case '$default':
        return await handleDefault(connectionId, event.body || '', event);
      default:
        LOGGER.warn('Unknown route key', { routeKey });
        return { statusCode: 400, body: 'Unknown route' };
    }
  } catch (error) {
    LOGGER.error('WebSocket handler error', { error });
    captureError(error instanceof Error ? error : new Error(String(error)), {
      tags: { lambda: 'websocket', operation: 'handler' },
      extra: { connectionId, routeKey },
    });

    return { statusCode: 500, body: 'Internal server error' };
  }
};

/**
 * Main WebSocket handler with Rollbar integration
 */
export const handler = withRollbar(baseWebSocketHandler);

/**
 * Send message to a specific connection
 * This function is exported for use by other lambdas
 */
export async function sendMessageToConnection(
  endpoint: string,
  connectionId: string,
  data: unknown,
): Promise<void> {
  const apiGatewayClient = new ApiGatewayManagementApiClient({
    endpoint,
  });

  try {
    await apiGatewayClient.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(data)),
      }),
    );

    LOGGER.info('Message sent to connection', { connectionId });
  } catch (error) {
    // Connection might be stale, log and clean up
    // Check multiple error shapes for AWS SDK v3
    const isGone =
      (error as { statusCode?: number }).statusCode === 410 ||
      (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode === 410 ||
      (error as { name?: string }).name === 'GoneException';

    if (isGone) {
      // Grace period: connections younger than 10 s may still be completing
      // the $connect handshake — a 410 during that window is likely a race
      // condition (API Gateway hasn't fully registered the route yet), not a
      // genuinely stale socket.  Use a conditional delete so we only remove
      // connections whose connectedAt is older than the grace threshold.
      const GRACE_MS = 10_000;
      const threshold = Date.now() - GRACE_MS;

      try {
        await dynamoClient.send(
          new DeleteItemCommand({
            TableName: connectionsTable,
            Key: {
              connectionId: { S: connectionId },
            },
            ConditionExpression:
              'attribute_not_exists(connectedAt) OR connectedAt < :threshold',
            ExpressionAttributeValues: {
              ':threshold': { N: threshold.toString() },
            },
          }),
        );
        LOGGER.warn('Stale connection removed', { connectionId });
      } catch (condErr) {
        // ConditionalCheckFailedException means the connection is within the
        // grace period — leave the DynamoDB row intact so the next broadcast
        // can retry delivery once the handshake finishes.
        if (
          (condErr as { name?: string }).name ===
          'ConditionalCheckFailedException'
        ) {
          LOGGER.info(
            'Connection within grace period, skipping stale removal',
            { connectionId },
          );
        } else {
          throw condErr;
        }
      }
    } else {
      throw error;
    }
  }
}

/**
 * Broadcast message to all connections (or filtered by leagueId)
 */
export async function broadcastMessage(
  endpoint: string,
  data: unknown,
  filterLeagueId?: number,
): Promise<void> {
  addBreadcrumb('Broadcasting message', { filterLeagueId });

  try {
    let targetConnections: { connectionId?: { S?: string } }[];

    if (filterLeagueId) {
      // Use Query with LeagueIdIndex for better performance
      const result = await dynamoClient.send(
        new QueryCommand({
          TableName: connectionsTable,
          IndexName: 'LeagueIdIndex',
          KeyConditionExpression: 'leagueId = :leagueId',
          ExpressionAttributeValues: {
            ':leagueId': { N: filterLeagueId.toString() },
          },
          ProjectionExpression: 'connectionId',
        }),
      );
      targetConnections = result.Items || [];

      LOGGER.info('Broadcasting to league connections', {
        leagueId: filterLeagueId,
        connectionCount: targetConnections.length,
      });
    } else {
      // Scan for all connections (use sparingly)
      const result = await dynamoClient.send(
        new ScanCommand({
          TableName: connectionsTable,
          ProjectionExpression: 'connectionId',
        }),
      );
      targetConnections = result.Items || [];

      LOGGER.info('Broadcasting to all connections', {
        connectionCount: targetConnections.length,
      });
    }

    // Send message to all target connections
    const sendPromises = targetConnections.map((item) => {
      const connId = item.connectionId?.S;
      if (connId) {
        return sendMessageToConnection(endpoint, connId, data);
      }
      return Promise.resolve();
    });

    await Promise.allSettled(sendPromises);

    LOGGER.info('Broadcast complete', {
      sent: targetConnections.length,
    });
  } catch (error) {
    LOGGER.error('Error broadcasting message', { error });
    captureError(error instanceof Error ? error : new Error(String(error)), {
      tags: { lambda: 'websocket', operation: 'broadcast' },
      extra: { filterLeagueId },
    });
    throw error;
  }
}
