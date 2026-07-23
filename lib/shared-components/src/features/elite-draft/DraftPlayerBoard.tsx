import React, { useCallback, useMemo, useState } from 'react';
import type {
  CurrentDraftPickInfo,
  DraftPickRecord,
  DraftPlayer,
  LeagueTeam,
} from './types';
import { DraftGrid } from './DraftGrid';
import { PlayerCard } from './PlayerCard';
import { getPositionColor } from './utils';
import { STAT_COLUMNS_BY_SPORT } from './statColumns';
import type { SportKind } from '../../config/sports';
// PlayerDetailModal is web-specific; consumers can provide their own via composition.
// Inline a no-op stub so the component compiles in all environments.
const PlayerDetailModal: React.FC<{
  playerId: number | null;
  playerName?: string;
  position?: string;
  open: boolean;
  onOpenChange: React.Dispatch<React.SetStateAction<boolean>>;
}> = () => null;

const positions = ['ALL', 'C', '1B', '2B', '3B', 'SS', 'OF', 'P'];

const DEPTH_SLOTS: Array<{ pos: string; label: string; slots: number }> = [
  { pos: 'C', label: 'C', slots: 1 },
  { pos: '1B', label: '1B', slots: 1 },
  { pos: '2B', label: '2B', slots: 1 },
  { pos: '3B', label: '3B', slots: 1 },
  { pos: 'SS', label: 'SS', slots: 1 },
  { pos: 'OF', label: 'OF', slots: 3 },
  { pos: 'P', label: 'P', slots: 9 },
  { pos: 'U', label: 'UTIL', slots: 2 },
];

// Dedicated (non-UTIL) depth-chart slot keys. A drafted player whose canonical
// slot is one of these fills that slot; anything else falls through to UTIL.
const DEDICATED_DEPTH_SLOTS = ['C', '1B', '2B', '3B', 'SS', 'OF', 'P'];

const DEPTH_OUTFIELD_POSITIONS = new Set(['OF', 'CF', 'LF', 'RF']);
const DEPTH_PITCHER_POSITIONS = new Set(['P', 'SP', 'RP']);

/**
 * Map a drafted player's granular eligible position (e.g. 'SP', 'RP', 'CF') to
 * its canonical depth-chart slot key ('P', 'OF', ...). `myTeam` players carry
 * the first entry of `eligiblePositions`, which can be a specific pitcher or
 * outfield position that never equals the canonical slot key — so an exact
 * match dropped pitchers from the 'P' slot and spilled them into UTIL. Mirrors
 * the normalization used by `positionCounts` in usePlayerData. (LS-8069)
 */
export const depthChartSlotForPosition = (
  position?: string,
): string | undefined => {
  if (!position) return undefined;
  if (DEPTH_OUTFIELD_POSITIONS.has(position)) return 'OF';
  if (DEPTH_PITCHER_POSITIONS.has(position)) return 'P';
  return position;
};

type ViewMode = 'grid' | 'list' | 'compact' | 'board' | 'table' | 'depth';
type SortKey = string;
type SortDir = 'asc' | 'desc';

interface DraftPlayerBoardProps {
  viewMode: ViewMode;
  /** Active league sport — drives data-table stat headers. Defaults to 'baseball' upstream. */
  sport: SportKind;
  selectedPosition: string;
  searchTerm: string;
  availablePlayersLoading: boolean;
  commPickMode: boolean;
  isOwner: boolean;
  isMyPick: boolean;
  pickLoading: boolean;
  myTeamId: number | null;
  draftId: number | null;
  filteredPlayers: DraftPlayer[];
  myTeam: DraftPlayer[];
  positionCounts: Record<string, number>;
  watchlist: number[];
  queuedPlayerIds: ReadonlySet<number>;
  autoPickTeamIds: ReadonlySet<string>;
  boardOrderedTeams: LeagueTeam[];
  pickHistory: DraftPickRecord[];
  currentPickInfo: CurrentDraftPickInfo | null;
  statsLookup: Map<number, DraftPlayer>;
  leagueTeamsLength: number;
  hasMorePlayers: boolean;
  loadingMore: boolean;
  onlineTeamIds: ReadonlySet<string>;
  onSetSearchTerm: (v: string) => void;
  onSetSelectedPosition: (v: string) => void;
  onSetViewMode: (v: ViewMode) => void;
  onSetWatchlist: React.Dispatch<React.SetStateAction<number[]>>;
  onDraftPlayer: (playerId: number) => void;
  onCommissionerPick: (playerId: number) => void;
  onToggleQueue: (playerId: number) => void;
  onLoadMore: () => void;
  /** Drag-to-draft (LS-8068): lifted to the screen so the rail can highlight
   *  eligible slots and commit the pick on drop. */
  onPlayerDragStart?: (player: DraftPlayer) => void;
  onPlayerDragEnd?: () => void;
}

