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
} from '@legacy-sports/graphql';
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

// Upper bound on individually-rendered game dots. gamesPerMatchup normally
// tops out in the single digits; this guards against a corrupt/huge value
// forcing an excessive Array.from allocation (negative values are already
// excluded by the enclosing `totalGames > 0` render guard).
const MAX_GAME_DOTS = 30;

/**
 * Derives the weekly matchup-format label for football leagues.
 * Currently all football leagues use head-to-head scoring; this helper
 * is the single place to update when a scoringFormat/matchupFormat field
 * is added to LeagueFragment.
 */
function footballMatchupFormatLabel(scoringFormat?: string | null): string {
  if (scoringFormat === 'total_points') return 'Total Points';
  if (scoringFormat === 'rotisserie') return 'Rotisserie';
  return 'Head-to-Head';
}

export interface MatchupTabProps {
  league: LeagueFragment;
  myTeamId: number | null;
  initialMatchupId: string | null;
  onTeam: (teamId: number) => void;
  isCommissioner?: boolean;
  onCommish?: () => void;
}

export const MatchupTab: React.FC<MatchupTabProps> = ({
  league,
  myTeamId,
  initialMatchupId,
  onTeam,
  isCommissioner,
  onCommish,
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

  const {
    matchup,
    loading: matchupLoading,
    error: matchupError,
    refetch: refetchMatchup,
  } = useMatchupById(matchupId);

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
  }, [playersData?.getMatchupPlayers]);

  const computed = useMemo(
    () =>
      computeMatchupScores({
        matchup,
        players: playersData?.getMatchupPlayers,
        hasPlayersError: playersError != null,
        scoringSettings,
        seasonStatsMap,
      }),
    [
      matchup,
      playersData?.getMatchupPlayers,
      playersError,
      scoringSettings,
      seasonStatsMap,
    ],
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

  const hasNoMatchup = !matchupLoading && !matchupError && matchupId == null;

  if (matchupLoading && !matchup) {
    return (
      <div
        data-testid="matchup-loading"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: '64px 16px',
          color: 'var(--fg3)',
        }}
      >
        <I.Loader size={28} style={{ animation: 'spin 1s linear infinite' }} />
        <span>Loading matchup…</span>
      </div>
    );
  }

  if (matchupError) {
    return (
      <div
        data-testid="matchup-error"
        style={{
          padding: 24,
          borderRadius: 8,
          background: 'var(--red-subtle)',
          border: '1px solid var(--red)',
          color: 'var(--red)',
        }}
      >
        <strong>Failed to load matchup.</strong>
        <div style={{ fontSize: 13, marginTop: 4, color: 'var(--fg2)' }}>
          {matchupError.message}
        </div>
      </div>
    );
  }

  if (hasNoMatchup) {
    return (
      <div
        data-testid="matchup-empty"
        style={{
          padding: 32,
          borderRadius: 8,
          background: 'var(--surface2)',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg1)' }}>
          No Active Matchup
        </div>
        <div style={{ fontSize: 13, color: 'var(--fg3)', maxWidth: 320 }}>
          There is no matchup scheduled for Week {week}. Matchups are created by
          the league commissioner before each period begins.
        </div>
        {isCommissioner && onCommish && (
          <button
            type="button"
            data-testid="go-to-commish"
            onClick={onCommish}
            style={{
              marginTop: 8,
              padding: '8px 20px',
              borderRadius: 6,
              background: 'var(--brand-gold)',
              color: 'var(--fg-on-gold)',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            Go to Commissioner tab
          </button>
        )}
      </div>
    );
  }

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
              league.totalMatchups != null
                ? week >= league.totalMatchups
                : !matchups || matchups.length === 0
            }
            onClick={() => setWeek((w) => w + 1)}
            aria-label="Next week"
          >
            <I.ChevronRight size={16} />
          </button>
        </div>
        <span className="meta">
          {isFootball
            ? `Matchup ${week}${league.totalMatchups ? `/${league.totalMatchups}` : ''} · ${footballMatchupFormatLabel()}`
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
          {totalGames <= MAX_GAME_DOTS ? (
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
          ) : (
            <div
              className="ls-games-dots-overflow"
              data-testid="games-dots-overflow"
            >
              {gamesPlayed}/{totalGames}
            </div>
          )}
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

      {matchup && (matchup.startTime || matchup.endTime) ? (
        <Section title="Schedule" sub="Matchup period">
          <div
            data-testid="matchup-schedule-card"
            style={{
              display: 'flex',
              gap: 32,
              padding: '12px 0',
              fontSize: 13,
              color: 'var(--fg2)',
            }}
          >
            {matchup.startTime ? (
              <div>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '.06em',
                    color: 'var(--fg3)',
                    marginBottom: 2,
                  }}
                >
                  Starts
                </div>
                <div style={{ color: 'var(--fg1)' }}>
                  {new Date(matchup.startTime).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </div>
              </div>
            ) : null}
            {matchup.endTime ? (
              <div>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '.06em',
                    color: 'var(--fg3)',
                    marginBottom: 2,
                  }}
                >
                  Ends
                </div>
                <div style={{ color: 'var(--fg1)' }}>
                  {new Date(matchup.endTime).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </Section>
      ) : null}
    </div>
  );
};
