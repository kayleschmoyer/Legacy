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
import {
  DRAFT_PREVIEW_VIEW_CONTEXT,
  retrieveSecretParameterValue,
} from '@legacy-sports/aws-utils';
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
import { WireNotificationType } from '@legacy-sports/utils';
import { and, eq } from 'drizzle-orm';

/** Issuer claim minted by lambdas/oauth-proxy and required on verify. */
const JWT_ISSUER = 'legacy-sports-oauth-proxy';

/** Audience claim required by all internal Legacy Sports lambdas. */
const JWT_AUDIENCE = 'legacy-sports';

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
const connectionsTable = process.env['CONNECTIONS_TABLE_NAME'] ?? '';
const JWT_SECRET_NAME = process.env['JWT_SECRET_NAME'] ?? '';

/**
 * Connections-table row TTL, in seconds. Overridable via env var so tests can
 * exercise expiry/refresh behavior without waiting out the real 2h window.
 */
const CONNECTION_TTL_SECONDS =
  Number(process.env['CONNECTION_TTL_SECONDS']) || 2 * 60 * 60;

/** Epoch-seconds TTL value for a connections-table row, `CONNECTION_TTL_SECONDS` from now. */
function computeConnectionTtl(): number {
  return Math.floor(Date.now() / 1000) + CONNECTION_TTL_SECONDS;
}

/**
 * Refresh a connection row's TTL without touching its other attributes.
 * Called on every heartbeat ping so long-lived sockets (drafts, live
 * leagues) don't have their row TTL-evicted while still open — shipped
 * clients never call the server `updateContext` action (they disconnect and
 * reconnect instead), so ping is the only refresh signal the server
 * reliably receives from a client that never changes context.
 */
async function refreshConnectionTtl(connectionId: string): Promise<void> {
  const ttl = computeConnectionTtl();
  await dynamoClient.send(
    new UpdateItemCommand({
      TableName: connectionsTable,
      Key: { connectionId: { S: connectionId } },
      UpdateExpression: 'SET #ttl = :ttl',
      ExpressionAttributeNames: { '#ttl': 'ttl' },
      ExpressionAttributeValues: { ':ttl': { N: ttl.toString() } },
    }),
  );
}

/**
 * Coerce an unknown caught value to an Error instance.
 * Plain objects are JSON-serialised into the message so their content is
 * visible in Rollbar rather than collapsing to "[object Object]".
 */
function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === 'object' && error !== null) {
    try {
      return new Error(JSON.stringify(error));
    } catch {
      return new Error('[unserializable error]');
    }
  }
  return new Error(String(error));
}

// Cache JWT secret to avoid repeated Secrets Manager calls
let cachedJwtSecret: string | null = null;

/**
 * Reset the cached JWT secret. Exposed for testing only.
 * @internal
 */
export function __resetCachedJwtSecret(): void {
  cachedJwtSecret = null;
}

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
 * Cookie name for the HttpOnly JWT cookie set by the OAuth proxy.
 */
const JWT_COOKIE = 'ls_jwt';

/**
 * Extract and validate JWT token from WebSocket connection
 *
 * Supports three token sources for maximum client compatibility:
 * 1. Query string (?token=...) - Required for browser WebSocket API
 * 2. Authorization header (Bearer ...) - Preferred for CLI/native clients
 * 3. HttpOnly cookie (ls_jwt) - Used by the web frontend
 *
 * Security: Query string tokens work with browsers but may appear in logs.
 * Mitigation: API Gateway access logs are disabled (see terraform/websocket.tf)
 */
