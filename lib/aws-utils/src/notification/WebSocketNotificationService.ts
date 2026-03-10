import {
  DeleteItemCommand,
  DynamoDBClient,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { LOGGER } from '@legacy-sports/logging';
import { WireNotificationType } from '@legacy-sports/utils';

// Type for DynamoDB attribute values
interface DynamoDBItem {
  [key: string]: {
    S?: string;
    N?: string;
    BOOL?: boolean;
    // Add other DynamoDB types as needed
  };
}

export interface DraftCompletedNotification {
  type: typeof WireNotificationType.DRAFT_COMPLETED;
  leagueId: number;
  selectionMethod: string;
  completedAt: string;
}

export interface DraftStartedNotification {
  type: typeof WireNotificationType.DRAFT_STARTED;
  leagueId: number;
  draftId: number;
  draftOrder: string;
  teamCount: number;
  pickTimeLimitSeconds: number;
  currentPickDeadline: string;
  startedAt: string;
}

export interface DraftPickNotification {
  type: typeof WireNotificationType.DRAFT_PICK_MADE;
  leagueId: number;
  draftId: number;
  pickId: number;
  teamId: number;
  playerId: number;
  round: number;
  pickNumber: number;
  overallPick: number;
  pickedAt: string;
  wasAutoPick: boolean;
  autoPickReason: string | null;
  currentPickDeadline: string | null;
  nextPick?: {
    teamId: number;
    round: number;
    pickNumber: number;
    overallPick: number;
  };
}

export interface DraftPausedNotification {
  type: typeof WireNotificationType.DRAFT_PAUSED;
  leagueId: number;
  pausedAt: string;
}

export interface DraftPickUndoneNotification {
  type: typeof WireNotificationType.DRAFT_PICK_UNDONE;
  leagueId: number;
  draftId: number;
  undonePickId: number;
  playerId: number;
  teamId: number;
  overallPick: number;
  newCurrentPick: number;
  newPickDeadline: string;
  undoneAt: string;
}

export interface DraftResumedNotification {
  type: typeof WireNotificationType.DRAFT_RESUMED;
  leagueId: number;
  currentPickDeadline: string;
  resumedAt: string;
}

export interface PlayerStatsLoadingNotification {
  type: typeof WireNotificationType.PLAYER_STATS_LOADING;
  playerId: number;
  matchupId: number;
  leagueId: number;
  progress?: {
    loaded: number;
    total: number;
  };
}

export interface PlayerStatsUpdatedNotification {
  type: typeof WireNotificationType.PLAYER_STATS_UPDATED;
  playerId: number;
  matchupId: number;
  leagueId: number;
  stats: unknown;
}

export interface MatchupStatsCompleteNotification {
  type: typeof WireNotificationType.MATCHUP_STATS_COMPLETE;
  matchupId: number;
  leagueId: number;
  totalPlayers: number;
  completedAt: string;
}

/**
 * A new message posted to a league-wide chat room.
 * Broadcast to all WebSocket connections scoped to the league.
 */
export interface LeagueChatMessageNotification {
  type: typeof WireNotificationType.LEAGUE_CHAT_MESSAGE;
  leagueId: number;
  messageId: number;
  senderId: number | null;
  senderUsername: string;
  messageText: string;
  /** ISO-8601 */
  timestamp: string;
  /** Discriminates between 'text', 'gif', 'trade', 'waiver', 'draft_settings' */
  messageType?: string;
  /** GIF URL for gif-type messages */
  gifUrl?: string | null;
  /** JSON-serialised metadata for card rendering */
  metadata?: Record<string, unknown> | null;
}

/**
 * A direct message pushed only to the recipient's active connections.
 */
export interface DirectMessageNotification {
  type: typeof WireNotificationType.DIRECT_MESSAGE;
  messageId: number;
  fromUserId: number;
  fromUsername: string;
  toUserId: number;
  leagueId: number | null;
  messageText: string;
  /** ISO-8601 */
  createdAt: string;
}

export interface NotificationMessage {
  type: string;
  data: unknown;
}

export interface RosterUpdateNotification {
  type: typeof WireNotificationType.ROSTER_UPDATE;
  leagueId: number;
  updatedAt: string;
}

export interface TradeOfferNotification {
  type: typeof WireNotificationType.TRADE_OFFER;
  leagueId: number;
  tradeOfferId: number;
  proposingTeamId: number;
  receivingTeamId: number;
  proposingTeamName: string;
  receivingTeamName: string;
  playerCount: number;
  /** ISO-8601 */
  proposedAt: string;
}

export interface PlayoffBracketCreatedNotification {
  type: typeof WireNotificationType.PLAYOFF_BRACKET_CREATED;
  leagueId: number;
  bracketId: number;
  season: number;
  format: string;
  startWeek: number;
  /** ISO-8601 */
  createdAt: string;
}

export interface WeekAdvancedNotification {
  type: typeof WireNotificationType.WEEK_ADVANCED;
  leagueId: number;
  previousWeek: number;
  newWeek: number;
  /** ISO-8601 */
  advancedAt: string;
}

/**
 * Sent to a specific user when their subscription tier or status changes.
 * Delivered only to the affected user's active WebSocket connections.
 */
export interface SubscriptionUpdatedNotification {
  type: typeof WireNotificationType.SUBSCRIPTION_UPDATED;
  tier: 'free' | 'premium';
  status: string;
}

/**
 * Sent to a user 3 days before their free trial ends (Stripe trial_will_end event).
 * Delivered only to the affected user's active WebSocket connections.
 */
export interface TrialWillEndNotification {
  type: typeof WireNotificationType.TRIAL_WILL_END;
  /** ISO-8601 timestamp when the trial will end. */
  trialEndsAt: string;
}

/**
 * Service for sending real-time notifications via WebSocket.
 *
 * **IMPORTANT: Always `await` every `notify*()` call and wrap it in try/catch.**
 *
 * AWS Lambda freezes the execution context after the handler returns.
 * Any unawaited async work (fire-and-forget) will be silently killed,
 * causing intermittent notification loss.
 *
 * @example
 * ```typescript
 * // ✅ Correct
 * try {
 *   await notificationService.notifyLeagueChatMessage(leagueId, payload);
 * } catch (err) {
 *   LOGGER.warn('WebSocket notification failed (non-fatal)', { err });
 * }
 *
 * // ❌ Wrong — fire-and-forget, will be killed by Lambda freeze
 * notificationService.notifyLeagueChatMessage(leagueId, payload).catch(...);
 * ```
 */
export class WebSocketNotificationService {
  private dynamoClient: DynamoDBClient;
  private apiGatewayClient: ApiGatewayManagementApiClient | null = null;
  private connectionsTableName: string;
  private websocketEndpoint: string | undefined;

  constructor(connectionsTableName: string, websocketEndpoint?: string) {
    this.dynamoClient = new DynamoDBClient({});
    this.connectionsTableName = connectionsTableName;
    this.websocketEndpoint = websocketEndpoint;

    if (websocketEndpoint) {
      this.apiGatewayClient = new ApiGatewayManagementApiClient({
        endpoint: websocketEndpoint,
      });
    }
  }

  /**
   * Send a message to a specific connection
   */
  private async sendToConnection(
    connectionId: string,
    data: NotificationMessage,
  ): Promise<boolean> {
    if (!this.apiGatewayClient) {
      LOGGER.warn('WebSocket endpoint not configured, skipping notification');
      return false;
    }

    try {
      await this.apiGatewayClient.send(
        new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: Buffer.from(JSON.stringify(data)),
        }),
      );

      LOGGER.debug('Message sent to connection', { connectionId });
      return true;
    } catch (error) {
      // Connection might be stale (410 Gone)
      // Check multiple error shapes for AWS SDK v3
      const isGone =
        (error as { statusCode?: number }).statusCode === 410 ||
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode === 410 ||
        (error as { name?: string }).name === 'GoneException';

      if (isGone) {
        // Grace period: connections younger than 10 s may still be completing
        // the $connect handshake — a 410 during that window is a race
        // condition, not a genuinely stale socket.  Conditional delete so we
        // only remove connections whose connectedAt is older than the grace.
        const GRACE_MS = 10_000;
        const threshold = Date.now() - GRACE_MS;

        try {
          await this.dynamoClient.send(
            new DeleteItemCommand({
              TableName: this.connectionsTableName,
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

        return false;
      }

      LOGGER.error('Error sending message to connection', {
        connectionId,
        error,
      });
      throw error;
    }
  }

  /**
   * Get connections for a specific matchup
   */
  private async getMatchupConnections(
    matchupId: number,
    viewContext = 'matchup',
  ): Promise<string[]> {
    try {
      const result = await this.dynamoClient.send(
        new QueryCommand({
          TableName: this.connectionsTableName,
          IndexName: 'MatchupIdIndex',
          KeyConditionExpression: 'matchupId = :matchupId',
          FilterExpression: 'viewContext = :context',
          ExpressionAttributeValues: {
            ':matchupId': { N: matchupId.toString() },
            ':context': { S: viewContext },
          },
          ProjectionExpression: 'connectionId',
        }),
      );

      const items = result.Items || [];
      const connectionIds = items
        .map((item: DynamoDBItem) => item['connectionId']?.S)
        .filter((id: string | undefined): id is string => !!id);

      LOGGER.info('Retrieved matchup connections', {
        matchupId,
        viewContext,
        count: connectionIds.length,
      });

      return connectionIds;
    } catch (error) {
      LOGGER.error('Error retrieving matchup connections', { error });
      throw error;
    }
  }

  /**
   * Get all connections, optionally filtered by leagueId
   */
  private async getConnections(filterLeagueId?: number): Promise<string[]> {
    try {
      let items: DynamoDBItem[];

      if (filterLeagueId !== undefined) {
        // Use GSI Query for efficient filtering by leagueId
        const result = await this.dynamoClient.send(
          new QueryCommand({
            TableName: this.connectionsTableName,
            IndexName: 'LeagueIdIndex',
            KeyConditionExpression: 'leagueId = :leagueId',
            ExpressionAttributeValues: {
              ':leagueId': { N: filterLeagueId.toString() },
            },
            ProjectionExpression: 'connectionId',
          }),
        );

        items = result.Items || [];

        LOGGER.info('Retrieved league connections via Query', {
          leagueId: filterLeagueId,
          count: items.length,
        });
      } else {
        // Scan for all connections (use sparingly, only for global broadcasts)
        const result = await this.dynamoClient.send(
          new ScanCommand({
            TableName: this.connectionsTableName,
            ProjectionExpression: 'connectionId',
          }),
        );

        items = result.Items || [];

        LOGGER.info('Retrieved all connections via Scan', {
          count: items.length,
        });
      }

      const connectionIds = items
        .map((item: DynamoDBItem) => item['connectionId']?.S)
        .filter((id: string | undefined): id is string => !!id);

      return connectionIds;
    } catch (error) {
      LOGGER.error('Error retrieving connections', { error });
      throw error;
    }
  }

  /**
   * Broadcast a message to all connections or filtered by leagueId
   */
  async broadcast(
    message: NotificationMessage,
    filterLeagueId?: number,
  ): Promise<{ sent: number; failed: number }> {
    if (!this.websocketEndpoint) {
      LOGGER.warn('WebSocket endpoint not configured, skipping broadcast');
      return { sent: 0, failed: 0 };
    }

    try {
      const connectionIds = await this.getConnections(filterLeagueId);

      if (connectionIds.length === 0) {
        LOGGER.info('No connections to broadcast to', { filterLeagueId });
        return { sent: 0, failed: 0 };
      }

      const results = await Promise.allSettled(
        connectionIds.map((connectionId) =>
          this.sendToConnection(connectionId, message),
        ),
      );

      const sent = results.filter(
        (r) => r.status === 'fulfilled' && r.value === true,
      ).length;
      const failed = results.length - sent;

      LOGGER.info('Broadcast complete', {
        total: connectionIds.length,
        sent,
        failed,
        filterLeagueId,
      });

      return { sent, failed };
    } catch (error) {
      LOGGER.error('Error broadcasting message', { error, filterLeagueId });
      throw error;
    }
  }

  /**
   * Send draft completed notification to all connections for a specific league
   */
  async notifyDraftCompleted(
    leagueId: number,
    selectionMethod: string,
  ): Promise<void> {
    const notification: DraftCompletedNotification = {
      type: WireNotificationType.DRAFT_COMPLETED,
      leagueId,
      selectionMethod,
      completedAt: new Date().toISOString(),
    };

    LOGGER.info('Sending draft completion notification', {
      leagueId,
      selectionMethod,
    });

    await this.broadcast(
      {
        type: 'notification',
        data: notification,
      },
      leagueId,
    );
  }

  /**
   * Send draft started notification to all connections for a specific league
   */
  async notifyDraftStarted(
    leagueId: number,
    draftId: number,
    draftOrder: string,
    teamCount: number,
    pickTimeLimitSeconds: number,
    currentPickDeadline: string,
  ): Promise<void> {
    const notification: DraftStartedNotification = {
      type: WireNotificationType.DRAFT_STARTED,
      leagueId,
      draftId,
      draftOrder,
      teamCount,
      pickTimeLimitSeconds,
      currentPickDeadline,
      startedAt: new Date().toISOString(),
    };

    LOGGER.info('Sending draft started notification', {
      leagueId,
      draftId,
      draftOrder,
      teamCount,
      pickTimeLimitSeconds,
    });

    await this.broadcast(
      {
        type: 'notification',
        data: notification,
      },
      leagueId,
    );
  }

  /**
   * Send draft pick notification to all connections for a specific league
   */
  async notifyDraftPickMade(
    leagueId: number,
    draftId: number,
    pickId: number,
    teamId: number,
    playerId: number,
    round: number,
    pickNumber: number,
    overallPick: number,
    nextPick?: {
      teamId: number;
      round: number;
      pickNumber: number;
      overallPick: number;
    },
    options?: {
      wasAutoPick?: boolean;
      autoPickReason?: string | null;
      currentPickDeadline?: string | null;
    },
  ): Promise<void> {
    const notification: DraftPickNotification = {
      type: WireNotificationType.DRAFT_PICK_MADE,
      leagueId,
      draftId,
      pickId,
      teamId,
      playerId,
      round,
      pickNumber,
      overallPick,
      pickedAt: new Date().toISOString(),
      wasAutoPick: options?.wasAutoPick ?? false,
      autoPickReason: options?.autoPickReason ?? null,
      currentPickDeadline: options?.currentPickDeadline ?? null,
      ...(nextPick ? { nextPick } : {}),
    };

    LOGGER.info('Sending draft pick notification', {
      leagueId,
      draftId,
      teamId,
      playerId,
      round,
      pickNumber,
      overallPick,
    });

    await this.broadcast(
      {
        type: 'notification',
        data: notification,
      },
      leagueId,
    );
  }

  /**
   * Send draft paused notification to all connections for a specific league
   */
  async notifyDraftPaused(leagueId: number): Promise<void> {
    const notification: DraftPausedNotification = {
      type: WireNotificationType.DRAFT_PAUSED,
      leagueId,
      pausedAt: new Date().toISOString(),
    };

    LOGGER.info('Sending draft paused notification', { leagueId });

    await this.broadcast(
      { type: 'notification', data: notification },
      leagueId,
    );
  }

  /**
   * Send draft pick undone notification to all connections for a specific league.
   * Informs all clients that the last pick has been rolled back.
   */
  async notifyDraftPickUndone(
    leagueId: number,
    draftId: number,
    undonePickId: number,
    playerId: number,
    teamId: number,
    overallPick: number,
    newCurrentPick: number,
    newPickDeadline: string,
  ): Promise<void> {
    const notification: DraftPickUndoneNotification = {
      type: WireNotificationType.DRAFT_PICK_UNDONE,
      leagueId,
      draftId,
      undonePickId,
      playerId,
      teamId,
      overallPick,
      newCurrentPick,
      newPickDeadline,
      undoneAt: new Date().toISOString(),
    };

    LOGGER.info('Sending draft pick undone notification', {
      leagueId,
      draftId,
      undonePickId,
      playerId,
      teamId,
      overallPick,
    });

    await this.broadcast(
      { type: 'notification', data: notification },
      leagueId,
    );
  }

  /**
   * Send draft resumed notification to all connections for a specific league
   */
  async notifyDraftResumed(
    leagueId: number,
    currentPickDeadline: string,
  ): Promise<void> {
    const notification: DraftResumedNotification = {
      type: WireNotificationType.DRAFT_RESUMED,
      leagueId,
      currentPickDeadline,
      resumedAt: new Date().toISOString(),
    };

    LOGGER.info('Sending draft resumed notification', {
      leagueId,
      currentPickDeadline,
    });

    await this.broadcast(
      { type: 'notification', data: notification },
      leagueId,
    );
  }

  /**
   * Notify matchup viewers that player stats are loading
   */
  async notifyPlayerStatsLoading(
    playerId: number,
    matchupId: number,
    leagueId: number,
    progress?: { loaded: number; total: number },
  ): Promise<void> {
    const notification: PlayerStatsLoadingNotification = {
      type: WireNotificationType.PLAYER_STATS_LOADING,
      playerId,
      matchupId,
      leagueId,
      progress,
    };

    LOGGER.info('Sending player stats loading notification', {
      playerId,
      matchupId,
    });

    await this.notifyMatchupViewers(matchupId, notification);
  }

  /**
   * Notify matchup viewers that player stats have been updated
   */
  async notifyPlayerStatsUpdated(
    playerId: number,
    matchupId: number,
    leagueId: number,
    stats: unknown,
  ): Promise<void> {
    const notification: PlayerStatsUpdatedNotification = {
      type: WireNotificationType.PLAYER_STATS_UPDATED,
      playerId,
      matchupId,
      leagueId,
      stats,
    };

    LOGGER.info('Sending player stats updated notification', {
      playerId,
      matchupId,
    });

    await this.notifyMatchupViewers(matchupId, notification);
  }

  /**
   * Notify matchup AND league viewers that all stats loading is complete.
   *
   * Previously this only called `notifyMatchupViewers` (viewContext='matchup'),
   * so users on the league page (viewContext='league') never received the event
   * and the UI never refreshed after game-selection finished.
   *
   * Now we also broadcast to the league so the LeagueDetailPage can refetch.
   */
  async notifyMatchupStatsComplete(
    matchupId: number,
    leagueId: number,
    totalPlayers: number,
  ): Promise<void> {
    const notification: MatchupStatsCompleteNotification = {
      type: WireNotificationType.MATCHUP_STATS_COMPLETE,
      matchupId,
      leagueId,
      totalPlayers,
      completedAt: new Date().toISOString(),
    };

    LOGGER.info('Sending matchup stats complete notification', {
      matchupId,
      leagueId,
      totalPlayers,
    });

    // Notify matchup-level viewers (users on the matchup detail page)
    await this.notifyMatchupViewers(matchupId, notification);

    // Also broadcast to league-level viewers so the league page refreshes
    await this.broadcast(
      {
        type: 'notification',
        data: notification,
      },
      leagueId,
    );
  }

  /**
   * Get all active WebSocket connections for a specific user.
   *
   * Queries the UserIdIndex GSI (hash_key="userId") for efficient lookups.
   * The GSI is defined in terraform/websocket.tf.
   */
  private async getUserConnections(userId: number): Promise<string[]> {
    try {
      const result = await this.dynamoClient.send(
        new QueryCommand({
          TableName: this.connectionsTableName,
          IndexName: 'UserIdIndex',
          KeyConditionExpression: 'userId = :userId',
          ExpressionAttributeValues: {
            ':userId': { N: userId.toString() },
          },
          ProjectionExpression: 'connectionId',
        }),
      );

      const items = result.Items || [];
      const connectionIds = items
        .map((item: DynamoDBItem) => item['connectionId']?.S)
        .filter((id: string | undefined): id is string => !!id);

      LOGGER.info('Retrieved user connections for DM delivery', {
        userId,
        count: connectionIds.length,
      });

      return connectionIds;
    } catch (error) {
      LOGGER.error('Error retrieving user connections', { error, userId });
      throw error;
    }
  }

  /**
   * Broadcast a new league chat message to all connected league members.
   *
   * @param leagueId - The league whose members should be notified.
   * @param payload  - Message details (excludes the `type` discriminator).
   */
  async notifyLeagueChatMessage(
    leagueId: number,
    payload: Omit<LeagueChatMessageNotification, 'type'>,
  ): Promise<void> {
    const notification: LeagueChatMessageNotification = {
      type: WireNotificationType.LEAGUE_CHAT_MESSAGE,
      ...payload,
    };

    LOGGER.info('Sending league chat message notification', {
      leagueId,
      messageId: payload.messageId,
      senderId: payload.senderId,
    });

    await this.broadcast(
      { type: 'notification', data: notification },
      leagueId,
    );
  }

  /**
   * Push a direct message notification to all active connections belonging
   * to the recipient.
   *
   * @param recipientUserId - The user who should receive the notification.
   * @param payload         - DM details (excludes the `type` discriminator).
   */
  async notifyDirectMessage(
    recipientUserId: number,
    payload: Omit<DirectMessageNotification, 'type'>,
  ): Promise<void> {
    if (!this.websocketEndpoint) {
      LOGGER.warn(
        'WebSocket endpoint not configured, skipping DM notification',
      );
      return;
    }

    const notification: DirectMessageNotification = {
      type: WireNotificationType.DIRECT_MESSAGE,
      ...payload,
    };

    LOGGER.info('Sending direct message notification', {
      recipientUserId,
      messageId: payload.messageId,
      fromUserId: payload.fromUserId,
    });

    try {
      const connectionIds = await this.getUserConnections(recipientUserId);

      if (connectionIds.length === 0) {
        LOGGER.info(
          'Recipient has no active WebSocket connections, DM stored for later retrieval',
          {
            recipientUserId,
          },
        );
        return;
      }

      const results = await Promise.allSettled(
        connectionIds.map((connectionId) =>
          this.sendToConnection(connectionId, {
            type: 'notification',
            data: notification,
          }),
        ),
      );

      const sent = results.filter(
        (r) => r.status === 'fulfilled' && r.value === true,
      ).length;

      LOGGER.info('Direct message notification delivered', {
        recipientUserId,
        sent,
        total: connectionIds.length,
      });
    } catch (error) {
      LOGGER.error('Error delivering direct message notification', {
        error,
        recipientUserId,
      });
      throw error;
    }
  }

  /**
   * Send notification to users actively viewing a specific matchup
   */
  private async notifyMatchupViewers(
    matchupId: number,
    notification: unknown,
  ): Promise<void> {
    if (!this.websocketEndpoint) {
      LOGGER.warn('WebSocket endpoint not configured, skipping notification');
      return;
    }

    try {
      const connectionIds = await this.getMatchupConnections(matchupId);

      if (connectionIds.length === 0) {
        LOGGER.info('No active viewers for matchup', { matchupId });
        return;
      }

      const results = await Promise.allSettled(
        connectionIds.map((connectionId) =>
          this.sendToConnection(connectionId, {
            type: 'notification',
            data: notification,
          }),
        ),
      );

      const sent = results.filter(
        (r) => r.status === 'fulfilled' && r.value === true,
      ).length;

      LOGGER.info('Notified matchup viewers', {
        matchupId,
        sent,
        total: connectionIds.length,
      });
    } catch (error) {
      LOGGER.error('Error notifying matchup viewers', { error, matchupId });
      throw error;
    }
  }

  /**
   * Notify a specific user that they have received a new trade offer.
   *
   * @param recipientUserId - The owner of the receiving team.
   * @param payload         - Trade offer details (excludes the `type` discriminator).
   */
  async notifyTradeOffer(
    recipientUserId: number,
    payload: Omit<TradeOfferNotification, 'type'>,
  ): Promise<void> {
    if (!this.websocketEndpoint) {
      LOGGER.warn(
        'WebSocket endpoint not configured, skipping trade offer notification',
      );
      return;
    }

    const notification: TradeOfferNotification = {
      type: WireNotificationType.TRADE_OFFER,
      ...payload,
    };

    LOGGER.info('Sending trade offer notification', {
      recipientUserId,
      tradeOfferId: payload.tradeOfferId,
      leagueId: payload.leagueId,
    });

    try {
      const connectionIds = await this.getUserConnections(recipientUserId);

      if (connectionIds.length === 0) {
        LOGGER.info(
          'Recipient has no active WebSocket connections, trade offer stored for later retrieval',
          { recipientUserId },
        );
        return;
      }

      await Promise.allSettled(
        connectionIds.map((connectionId) =>
          this.sendToConnection(connectionId, {
            type: 'notification',
            data: notification,
          }),
        ),
      );
    } catch (error) {
      LOGGER.error('Error sending trade offer notification', {
        error,
        recipientUserId,
        tradeOfferId: payload.tradeOfferId,
      });
      throw error;
    }
  }

  /**
   * Notify all connections in a league that rosters have been updated
   * (e.g. after waiver claims are processed).
   */
  async notifyRosterUpdate(leagueId: number): Promise<void> {
    const notification: RosterUpdateNotification = {
      type: WireNotificationType.ROSTER_UPDATE,
      leagueId,
      updatedAt: new Date().toISOString(),
    };

    LOGGER.info('Sending roster update notification', { leagueId });

    await this.broadcast(
      {
        type: 'notification',
        data: notification,
      },
      leagueId,
    );
  }

  /**
   * Notify all league members that the playoff bracket has been created.
   *
   * @param leagueId - The league whose members should be notified.
   * @param payload  - Bracket details (excludes the `type` discriminator).
   */
  async notifyPlayoffBracketCreated(
    leagueId: number,
    payload: Omit<PlayoffBracketCreatedNotification, 'type'>,
  ): Promise<void> {
    const notification: PlayoffBracketCreatedNotification = {
      type: WireNotificationType.PLAYOFF_BRACKET_CREATED,
      ...payload,
    };

    LOGGER.info('Sending playoff bracket created notification', {
      leagueId,
      bracketId: payload.bracketId,
      format: payload.format,
    });

    await this.broadcast(
      {
        type: 'notification',
        data: notification,
      },
      leagueId,
    );
  }

  /**
   * Notify all league members that the current week has been advanced.
   * Clients should refetch their matchup data on receipt.
   *
   * @param leagueId - The league whose members should be notified.
   * @param payload  - Week details (excludes the `type` discriminator).
   */
  async notifyWeekAdvanced(
    leagueId: number,
    payload: Omit<WeekAdvancedNotification, 'type'>,
  ): Promise<void> {
    const notification: WeekAdvancedNotification = {
      type: WireNotificationType.WEEK_ADVANCED,
      ...payload,
    };

    LOGGER.info('Sending week advanced notification', {
      leagueId,
      previousWeek: payload.previousWeek,
      newWeek: payload.newWeek,
    });

    await this.broadcast(
      {
        type: 'notification',
        data: notification,
      },
      leagueId,
    );
  }

  /**
   * Notify the affected user that their subscription tier or status has changed.
   * Delivered only to the user's currently active WebSocket connections.
   *
   * Fired by the stripe-webhook Lambda after syncing a new tier to the database.
   *
   * @param userId - The user whose subscription has changed.
   * @param tier   - The new subscription tier: 'free' or 'premium'.
   * @param status - The Stripe subscription status (e.g. 'active', 'canceled').
   */
  async notifySubscriptionUpdated(
    userId: number,
    tier: 'free' | 'premium',
    status: string,
  ): Promise<void> {
    const notification: SubscriptionUpdatedNotification = {
      type: WireNotificationType.SUBSCRIPTION_UPDATED,
      tier,
      status,
    };

    LOGGER.info('Sending subscription updated notification', {
      userId,
      tier,
      status,
    });

    try {
      const connectionIds = await this.getUserConnections(userId);

      if (connectionIds.length === 0) {
        LOGGER.info(
          'User has no active WebSocket connections, subscription update not pushed',
          { userId },
        );
        return;
      }

      await Promise.allSettled(
        connectionIds.map((connectionId) =>
          this.sendToConnection(connectionId, {
            type: 'notification',
            data: notification,
          }),
        ),
      );
    } catch (error) {
      LOGGER.error('Error sending subscription updated notification', {
        error,
        userId,
      });
      throw error;
    }
  }

  /**
   * Notify a user that their free trial will end soon (3 days before expiry).
   * Delivered only to the user's currently active WebSocket connections.
   *
   * Fired by the stripe-webhook Lambda on customer.subscription.trial_will_end.
   *
   * @param userId      - The user whose trial is ending.
   * @param trialEndsAt - ISO-8601 timestamp when the trial will end.
   */
  async notifyTrialWillEnd(userId: number, trialEndsAt: string): Promise<void> {
    const notification: TrialWillEndNotification = {
      type: WireNotificationType.TRIAL_WILL_END,
      trialEndsAt,
    };

    LOGGER.info('Sending trial will end notification', { userId, trialEndsAt });

    try {
      const connectionIds = await this.getUserConnections(userId);

      if (connectionIds.length === 0) {
        LOGGER.info(
          'User has no active WebSocket connections, trial-will-end not pushed',
          { userId },
        );
        return;
      }

      await Promise.allSettled(
        connectionIds.map((connectionId) =>
          this.sendToConnection(connectionId, {
            type: 'notification',
            data: notification,
          }),
        ),
      );
    } catch (error) {
      LOGGER.error('Error sending trial will end notification', {
        error,
        userId,
      });
      throw error;
    }
  }
}

/**
 * Create a notification service from environment variables
 */
export function createNotificationService(): WebSocketNotificationService | null {
  const connectionsTableName = process.env['CONNECTIONS_TABLE_NAME'];
  const websocketEndpoint = process.env['WEBSOCKET_ENDPOINT'];

  if (!connectionsTableName) {
    LOGGER.warn(
      'CONNECTIONS_TABLE_NAME not set, notifications will be disabled',
    );
    return null;
  }

  return new WebSocketNotificationService(
    connectionsTableName,
    websocketEndpoint,
  );
}
