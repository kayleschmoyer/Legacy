import { LOGGER } from '@legacy-sports/logging';
import { WebSocketClient } from '@legacy-sports/websocket-client';
import {
  ClientNotificationType,
  wireToClientEventName,
} from '@legacy-sports/utils';
import { CommandArgs } from '../utils/loadEnvFile';
import { AuthMiddleware } from '../services/AuthMiddleware';

export interface TestWorkflowArgs extends CommandArgs {
  user?: string;
  skipCleanup?: boolean;
  teams?: number;
  weeks?: number;
  finalWeekGames?: number;
}

/**
 * Connect to WebSocket and wait for specific events
 * Uses the shared WebSocketClient for connection management
 */
async function connectWebSocket(
  token: string,
  leagueId?: number,
  matchupId?: number,
  viewContext: 'general' | 'league' | 'matchup' | 'roster' = 'general',
): Promise<WebSocketClient> {
  const wsUrl =
    process.env.WEBSOCKET_URL ||
    process.env.VITE_WEBSOCKET_URL ||
    'wss://nx7q8petpg.execute-api.us-east-1.amazonaws.com/dev';

  LOGGER.info(`🔌 Connecting to WebSocket: ${wsUrl}`);

  const client = new WebSocketClient({
    url: wsUrl,
    token,
    leagueId,
    matchupId,
    viewContext,
    autoConnect: false,
    reconnect: false, // CLI manages connection manually
  });

  // Set up logging for connection events
  client.on('connected', () => {
    LOGGER.info('✅ WebSocket connected');
  });

  client.on('disconnected', () => {
    LOGGER.info('🔌 WebSocket disconnected');
  });

  client.on('error', (error) => {
    LOGGER.error('❌ WebSocket error:', error);
  });

  // Connect and wait for connection
  return new Promise((resolve, reject) => {
    const unsubscribe = client.on('connected', () => {
      unsubscribe();
      resolve(client);
    });

    const unsubError = client.on('error', (error) => {
      unsubError();
      reject(error);
    });

    client.connect();

    // Timeout after 30 seconds
    setTimeout(() => {
      if (client.getState() !== 'connected') {
        client.dispose();
        reject(new Error('WebSocket connection timeout'));
      }
    }, 30000);
  });
}

/**
 * Wait for a specific WebSocket event
 */
async function waitForEvent(
  client: WebSocketClient,
  eventType: string,
  leagueId: number,
  matchupId?: number,
  timeout = 300000, // 5 minutes default
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timeout waiting for ${eventType} event`));
    }, timeout);

    const unsubscribe = client.on('message', (message) => {
      try {
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
            `📦 Notification wrapper detected: data.type=${(message.data as { type?: string }).type}`,
          );

          const data = message.data as {
            type?: string;
            leagueId?: number;
            matchupId?: number;
          };

          // Map notification data types to expected event types
          const notificationTypeMap: Record<string, string> = {
            DRAFT_COMPLETED: ClientNotificationType.DRAFT_COMPLETED,
            MATCHUP_STATS_COMPLETE:
              ClientNotificationType.MATCHUP_STATS_COMPLETE,
            PLAYER_STATS_LOADING: ClientNotificationType.PLAYER_STATS_LOADING,
            GAME_SELECTED: 'game-selected',
          };

          const mappedType = data.type
            ? notificationTypeMap[data.type] || wireToClientEventName(data.type)
            : '';
          const messageLeagueId = data.leagueId || message.leagueId;
          const messageMatchupId = data.matchupId || message.matchupId;

          LOGGER.debug(
            `🔄 Mapped type: ${data.type} -> ${mappedType}, messageLeagueId=${messageLeagueId}, messageMatchupId=${messageMatchupId}`,
          );

          // Check if event type matches
          const typeMatches = mappedType === eventType;
          const leagueMatches = messageLeagueId === leagueId;
          const matchupMatches = !matchupId || messageMatchupId === matchupId;

          if (typeMatches && leagueMatches && matchupMatches) {
            LOGGER.info(`✅ Event matched! Resolving...`);
            clearTimeout(timeoutId);
            unsubscribe();
            resolve();
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
          unsubscribe();
          resolve();
        } else {
          LOGGER.debug(
            `❌ Message doesn't match: type="${message.type}" vs eventType="${eventType}"`,
          );
        }
      } catch (error) {
        LOGGER.warn('Failed to parse WebSocket message:', error);
      }
    });
  });
}

/**
 * Create a league via GraphQL
 */
