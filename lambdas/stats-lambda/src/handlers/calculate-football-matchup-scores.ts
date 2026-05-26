import type { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { eq } from 'drizzle-orm';
import { LOGGER } from '@legacy-sports/logging';
import { addBreadcrumb, captureError } from '@legacy-sports/rollbar';
import { getDbOptions } from '@legacy-sports/utils/node';
import {
  type FootballMatchupPlayerGameStats,
  getMatchupFootballPlayerGameStats,
  type PublicDb,
  PublicSchema,
  runWithPublicClient,
  updateMatchupScore,
} from '@legacy-sports/db-client';
import {
  computeDefenseScore,
  computeIDPScore,
  computeScoring,
  DEFAULT_DEFENSE_POINTS_ALLOWED_BANDS,
  DEFAULT_DEFENSE_SCORING,
  DEFAULT_IDP_SCORING,
  DEFAULT_KICKING_SCORING,
  DEFAULT_PASSING_SCORING,
  DEFAULT_RECEIVING_SCORING,
  DEFAULT_RUSHING_SCORING,
} from '@legacy-sports/scoring';
import type { CalculateFootballScoresMessage } from '../load-game-types';
import { emitFootballFailure, emitFootballSuccess } from '../football-metrics';

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
 * Fetches player game stats, applies sport-appropriate scoring (DST bands,
 * IDP flat multipliers, or offensive flat multipliers), and writes team scores.
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

  const { team1Id, team2Id, team1Score, team2Score } = matchupResult;

  if (!forceRecalculation && team1Score && team2Score) {
    return {
      matchupId,
      team1Score: parseFloat(team1Score),
      team2Score: parseFloat(team2Score),
      updated: false,
    };
  }

  // Fetch all matchup players with teamId for grouping
  const matchupPlayers = await db
    .select({
      matchupPlayerId: PublicSchema.matchupPlayers.id,
      teamId: PublicSchema.matchupPlayers.teamId,
    })
    .from(PublicSchema.matchupPlayers)
    .where(eq(PublicSchema.matchupPlayers.matchupId, matchupId));

  const matchupPlayerToTeam = new Map<number, number>(
    matchupPlayers.map((mp) => [mp.matchupPlayerId, mp.teamId]),
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

    const score = computeFootballPlayerGameScore(stat);

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

function computeFootballPlayerGameScore(
  stat: FootballMatchupPlayerGameStats,
): number {
  if (stat.defense !== null) {
    return computeDefenseScore(
      {
        sacks: stat.defense.sacks,
        int: stat.defense.interceptions,
        fumbles_rec: stat.defense.fumblesRec,
        def_td: stat.defense.defTd,
        safeties: stat.defense.safeties,
        pts_allowed: stat.defense.ptsAllowed,
        yds_allowed: stat.defense.ydsAllowed,
        pass_yds_allowed: stat.defense.passYdsAllowed,
        rush_yds_allowed: stat.defense.rushYdsAllowed,
      },
      DEFAULT_DEFENSE_SCORING,
      DEFAULT_DEFENSE_POINTS_ALLOWED_BANDS,
    );
  }

  if (stat.idpDefense !== null) {
    return computeIDPScore(
      {
        solo_tkl: stat.idpDefense.soloTkl,
        ast_tkl: stat.idpDefense.astTkl,
        sacks:
          stat.idpDefense.sacks !== null
            ? parseFloat(stat.idpDefense.sacks)
            : null,
        int: stat.idpDefense.interceptions,
        pd: stat.idpDefense.pd,
        ff: stat.idpDefense.ff,
        fr: stat.idpDefense.fr,
        def_td: stat.idpDefense.defTd,
        safeties: stat.idpDefense.safeties,
      },
      DEFAULT_IDP_SCORING,
    );
  }

  // Offensive / kicking player — sum applicable stat groups from the combined view
  let score = 0;
  const o = stat.offense;

  if (o !== null) {
    if (o.passAtt !== null) {
      score += computeScoring(
        {
          yds: o.passYds,
          td: o.passTd,
          int: o.interceptions,
          sacked: o.sacked,
        },
        DEFAULT_PASSING_SCORING,
      );
    }

    if (o.rushAtt !== null) {
      score += computeScoring(
        { yds: o.rushYds, td: o.rushTd, fumbles: o.rushFumbles },
        DEFAULT_RUSHING_SCORING,
      );
    }

    if (o.rec !== null) {
      score += computeScoring(
        { rec: o.rec, yds: o.recYds, td: o.recTd, fumbles: o.recFumbles },
        DEFAULT_RECEIVING_SCORING,
      );
    }

    if (o.fgm !== null) {
      score += computeScoring(
        { fgm: o.fgm, fg_50m: o.fg50m, xpm: o.xpm },
        DEFAULT_KICKING_SCORING,
      );
    }
  }

  return score;
}

const baseHandler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  LOGGER.debug('Processing football score calculation event', {
    recordCount: event.Records.length,
  });
  addBreadcrumb(
    `Processing ${event.Records.length} football score SQS records`,
  );

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
