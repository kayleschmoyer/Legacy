import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type SeasonStats } from '@legacy-sports/scoring';
import {
  MatchupScoreboardHero,
  type MatchupScoreboardHeroTeam,
} from '@legacy-sports/shared-components/matchup';
import {
  type LeagueFragment,
  type MatchupPlayerFragment,
  MatchupStatus,
  Sport,
  useGetMatchupPlayersQuery,
} from '../../../../api/db/graphql.generated';
import {
  useCurrentWeek,
  useMatchupById,
  useMatchupsByWeek,
} from '../../../../hooks/useMatchup';
import { useLeagueWebSocket } from '../../../../hooks/useLeagueWebSocket';
import { MatchupRosterComparison } from '../../../../features/matchup/MatchupRosterComparison';
import { computeMatchupScores } from '../../../../features/matchup/MatchupScoreboard';
import { useLeagueScoringSettings } from '../../../../lib/scoring';
import { mapMatchupPlayerToSeasonStats } from '../../../../lib/scoring/mapGraphQLToScoringFormat';
import { I } from '../Icons';
import { Section } from '../Shared';

export interface MatchupTabProps {
  league: LeagueFragment;
  myTeamId: number | null;
  initialMatchupId: string | null;
  onTeam: (teamId: number) => void;
}

