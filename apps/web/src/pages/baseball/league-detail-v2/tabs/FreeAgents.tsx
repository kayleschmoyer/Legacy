import React, { useEffect, useMemo, useState } from 'react';
import {
  type LeagueFragment,
  useGetPlayersWithStatsQuery,
} from '../../../../api/db/graphql.generated';
import { useLeagueTakenPlayers } from '../../../../hooks/useLeagueTakenPlayers';
import { WaiverClaimModal } from '../../../../features/baseball/WaiverClaimModal';
import { buildFreeAgentAriaLabel } from '../../../../features/baseball/LeagueFreeAgents';
import { Banner, positionClass, Section } from '../Shared';
import { I } from '../Icons';

export interface FreeAgentsTabProps {
  league: LeagueFragment;
  isMember: boolean;
  myTeamId: number | null;
}

type Group = 'hitters' | 'pitchers';

const PAGE_SIZE = 50;

const HITTER_POSITIONS = ['ALL', 'C', '1B', '2B', '3B', 'SS', 'OF', 'DH'];
const PITCHER_POSITIONS = ['ALL', 'SP', 'RP'];

interface StatCol {
  id: string;
  label: string;
  title?: string;
  bold?: boolean;
}

const HITTER_COLS: StatCol[] = [
  { id: 'PTS', label: 'PTS', title: 'Hitter fantasy score', bold: true },
  {
    id: 'PROJ',
    label: 'PROJ',
    title: 'Projected points this matchup',
    bold: true,
  },
  { id: 'AVG', label: 'AVG', title: 'Career batting average' },
  { id: 'HR', label: 'HR', title: 'Career home runs' },
  { id: 'RBI', label: 'RBI', title: 'Career RBI' },
  { id: 'SB', label: 'SB', title: 'Career stolen bases' },
  { id: 'oWAR', label: 'oWAR', title: 'Offensive WAR' },
];

const PITCHER_COLS: StatCol[] = [
  { id: 'PTS', label: 'PTS', title: 'Pitcher fantasy score', bold: true },
  {
    id: 'PROJ',
    label: 'PROJ',
    title: 'Projected points this matchup',
    bold: true,
  },
  { id: 'ERA', label: 'ERA', title: 'Earned run average', bold: true },
  { id: 'W', label: 'W', title: 'Career wins' },
  { id: 'K', label: 'K', title: 'Career strikeouts' },
  { id: 'SV', label: 'SV', title: 'Career saves' },
  { id: 'WHIP', label: 'WHIP', title: 'Walks + hits per inning pitched' },
];

const fmtAvg = (n: number | null | undefined): string =>
  n == null ? '—' : n.toFixed(3).replace(/^0\./, '.');

const fmtInt = (n: number | null | undefined): string =>
  n == null ? '—' : Math.round(n).toLocaleString();

const fmtF1 = (n: number | null | undefined): string =>
  n == null ? '—' : n.toFixed(1);

const fmtF2 = (n: number | null | undefined): string =>
  n == null ? '—' : n.toFixed(2);

