import { LOGGER } from '@legacy-sports/logging';
import WebSocket from 'ws';
import { CommandArgs } from '../utils/loadEnvFile';
import { AuthMiddleware } from '../services/AuthMiddleware';

export interface TestWorkflowArgs extends CommandArgs {
  user?: string;
  skipCleanup?: boolean;
}

interface WebSocketMessage {
  type: string;
  leagueId?: number;
  status?: string;
  progress?: {
    current: number;
    total: number;
  };
  matchupId?: number;
  data?: {
    type: string;
    leagueId?: number;
    matchupId?: number;
    draftType?: string;
    completedAt?: string;
    [key: string]: unknown;
  };
}

/**
 * Connect to WebSocket and wait for specific events
 * Includes heartbeat mechanism to prevent 10-minute idle timeout
 */
async function connectWebSocket(
  token: string,
  leagueId?: number,
  matchupId?: number,
  viewContext = 'general',
): Promise<WebSocket> {
  let wsUrl =
    process.env.WEBSOCKET_URL ||
    'wss://nx7q8petpg.execute-api.us-east-1.amazonaws.com/dev';

  // Build query parameters
  // Note: WebSocket connections in API Gateway don't support custom headers,
  // so we must pass the JWT token as a query parameter
  const params: string[] = [`token=${encodeURIComponent(token)}`];
  if (leagueId) {
    params.push(`leagueId=${leagueId}`);
  }
  if (matchupId) {
    params.push(`matchupId=${matchupId}`);
  }
  if (viewContext !== 'general') {
    params.push(`viewContext=${viewContext}`);
  }

  wsUrl += `?${params.join('&')}`;

  LOGGER.info(`🔌 Connecting to WebSocket: ${wsUrl}`);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);

    // Smart heartbeat mechanism to prevent 10-minute idle timeout
    // Only sends ping if no messages received for 8+ minutes
    // Disconnects after 3 consecutive pings with no data (24+ min idle)
    let heartbeatInterval: NodeJS.Timeout | null = null;
    let pongTimeout: NodeJS.Timeout | null = null;
    let isAlive = true;
    let lastMessageTime = Date.now();
    let consecutivePings = 0;
    const MAX_CONSECUTIVE_PINGS = 3; // Disconnect after 24 minutes of only pings

    const startHeartbeat = () => {
      // Check every 8 minutes if we need to send a ping
      const eightMinutes = 480000; // 8 minutes in milliseconds

      heartbeatInterval = setInterval(() => {
        const timeSinceLastMessage = Date.now() - lastMessageTime;

        // Only send ping if we haven't received any messages in 8+ minutes
        if (timeSinceLastMessage < eightMinutes) {
          LOGGER.debug(
            `💓 Skipping ping - received message ${Math.round(timeSinceLastMessage / 1000)}s ago`,
          );
          consecutivePings = 0; // Reset counter when we have recent messages
          return;
        }

        // Check if we've sent too many consecutive pings without data
        if (consecutivePings >= MAX_CONSECUTIVE_PINGS) {
          LOGGER.warn(
            `⚠️ WebSocket idle for ${MAX_CONSECUTIVE_PINGS * 8}+ minutes with no data, disconnecting`,
          );
          LOGGER.info('💡 Falling back to polling for remaining operations');
          ws.close();
          return;
        }

        if (!isAlive) {
          LOGGER.warn(
            '⚠️ WebSocket not responding to pings, closing connection',
          );
          ws.terminate();
          return;
        }

        isAlive = false;
        consecutivePings++;
        LOGGER.debug(
          `💓 Sending WebSocket ping #${consecutivePings} (idle for 8+ minutes)`,
        );

        ws.send(JSON.stringify({ type: 'ping' }), (error) => {
          if (error) {
            LOGGER.warn('⚠️ Failed to send ping:', error);
          }
        });

        // Set timeout for pong response (30 seconds)
        pongTimeout = setTimeout(() => {
          if (!isAlive) {
            LOGGER.warn('⚠️ No pong received within 30 seconds');
            ws.terminate();
          }
        }, 30000);
      }, eightMinutes); // Check every 8 minutes
    };

    const stopHeartbeat = () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      if (pongTimeout) {
        clearTimeout(pongTimeout);
        pongTimeout = null;
      }
    };

    ws.on('open', () => {
      LOGGER.info('✅ WebSocket connected');
      startHeartbeat();
      resolve(ws);
    });

    ws.on('message', (data: WebSocket.Data) => {
      try {
        // Update last message time for any message received
        lastMessageTime = Date.now();

        // Convert data to string (handles Buffer, ArrayBuffer, Buffer[], etc.)
        let messageString: string;
        if (typeof data === 'string') {
          messageString = data;
        } else if (Buffer.isBuffer(data)) {
          messageString = data.toString('utf8');
        } else if (Array.isArray(data)) {
          messageString = Buffer.concat(data).toString('utf8');
        } else {
          messageString = new TextDecoder().decode(data);
        }

        const message = JSON.parse(messageString) as { type?: string };

        // Handle pong response
        if (message.type === 'pong') {
          LOGGER.debug('💓 Received WebSocket pong');
          isAlive = true;
          if (pongTimeout) {
            clearTimeout(pongTimeout);
            pongTimeout = null;
          }
        } else {
          // Any non-pong message is actual data, reset consecutive ping counter
          consecutivePings = 0;
        }
      } catch {
        // Ignore parse errors for pong handling
      }
    });

    ws.on('error', (error) => {
      LOGGER.error('❌ WebSocket error:', error);
      stopHeartbeat();
      reject(error);
    });

    ws.on('close', () => {
      LOGGER.info('🔌 WebSocket disconnected');
      stopHeartbeat();
    });

    // Ensure cleanup happens
    const originalClose = ws.close.bind(ws);
    ws.close = (...args: Parameters<typeof ws.close>) => {
      stopHeartbeat();
      return originalClose(...args);
    };
  });
}

