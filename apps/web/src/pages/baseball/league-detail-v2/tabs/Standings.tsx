import React, { useMemo } from 'react';
import { StandingsTable } from '@legacy-sports/shared-components';
import {
  type LeagueFragment,
  PlayoffMatchupStatus,
  Sport,
  type TeamFragment,
  useGetLeagueStandingsQuery,
  useGetPlayoffBracketQuery,
} from '../../../../api/db/graphql.generated';
import { I } from '../Icons';
import { Banner, colorFromString, initialsFromName, Section } from '../Shared';

interface PlayoffBracketTeam {
  name?: string | null;
  score?: number | null;
  isWinner?: boolean | null;
}

interface PlayoffBracketMatch {
  round?: string | null;
  teams?: readonly PlayoffBracketTeam[] | null;
  isFinal?: boolean | null;
}

const BracketView: React.FC<{ matches: readonly PlayoffBracketMatch[] }> = ({
  matches,
}) => {
  const byRound = useMemo(() => {
    const buckets = new Map<string, PlayoffBracketMatch[]>();
    matches.forEach((m) => {
      const key = (m.round ?? 'round').toString();
      const existing = buckets.get(key);
      if (existing) {
        existing.push(m);
      } else {
        buckets.set(key, [m]);
      }
    });
    return Array.from(buckets.entries());
  }, [matches]);

  if (matches.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--fg3)' }}>
        Playoff bracket has not been set yet.
      </div>
    );
  }

  return (
    <div className="ls-bracket">
      {byRound.map(([round, ms]) => (
        <div
          key={round}
          className={`ls-bracket-col ${round.toLowerCase().includes('final') ? 'final' : ''}`}
        >
          <div className="ls-bracket-round">{round}</div>
          {ms.map((match, i) => (
            <div
              key={i}
              className={`ls-bracket-match ${match.isFinal ? 'champ' : ''}`}
            >
              {(match.teams ?? []).map((team, j) => (
                <div
                  key={j}
                  className={`ls-bracket-team ${team.isWinner ? 'winner' : ''}`}
                  data-testid="playoff-bracket-team"
                  data-assigned={team.name ? 'true' : 'false'}
                >
                  <span className="name">
                    <div
                      className={`ls-avatar sm ${colorFromString(team.name)}`}
                    >
                      {initialsFromName(team.name)}
                    </div>
                    {team.name ?? '—'}
                  </span>
                  <span className="sc">{team.score?.toFixed(1) ?? '—'}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export interface StandingsTabProps {
  league: LeagueFragment;
  teams: readonly TeamFragment[];
  myTeamId: number | null;
  onTeam: (teamId: number) => void;
}

export const StandingsTab: React.FC<StandingsTabProps> = ({
  league,
  teams,
  myTeamId,
  onTeam,
}) => {
  const isFootball = league.sport === Sport.Football;
  const { data: standingsData, loading: standingsLoading } =
    useGetLeagueStandingsQuery({
      variables: { leagueId: league.id ?? 0 },
      skip: !league.id,
      errorPolicy: 'all',
    });
  const standings = useMemo(
    () => standingsData?.getLeagueStandings ?? [],
    [standingsData?.getLeagueStandings],
  );

  // Always run the bracket query — do NOT skip on !playoffEnabled. The
  // `league.playoffEnabled` field can be stale/null in the Apollo cache
  // when the league was just created via `createLeagueAndTeams` (whose
  // resolver returns playoffEnabled=null because LeagueService.createLeague
  // omits it from .returning()), so skipping the query here would hide an
  // existing bracket from the user. Render the section if a bracket exists
  // regardless of the flag (see the gate below).
  const { data: bracketData } = useGetPlayoffBracketQuery({
    variables: { leagueId: league.id ?? 0 },
    skip: !league.id,
    errorPolicy: 'all',
  });

  // Feed the shared StandingsTable. When standings haven't been computed yet
  // (e.g. a freshly created league before any games), fall back to the team
  // list so members still see their teams instead of an empty table.
  const standingsForTable = useMemo(() => {
    if (standings.length > 0) return standings;
    return teams
      .filter((t) => t.id != null)
      .map((t) => ({
        __typename: 'TeamStanding' as const,
        teamId: t.id != null ? String(t.id) : null,
        teamName: t.name ?? 'Team',
        wins: null,
        losses: null,
        ties: null,
        winPercentage: null,
        pointsFor: null,
        pointsAgainst: null,
        avatarUrl: null,
        primaryColor: t.primaryColor ?? null,
        secondaryColor: null,
        divisionId: null,
      }));
  }, [standings, teams]);

  const teamCount = standingsForTable.length;
  const subtitle = standingsLoading
    ? 'Loading…'
    : isFootball
      ? `${teamCount} teams · Sorted by win percentage, then PF`
      : `${teamCount} teams · Sorted by win percentage`;

  const bracketMatches: readonly PlayoffBracketMatch[] = (
    bracketData?.getPlayoffBracket?.matchups ?? []
  ).map((m) => {
    const roundLabel = m.round ? String(m.round).replace(/_/g, ' ') : null;
    const isFinal = roundLabel?.toLowerCase().includes('final') ?? false;
    return {
      round: roundLabel,
      teams: [
        {
          name: m.highSeedTeam?.name ?? null,
          score: m.highSeedScore ?? null,
          isWinner:
            m.winnerTeamId != null && m.winnerTeamId === m.highSeedTeamId,
        },
        {
          name: m.lowSeedTeam?.name ?? null,
          score: m.lowSeedScore ?? null,
          isWinner:
            m.winnerTeamId != null && m.winnerTeamId === m.lowSeedTeamId,
        },
      ],
      isFinal,
    };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <StandingsTable
        standings={standingsForTable}
        loading={standingsLoading}
        currentUserTeamId={myTeamId}
        onTeamPress={onTeam}
        subtitle={subtitle}
      />

      {league.playoffEnabled || bracketData?.getPlayoffBracket ? (
        <Section
          title="Playoff Bracket"
          sub={league.playoffFormat ?? 'Single elimination'}
          right={
            <span className="ls-chip ls-chip-pre">
              <I.Trophy size={10} /> Playoff Mode
            </span>
          }
        >
          {bracketData?.getPlayoffBracket?.status ===
            PlayoffMatchupStatus.Completed &&
          bracketData.getPlayoffBracket.championTeam ? (
            <Banner
              kind="gold"
              icon={<I.Trophy size={16} />}
              title="Champion"
              sub={bracketData.getPlayoffBracket.championTeam.name ?? undefined}
            />
          ) : null}
          <BracketView matches={bracketMatches} />
        </Section>
      ) : null}
    </div>
  );
};
