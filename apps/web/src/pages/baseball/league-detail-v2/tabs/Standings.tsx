import React, { useMemo } from 'react';
import {
  type LeagueFragment,
  PlayoffMatchupStatus,
  type TeamFragment,
  useGetLeagueStandingsQuery,
  useGetPlayoffBracketQuery,
} from '../../../../api/db/graphql.generated';
import { I } from '../Icons';
import {
  Banner,
  colorFromString,
  initialsFromName,
  Rank,
  Section,
} from '../Shared';

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

const fmtNum = (n: number | null | undefined, digits = 1): string =>
  n == null ? '—' : n.toFixed(digits);

// Restrict commissioner-supplied team `primaryColor` values to a known-safe
// CSS color shape (#hex, rgb()/rgba(), or a CSS named color) before letting
// them flow into an inline `style` attribute. Anything outside this allow-list
// (e.g. "url(...)", "expression(...)", semicolons) is dropped — the team
// avatar falls back to its hashed palette color.
const SAFE_CSS_COLOR_RE =
  /^(#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\(\s*[\d.\s,%/]+\s*\)|[a-z]+)$/i;
const safeCssColor = (raw: string | null | undefined): string | undefined => {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  return SAFE_CSS_COLOR_RE.test(trimmed) ? trimmed : undefined;
};

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
          winPct: s.winPercentage,
          pf: s.pointsFor,
          pa: s.pointsAgainst,
          divisionId: s.divisionId ?? null,
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
        winPct: null as number | null,
        pf: null as number | null,
        pa: null as number | null,
        divisionId: null as number | null,
      }));
  }, [standings, teams]);

  // Group rows by division when ≥2 distinct divisionIds are present. Sort
  // within each division by win % so divisional standings make sense; if
  // only one division (or none) exists, render a single flat group.
  const grouped = useMemo(() => {
    const divisions = new Set<number>();
    rows.forEach((r) => {
      if (r.divisionId != null) divisions.add(r.divisionId);
    });
    if (divisions.size < 2) {
      return [{ id: null as number | null, rows }];
    }
    const buckets = new Map<number | null, typeof rows>();
    rows.forEach((r) => {
      const key = r.divisionId ?? null;
      const existing = buckets.get(key);
      if (existing) existing.push(r);
      else buckets.set(key, [r]);
    });
    return Array.from(buckets.entries())
      .sort(([a], [b]) => {
        if (a == null) return 1;
        if (b == null) return -1;
        return a - b;
      })
      .map(([id, divRows]) => ({
        id,
        rows: divRows.map((r, i) => ({ ...r, rank: i + 1 })),
      }));
  }, [rows]);

  const fmtPct = (v: number | null | undefined): string =>
    v == null ? '—' : v.toFixed(3).replace(/^0\./, '.');

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
                <th scope="col" style={{ width: 60 }}>
                  Rank
                </th>
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
                  Win %
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
              {grouped.map((group) => (
                <React.Fragment key={group.id ?? 'all'}>
                  {group.id != null ? (
                    <tr>
                      <td
                        colSpan={9}
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontWeight: 700,
                          fontSize: 12,
                          letterSpacing: '.14em',
                          textTransform: 'uppercase',
                          color: 'var(--brand-gold-light)',
                          background: 'rgba(197,165,90,.06)',
                          padding: '10px 14px',
                        }}
                      >
                        Division {group.id}
                      </td>
                    </tr>
                  ) : null}
                  {group.rows.map((row) => {
                    const diff =
                      row.pf != null && row.pa != null ? row.pf - row.pa : null;
                    const isMe = myTeamId === row.teamId;
                    return (
                      <tr
                        key={row.teamId ?? `${group.id}-${row.rank}`}
                        className={isMe ? 'me' : ''}
                        onClick={() => row.teamId != null && onTeam(row.teamId)}
                      >
                        <td>
                          <Rank n={row.rank} />
                        </td>
                        <td>
                          <div className="ls-team-cell">
                            <div
                              className={`ls-avatar sm ${colorFromString(row.name)}`}
                              style={(() => {
                                const safe = safeCssColor(row.primaryColor);
                                return safe ? { background: safe } : undefined;
                              })()}
                            >
                              {initialsFromName(row.name)}
                            </div>
                            <span className="name">
                              {row.name}
                              {isMe ? (
                                <span
                                  className="ls-chip ls-chip-commish"
                                  style={{
                                    marginLeft: 8,
                                    fontSize: 8,
                                    padding: '2px 6px',
                                  }}
                                >
                                  You
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </td>
                        <td className="num">{row.wins ?? '—'}</td>
                        <td className="num">{row.losses ?? '—'}</td>
                        <td className="num">{row.ties ?? '—'}</td>
                        <td
                          className="num"
                          style={{
                            color: 'var(--fg1-strong)',
                            fontWeight: 600,
                          }}
                        >
                          {fmtPct(row.winPct)}
                        </td>
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
                </React.Fragment>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
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