async function createLeague(
  authMiddleware: AuthMiddleware,
  userEmail: string,
  numberOfTeams = 4,
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
      numberOfTeams,
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
): Promise<{
  matchups: Array<{
    id: number;
    weekNumber: number;
    gamesPerMatchup?: number | null;
  }>;
}> {
  LOGGER.info('\n⏭️ Step 3: Advancing league week (creating matchups)...');

  const mutation = `
    mutation AdvanceLeagueWeek($leagueId: Int!) {
      advanceLeagueWeek(leagueId: $leagueId) {
        matchups {
          id
          weekNumber
          status
          statsLoadingStatus
          gamesPerMatchup
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
        matchups: Array<{
          id: number;
          weekNumber: number;
          status: string;
          gamesPerMatchup?: number | null;
        }>;
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

export async function handleTestWorkflow(
  args: TestWorkflowArgs,
): Promise<void> {
  const { user, skipCleanup, teams = 4, weeks = 1, finalWeekGames } = args;

  try {
    LOGGER.info('🚀 Starting End-to-End League Workflow Test');
    LOGGER.info('═'.repeat(60));
    LOGGER.info(`   Teams: ${teams}`);
    LOGGER.info(`   Weeks: ${weeks}`);
    if (finalWeekGames !== undefined) {
      LOGGER.info(`   Final week games: ${finalWeekGames}`);
    } else {
      LOGGER.info(`   Final week games: all games`);
    }
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

    let client: WebSocketClient | null = null;
    let leagueId: number | undefined;
    let totalMatchupsProcessed = 0;
    let totalGamesTriggered = 0;

    try {
      // Step 1: Create league
      const { leagueId: newLeagueId, teamIds } = await createLeague(
        authMiddleware,
        userEmail,
        teams,
      );
      leagueId = newLeagueId;

      // Connect to WebSocket with leagueId (optional - will continue if fails)
      try {
        client = await connectWebSocket(token, leagueId);
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
      if (client) {
        LOGGER.info('\n⏳ Waiting for draft to complete via WebSocket...');
        try {
          await waitForEvent(
            client,
            ClientNotificationType.DRAFT_COMPLETED,
            leagueId,
            undefined,
            180000,
          ); // 3 minutes
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

      // Step 3: Process multiple weeks
      for (let weekNum = 1; weekNum <= weeks; weekNum++) {
        LOGGER.info(`\n${'═'.repeat(60)}`);
        LOGGER.info(`📅 Processing Week ${weekNum} of ${weeks}`);
        LOGGER.info(`${'═'.repeat(60)}`);

        // Advance league week to create matchups
        const { matchups } = await advanceLeagueWeek(
          authMiddleware,
          userEmail,
          leagueId,
        );

        // Determine how many games to trigger for this week
        const isLastWeek = weekNum === weeks;
        const gamesPerMatchup = matchups[0]?.gamesPerMatchup || 5;
        const gamesToTrigger =
          isLastWeek && finalWeekGames !== undefined
            ? Math.min(finalWeekGames, gamesPerMatchup)
            : gamesPerMatchup;

        LOGGER.info(
          `\n🎮 Triggering ${gamesToTrigger} of ${gamesPerMatchup} games for ${matchups.length} matchup(s)`,
        );

        // Process each matchup in this week
        for (const matchup of matchups) {
          // Ensure IDs are numbers, not strings
          const matchupId =
            typeof matchup.id === 'string'
              ? parseInt(matchup.id, 10)
              : matchup.id;

          LOGGER.info(
            `\n🎲 Processing Matchup ${matchupId} (Week ${matchup.weekNumber})`,
          );

          // Trigger games sequentially for this matchup
          for (let gameNum = 1; gameNum <= gamesToTrigger; gameNum++) {
            LOGGER.info(
              `\n   🎯 Game ${gameNum}/${gamesToTrigger} for Matchup ${matchupId}`,
            );
            await triggerGameSelection(
              authMiddleware,
              userEmail,
              matchupId,
              gameNum,
            );

            // Close existing WebSocket and reconnect with matchupId context
            if (client) {
              LOGGER.debug('🔄 Reconnecting WebSocket with matchup context...');
              client.dispose();
              client = null;
            }

            try {
              client = await connectWebSocket(
                token,
                leagueId,
                matchupId,
                'matchup',
              );
            } catch (error) {
              LOGGER.warn(
                '⚠️ Failed to connect to WebSocket, will use polling instead',
              );
              LOGGER.warn(
                `   Error: ${error instanceof Error ? error.message : String(error)}`,
              );
            }

            // Wait for stats loading to complete via WebSocket
            if (client) {
              LOGGER.info(
                `   ⏳ Waiting for stats loading to complete for matchup ${matchupId}, game ${gameNum}...`,
              );
              try {
                // Smart heartbeat only sends pings during idle periods (8+ min without messages)
                // Active stats loading sends frequent notifications, keeping connection alive naturally
                await waitForEvent(
                  client,
                  'matchup-stats-complete',
                  leagueId,
                  matchupId,
                  900000,
                ); // 15 minutes
                LOGGER.info(
                  `   ✅ Stats loading completed for matchup ${matchupId}, game ${gameNum} (via WebSocket)`,
                );
              } catch (error) {
                LOGGER.warn(
                  `   ⚠️ WebSocket wait failed for matchup ${matchupId}, falling back to polling`,
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
                `   ⚠️ No WebSocket connection, using polling for matchup ${matchupId}`,
              );
              await waitForStatsLoading(authMiddleware, userEmail, matchupId);
            }

            totalGamesTriggered++;
          }

          totalMatchupsProcessed++;
        }

        LOGGER.info(
          `\n✅ Week ${weekNum} completed: ${matchups.length} matchup(s), ${gamesToTrigger} game(s) each`,
        );
      }

      LOGGER.info('\n═'.repeat(60));
      LOGGER.info('🎉 WORKFLOW TEST COMPLETED SUCCESSFULLY!');
      LOGGER.info('═'.repeat(60));
      LOGGER.info(`\n📊 Summary:`);
      LOGGER.info(`   League ID: ${leagueId}`);
      LOGGER.info(`   Teams: ${teamIds.length}`);
      LOGGER.info(`   Weeks processed: ${weeks}`);
      LOGGER.info(`   Total matchups: ${totalMatchupsProcessed}`);
      LOGGER.info(`   Total games triggered: ${totalGamesTriggered}`);
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
      if (client) {
        client.dispose();
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