/**
 * Wait for a specific WebSocket event
 */
async function waitForEvent(
  ws: WebSocket,
  eventType: string,
  leagueId: number,
  matchupId?: number,
  timeout = 300000, // 5 minutes default
): Promise<WebSocketMessage> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Timeout waiting for ${eventType} event`));
    }, timeout);

    const messageHandler = (data: WebSocket.Data) => {
      try {
        // Convert data to string (handles Buffer, ArrayBuffer, Buffer[], etc.)
        let messageString: string;
        if (typeof data === 'string') {
          messageString = data;
        } else if (Buffer.isBuffer(data)) {
          messageString = data.toString('utf8');
        } else if (Array.isArray(data)) {
          messageString = Buffer.concat(data).toString('utf8');
        } else {
          messageString = new TextDecoder().decode(data);
        }

        const message = JSON.parse(messageString) as WebSocketMessage;

        // Ignore pong messages (handled by heartbeat mechanism)
        if (message.type === 'pong') {
          return;
        }

        LOGGER.debug(
          `📨 Received WebSocket message:`,
          JSON.stringify(message, null, 2),
        );
        LOGGER.debug(
          `🔍 Looking for eventType="${eventType}" with leagueId=${leagueId}${matchupId ? `, matchupId=${matchupId}` : ''}`,
        );

        // Check if this is a notification wrapper with nested data
        if (message.type === 'notification' && message.data) {
          LOGGER.debug(
            `📦 Notification wrapper detected: data.type=${message.data.type}`,
          );

          // Map notification data types to expected event types
          const notificationTypeMap: Record<string, string> = {
            DRAFT_COMPLETED: 'draft-complete',
            MATCHUP_STATS_COMPLETE: 'matchup-stats-complete',
            PLAYER_STATS_LOADING: 'player-stats-loading',
            GAME_SELECTED: 'game-selected',
          };

          const mappedType =
            notificationTypeMap[message.data.type] ||
            message.data.type.toLowerCase();
          const messageLeagueId = message.data.leagueId || message.leagueId;
          const messageMatchupId = message.data.matchupId || message.matchupId;

          LOGGER.debug(
            `🔄 Mapped type: ${message.data.type} -> ${mappedType}, messageLeagueId=${messageLeagueId}, messageMatchupId=${messageMatchupId}`,
          );

          // Check if event type matches
          const typeMatches = mappedType === eventType;
          const leagueMatches = messageLeagueId === leagueId;
          const matchupMatches = !matchupId || messageMatchupId === matchupId;

          if (typeMatches && leagueMatches && matchupMatches) {
            LOGGER.info(`✅ Event matched! Resolving...`);
            clearTimeout(timeoutId);
            ws.removeListener('message', messageHandler);
            resolve(message);
          } else {
            LOGGER.debug(
              `❌ No match: type=${typeMatches}, league=${leagueMatches}, matchup=${matchupMatches}`,
            );
          }
        } else if (
          message.type === eventType &&
          message.leagueId === leagueId &&
          (!matchupId || message.matchupId === matchupId)
        ) {
          // Direct message type match (for backwards compatibility)
          LOGGER.info(`✅ Direct event matched! Resolving...`);
          clearTimeout(timeoutId);
          ws.removeListener('message', messageHandler);
          resolve(message);
        } else {
          LOGGER.debug(
            `❌ Message doesn't match: type="${message.type}" vs eventType="${eventType}"`,
          );
        }
      } catch (error) {
        LOGGER.warn('Failed to parse WebSocket message:', error);
      }
    };

    ws.on('message', messageHandler);

    ws.on('close', () => {
      clearTimeout(timeoutId);
      reject(new Error('WebSocket closed while waiting for event'));
    });

    ws.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
  });
}

