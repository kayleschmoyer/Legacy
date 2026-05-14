import React, { useEffect, useMemo, useState } from 'react';
import { type SeasonStats } from '@legacy-sports/scoring';
import {
  type LeagueFragment,
  type MatchupPlayerFragment,
  MatchupStatus,
  useGetMatchupPlayersQuery,
} from '../../../../api/db/graphql.generated';
import {
  useCurrentWeek,
  useMatchupById,
  useMatchupsByWeek,
} from '../../../../hooks/useMatchup';
import { MatchupRosterComparison } from '../../../../features/matchup/MatchupRosterComparison';
import { computeMatchupScores } from '../../../../features/matchup/MatchupScoreboard';
import { useLeagueScoringSettings } from '../../../../lib/scoring';
import { mapMatchupPlayerToSeasonStats } from '../../../../lib/scoring/mapGraphQLToScoringFormat';
import { I } from '../Icons';
import { colorFromString, initialsFromName, Section } from '../Shared';

interface MatchupTeamSide {
  id?: number | null;
  name?: string | null;
  primaryColor?: string | null;
  score?: number | null;
  projectedScore?: number | null;
  record?: string | null;
}

const STATUS_CHIP: Record<
  MatchupStatus | 'unknown',
  { cls: string; label: string; pulse: boolean }
> = {
  [MatchupStatus.InProgress]: {
    cls: 'ls-chip-live',
    label: 'Live',
    pulse: true,
  },
  [MatchupStatus.Scheduled]: {
    cls: 'ls-chip-pre',
    label: 'Scheduled',
    pulse: false,
  },
  [MatchupStatus.Completed]: {
    cls: 'ls-chip-final',
    label: 'Final',
    pulse: false,
  },
  [MatchupStatus.Cancelled]: {
    cls: 'ls-chip-final',
    label: 'Cancelled',
    pulse: false,
  },
  unknown: { cls: 'ls-chip-final', label: 'Status unknown', pulse: false },
};

const ScoreboardHero: React.FC<{
  weekNumber?: number | null;
  totalMatchups?: number | null;
  status?: MatchupStatus | null;
  team1: MatchupTeamSide;
  team2: MatchupTeamSide;
  onTeam: (teamId: number) => void;
}> = ({ weekNumber, totalMatchups, status, team1, team2, onTeam }) => {
  const score1 = team1.score ?? 0;
  const score2 = team2.score ?? 0;
  const team1Leading = score1 >= score2;
  const chip = STATUS_CHIP[status ?? 'unknown'] ?? STATUS_CHIP.unknown;
  return (
    <div className="ls-scoreboard-hero">
      <div className="top-band">
        <div className="band-left">
          <span className={`ls-chip ${chip.cls}`}>
            {chip.pulse ? <span className="ls-dot ls-pulse" /> : null}
            {chip.label} · Week {weekNumber ?? '—'}
          </span>
          {totalMatchups ? (
            <span className="meta">
              Matchup {weekNumber ?? '?'}/{totalMatchups}
            </span>
          ) : null}
        </div>
      </div>
      <div className="body">
        <div className={`side ${team1Leading ? 'leading' : ''}`}>
          <div
            className={`ls-avatar lg ${colorFromString(team1.name)}`}
            style={
              team1.primaryColor
                ? { background: team1.primaryColor }
                : undefined
            }
            onClick={() => team1.id != null && onTeam(team1.id)}
          >
            {initialsFromName(team1.name)}
          </div>
          <div className="name">{team1.name ?? 'Team 1'}</div>
          <div className="record mono">{team1.record ?? '—'}</div>
          <div className="score-huge">{score1.toFixed(2)}</div>
          {team1.projectedScore != null ? (
            <div className="proj">{team1.projectedScore.toFixed(2)} proj</div>
          ) : null}
        </div>
        <div className="vs-big">VS</div>
        <div className={`side ${!team1Leading ? 'leading' : ''}`}>
          <div
            className={`ls-avatar lg ${colorFromString(team2.name)}`}
            style={
              team2.primaryColor
                ? { background: team2.primaryColor }
                : undefined
            }
            onClick={() => team2.id != null && onTeam(team2.id)}
          >
            {initialsFromName(team2.name)}
          </div>
          <div className="name">{team2.name ?? 'Team 2'}</div>
          <div className="record mono">{team2.record ?? '—'}</div>
          <div className="score-huge">{score2.toFixed(2)}</div>
          {team2.projectedScore != null ? (
            <div className="proj">{team2.projectedScore.toFixed(2)} proj</div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

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
  const { currentWeek } = useCurrentWeek(league.id ?? null);
  const [week, setWeek] = useState<number>(
    league.currentWeekNumber ?? currentWeek ?? 1,
  );
  useEffect(() => {
    if (league.currentWeekNumber) setWeek(league.currentWeekNumber);
    else if (currentWeek) setWeek(currentWeek);
  }, [league.currentWeekNumber, currentWeek]);

  const { matchups } = useMatchupsByWeek(league.id ?? null, week);

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

  const { matchup } = useMatchupById(matchupId);

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

  const team1Side: MatchupTeamSide = matchup
    ? {
        id: matchup.team1Id ?? null,
        name: matchup.team1?.name ?? 'Team 1',
        score: computed.team1Score,
        projectedScore: computed.team1Projected,
      }
    : { name: 'Team 1' };
  const team2Side: MatchupTeamSide = matchup
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
          {totalGames > 0
            ? `${gamesPlayed} of ${totalGames} games complete`
            : 'No games scheduled'}
        </span>
      </div>

      <ScoreboardHero
        weekNumber={week}
        totalMatchups={league.totalMatchups}
        status={matchup?.status ?? null}
        team1={team1Side}
        team2={team2Side}
        onTeam={onTeam}
      />

      {totalGames > 0 ? (
        <div className="ls-games-remaining">
          <div className="ls-games-row">
            <span className="eyebrow">Games Remaining</span>
            <span className="mono" style={{ color: 'var(--fg2)' }}>
              {gamesRemaining} / {totalGames}
            </span>
          </div>
          <div className="ls-games-dots">
            {Array.from({ length: totalGames }).map((_, idx) => {
              const cls =
                idx < gamesPlayed
                  ? 'done'
                  : idx === gamesPlayed
                    ? 'live'
                    : 'pending';
              return <div key={idx} className={`ls-game-dot ${cls}`} />;
            })}
          </div>
          <div className="ls-progress">
            <div
              className="ls-progress-fill"
              style={{
                width: `${totalGames === 0 ? 0 : (gamesPlayed / totalGames) * 100}%`,
              }}
            />
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
