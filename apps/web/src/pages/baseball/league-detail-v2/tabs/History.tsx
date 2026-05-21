import React, { useMemo, useState } from 'react';
import { LOGGER } from '@legacy-sports/logging';
import {
  type LeagueFragment,
  useGetAllTimeRecordsQuery,
  useGetLeagueHistoryQuery,
  useGetLeagueStandingsQuery,
} from '../../../../api/db/graphql.generated';
import { I } from '../Icons';
import {
  colorFromString,
  Empty,
  initialsFromName,
  Rank,
  Section,
} from '../Shared';

export interface HistoryTabProps {
  league: LeagueFragment;
}

const RECORD_ICONS: Record<string, React.ReactNode> = {
  highest_score: <I.Zap size={20} />,
  most_wins: <I.Trophy size={20} />,
  most_points_season: <I.TrendingUp size={20} />,
  longest_win_streak: <I.Flame size={20} />,
};

const RECORD_LABELS: Record<string, string> = {
  highest_score: 'Highest Single-Matchup Score',
  most_wins: 'Most Wins in a Season',
  most_points_season: 'Most Points in a Season',
  longest_win_streak: 'Longest Win Streak',
};

const formatRecordValue = (type: string, value: number): string => {
  if (type === 'longest_win_streak' || type === 'most_wins') {
    return String(value);
  }
  return value.toFixed(1);
};

const formatDate = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString();
};

