import type { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { eq } from 'drizzle-orm';
import { LOGGER } from '@legacy-sports/logging';
import { addBreadcrumb, captureError } from '@legacy-sports/rollbar';
import { getDbOptions } from '@legacy-sports/utils/node';
import {
  getMatchupFootballPlayerGameStats,
  type PublicDb,
  PublicSchema,
  runWithPublicClient,
  updateMatchupScore,
} from '@legacy-sports/db-client';
import { createNotificationPublisher } from '@legacy-sports/aws-utils';
import { computeFootballPlayerGamePoints } from '@legacy-sports/scoring';
import { getFootballScoringSettingsForLeague } from '@legacy-sports/scoring/server';
import type { CalculateFootballScoresMessage } from '../load-game-types';
import { emitFootballFailure, emitFootballSuccess } from '../football-metrics';
import { publishFootballGameAlerts } from '../football-notification-triggers';

export function isFootballScoreMessage(
  value: unknown,
): value is CalculateFootballScoresMessage {
  if (typeof value !== 'object' || value === null) return false;
  const msg = value as Record<string, unknown>;
  return (
    msg['type'] === 'football-calculate-scores' &&
    typeof msg['matchupId'] === 'number'
  );
}

export interface CalculateFootballScoresResult {
  matchupId: number;
  team1Score: number;
  team2Score: number;
  updated: boolean;
}

/**
 * Core football matchup score calculation.
 *
 * Fetches player game stats, applies the **league's** scoring settings (DST
 * bands, IDP flat multipliers, or offensive flat multipliers), and writes team
 * scores.
 *
 * Before LS-9672 this scored every league from the hardcoded `DEFAULT_*`
 * constants: a commissioner could configure football scoring and it had zero
 * effect on the matchup scores this function persists, with no error and no
 * log line. It now resolves the league's profile through the same
 * `getFootballScoringSettingsForLeague` the `matchupScores` breakdown
 * resolver uses, and scores each player-game through the same
 * `computeFootballPlayerGamePoints`, so the two cannot drift apart.
 *
 * A league with no scoring profile still resolves to the platform defaults,
 * so unconfigured leagues score exactly as they did before.
 */
export async function calculateAndUpdateFootballMatchupScores(
  db: PublicDb,
  matchupId: number,
  forceRecalculation = false,
): Promise<CalculateFootballScoresResult> {
  const matchupResult = await db.query.matchups.findFirst({
    where: (matchups, { eq: eqFn }) => eqFn(matchups.id, matchupId),
  });

  if (!matchupResult) {
    throw new Error(`Matchup ${matchupId} not found`);
  }

  const { team1Id, team2Id, team1Score, team2Score, leagueId } = matchupResult;

  if (!forceRecalculation && team1Score && team2Score) {
    return {
      matchupId,
      team1Score: parseFloat(team1Score),
      team2Score: parseFloat(team2Score),
      updated: false,
    };
  }

  // Fetch all matchup players with teamId for grouping, plus the rostered
  // position type — position-scoped bonuses (LS-9104) are part of the
  // league's scoring configuration, so leaving them out would reintroduce
  // the same silent no-op for a subset of it (LS-9672).
  const matchupPlayers = await db
    .select({
      matchupPlayerId: PublicSchema.matchupPlayers.id,
      teamId: PublicSchema.matchupPlayers.teamId,
      positionType: PublicSchema.leaguePosition.positionType,
    })
    .from(PublicSchema.matchupPlayers)
    .leftJoin(
      PublicSchema.leaguePosition,
      eq(
        PublicSchema.leaguePosition.id,
        PublicSchema.matchupPlayers.positionId,
      ),
    )
    .where(eq(PublicSchema.matchupPlayers.matchupId, matchupId));

  const matchupPlayerToTeam = new Map<number, number>(
    matchupPlayers.map((mp) => [mp.matchupPlayerId, mp.teamId]),
  );
  const matchupPlayerToPosition = new Map<number, string>(
    matchupPlayers
      .filter((mp): mp is typeof mp & { positionType: string } =>
        Boolean(mp.positionType),
      )
      .map((mp) => [mp.matchupPlayerId, mp.positionType]),
  );

  // The league's configured scoring, or the platform defaults when it has no
  // profile — the same resolution the matchupScores breakdown resolver uses.
  const scoringSettings = await getFootballScoringSettingsForLeague(
    db,
    leagueId,
  );

  const playerGameStats = await getMatchupFootballPlayerGameStats(
    db,
    matchupId,
  );

  let team1Total = 0;
  let team2Total = 0;

  for (const stat of playerGameStats) {
    const teamId = matchupPlayerToTeam.get(stat.matchupPlayerId);
    if (teamId === undefined) continue;

    // Bench players do not score (LS-10948). matchup_players holds the whole
    // roster and game selection picks games for bench rows too, so without
    // this skip the persisted score summed starters AND bench while the
    // matchupScores resolver counts starters only.
    const position = matchupPlayerToPosition.get(stat.matchupPlayerId);
    if (position === undefined) continue;

    const score = computeFootballPlayerGamePoints(stat, scoringSettings, {
      position,
    });

    if (teamId === team1Id) {
      team1Total += score;
    } else if (teamId === team2Id) {
      team2Total += score;
    }
  }

  const updatedMatchup = await updateMatchupScore(
    db,
    matchupId,
    team1Total,
    team2Total,
  );

  return {
    matchupId,
    team1Score: updatedMatchup.team1Score
      ? parseFloat(updatedMatchup.team1Score)
      : team1Total,
    team2Score: updatedMatchup.team2Score
      ? parseFloat(updatedMatchup.team2Score)
      : team2Total,
    updated: true,
  };
}

const baseHandler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  LOGGER.debug('Processing football score calculation event', {
    recordCount: event.Records.length,
  });
  addBreadcrumb(
    `Processing ${event.Records.length} football score SQS records`,
  );

  const notificationPublisher = createNotificationPublisher();

  return await runWithPublicClient(getDbOptions(), async (db) => {
    const batchItemFailures: { itemIdentifier: string }[] = [];

    for (const record of event.Records) {
      try {
        if (!record.body) {
          batchItemFailures.push({ itemIdentifier: record.messageId });
          continue;
        }

        let message: CalculateFootballScoresMessage;
        try {
          message = JSON.parse(record.body) as CalculateFootballScoresMessage;
        } catch (parseErr) {
          const err =
            parseErr instanceof Error ? parseErr : new Error(String(parseErr));
          LOGGER.error('Failed to parse football score message', err, {
            messageId: record.messageId,
          });
          batchItemFailures.push({ itemIdentifier: record.messageId });
          continue;
        }

        addBreadcrumb(
          `Calculating football scores for matchup ${message.matchupId}`,
        );

        const result = await calculateAndUpdateFootballMatchupScores(
          db,
          message.matchupId,
          true,
        );

        LOGGER.info(
          `Football scores calculated for matchup ${message.matchupId}`,
          {
            team1Score: result.team1Score,
            team2Score: result.team2Score,
          },
        );

        await publishFootballGameAlerts(
          db,
          notificationPublisher,
          message.matchupId,
        );

        await emitFootballSuccess('matchup_score');
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        LOGGER.error('Failed to calculate football scores', err, {
          messageId: record.messageId,
        });
        captureError(err, {
          context: 'calculate-football-matchup-scores',
          messageId: record.messageId,
        });
        await emitFootballFailure('matchup_score');
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }

    return { batchItemFailures };
  });
};

export const handler = baseHandler;