async function validateToken(
  event: APIGatewayProxyWebsocketEventV2,
): Promise<{ valid: boolean; userId?: number; payload?: JwtPayload }> {
  try {
    // Extract JWT — impersonation cookie takes highest priority so that
    // WebSocket connections authenticate as the impersonated user even when
    // the client also passes the admin JWT via query string.
    const headers = event.headers as
      | Record<string, string | undefined>
      | undefined;
    let token: string | undefined;

    // 1. Check HttpOnly cookies first (ls_imp_jwt > ls_jwt)
    const cookieHeader = headers?.['cookie'] || headers?.['Cookie'];
    if (cookieHeader) {
      const cookies = cookieHeader.split(';');
      let regularToken: string | undefined;
      for (const cookie of cookies) {
        const [name, ...valueParts] = cookie.trim().split('=');
        if (name === 'ls_imp_jwt') {
          token = valueParts.join('=') || undefined;
          break;
        }
        if (name === JWT_COOKIE) {
          regularToken = valueParts.join('=') || undefined;
        }
      }
      if (!token && regularToken) {
        token = regularToken;
      }
    }

    // 2. Fall back to query string (?token=...)
    if (!token) {
      const queryParams = event.queryStringParameters as
        | Record<string, string | undefined>
        | undefined;
      token = queryParams?.['token'];
    }

    // 3. Fall back to Authorization header (Bearer ...)
    if (!token) {
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
        'No token provided in query parameters, Authorization header, or cookie',
      );
      return { valid: false };
    }

    // Get JWT secret and verify
    const jwtSecret = await getJwtSecret();

    try {
      const decoded = verify(token, jwtSecret, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
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
    LOGGER.error('Error validating token', toError(error));
    return { valid: false };
  }
}

/**
 * WebSocket Lambda Handler
 * Manages WebSocket connections and message routing
 */

/**
 * Whether a user may read a league's realtime channel, within the caller's
 * DB session (avoids nested runWithPublicClient).
 *
 * Members always have access. Signed-in non-members are allowed as
 * spectators when the league is public (LS-8940).
 */
async function hasLeagueReadAccess(
  db: PublicDb,
  userId: number,
  leagueId: number,
): Promise<boolean> {
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

  if (membership.length > 0) {
    return true;
  }

  // Public-league spectator fallback.
  const league = await db
    .select({ isPublic: PublicSchema.leagues.isPublic })
    .from(PublicSchema.leagues)
    .where(eq(PublicSchema.leagues.id, leagueId))
    .limit(1);

  return league.length > 0 && league[0].isPublic;
}

/**
 * Validate user has access to a league — covers both the `$connect` check
 * and the `updateContext` revalidation, which both route through here.
 */
async function validateLeagueAccess(
  userId: number,
  leagueId: number,
): Promise<boolean> {
  return runWithPublicClient(getDbOptions(), (db: PublicDb) =>
    hasLeagueReadAccess(db, userId, leagueId),
  );
}

/** `viewContext` of a connection in a draft's room (LS-10075). */
const DRAFT_VIEW_CONTEXT = 'draft';

/** Whether `viewContext` names one of the draft channel's connection kinds. */
function isDraftViewContext(viewContext: string | undefined): boolean {
  return (
    viewContext === DRAFT_VIEW_CONTEXT ||
    viewContext === DRAFT_PREVIEW_VIEW_CONTEXT
  );
}

/**
 * Validate user may open a draft's realtime channel (LS-10075).
 *
 * This is `authorizeDraft(ctx, draftId, 'read')` — or `'preview'` for a
 * lobby-preview connection, which resolves identically today — from
 * `lambdas/db/src/schema/drafts/authorize-draft.ts`. That guard is bound to
 * the GraphQL `Context` inside the db lambda, so it can't be called from
 * here; its league branch is the league channel's read check, which is
 * reused rather than restated. Mock drafts are refused, as `authorizeDraft`
 * refuses them, until LS-10076 lands the mock branch in both places.
 *
 * @returns the draft's league, which presence payloads carry.
 */
async function validateDraftAccess(
  userId: number,
  draftId: number,
): Promise<{ hasAccess: boolean; leagueId: number | null }> {
  return runWithPublicClient(getDbOptions(), async (db: PublicDb) => {
    const [draft] = await db
      .select({
        leagueId: PublicSchema.drafts.leagueId,
        kind: PublicSchema.drafts.kind,
      })
      .from(PublicSchema.drafts)
      .where(eq(PublicSchema.drafts.id, draftId))
      .limit(1);

    if (!draft || draft.kind === 'mock') {
      return { hasAccess: false, leagueId: null };
    }

    return {
      hasAccess: await hasLeagueReadAccess(db, userId, draft.leagueId),
      leagueId: draft.leagueId,
    };
  });
}

/**
 * Validate user has access to a matchup (via league membership)
 * Optimized to perform both queries in a single DB client session
 */
async function validateMatchupAccess(
  userId: number,
  matchupId: number,
): Promise<{ hasAccess: boolean; leagueId?: number }> {
  return runWithPublicClient(getDbOptions(), async (db: PublicDb) => {
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
    // Validate Origin header for CSRF protection when using cookie-based auth.
    // Without this, a malicious page could open a WebSocket to our endpoint and
    // the browser would attach the HttpOnly cookie automatically.
    const headers = (event.headers ?? {}) as Record<string, string | undefined>;
    const origin = headers['Origin'] ?? headers['origin'] ?? undefined;
    if (origin) {
      const allowed = (
        process.env['CORS_ALLOWED_ORIGINS'] ?? 'https://legacy-fantasy.com'
      )
        .split(',')
        .map((o) => o.trim());
      if (!allowed.includes(origin)) {
        // A rejected Origin is an expected, fully-handled access-control
        // outcome (we return a clean 403), not an application fault. The
        // public WebSocket endpoint continuously attracts connections from
        // unrecognized origins (bots, scanners, stale preview builds) and
        // browsers auto-reconnect on failure, so capturing every rejection to
        // Rollbar floods the item (1,200+ occurrences) and feeds the
        // per-minute ingestion throttle (LS-8342/LS-8343). Keep a CloudWatch
        // warning for debuggability, but do not report to Rollbar.
        LOGGER.warn('WebSocket connection rejected: invalid Origin', {
          origin,
          allowedOrigins: allowed,
        });
        return { statusCode: 403, body: 'Forbidden: Invalid origin' };
      }
    }

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
    const draftIdStr = queryParams?.['draftId'];
    const viewContext =
      queryParams?.['viewContext'] ||
      (draftIdStr ? DRAFT_VIEW_CONTEXT : 'general');

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

    // Draft channel (LS-10075). Exclusive of league/matchup context: a
    // connection on both would hear league chat on a draft board.
    let draftId: number | undefined;
    let draftLeagueId: number | null = null;

    if (draftIdStr) {
      draftId = parseInt(draftIdStr, 10);
      if (!Number.isFinite(draftId)) {
        LOGGER.warn('Invalid draftId parameter', { draftIdStr });
        return { statusCode: 400, body: 'Bad Request: Invalid draftId' };
      }

      if (leagueId || matchupId) {
        LOGGER.warn('draftId combined with league or matchup context', {
          userId,
          draftId,
          leagueId,
          matchupId,
        });
        return {
          statusCode: 400,
          body: 'Bad Request: draftId cannot be combined with leagueId or matchupId',
        };
      }

      if (!isDraftViewContext(viewContext)) {
        LOGGER.warn('draftId sent without a draft viewContext', {
          userId,
          draftId,
          viewContext,
        });
        return {
          statusCode: 400,
          body: 'Bad Request: draftId requires a draft viewContext',
        };
      }

      const access = await validateDraftAccess(userId, draftId);
      if (!access.hasAccess) {
        LOGGER.warn('User does not have access to draft', { userId, draftId });
        return {
          statusCode: 403,
          body: 'Forbidden: No access to this draft',
        };
      }
      draftLeagueId = access.leagueId;
    }

    LOGGER.info('Validated WebSocket connection', {
      userId,
      leagueId: leagueId ?? null,
      matchupId: matchupId ?? null,
      draftId: draftId ?? null,
      viewContext,
    });

    // Build item with TTL
    const ttl = computeConnectionTtl();
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

    if (draftId) {
      item.draftId = { N: draftId.toString() };
      if (draftLeagueId) {
        item.draftLeagueId = { N: draftLeagueId.toString() };
      }
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
      draftId: draftId ?? null,
      viewContext,
      ttl,
    });

    // ── Presence: broadcast USER_JOINED to channel peers, send USER_LIST back ──
    const presenceChannel = presenceChannelFromRow(item);
    if (presenceChannel) {
      const endpoint = buildApiGatewayEndpoint(event);
      try {
        const peers = await getPresencePeers(presenceChannel, connectionId);

        // Notify existing peers that this user joined
        const joinedMsg = {
          type: 'notification',
          data: {
            type: WireNotificationType.USER_JOINED,
            ...presenceScope(presenceChannel),
            userId,
            username,
          },
        };
        await Promise.allSettled(
          peers.map((p) =>
            sendMessageToConnection(endpoint, p.connectionId, joinedMsg),
          ),
        );

        // Send current online list back to the newly connected client,
        // including the connecting user themselves so they appear as online
        // in their own draft board view.
        const userListMsg = {
          type: 'notification',
          data: {
            type: WireNotificationType.USER_LIST,
            ...presenceScope(presenceChannel),
            users: [
              ...peers.map((p) => ({
                userId: p.userId,
                username: p.username,
              })),
              { userId, username },
            ],
          },
        };
        await sendMessageToConnection(endpoint, connectionId, userListMsg);
      } catch (presenceErr) {
        // Non-fatal — presence is best-effort
        LOGGER.warn('Presence broadcast failed on connect', {
          connectionId,
          ...presenceScope(presenceChannel),
          error:
            presenceErr instanceof Error
              ? presenceErr.message
              : String(presenceErr),
        });
      }
    }

    return { statusCode: 200, body: 'Connected' };
  } catch (error) {
    LOGGER.error('Error handling connect', toError(error), { connectionId });

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
 * A presence channel: the league channel, or a draft's room (LS-10075).
 * Lobby-preview draft connections belong to neither — they never see or
 * show presence.
 */
type PresenceChannel =
  | { kind: 'league'; leagueId: number }
  | { kind: 'draft'; draftId: number; leagueId: number | null };

/** The presence channel a connections-table row belongs to, if any. */
function presenceChannelFromRow(
  row: Record<string, { S?: string; N?: string }> | undefined,
): PresenceChannel | null {
  const draftIdStr = row?.['draftId']?.N;
  if (draftIdStr) {
    if (row?.['viewContext']?.S !== DRAFT_VIEW_CONTEXT) return null;
    const draftLeagueIdStr = row['draftLeagueId']?.N;
    return {
      kind: 'draft',
      draftId: parseInt(draftIdStr, 10),
      leagueId: draftLeagueIdStr ? parseInt(draftLeagueIdStr, 10) : null,
    };
  }

  const leagueIdStr = row?.['leagueId']?.N;
  return leagueIdStr
    ? { kind: 'league', leagueId: parseInt(leagueIdStr, 10) }
    : null;
}

/** The ids a presence payload is scoped by. */
function presenceScope(channel: PresenceChannel): {
  leagueId: number | null;
  draftId?: number;
} {
  return channel.kind === 'draft'
    ? { leagueId: channel.leagueId, draftId: channel.draftId }
    : { leagueId: channel.leagueId };
}

/**
 * Query DynamoDB for all connections on a presence channel, optionally
 * excluding one. Returns connectionId, userId, and username for each.
 */
async function getPresencePeers(
  channel: PresenceChannel,
  excludeConnectionId?: string,
): Promise<Array<{ connectionId: string; userId: number; username: string }>> {
  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: connectionsTable,
      ...(channel.kind === 'draft'
        ? {
            IndexName: 'DraftIdIndex',
            KeyConditionExpression: 'draftId = :draftId',
            ExpressionAttributeValues: {
              ':draftId': { N: channel.draftId.toString() },
            },
          }
        : {
            IndexName: 'LeagueIdIndex',
            KeyConditionExpression: 'leagueId = :leagueId',
            ExpressionAttributeValues: {
              ':leagueId': { N: channel.leagueId.toString() },
            },
          }),
      ProjectionExpression: 'connectionId, userId, username, viewContext',
    }),
  );

  return (result.Items ?? []).flatMap((item) => {
    const connId = item.connectionId?.S;
    // Skip items with missing connectionId or the excluded connection
    if (!connId || (excludeConnectionId && connId === excludeConnectionId)) {
      return [];
    }
    // Lobby previews share the draft's index but are not in its room.
    if (item.viewContext?.S === DRAFT_PREVIEW_VIEW_CONTEXT) {
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
 * Handle a client-initiated request for a fresh presence snapshot.
 *
 * On reconnect, `userJoined`/`userLeft` events that fired while the client
 * was disconnected are lost, leaving `onlineTeamIds` stale until the next
 * full page mount. The `$connect` handler already pushes a fresh USER_LIST
 * on every new connection, but that broadcast is best-effort (LDB-028) —
 * this gives the client an explicit way to re-sync presence without waiting
 * for a full remount.
 */
async function handleRequestUserList(
  connectionId: string,
  event: APIGatewayProxyWebsocketEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const existing = await dynamoClient.send(
      new GetItemCommand({
        TableName: connectionsTable,
        Key: { connectionId: { S: connectionId } },
      }),
    );

    const channel = presenceChannelFromRow(existing.Item);
    if (!channel) {
      // No presence context on this connection — nothing to refresh.
      return { statusCode: 200, body: 'No league context' };
    }

    const userIdStr = existing.Item?.['userId']?.N;
    if (!userIdStr) {
      LOGGER.error('Connection missing userId', { connectionId });
      return { statusCode: 500, body: 'Invalid connection state' };
    }

    const userId = parseInt(userIdStr, 10);
    const username = existing.Item?.['username']?.S ?? '';

    const peers = await getPresencePeers(channel, connectionId);
    const endpoint = buildApiGatewayEndpoint(event);
    const userListMsg = {
      type: 'USER_LIST',
      ...presenceScope(channel),
      users: [
        ...peers.map((p) => ({ userId: p.userId, username: p.username })),
        { userId, username },
      ],
    };
    await sendMessageToConnection(endpoint, connectionId, userListMsg);

    return { statusCode: 200, body: 'User list sent' };
  } catch (error) {
    LOGGER.warn('Failed to handle requestUserList', toError(error), {
      connectionId,
    });
    return { statusCode: 500, body: 'Failed to send user list' };
  }
}

/**
 * Handle disconnection event - remove connection ID from DynamoDB
 * and broadcast USER_LEFT to remaining presence-channel peers.
 */
async function handleDisconnect(
  connectionId: string,
  event: APIGatewayProxyWebsocketEventV2,
): Promise<APIGatewayProxyResultV2> {
  addBreadcrumb('WebSocket disconnection request', { connectionId });

  try {
    // Read connection data before deleting (needed for presence broadcast)
    let disconnectingUserId: number | null = null;
    let disconnectingChannel: PresenceChannel | null = null;

    try {
      const existing = await dynamoClient.send(
        new GetItemCommand({
          TableName: connectionsTable,
          Key: { connectionId: { S: connectionId } },
        }),
      );
      if (existing.Item) {
        disconnectingUserId = parseInt(existing.Item['userId']?.N ?? '0', 10);
        disconnectingChannel = presenceChannelFromRow(existing.Item);
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

    // ── Presence: broadcast USER_LEFT to remaining channel peers ──
    if (disconnectingUserId && disconnectingChannel) {
      const channel = disconnectingChannel;
      const endpoint = buildApiGatewayEndpoint(event);
      try {
        const remainingPeers = await getPresencePeers(channel);
        const leftMsg = {
          type: 'notification',
          data: {
            type: WireNotificationType.USER_LEFT,
            ...presenceScope(channel),
            userId: disconnectingUserId,
          },
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
          ...presenceScope(channel),
          error:
            presenceErr instanceof Error
              ? presenceErr.message
              : String(presenceErr),
        });
      }
    }

    return { statusCode: 200, body: 'Disconnected' };
  } catch (error) {
    LOGGER.error('Error handling disconnect', toError(error), { connectionId });

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
    draftId?: number | null;
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

    // Draft channel (LS-10075) — exclusive of league/matchup context, as on
    // $connect.
    let draftLeagueId: number | null = null;
    if (data.draftId !== undefined && data.draftId !== null) {
      if (
        (data.leagueId ?? null) !== null ||
        (data.matchupId ?? null) !== null
      ) {
        LOGGER.warn('draftId combined with league or matchup context', {
          userId,
          connectionId,
          data,
        });
        return {
          statusCode: 400,
          body: 'Bad Request: draftId cannot be combined with leagueId or matchupId',
        };
      }

      const effectiveViewContext =
        data.viewContext ?? existingConnection.Item['viewContext']?.S;
      if (!isDraftViewContext(effectiveViewContext)) {
        LOGGER.warn('draftId sent without a draft viewContext', {
          userId,
          connectionId,
          viewContext: effectiveViewContext,
        });
        return {
          statusCode: 400,
          body: 'Bad Request: draftId requires a draft viewContext',
        };
      }

      const access = await validateDraftAccess(userId, data.draftId);
      if (!access.hasAccess) {
        LOGGER.warn('User does not have access to draft in updateContext', {
          userId,
          draftId: data.draftId,
          connectionId,
        });
        return {
          statusCode: 403,
          body: 'Forbidden: No access to this draft',
        };
      }
      draftLeagueId = access.leagueId;
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

    // Handle draftId: moving onto a draft channel drops league/matchup
    // context; clearing it, or moving onto a league/matchup, drops the draft.
    if (data.draftId !== undefined && data.draftId !== null) {
      setExpressions.push('draftId = :draftId');
      attributeValues[':draftId'] = { N: data.draftId.toString() };
      removeExpressions.push('leagueId', 'matchupId');
      if (draftLeagueId !== null) {
        setExpressions.push('draftLeagueId = :draftLeagueId');
        attributeValues[':draftLeagueId'] = { N: draftLeagueId.toString() };
      } else {
        removeExpressions.push('draftLeagueId');
      }
    } else if (
      existingConnection.Item['draftId'] &&
      (data.draftId === null ||
        (data.leagueId ?? null) !== null ||
        (data.matchupId ?? null) !== null)
    ) {
      removeExpressions.push('draftId', 'draftLeagueId');
    }

    if (data.viewContext) {
      setExpressions.push('viewContext = :viewContext');
      attributeValues[':viewContext'] = { S: data.viewContext };
    }

    if (setExpressions.length > 0 || removeExpressions.length > 0) {
      // Refresh TTL. `ttl` is a DynamoDB reserved keyword, so it must be
      // referenced via an ExpressionAttributeNames alias rather than
      // literally in the UpdateExpression (LS-9011).
      const ttl = computeConnectionTtl();
      setExpressions.push('#ttl = :ttl');
      attributeValues[':ttl'] = { N: ttl.toString() };

      // Build complete update expression
      const updateParts: string[] = [];
      if (setExpressions.length > 0) {
        updateParts.push(`SET ${setExpressions.join(', ')}`);
      }
      if (removeExpressions.length > 0) {
        // De-duplicated: DynamoDB rejects overlapping document paths, and a
        // draft move can name leagueId/matchupId that are also being cleared.
        updateParts.push(
          `REMOVE ${[...new Set(removeExpressions)].join(', ')}`,
        );
      }

      await dynamoClient.send(
        new UpdateItemCommand({
          TableName: connectionsTable,
          Key: { connectionId: { S: connectionId } },
          UpdateExpression: updateParts.join(' '),
          ExpressionAttributeNames: { '#ttl': 'ttl' },
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
      data?: {
        matchupId?: number;
        leagueId?: number;
        draftId?: number;
        viewContext?: string;
      };
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

    if (message.type === 'requestUserList') {
      return await handleRequestUserList(connectionId, event);
    }

    if (message.type === 'ping') {
      // Refresh the connections-table row TTL on every heartbeat so a long-lived
      // socket (e.g. a multi-hour draft) never gets TTL-evicted while still
      // open. Non-fatal: a refresh failure shouldn't block the pong ack.
      try {
        await refreshConnectionTtl(connectionId);
      } catch (error) {
        LOGGER.warn(
          'Failed to refresh connection TTL on ping',
          toError(error),
          { connectionId },
        );
      }

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
    LOGGER.error('Error handling message', toError(error), {
      connectionId,
      bodyLength: body.length,
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
  // Validate required environment variables on each invocation rather than at
  // module load time. Throwing at module load makes the module untestable
  // (static imports are hoisted before env-var setup in Jest) and causes
  // Rollbar noise when the module is loaded in test environments.
  if (!connectionsTable || !JWT_SECRET_NAME) {
    LOGGER.error(
      'Missing required environment variables',
      new Error('CONNECTIONS_TABLE_NAME and JWT_SECRET_NAME must be set'),
      {
        CONNECTIONS_TABLE_NAME: connectionsTable ? 'SET' : 'MISSING',
        JWT_SECRET_NAME: JWT_SECRET_NAME ? 'SET' : 'MISSING',
      },
    );
    return { statusCode: 500, body: 'Server configuration error' };
  }

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
    LOGGER.error('WebSocket handler error', toError(error), {
      connectionId,
      routeKey,
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
    LOGGER.error('Error broadcasting message', toError(error), {
      filterLeagueId,
    });
    throw error;
  }
}
