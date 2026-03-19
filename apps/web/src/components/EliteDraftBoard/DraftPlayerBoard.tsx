import React from 'react';
import type {
  CurrentDraftPickInfo,
  DraftPickRecord,
  DraftPlayer,
  LeagueTeam,
} from './types';
import { DraftGrid } from './DraftGrid';
import { PlayerCard } from './PlayerCard';

const positions = ['ALL', 'C', '1B', '2B', '3B', 'SS', 'OF', 'P'];
const viewModes: Array<'grid' | 'list' | 'compact' | 'board'> = [
  'grid',
  'list',
  'compact',
  'board',
];

interface DraftPlayerBoardProps {
  viewMode: 'grid' | 'list' | 'compact' | 'board';
  selectedPosition: string;
  searchTerm: string;
  availablePlayersLoading: boolean;
  commPickMode: boolean;
  isOwner: boolean;
  isMyPick: boolean;
  myTeamId: number | null;
  draftId: number | null;
  filteredPlayers: DraftPlayer[];
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
  onSetViewMode: (v: 'grid' | 'list' | 'compact' | 'board') => void;
  onSetWatchlist: React.Dispatch<React.SetStateAction<number[]>>;
  onDraftPlayer: (playerId: number) => void;
  onCommissionerPick: (playerId: number) => void;
  onToggleQueue: (playerId: number) => void;
  onLoadMore: () => void;
}

export function DraftPlayerBoard({
  viewMode,
  selectedPosition,
  searchTerm,
  availablePlayersLoading,
  commPickMode,
  isOwner,
  isMyPick,
  myTeamId,
  draftId,
  filteredPlayers,
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
}: DraftPlayerBoardProps): React.JSX.Element {
  const gridCols =
    viewMode === 'grid' ? 'repeat(auto-fill, minmax(320px, 1fr))' : '1fr';

  return (
    <div
      className="d-main"
      role="main"
      aria-label="Player draft board"
      data-testid="draft-board"
    >
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
          />
          {availablePlayersLoading && (
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
          )}
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
        <div
          className="d-views"
          role="radiogroup"
          aria-label="View mode"
          onKeyDown={(e) => {
            const idx = viewModes.indexOf(viewMode);
            let next = idx;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault();
              next = (idx + 1) % viewModes.length;
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault();
              next = (idx - 1 + viewModes.length) % viewModes.length;
            } else if (e.key === 'Home') {
              e.preventDefault();
              next = 0;
            } else if (e.key === 'End') {
              e.preventDefault();
              next = viewModes.length - 1;
            }
            if (next !== idx) {
              onSetViewMode(viewModes[next]);
              e.currentTarget
                .querySelectorAll<HTMLButtonElement>('[role="radio"]')
                [next]?.focus();
            }
          }}
        >
          {viewModes.map((mode) => {
            const isUserAutoPick =
              mode === 'board' &&
              myTeamId !== null &&
              autoPickTeamIds.has(String(myTeamId));
            return (
              <button
                key={mode}
                className={`d-view-btn${viewMode === mode ? ' active' : ''}`}
                onClick={() => onSetViewMode(mode)}
                role="radio"
                aria-checked={viewMode === mode}
                tabIndex={viewMode === mode ? 0 : -1}
                title={
                  isUserAutoPick
                    ? 'Board view — your team is on auto-pick'
                    : undefined
                }
                style={{ position: 'relative' }}
              >
                {mode === 'grid'
                  ? '⊞'
                  : mode === 'list'
                    ? '☰'
                    : mode === 'compact'
                      ? '⋯'
                      : '▦'}
                {isUserAutoPick && (
                  <span
                    aria-label="auto-pick active"
                    role="img"
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -4,
                      fontSize: 9,
                      lineHeight: 1,
                      pointerEvents: 'none',
                    }}
                  >
                    🤖
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

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

      {viewMode !== 'board' && (
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
                isWatched={watchlist.includes(player.id)}
                isQueued={queuedPlayerIds.has(player.id)}
                onDraft={() => {
                  if (commPickMode && isOwner) {
                    onCommissionerPick(player.id);
                  } else {
                    onDraftPlayer(player.id);
                  }
                }}
                onToggleWatch={() =>
                  onSetWatchlist((prev) =>
                    prev.includes(player.id)
                      ? prev.filter((id) => id !== player.id)
                      : [...prev, player.id],
                  )
                }
                onToggleQueue={
                  myTeamId !== null && draftId
                    ? () => onToggleQueue(player.id)
                    : undefined
                }
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
  );
}