export const MatchupTab: React.FC<MatchupTabProps> = ({
  league,
  myTeamId,
  initialMatchupId,
  onTeam,
}) => {
  const isFootball = league.sport === Sport.Football;
  const { currentWeek } = useCurrentWeek(league.id ?? null);
  const [week, setWeek] = useState<number>(
    league.currentWeekNumber ?? currentWeek ?? 1,
  );
  useEffect(() => {
    if (league.currentWeekNumber) setWeek(league.currentWeekNumber);
    else if (currentWeek) setWeek(currentWeek);
  }, [league.currentWeekNumber, currentWeek]);

  const { matchups, refetch: refetchMatchups } = useMatchupsByWeek(
    league.id ?? null,
    week,
  );

  const myMatchup = useMemo(() => {
    if (!matchups || matchups.length === 0) return null;
    if (myTeamId) {
      const found = matchups.find(
        (m) => m?.team1Id === myTeamId || m?.team2Id === myTeamId,
      );
      if (found) return found;
    }
    return matchups[0];
  }, [matchups, myTeamId]);

  const matchupId = initialMatchupId
    ? parseInt(initialMatchupId, 10)
    : myMatchup?.id != null
      ? Number(myMatchup.id)
      : null;

  const { matchup, refetch: refetchMatchup } = useMatchupById(matchupId);

  // Refetch scores when the server signals stats have been recalculated.
  const refetchMatchupsRef = useRef(refetchMatchups);
  refetchMatchupsRef.current = refetchMatchups;
  const refetchMatchupRef = useRef(refetchMatchup);
  refetchMatchupRef.current = refetchMatchup;
  useLeagueWebSocket({
    onMatchupStatsComplete: () => {
      void refetchMatchupsRef.current();
      void refetchMatchupRef.current();
    },
  });

  // Pull players + scoring settings to compute live scores and projections
  // client-side, mirroring the canonical MatchupScoreboard behaviour.
  const { data: playersData, error: playersError } = useGetMatchupPlayersQuery({
    variables: { matchupId: matchupId ?? 0 },
    skip: !matchupId,
    errorPolicy: 'all',
  });
  const { settings: scoringSettings } = useLeagueScoringSettings(
    league.id ?? undefined,
  );
  const seasonStatsMap = useMemo(() => {
    const map = new Map<number, SeasonStats>();
    playersData?.getMatchupPlayers?.forEach((mp: MatchupPlayerFragment) => {
      const stats = mapMatchupPlayerToSeasonStats(mp);
      if (stats) map.set(stats.playerId, stats);
    });
    return map;
  }, [playersData]);

  const computed = useMemo(
    () =>
      computeMatchupScores({
        matchup,
        players: playersData?.getMatchupPlayers,
        hasPlayersError: playersError != null,
        scoringSettings,
        seasonStatsMap,
      }),
    [matchup, playersData, playersError, scoringSettings, seasonStatsMap],
  );

  const team1Side: MatchupScoreboardHeroTeam = matchup
    ? {
        id: matchup.team1Id ?? null,
        name: matchup.team1?.name ?? 'Team 1',
        score: computed.team1Score,
        projectedScore: computed.team1Projected,
      }
    : { name: 'Team 1' };
  const team2Side: MatchupScoreboardHeroTeam = matchup
    ? {
        id: matchup.team2Id ?? null,
        name: matchup.team2?.name ?? 'Team 2',
        score: computed.team2Score,
        projectedScore: computed.team2Projected,
      }
    : { name: 'Team 2' };

  const totalGames = matchup?.gamesPerMatchup ?? league.gamesPerMatchup ?? 0;
  const gamesPlayed = matchup?.selectedGamesCount ?? 0;
  const gamesRemaining = Math.max(0, totalGames - gamesPlayed);
  const percentComplete =
    totalGames > 0 ? Math.round((gamesPlayed / totalGames) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="ls-week-nav">
        <div className="ls-week-nav-left">
          <button
            type="button"
            className="ls-navbtn"
            disabled={week <= 1}
            onClick={() => setWeek((w) => Math.max(1, w - 1))}
            aria-label="Previous week"
          >
            <I.ChevronLeft size={16} />
          </button>
          <div className="ls-week-title">Week {week}</div>
          <button
            type="button"
            className="ls-navbtn"
            disabled={
              league.totalMatchups != null && week >= league.totalMatchups
            }
            onClick={() => setWeek((w) => w + 1)}
            aria-label="Next week"
          >
            <I.ChevronRight size={16} />
          </button>
        </div>
        <span className="meta">
          {isFootball
            ? `Matchup ${week}${league.totalMatchups ? `/${league.totalMatchups}` : ''} · Head-to-Head`
            : totalGames > 0
              ? `${gamesPlayed} of ${totalGames} games complete`
              : 'No games scheduled'}
        </span>
      </div>

      <MatchupScoreboardHero
        weekNumber={week}
        totalMatchups={league.totalMatchups}
        status={matchup?.status ?? null}
        team1={team1Side}
        team2={team2Side}
        gamesPlayed={gamesPlayed}
        totalGames={totalGames}
        onTeamPress={onTeam}
      />

      {!isFootball && totalGames > 0 ? (
        <div className="ls-games-remaining">
          <div className="ls-games-row">
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  color: 'var(--fg1)',
                }}
              >
                Games Remaining
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  color: 'var(--fg3)',
                  marginTop: 2,
                }}
              >
                <span className="mono" style={{ color: 'var(--fg1-strong)' }}>
                  {gamesPlayed}
                </span>{' '}
                of <span className="mono">{totalGames}</span> complete ·{' '}
                <span className="mono">{gamesRemaining}</span> remaining
              </div>
            </div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: 28,
                color: 'var(--brand-gold-light)',
                fontVariantNumeric: 'tabular-nums',
              }}
              aria-label={`${percentComplete} percent complete`}
            >
              {percentComplete}%
            </div>
          </div>
          <div className="ls-progress">
            <div
              className="ls-progress-fill"
              style={{ width: `${percentComplete}%` }}
            />
          </div>
          <div className="ls-games-dots">
            {Array.from({ length: totalGames }).map((_, idx) => {
              const cls =
                idx < gamesPlayed
                  ? 'done'
                  : idx === gamesPlayed &&
                      matchup?.status === MatchupStatus.InProgress
                    ? 'live'
                    : 'pending';
              return <div key={idx} className={`ls-game-dot ${cls}`} />;
            })}
          </div>
        </div>
      ) : null}

      <Section title="Roster Comparison" sub="Starters and bench, side by side">
        {matchup ? (
          <MatchupRosterComparison
            matchup={matchup}
            userTeamId={myTeamId ?? null}
          />
        ) : (
          <div
            style={{ padding: 32, textAlign: 'center', color: 'var(--fg3)' }}
          >
            No matchup scheduled for this week yet.
          </div>
        )}
      </Section>
    </div>
  );
};
