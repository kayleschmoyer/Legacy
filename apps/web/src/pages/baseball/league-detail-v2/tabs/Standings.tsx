import React, { useMemo } from 'react';
import {
  type LeagueFragment,
  type TeamFragment,
  useGetLeagueStandingsQuery,
  useGetPlayoffBracketQuery,
} from '../../../../api/db/graphql.generated';
import { I } from '../Icons';
import { colorFromString, initialsFromName, Rank, Section } from '../Shared';

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

const fmtNum = (n: number | null | undefined, digits = 1): string =>
  n == null ? '—' : n.toFixed(digits);

export const StandingsTab: React.FC<StandingsTabProps> = ({
  league,
  teams,
  myTeamId,
  onTeam,
}) => {
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

  const { data: bracketData } = useGetPlayoffBracketQuery({
    variables: { leagueId: league.id ?? 0 },
    skip: !league.id || !league.playoffEnabled,
    errorPolicy: 'all',
  });

  // If standings data is unavailable, fall back to the unsorted team list
  const rows = useMemo(() => {
    if (standings.length > 0) {
      return [...standings]
        .sort((a, b) => {
          const aw = a.winPercentage ?? -1;
          const bw = b.winPercentage ?? -1;
          if (aw !== bw) return bw - aw;
          return (b.pointsFor ?? 0) - (a.pointsFor ?? 0);
        })
        .map((s, i) => ({
          rank: i + 1,
          teamId: s.teamId ? Number(s.teamId) : null,
          name: s.teamName ?? 'Team',
          primaryColor: s.primaryColor ?? null,
          wins: s.wins,
          losses: s.losses,
          ties: s.ties,
          pf: s.pointsFor,
          pa: s.pointsAgainst,
        }));
    }
    return teams
      .filter((t) => t.id != null)
      .map((t, i) => ({
        rank: i + 1,
        teamId: t.id ?? null,
        name: t.name ?? 'Team',
        primaryColor: t.primaryColor ?? null,
        wins: null as number | null,
        losses: null as number | null,
        ties: null as number | null,
        pf: null as number | null,
        pa: null as number | null,
      }));
  }, [standings, teams]);

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
      <Section
        title="League Standings"
        sub={
          standingsLoading
            ? 'Loading…'
            : `${rows.length} teams · Sorted by win percentage`
        }
      >
        <div className="ls-table-wrap">
          <table className="ls-table" aria-label="League Standings">
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Team</th>
                <th scope="col" className="num">
                  W
                </th>
                <th scope="col" className="num">
                  L
                </th>
                <th scope="col" className="num">
                  T
                </th>
                <th scope="col" className="num">
                  PF
                </th>
                <th scope="col" className="num">
                  PA
                </th>
                <th scope="col" className="num">
                  Diff
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const diff =
                  row.pf != null && row.pa != null ? row.pf - row.pa : null;
                return (
                  <tr
                    key={row.teamId ?? row.rank}
                    className={myTeamId === row.teamId ? 'me' : ''}
                    onClick={() => row.teamId != null && onTeam(row.teamId)}
                  >
                    <td>
                      <Rank n={row.rank} />
                    </td>
                    <td>
                      <div className="ls-team-cell">
                        <div
                          className={`ls-avatar sm ${colorFromString(row.name)}`}
                          style={
                            row.primaryColor
                              ? { background: row.primaryColor }
                              : undefined
                          }
                        >
                          {initialsFromName(row.name)}
                        </div>
                        <span className="name">{row.name}</span>
                      </div>
                    </td>
                    <td className="num">{row.wins ?? '—'}</td>
                    <td className="num">{row.losses ?? '—'}</td>
                    <td className="num">{row.ties ?? '—'}</td>
                    <td className="num">{fmtNum(row.pf)}</td>
                    <td className="num">{fmtNum(row.pa)}</td>
                    <td
                      className="num"
                      style={
                        diff != null
                          ? {
                              color:
                                diff > 0
                                  ? 'var(--success-fg)'
                                  : diff < 0
                                    ? 'var(--danger-fg)'
                                    : undefined,
                            }
                          : undefined
                      }
                    >
                      {diff == null
                        ? '—'
                        : `${diff > 0 ? '+' : ''}${diff.toFixed(1)}`}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      textAlign: 'center',
                      color: 'var(--fg3)',
                      padding: 32,
                    }}
                  >
                    No teams have joined this league yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Section>

      {league.playoffEnabled ? (
        <Section
          title="Playoff Bracket"
          sub={league.playoffFormat ?? 'Single elimination'}
          right={
            <span className="ls-chip ls-chip-pre">
              <I.Trophy size={10} /> Playoff Mode
            </span>
          }
        >
          <BracketView matches={bracketMatches} />
        </Section>
      ) : null}
    </div>
  );
};
