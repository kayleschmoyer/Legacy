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
  type: 'DRAFT_COMPLETED';
  leagueId: number;
  draftType: string;
  completedAt: string;
}

export interface PlayerStatsLoadingNotification {
  type: 'PLAYER_STATS_LOADING';
  playerId: number;
  matchupId: number;
  leagueId: number;
  progress?: {
    loaded: number;
    total: number;
  };
}

export interface PlayerStatsUpdatedNotification {
  type: 'PLAYER_STATS_UPDATED';
  playerId: number;
  matchupId: number;
  leagueId: number;
  stats: unknown;
}

export interface MatchupStatsCompleteNotification {
  type: 'MATCHUP_STATS_COMPLETE';
  matchupId: number;
  leagueId: number;
  totalPlayers: number;
  completedAt: string;
}

export interface NotificationMessage {
  type: string;
  data: unknown;
}

/**
 * Service for sending real-time notifications via WebSocket
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
        LOGGER.warn('Stale connection detected, removing', { connectionId });

        // Clean up stale connection
        await this.dynamoClient.send(
          new DeleteItemCommand({
            TableName: this.connectionsTableName,
            Key: {
              connectionId: { S: connectionId },
            },
          }),
        );

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
    draftType: string,
  ): Promise<void> {
    const notification: DraftCompletedNotification = {
      type: 'DRAFT_COMPLETED',
      leagueId,
      draftType,
      completedAt: new Date().toISOString(),
    };

    LOGGER.info('Sending draft completion notification', {
      leagueId,
      draftType,
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
   * Notify matchup viewers that player stats are loading
   */
  async notifyPlayerStatsLoading(
    playerId: number,
    matchupId: number,
    leagueId: number,
    progress?: { loaded: number; total: number },
  ): Promise<void> {
    const notification: PlayerStatsLoadingNotification = {
      type: 'PLAYER_STATS_LOADING',
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
      type: 'PLAYER_STATS_UPDATED',
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
   * Notify matchup viewers that all stats loading is complete
   */
  async notifyMatchupStatsComplete(
    matchupId: number,
    leagueId: number,
    totalPlayers: number,
  ): Promise<void> {
    const notification: MatchupStatsCompleteNotification = {
      type: 'MATCHUP_STATS_COMPLETE',
      matchupId,
      leagueId,
      totalPlayers,
      completedAt: new Date().toISOString(),
    };

    LOGGER.info('Sending matchup stats complete notification', {
      matchupId,
      totalPlayers,
    });

    await this.notifyMatchupViewers(matchupId, notification);
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