export const HistoryTab: React.FC<HistoryTabProps> = ({ league }) => {
  const leagueId = league.id ?? 0;

  const {
    data: historyData,
    loading: historyLoading,
    error: historyError,
  } = useGetLeagueHistoryQuery({
    variables: { leagueId },
    skip: !leagueId,
    errorPolicy: 'all',
  });

  const seasons = useMemo(
    () => historyData?.getLeagueHistory ?? [],
    [historyData?.getLeagueHistory],
  );

  const defaultSeasonLeagueId = useMemo(() => {
    const frozen = seasons.find((s) => s.frozenAt !== null);
    return frozen?.leagueId ?? seasons[0]?.leagueId ?? leagueId;
  }, [seasons, leagueId]);

  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(null);
  const viewingLeagueId = selectedLeagueId ?? defaultSeasonLeagueId;

  const selectedSeason = useMemo(
    () => seasons.find((s) => s.leagueId === viewingLeagueId),
    [seasons, viewingLeagueId],
  );

  const {
    data: standingsData,
    loading: standingsLoading,
    error: standingsError,
  } = useGetLeagueStandingsQuery({
    variables: { leagueId: viewingLeagueId },
    skip: !viewingLeagueId,
    errorPolicy: 'all',
  });

  const {
    data: recordsData,
    loading: recordsLoading,
    error: recordsError,
  } = useGetAllTimeRecordsQuery({
    variables: { leagueId },
    skip: !leagueId,
    errorPolicy: 'all',
  });

  React.useEffect(() => {
    if (historyError) {
      LOGGER.error('League history query failed', {
        err: historyError,
        leagueId,
      });
    }
  }, [historyError, leagueId]);
  React.useEffect(() => {
    if (standingsError) {
      LOGGER.error('Season standings query failed', {
        err: standingsError,
        viewingLeagueId,
      });
    }
  }, [standingsError, viewingLeagueId]);
  React.useEffect(() => {
    if (recordsError) {
      LOGGER.error('All-time records query failed', {
        err: recordsError,
        leagueId,
      });
    }
  }, [recordsError, leagueId]);

  const standings = useMemo(() => {
    const list = standingsData?.getLeagueStandings ?? [];
    return [...list].sort((a, b) => {
      const aw = a.winPercentage ?? -1;
      const bw = b.winPercentage ?? -1;
      if (aw !== bw) return bw - aw;
      return (b.pointsFor ?? 0) - (a.pointsFor ?? 0);
    });
  }, [standingsData?.getLeagueStandings]);

  const records = useMemo(
    () => recordsData?.getAllTimeRecords ?? [],
    [recordsData?.getAllTimeRecords],
  );

  const champions = useMemo(
    () => seasons.filter((s) => s.frozenAt && s.championTeamName),
    [seasons],
  );

  if (!league.id) {
    return <Empty title="History unavailable" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Section
        title="League History"
        sub={
          historyLoading
            ? 'Loading…'
            : selectedSeason
              ? `Season ${selectedSeason.seasonNumber ?? '—'}${selectedSeason.frozenAt ? ` · Completed ${formatDate(selectedSeason.frozenAt)}` : ' · Current'}`
              : 'Past seasons + standings'
        }
        right={
          seasons.length > 1 ? (
            <select
              className="ls-select"
              value={viewingLeagueId}
              onChange={(e) => {
                const parsed = Number(e.target.value);
                if (Number.isFinite(parsed)) setSelectedLeagueId(parsed);
              }}
              aria-label="Select season"
            >
              {seasons
                .filter(
                  (s): s is typeof s & { leagueId: number } =>
                    s.leagueId != null,
                )
                .map((s) => (
                  <option key={s.leagueId} value={s.leagueId}>
                    Season {s.seasonNumber ?? '—'}
                    {s.frozenAt ? '' : ' (current)'}
                  </option>
                ))}
            </select>
          ) : null
        }
      >
        {historyError && seasons.length === 0 ? (
          <Empty
            icon={<I.AlertTriangle size={28} />}
            title="Couldn't load league history"
            sub={historyError.message}
          />
        ) : seasons.length <= 1 ? (
          <Empty
            icon={<I.Calendar size={28} />}
            title="First season in progress"
            sub="History will be available after season renewal."
          />
        ) : (
          <div className="ls-table-wrap">
            <table className="ls-table" aria-label="Season Standings">
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
                </tr>
              </thead>
              <tbody>
                {standingsLoading && standings.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      style={{
                        textAlign: 'center',
                        color: 'var(--fg3)',
                        padding: 32,
                      }}
                    >
                      Loading season standings…
                    </td>
                  </tr>
                ) : standingsError && standings.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      style={{
                        textAlign: 'center',
                        color: 'var(--danger-fg)',
                        padding: 32,
                      }}
                    >
                      Couldn&apos;t load standings: {standingsError.message}
                    </td>
                  </tr>
                ) : standings.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      style={{
                        textAlign: 'center',
                        color: 'var(--fg3)',
                        padding: 32,
                      }}
                    >
                      No standings data available for this season.
                    </td>
                  </tr>
                ) : (
                  standings.map((t, i) => {
                    const rank = i + 1;
                    const winPct = t.winPercentage ?? 0;
                    return (
                      <tr key={t.teamId ?? rank}>
                        <td>
                          <Rank n={rank} />
                        </td>
                        <td>
                          <div className="ls-team-cell">
                            <div
                              className={`ls-avatar sm ${colorFromString(t.teamName)}`}
                              style={
                                t.primaryColor
                                  ? { background: t.primaryColor }
                                  : undefined
                              }
                            >
                              {initialsFromName(t.teamName)}
                            </div>
                            <span className="name" style={{ fontWeight: 600 }}>
                              {t.teamName ?? 'Team'}
                            </span>
                            {rank === 1 && selectedSeason?.frozenAt ? (
                              <I.Trophy
                                size={14}
                                style={{ color: 'var(--brand-gold-light)' }}
                              />
                            ) : null}
                          </div>
                        </td>
                        <td className="num">{t.wins ?? '—'}</td>
                        <td className="num">{t.losses ?? '—'}</td>
                        <td className="num">{t.ties ?? '—'}</td>
                        <td
                          className="num"
                          style={{
                            fontWeight: 600,
                            color: 'var(--fg1-strong)',
                          }}
                        >
                          {winPct.toFixed(3).replace(/^0/, '')}
                        </td>
                        <td className="num">{(t.pointsFor ?? 0).toFixed(1)}</td>
                        <td className="num">
                          {(t.pointsAgainst ?? 0).toFixed(1)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="All-Time Records"
        sub={`Across all seasons of ${league.name ?? 'this league'}`}
      >
        {recordsError && records.length === 0 ? (
          <Empty
            icon={<I.AlertTriangle size={28} />}
            title="Couldn't load records"
            sub={recordsError.message}
          />
        ) : recordsLoading && records.length === 0 ? (
          <Empty title="Loading records…" />
        ) : records.length === 0 ? (
          <Empty
            icon={<I.Award size={28} />}
            title="No records yet"
            sub="Records are computed from completed matchups across all seasons."
          />
        ) : (
          <div className="ls-records-grid">
            {records.map((r, i) => {
              const type = r.recordType ?? 'unknown';
              return (
                <div
                  key={type}
                  className={`ls-record-card ${i === 0 ? 'trophy' : ''}`}
                >
                  <div className="ls-record-icon">
                    {RECORD_ICONS[type] ?? <I.Trophy size={20} />}
                  </div>
                  <div className="ls-record-label">
                    {RECORD_LABELS[type] ?? type}
                  </div>
                  <div className="ls-record-value">
                    {formatRecordValue(type, r.value ?? 0)}
                  </div>
                  <div className="ls-record-holder">{r.teamName ?? '—'}</div>
                  <div className="ls-record-date">
                    {r.seasonNumber != null ? `Season ${r.seasonNumber}` : ''}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {champions.length > 0 ? (
        <Section title="Champions Row" sub="Previous season winners">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))',
              gap: 14,
            }}
          >
            {champions.map((c) => (
              <div
                key={c.leagueId}
                style={{
                  padding: 14,
                  background:
                    'linear-gradient(135deg, rgba(197,165,90,0.08), var(--surface-card) 60%)',
                  border: '1px solid rgba(197,165,90,.25)',
                  borderRadius: 'var(--radius-4)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 10,
                  }}
                >
                  <div style={{ color: 'var(--brand-gold-light)' }}>
                    <I.Trophy size={20} />
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 800,
                      fontSize: 18,
                      color: 'var(--brand-gold-light)',
                      letterSpacing: '.04em',
                    }}
                  >
                    Season {c.seasonNumber}
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: 15,
                    color: 'var(--fg1-strong)',
                  }}
                >
                  {c.championTeamName ?? 'Unknown'}
                </div>
                {c.runnerUpTeamName ? (
                  <div
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 12,
                      color: 'var(--fg3)',
                      marginTop: 2,
                    }}
                  >
                    vs {c.runnerUpTeamName}
                  </div>
                ) : null}
                {c.championScore != null ? (
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: 'var(--fg4)',
                      marginTop: 6,
                    }}
                  >
                    Final: {c.championScore.toFixed(1)}
                    {c.runnerUpScore != null
                      ? ` – ${c.runnerUpScore.toFixed(1)}`
                      : ''}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
};