/**
 * Create a league via GraphQL
 */
async function createLeague(
  authMiddleware: AuthMiddleware,
  userEmail: string,
): Promise<{ leagueId: number; teamIds: number[] }> {
  LOGGER.info('\n📝 Step 1: Creating league...');

  const mutation = `
    mutation CreateTestLeague($input: CreateLeagueAndTeamsInput!) {
      createLeagueAndTeams(input: $input) {
        league {
          id
          name
          draftStatus
          currentMatchup
        }
        teams {
          id
          name
        }
      }
    }
  `;

  const variables = {
    input: {
      leagueName: `Test League ${new Date().toISOString()}`,
      numberOfTeams: 4,
      draftType: 'RANDOM-DRAFT',
      maxRosterSize: 25,
    },
  };

  const response = await authMiddleware.makeAuthenticatedRequest(
    authMiddleware.getGraphQLUrl(),
    {
      method: 'POST',
      body: JSON.stringify({ query: mutation, variables }),
      userEmail,
    },
  );

  const data = (await response.json()) as {
    data?: {
      createLeagueAndTeams?: {
        league: { id: number; name: string };
        teams: Array<{ id: number; name: string }>;
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (data.errors) {
    throw new Error(
      `GraphQL error: ${data.errors.map((e) => e.message).join(', ')}`,
    );
  }

  if (!data.data?.createLeagueAndTeams) {
    throw new Error('Failed to create league: no data returned');
  }

  const league = data.data.createLeagueAndTeams.league;
  const teams = data.data.createLeagueAndTeams.teams;

  LOGGER.info(`✅ League created: ${league.name} (ID: ${league.id})`);
  LOGGER.info(`✅ Teams created: ${teams.length} teams`);

  return {
    leagueId: league.id,
    teamIds: teams.map((t) => t.id),
  };
}

/**
 * Start draft via GraphQL
 */
async function startDraft(
  authMiddleware: AuthMiddleware,
  userEmail: string,
  leagueId: number,
): Promise<void> {
  LOGGER.info('\n🎲 Step 2: Starting draft...');

  const mutation = `
    mutation StartDraft($leagueId: Int!) {
      startDraft(leagueId: $leagueId) {
        id
        draftStatus
      }
    }
  `;

  const variables = { leagueId };

  const response = await authMiddleware.makeAuthenticatedRequest(
    authMiddleware.getGraphQLUrl(),
    {
      method: 'POST',
      body: JSON.stringify({ query: mutation, variables }),
      userEmail,
    },
  );

  const data = (await response.json()) as {
    data?: {
      startDraft?: {
        id: number;
        draftStatus: string;
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (data.errors) {
    throw new Error(
      `GraphQL error: ${data.errors.map((e) => e.message).join(', ')}`,
    );
  }

  if (!data.data?.startDraft) {
    throw new Error('Failed to start draft: no data returned');
  }

  LOGGER.info(`✅ Draft started for league ${leagueId}`);
}

/**
 * Advance league week to create matchups
 */
async function advanceLeagueWeek(
  authMiddleware: AuthMiddleware,
  userEmail: string,
  leagueId: number,
): Promise<{ matchups: Array<{ id: number; weekNumber: number }> }> {
  LOGGER.info('\n⏭️ Step 3: Advancing league week (creating matchups)...');

  const mutation = `
    mutation AdvanceLeagueWeek($leagueId: Int!) {
      advanceLeagueWeek(leagueId: $leagueId) {
        matchups {
          id
          weekNumber
          status
          statsLoadingStatus
        }
        currentMatchupId
      }
    }
  `;

  const variables = { leagueId };

  const response = await authMiddleware.makeAuthenticatedRequest(
    authMiddleware.getGraphQLUrl(),
    {
      method: 'POST',
      body: JSON.stringify({ query: mutation, variables }),
      userEmail,
    },
  );

  const data = (await response.json()) as {
    data?: {
      advanceLeagueWeek?: {
        matchups: Array<{ id: number; weekNumber: number; status: string }>;
        currentMatchupId: number;
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (data.errors) {
    throw new Error(
      `GraphQL error: ${data.errors.map((e) => e.message).join(', ')}`,
    );
  }

  if (!data.data?.advanceLeagueWeek) {
    throw new Error('Failed to advance league week: no data returned');
  }

  const matchups = data.data.advanceLeagueWeek.matchups;
  LOGGER.info(`✅ Created ${matchups.length} matchups for week 1`);
  matchups.forEach((m) => {
    LOGGER.info(`   - Matchup ${m.id} (Week ${m.weekNumber})`);
  });

  return { matchups };
}

/**
 * Trigger game selection for a matchup
 */
async function triggerGameSelection(
  authMiddleware: AuthMiddleware,
  userEmail: string,
  matchupId: number,
  gameNumber = 1,
): Promise<void> {
  LOGGER.info(
    `\n🎮 Step 4: Triggering game selection for matchup ${matchupId} (game ${gameNumber})...`,
  );

  const mutation = `
    mutation TriggerGameSelection($matchupId: Int!, $gameNumber: Int!) {
      triggerGameSelection(matchupId: $matchupId, gameNumber: $gameNumber)
    }
  `;

  const variables = { matchupId, gameNumber };

  const response = await authMiddleware.makeAuthenticatedRequest(
    authMiddleware.getGraphQLUrl(),
    {
      method: 'POST',
      body: JSON.stringify({ query: mutation, variables }),
      userEmail,
    },
  );

  const data = (await response.json()) as {
    data?: {
      triggerGameSelection?: boolean;
    };
    errors?: Array<{ message: string }>;
  };

  if (data.errors) {
    throw new Error(
      `GraphQL error: ${data.errors.map((e) => e.message).join(', ')}`,
    );
  }

  if (!data.data?.triggerGameSelection) {
    throw new Error('Failed to trigger game selection');
  }

  LOGGER.info(`✅ Game selection triggered for matchup ${matchupId}`);
}

/**
 * Poll matchup status until stats loading completes
 */
async function waitForStatsLoading(
  authMiddleware: AuthMiddleware,
  userEmail: string,
  matchupId: number,
  maxAttempts = 60,
  intervalMs = 5000,
): Promise<void> {
  LOGGER.info(
    `\n⏳ Waiting for stats loading to complete for matchup ${matchupId}...`,
  );

  const query = `
    query GetMatchup($matchupId: Int!) {
      getMatchupById(id: $matchupId) {
        id
        statsLoadingStatus
        status
      }
    }
  `;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await authMiddleware.makeAuthenticatedRequest(
      authMiddleware.getGraphQLUrl(),
      {
        method: 'POST',
        body: JSON.stringify({ query, variables: { matchupId } }),
        userEmail,
      },
    );

    const data = (await response.json()) as {
      data?: {
        getMatchupById?: {
          id: number;
          statsLoadingStatus: string;
          status: string;
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (data.errors) {
      throw new Error(
        `GraphQL error: ${data.errors.map((e) => e.message).join(', ')}`,
      );
    }

    const matchup = data.data?.getMatchupById;
    if (!matchup) {
      throw new Error(`Matchup ${matchupId} not found`);
    }

    LOGGER.info(
      `   [${attempt}/${maxAttempts}] Status: ${matchup.statsLoadingStatus} | Matchup: ${matchup.status}`,
    );

    if (matchup.statsLoadingStatus === 'completed') {
      LOGGER.info(`✅ Stats loading completed for matchup ${matchupId}`);
      return;
    }

    if (matchup.statsLoadingStatus === 'failed') {
      throw new Error(`Stats loading failed for matchup ${matchupId}`);
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Timeout: Stats loading did not complete within ${(maxAttempts * intervalMs) / 1000} seconds`,
  );
}

/**
 * Main workflow test handler
 */
export async function handleTestWorkflow(
  args: TestWorkflowArgs,
): Promise<void> {
  const { user, skipCleanup } = args;

  try {
    LOGGER.info('🚀 Starting End-to-End League Workflow Test');
    LOGGER.info('═'.repeat(60));

    // Set up authentication
    const authMiddleware = new AuthMiddleware();
    const currentUser = await authMiddleware.getCurrentUser();

    if (!currentUser) {
      LOGGER.error('❌ Authentication required');
      LOGGER.info('💡 Run "cli auth login" to authenticate, then try again');
      return;
    }

    const userEmail = user || currentUser.email;
    LOGGER.info(`🔐 Running as: ${userEmail} (${currentUser.accessLevel})`);

    // Get auth token for WebSocket
    const token = await authMiddleware.requireAuth({ userEmail });
    if (!token) {
      throw new Error('Failed to get authentication token');
    }

    let ws: WebSocket | null = null;
    let leagueId: number | undefined;

    try {
      // Step 1: Create league
      const { leagueId: newLeagueId, teamIds } = await createLeague(
        authMiddleware,
        userEmail,
      );
      leagueId = newLeagueId;

      // Connect to WebSocket with leagueId (optional - will continue if fails)
      try {
        ws = await connectWebSocket(token, leagueId);
      } catch (error) {
        LOGGER.warn(
          '⚠️ Failed to connect to WebSocket, will use polling instead',
        );
        LOGGER.warn(
          `   Error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Step 2: Start draft
      await startDraft(authMiddleware, userEmail, leagueId);

      // Wait for draft to complete
      if (ws) {
        LOGGER.info('\n⏳ Waiting for draft to complete via WebSocket...');
        try {
          await waitForEvent(ws, 'draft-complete', leagueId, undefined, 180000); // 3 minutes
          LOGGER.info('✅ Draft completed (via WebSocket)');
        } catch (error) {
          LOGGER.warn('⚠️ WebSocket wait failed, falling back to wait');
          LOGGER.warn(
            `   Error: ${error instanceof Error ? error.message : String(error)}`,
          );
          // Fallback: just wait for draft to complete
          LOGGER.info('⏳ Waiting 10 seconds for draft to complete...');
          await new Promise((resolve) => setTimeout(resolve, 10000));
        }
      } else {
        LOGGER.info('⏳ Waiting 10 seconds for draft to complete...');
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }

      // Step 3: Advance league week to create matchups
      const { matchups } = await advanceLeagueWeek(
        authMiddleware,
        userEmail,
        leagueId,
      );

      // Step 4: Trigger game selection for each matchup and wait for completion
      for (const matchup of matchups) {
        // Ensure IDs are numbers, not strings
        const matchupId =
          typeof matchup.id === 'string'
            ? parseInt(matchup.id, 10)
            : matchup.id;

        LOGGER.info(
          `\n🎲 Triggering game selection for matchup ${matchupId}...`,
        );
        await triggerGameSelection(authMiddleware, userEmail, matchupId);

        // Close existing WebSocket and reconnect with matchupId context
        if (ws) {
          LOGGER.info('🔄 Reconnecting WebSocket with matchup context...');
          ws.close();
          ws = null;
        }

        try {
          ws = await connectWebSocket(token, leagueId, matchupId, 'matchup');
        } catch (error) {
          LOGGER.warn(
            '⚠️ Failed to connect to WebSocket, will use polling instead',
          );
          LOGGER.warn(
            `   Error: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        // Wait for stats loading to complete via WebSocket
        if (ws) {
          LOGGER.info(
            `\n⏳ Waiting for stats loading to complete for matchup ${matchupId} via WebSocket...`,
          );
          try {
            // Smart heartbeat only sends pings during idle periods (8+ min without messages)
            // Active stats loading sends frequent notifications, keeping connection alive naturally
            await waitForEvent(
              ws,
              'matchup-stats-complete',
              leagueId,
              matchupId,
              900000,
            ); // 15 minutes
            LOGGER.info(
              `✅ Stats loading completed for matchup ${matchupId} (via WebSocket)`,
            );
          } catch (error) {
            LOGGER.warn(
              `⚠️ WebSocket wait failed for matchup ${matchupId}, falling back to polling`,
            );
            LOGGER.warn(
              `   Error: ${error instanceof Error ? error.message : String(error)}`,
            );
            // Fall back to polling
            await waitForStatsLoading(authMiddleware, userEmail, matchupId);
          }
        } else {
          // Fallback to polling if WebSocket not available
          LOGGER.warn(
            `⚠️ No WebSocket connection, using polling for matchup ${matchupId}`,
          );
          await waitForStatsLoading(authMiddleware, userEmail, matchupId);
        }
      }

      LOGGER.info('\n═'.repeat(60));
      LOGGER.info('🎉 WORKFLOW TEST COMPLETED SUCCESSFULLY!');
      LOGGER.info('═'.repeat(60));
      LOGGER.info(`\n📊 Summary:`);
      LOGGER.info(`   League ID: ${leagueId}`);
      LOGGER.info(`   Teams: ${teamIds.length}`);
      LOGGER.info(`   Matchups: ${matchups.length}`);
      LOGGER.info(`   All game selections completed with stats loaded`);
      LOGGER.info(
        `\n🔗 View league: https://legacy-fantasy.com/league/${leagueId}`,
      );

      if (!skipCleanup) {
        LOGGER.info(
          '\n💡 Tip: Use --skip-cleanup to keep the test league for inspection',
        );
        LOGGER.info(`   League ${leagueId} is ready for further testing`);
      }
    } finally {
      // Close WebSocket
      if (ws) {
        ws.close();
      }
    }
  } catch (error) {
    LOGGER.error('\n❌ WORKFLOW TEST FAILED');
    LOGGER.error(
      '   Error:',
      error instanceof Error ? error.message : String(error),
    );
    if (error instanceof Error && error.stack) {
      LOGGER.debug('   Stack trace:', error.stack);
    }
    throw error;
  }
}