const VIEW_TABS: Array<{ mode: ViewMode; label: string }> = [
  { mode: 'grid', label: 'Cards' },
  { mode: 'table', label: 'Data Table' },
  { mode: 'board', label: 'Draft Board' },
  { mode: 'depth', label: 'My Depth Chart' },
];

export function DraftPlayerBoard({
  viewMode,
  sport,
  selectedPosition,
  searchTerm,
  availablePlayersLoading,
  commPickMode,
  isOwner,
  isMyPick,
  pickLoading,
  myTeamId,
  draftId,
  filteredPlayers,
  myTeam,
  positionCounts: _positionCounts,
  watchlist,
  queuedPlayerIds,
  autoPickTeamIds,
  boardOrderedTeams,
  pickHistory,
  currentPickInfo,
  statsLookup,
  leagueTeamsLength,
  hasMorePlayers,
  loadingMore,
  onlineTeamIds,
  onSetSearchTerm,
  onSetSelectedPosition,
  onSetViewMode,
  onSetWatchlist,
  onDraftPlayer,
  onCommissionerPick,
  onToggleQueue,
  onLoadMore,
  onPlayerDragStart,
  onPlayerDragEnd,
}: DraftPlayerBoardProps): React.JSX.Element {
  const gridCols =
    viewMode === 'grid' ? 'repeat(auto-fill, minmax(320px, 1fr))' : '1fr';

  // Player detail modal state
  const [detailPlayerId, setDetailPlayerId] = useState<number | null>(null);
  const [detailPlayerName, setDetailPlayerName] = useState('');
  const [detailPlayerPos, setDetailPlayerPos] = useState<string | undefined>();
  const [detailOpen, setDetailOpen] = useState(false);

  // O(1) watchlist lookup — avoids O(n) Array.includes per card per render
  const watchlistSet = useMemo(() => new Set(watchlist), [watchlist]);

  // Preserves each player's original rank (1-based position in filteredPlayers)
  // so the Rank column stays accurate even when the table is sorted by another column.
  const rankMap = useMemo(
    () => new Map(filteredPlayers.map((p, i) => [p.id, i + 1])),
    [filteredPlayers],
  );

  // Data table sorting
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleHeaderClick = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return key;
      }
      setSortDir('desc');
      return key;
    });
  }, []);

  const sortedPlayers = useMemo(() => {
    if (sortKey === 'rank') return filteredPlayers;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filteredPlayers].sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;
      if (sortKey === 'name') {
        aVal = a.name;
        bVal = b.name;
      } else if (sortKey === 'position') {
        aVal = a.position ?? '';
        bVal = b.position ?? '';
      } else if (sortKey === 'adp') {
        aVal = (a as DraftPlayer & { adp?: number }).adp ?? Infinity;
        bVal = (b as DraftPlayer & { adp?: number }).adp ?? Infinity;
      } else {
        const col = STAT_COLUMNS_BY_SPORT[sport].find(
          (c) => c.label === sortKey,
        );
        aVal = col ? col.sortValue(a) : 0;
        bVal = col ? col.sortValue(b) : 0;
      }
      if (typeof aVal === 'string') {
        return dir * aVal.localeCompare(bVal as string);
      }
      return dir * (aVal - (bVal as number));
    });
  }, [filteredPlayers, sortKey, sortDir, sport]);

  // Stable callbacks passed to PlayerCard to prevent re-renders via React.memo
  const handleDraftPlayer = useCallback(
    (playerId: number) => {
      if (commPickMode && isOwner) {
        onCommissionerPick(playerId);
      } else {
        onDraftPlayer(playerId);
      }
    },
    [commPickMode, isOwner, onCommissionerPick, onDraftPlayer],
  );

  const handleToggleWatch = useCallback(
    (playerId: number) => {
      onSetWatchlist((prev) =>
        prev.includes(playerId)
          ? prev.filter((id) => id !== playerId)
          : [...prev, playerId],
      );
    },
    [onSetWatchlist],
  );

  const handleToggleQueuePlayer = useCallback(
    (playerId: number) => {
      onToggleQueue(playerId);
    },
    [onToggleQueue],
  );

  // Use statsLookup (O(1) Map) instead of filteredPlayers.find() (O(n))
  const handlePlayerClick = useCallback(
    (playerId: number) => {
      const player = statsLookup.get(playerId);
      if (!player) return;
      setDetailPlayerId(player.id);
      setDetailPlayerName(player.name);
      setDetailPlayerPos(player.position);
      setDetailOpen(true);
    },
    [statsLookup],
  );

  const showSearchControls =
    viewMode === 'grid' ||
    viewMode === 'list' ||
    viewMode === 'compact' ||
    viewMode === 'table';

  return (
    <>
      <PlayerDetailModal
        playerId={detailPlayerId}
        playerName={detailPlayerName}
        position={detailPlayerPos}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
      <div
        className="d-main"
        role="main"
        aria-label="Player draft board"
        data-testid="draft-board"
      >
        {/* View tabs */}
        <div className="d-view-tabs" role="tablist" aria-label="View mode">
          {VIEW_TABS.map(({ mode, label }) => (
            <button
              key={mode}
              className={`d-view-tab${viewMode === mode ? ' active' : ''}`}
              role="tab"
              aria-selected={viewMode === mode}
              onClick={() => onSetViewMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search + position filter — only for player pool views */}
        {showSearchControls && (
          <div className="d-controls">
            <div className="d-search-wrap">
              <svg
                className="d-search-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                className="d-search-input"
                type="text"
                placeholder="Search available players..."
                aria-label="Search players"
                value={searchTerm}
                onChange={(e) => onSetSearchTerm(e.target.value)}
                style={searchTerm ? { paddingRight: 34 } : undefined}
              />
              {searchTerm ? (
                <button
                  className="d-search-clear"
                  type="button"
                  aria-label="Clear search"
                  onClick={() => onSetSearchTerm('')}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    width="14"
                    height="14"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              ) : availablePlayersLoading ? (
                <span
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    display: 'inline-block',
                    width: 14,
                    height: 14,
                    border: '2px solid rgba(197, 165, 90, 0.2)',
                    borderTopColor: 'var(--d-accent)',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
              ) : null}
            </div>
            <div
              className="d-pills"
              role="radiogroup"
              aria-label="Filter by position"
              onKeyDown={(e) => {
                const idx = positions.indexOf(selectedPosition);
                let next = idx;
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  next = (idx + 1) % positions.length;
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  next = (idx - 1 + positions.length) % positions.length;
                } else if (e.key === 'Home') {
                  e.preventDefault();
                  next = 0;
                } else if (e.key === 'End') {
                  e.preventDefault();
                  next = positions.length - 1;
                }
                if (next !== idx) {
                  onSetSelectedPosition(positions[next]);
                  e.currentTarget
                    .querySelectorAll<HTMLButtonElement>('[role="radio"]')
                    [next]?.focus();
                }
              }}
            >
              {positions.map((pos) => (
                <button
                  key={pos}
                  className={`d-pill${selectedPosition === pos ? ' active' : ''}`}
                  onClick={() => onSetSelectedPosition(pos)}
                  role="radio"
                  aria-checked={selectedPosition === pos}
                  tabIndex={selectedPosition === pos ? 0 : -1}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Draft Board view */}
        {viewMode === 'board' && (
          <DraftGrid
            teams={boardOrderedTeams}
            picks={pickHistory}
            currentPickInfo={currentPickInfo}
            myTeamId={myTeamId}
            statsLookup={statsLookup}
            autoPickTeamIds={autoPickTeamIds}
            maxRounds={
              leagueTeamsLength > 0
                ? Math.max(
                    Math.ceil(
                      (pickHistory.length + leagueTeamsLength) /
                        leagueTeamsLength,
                    ),
                    currentPickInfo?.round ?? 1,
                    ...pickHistory.map((p) => p.round),
                    20,
                  )
                : 20
            }
            onlineTeamIds={onlineTeamIds}
          />
        )}

        {/* Data Table view */}
        {viewMode === 'table' && (
          <div className="d-data-table-wrap">
            <table className="d-data-table">
              <thead>
                <tr>
                  {(
                    [
                      { key: 'rank', label: 'Rank', className: '' },
                      { key: 'name', label: 'Player', className: '' },
                      { key: 'position', label: 'Pos', className: '' },
                      { key: 'adp', label: 'ADP', className: 'num' },
                    ] as Array<{
                      key: string;
                      label: string;
                      className: string;
                    }>
                  ).map(({ key, label, className }) => (
                    <th
                      key={key}
                      className={[
                        className,
                        sortKey === key ? 'sort-active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => handleHeaderClick(key)}
                      aria-sort={
                        sortKey === key
                          ? sortDir === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      {label}
                      {sortKey === key && (
                        <span className="d-sort-arrow" aria-hidden="true">
                          {sortDir === 'asc' ? ' ↑' : ' ↓'}
                        </span>
                      )}
                    </th>
                  ))}
                  {STAT_COLUMNS_BY_SPORT[sport].map((col) => (
                    <th
                      key={col.label}
                      className={[
                        'num',
                        sortKey === col.label ? 'sort-active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => handleHeaderClick(col.label)}
                      aria-sort={
                        sortKey === col.label
                          ? sortDir === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      {col.label}
                      {sortKey === col.label && (
                        <span className="d-sort-arrow" aria-hidden="true">
                          {sortDir === 'asc' ? ' ↑' : ' ↓'}
                        </span>
                      )}
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map((player, idx) => {
                  const posColor = getPositionColor(
                    'baseball',
                    player.position ?? '',
                  );
                  return (
                    <tr
                      key={player.id}
                      className={
                        watchlistSet.has(player.id) ? 'watched' : undefined
                      }
                      onClick={() => handlePlayerClick(player.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td
                        className="num"
                        style={{ color: 'var(--d-text-muted)', fontSize: 11 }}
                      >
                        {rankMap.get(player.id) ?? idx + 1}
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>
                          {player.name}
                        </span>
                      </td>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '1px 5px',
                            borderRadius: 3,
                            fontSize: 10,
                            fontWeight: 700,
                            color: posColor,
                            background: `${posColor}26`,
                            fontFamily: "'Big Shoulders Display', sans-serif",
                            letterSpacing: 0.6,
                          }}
                        >
                          {player.position ?? '?'}
                        </span>
                      </td>
                      <td className="num">
                        {(
                          player as DraftPlayer & { adp?: number }
                        ).adp?.toFixed(1) ?? '—'}
                      </td>
                      {STAT_COLUMNS_BY_SPORT[sport].map((col) => (
                        <td key={col.label} className="num">
                          {col.render(player)}
                        </td>
                      ))}
                      <td>
                        {(commPickMode ? isOwner : isMyPick) && (
                          <button
                            className={`d-state-btn${commPickMode && isOwner ? ' force-pick' : ''}`}
                            style={{ padding: '3px 10px', fontSize: 11 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDraftPlayer(player.id);
                            }}
                            disabled={pickLoading}
                          >
                            {commPickMode && isOwner ? 'Force Pick' : 'Draft'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {sortedPlayers.length === 0 && !availablePlayersLoading && (
                  <tr>
                    <td
                      colSpan={10}
                      style={{
                        textAlign: 'center',
                        padding: '40px 20px',
                        color: 'var(--d-text-muted)',
                      }}
                    >
                      {searchTerm
                        ? 'No players match your search'
                        : 'All available players have been drafted'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* My Depth Chart view */}
        {viewMode === 'depth' && (
          <div className="d-depth-grid">
            {DEPTH_SLOTS.map(({ pos, label, slots }) => {
              const drafted = myTeam
                .filter((p) => {
                  const slotPos = depthChartSlotForPosition(p.position);
                  return pos === 'U'
                    ? !(slotPos && DEDICATED_DEPTH_SLOTS.includes(slotPos))
                    : slotPos === pos;
                })
                .slice(0, slots);
              const posColor = getPositionColor('baseball', pos);
              return (
                <div key={pos} className="d-depth-slot">
                  <div
                    className="d-depth-slot-head"
                    style={{ borderColor: posColor, color: posColor }}
                  >
                    {label}
                  </div>
                  {Array.from({ length: slots }).map((_, i) => {
                    const player = drafted[i];
                    return (
                      <div
                        key={i}
                        className={`d-depth-row${player ? ' filled' : ' empty'}`}
                      >
                        {player ? (
                          <>
                            <span
                              style={{
                                fontWeight: 600,
                                fontSize: 12,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {player.name}
                            </span>
                            <span
                              style={{
                                fontSize: 10,
                                color: 'var(--d-text-muted)',
                                flexShrink: 0,
                              }}
                            >
                              {player.position}
                            </span>
                          </>
                        ) : (
                          <span
                            style={{
                              fontSize: 11,
                              color: 'var(--d-text-muted)',
                              fontStyle: 'italic',
                            }}
                          >
                            Empty
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {myTeam.length === 0 && (
              <div
                style={{
                  gridColumn: '1 / -1',
                  textAlign: 'center',
                  padding: '60px 20px',
                  color: 'var(--d-text-muted)',
                }}
              >
                <div style={{ fontSize: 13 }}>No players drafted yet</div>
              </div>
            )}
          </div>
        )}

        {/* Cards / List / Compact view */}
        {(viewMode === 'grid' ||
          viewMode === 'list' ||
          viewMode === 'compact') && (
          <>
            <div
              className="d-player-grid"
              data-testid="player-pool"
              style={{ gridTemplateColumns: gridCols }}
            >
              {filteredPlayers.map((player, idx) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  index={idx}
                  isMyPick={commPickMode ? isOwner : isMyPick}
                  isCommPick={commPickMode && isOwner}
                  pickLoading={commPickMode ? false : pickLoading}
                  isWatched={watchlistSet.has(player.id)}
                  isQueued={queuedPlayerIds.has(player.id)}
                  onDraft={handleDraftPlayer}
                  onToggleWatch={handleToggleWatch}
                  onToggleQueue={
                    myTeamId !== null && draftId
                      ? handleToggleQueuePlayer
                      : undefined
                  }
                  onPlayerClick={handlePlayerClick}
                  onDragStartPlayer={onPlayerDragStart}
                  onDragEndPlayer={onPlayerDragEnd}
                />
              ))}
              {filteredPlayers.length === 0 && !availablePlayersLoading && (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    textAlign: 'center',
                    padding: '60px 20px',
                    color: 'var(--d-text-muted)',
                  }}
                >
                  <div style={{ fontSize: 48, marginBottom: 12 }}>
                    <span role="img" aria-label="search">
                      🔍
                    </span>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>
                    No players found
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    {searchTerm
                      ? 'Try a different search term'
                      : 'All available players have been drafted'}
                  </div>
                </div>
              )}
            </div>
            {hasMorePlayers &&
              !availablePlayersLoading &&
              filteredPlayers.length > 0 && (
                <div style={{ textAlign: 'center', padding: '16px 20px' }}>
                  <button
                    className="d-state-btn"
                    onClick={onLoadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? 'Loading…' : 'Load More Players'}
                  </button>
                </div>
              )}
          </>
        )}
      </div>
    </>
  );
}