export const FreeAgentsTab: React.FC<FreeAgentsTabProps> = ({
  league,
  isMember,
  myTeamId,
}) => {
  const [group, setGroup] = useState<Group>('hitters');
  const [pos, setPos] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [claimPlayer, setClaimPlayer] = useState<{
    id: number;
    firstName?: string | null;
    lastName?: string | null;
    eligiblePositions?: string[] | null;
  } | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  // Reset filter + page when switching group
  const handleGroup = (next: Group) => {
    setGroup(next);
    setPos('ALL');
    setPage(0);
  };

  const queryPosition =
    group === 'pitchers'
      ? pos === 'ALL'
        ? 'P'
        : pos
      : pos === 'ALL'
        ? 'HITTER'
        : pos;

  const orderBy =
    group === 'pitchers'
      ? 'pitchingAvgPointsPerGame'
      : 'hitterAvgPointsPerGame';

  const leagueId = league.id ?? 0;
  const gamesPerMatchup = league.gamesPerMatchup ?? 5;

  const { data, loading } = useGetPlayersWithStatsQuery({
    variables: {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      orderBy,
      orderDirection: 'desc',
      position: queryPosition,
      leagueId,
      search: debouncedSearch || undefined,
    },
    skip: !league.id,
    fetchPolicy: 'cache-and-network',
  });

  const { takenPlayerIds, loading: takenLoading } = useLeagueTakenPlayers(
    leagueId,
    `${page}|${group}|${pos}|${debouncedSearch}`,
  );

  const players = useMemo(
    () =>
      (data?.players ?? []).filter(
        (p) => p?.id != null && !takenPlayerIds.has(p.id),
      ),
    [data?.players, takenPlayerIds],
  );

  const cols = group === 'pitchers' ? PITCHER_COLS : HITTER_COLS;
  const positions = group === 'pitchers' ? PITCHER_POSITIONS : HITTER_POSITIONS;
  const isLoading = loading || takenLoading;
  const hasNextPage = (data?.players ?? []).length >= PAGE_SIZE;

  const renderCell = (
    p: NonNullable<(typeof players)[number]>,
    col: StatCol,
  ): React.ReactNode => {
    const b = p.careerBatting;
    const pit = p.careerPitching;
    const s = p.scoring;
    switch (col.id) {
      case 'PTS':
        return fmtInt(group === 'pitchers' ? s?.pitchingScore : s?.hitterScore);
      case 'PROJ': {
        const perGame =
          group === 'pitchers'
            ? s?.pitchingAvgPointsPerGame
            : s?.hitterAvgPointsPerGame;
        return fmtF1(perGame != null ? perGame * gamesPerMatchup : null);
      }
      case 'AVG': {
        const h = b?.hits ?? 0;
        const ab = b?.atBats ?? 0;
        return ab > 0 ? fmtAvg(h / ab) : '—';
      }
      case 'HR':
        return fmtInt(b?.homeRuns);
      case 'RBI':
        return fmtInt(b?.rbi);
      case 'SB':
        return fmtInt(b?.stolenBases);
      case 'oWAR':
        return fmtF1(b?.offensiveWAR);
      case 'ERA':
        return pit?.era != null ? fmtF2(Number(pit.era)) : '—';
      case 'W':
        return fmtInt(pit?.wins);
      case 'K':
        return fmtInt(pit?.strikeouts);
      case 'SV':
        return fmtInt(pit?.saves);
      case 'WHIP': {
        const outs = pit?.outsRecorded ?? 0;
        if (outs === 0) return '—';
        const innings = outs / 3;
        const bb = pit?.baseOnBalls ?? 0;
        const h = pit?.hits ?? 0;
        return ((bb + h) / innings).toFixed(2);
      }
      default:
        return '—';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!isMember ? (
        <Banner
          kind="spectator"
          icon={<I.Eye size={20} />}
          title="Spectator Mode"
          sub="Browse the free-agent pool. Join the league to make claims."
        />
      ) : null}
      {league.waiverEnabled && isMember && !myTeamId ? (
        <Banner
          kind="info"
          icon={<I.Info size={20} />}
          title="Join a team to make waiver claims"
        />
      ) : null}
      <Section
        title="Free Agents"
        sub={
          league.waiverEnabled
            ? `${league.waiverType ?? 'Waivers'} active${
                league.faabBudgetDefault
                  ? ` · FAAB ${league.faabBudgetDefault}`
                  : ''
              }`
            : 'Available players in the league pool'
        }
        right={
          <div className="ls-subtabs">
            <button
              type="button"
              className={group === 'hitters' ? 'on' : ''}
              onClick={() => handleGroup('hitters')}
            >
              Hitters
            </button>
            <button
              type="button"
              className={group === 'pitchers' ? 'on' : ''}
              onClick={() => handleGroup('pitchers')}
            >
              Pitchers
            </button>
          </div>
        }
      >
        <div className="ls-fa-controls">
          <div className="ls-search">
            <I.Search size={16} />
            <input
              type="search"
              placeholder="Search players…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search free agents by name"
            />
          </div>
          <div className="ls-filter-pills" role="tablist">
            {positions.map((p) => (
              <button
                key={p}
                type="button"
                data-testid={`position-filter-${p}`}
                className={pos === p ? 'on' : ''}
                onClick={() => {
                  setPos(p);
                  setPage(0);
                }}
                aria-pressed={pos === p}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="ls-table-wrap">
          <table className="ls-table" aria-label="Free Agents">
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col">Pos</th>
                {cols.map((c) => (
                  <th key={c.id} scope="col" className="num" title={c.title}>
                    {c.label}
                  </th>
                ))}
                <th scope="col" style={{ textAlign: 'right' }}>
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => {
                const playerId = p?.id;
                if (playerId == null) return null;
                const primaryPos = p.eligiblePositions?.[0] ?? null;
                const klass = positionClass(primaryPos);
                return (
                  <tr key={playerId}>
                    <td>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--fg1)' }}>
                          {[p.firstName, p.lastName]
                            .filter((part): part is string => Boolean(part))
                            .join(' ') || 'Unknown Player'}
                        </div>
                        {p.primaryEra != null ? (
                          <div
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 11,
                              color: 'var(--fg4)',
                            }}
                          >
                            {p.primaryEra}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      {primaryPos ? (
                        <span className={`ls-pchip ${klass}`}>
                          {primaryPos}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    {cols.map((c) => (
                      <td
                        key={c.id}
                        className="num"
                        style={
                          c.bold
                            ? { fontWeight: 700, color: 'var(--fg1-strong)' }
                            : undefined
                        }
                      >
                        {renderCell(p, c)}
                      </td>
                    ))}
                    <td style={{ textAlign: 'right' }}>
                      {isMember && myTeamId ? (
                        <button
                          type="button"
                          className="ls-btn ls-btn-gold sm"
                          data-testid="claim-free-agent-button"
                          onClick={() =>
                            setClaimPlayer({
                              id: playerId,
                              firstName: p.firstName,
                              lastName: p.lastName,
                              eligiblePositions: p.eligiblePositions,
                            })
                          }
                          aria-label={buildFreeAgentAriaLabel(
                            p.firstName,
                            p.lastName,
                          )}
                        >
                          <I.Plus size={11} />
                          Claim
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="ls-btn ls-btn-ghost sm"
                          disabled
                        >
                          {isMember ? 'Join Team' : 'Spectator'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!isLoading && players.length === 0 ? (
                <tr>
                  <td
                    colSpan={cols.length + 3}
                    style={{
                      textAlign: 'center',
                      padding: 36,
                      color: 'var(--fg4)',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: 'var(--fg1)' }}>
                      No players found
                    </div>
                    <div style={{ marginTop: 4 }}>
                      Try adjusting your search or position filter.
                    </div>
                  </td>
                </tr>
              ) : null}
              {isLoading && players.length === 0 ? (
                <tr>
                  <td
                    colSpan={cols.length + 3}
                    style={{
                      textAlign: 'center',
                      padding: 36,
                      color: 'var(--fg3)',
                    }}
                  >
                    Loading free agents…
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <div className="ls-paginate">
            <span className="meta">
              {players.length > 0
                ? `Showing ${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + players.length}`
                : 'No results'}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="ls-navbtn"
                onClick={() => setPage((n) => Math.max(0, n - 1))}
                disabled={page === 0}
                aria-label="Previous page"
              >
                <I.ChevronLeft size={14} />
              </button>
              <button
                type="button"
                className="ls-navbtn"
                onClick={() => setPage((n) => n + 1)}
                disabled={!hasNextPage}
                aria-label="Next page"
              >
                <I.ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </Section>

      {claimPlayer ? (
        <WaiverClaimModal
          open
          onClose={() => setClaimPlayer(null)}
          player={claimPlayer}
          leagueId={leagueId}
        />
      ) : null}
    </div>
  );
};
