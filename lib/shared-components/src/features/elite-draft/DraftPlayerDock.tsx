/**
 * DraftPlayerDock — the player list pinned under the Draft Board (LS-10005).
 *
 * The mock keeps the board as the main view at every width and puts the
 * player list in a dock at the bottom of the board pane: collapsed to a bar
 * (pick, availability, open slots, clock) until the CTA or chevron slides it
 * up — "the same model as the $xxs sheet, scaled to the wider grid (rows go
 * 2- and 3-up)". Source: `.bd-dock` in docs/design/B8P9BQz8s6NZ9Q-FqWI_yA/
 * legacy-sports-draft-board/project/styles/mobile.css, rendered in
 * components/DraftGrid.html.
 *
 * Not a third player list. `DraftPlayerBoard` hands it the rows the Cards and
 * Data Table views already render (`filteredPlayers`, server-filtered by the
 * shared search/position state), its own pick routing (`onDraftPlayer`), and
 * the very search + position-pill control those views use (`tools`). What is
 * new here is only the dock chrome and a compact row.
 *
 * Raw DOM styled by the `d-dock-*` rules in `styles.ts`, like its siblings
 * `DraftGrid` and `DraftBoardTimeline`: the Draft Board view is web-only (the
 * phone tier swaps the whole screen for `CompactLiveDraftBoard`).
 */
import React, { useId, useState } from 'react';

import type { DraftPlayer } from './types';
import type { DockRowColumns } from './draftDock';
import { STAT_COLUMNS_BY_SPORT } from './statColumns';
import { formatEligiblePositions } from './utils';
import type { SportKind } from '../../config/sports';

export interface DraftPlayerDockProps {
  sport: SportKind;
  /** The bar headline — `dockPickLabel()`. */
  pickLabel: string;
  /** "1,148 available" — `formatAvailableCount()`. */
  availableLabel: string;
  /** "open slots: 1B, SS" — `formatOpenSlots()`. */
  openSlotsLabel: string;
  /** "0:47 left" / "Paused", or null when no clock applies. */
  clockLabel: string | null;
  /** Rows side by side when open — `dockRowColumns()`. */
  columns: DockRowColumns;
  /** The search + position-pill control the Cards/Table views render. */
  tools: React.ReactNode;
  players: readonly DraftPlayer[];
  /** Whether a player fills one of the viewer's open slots (`.prow.fits`). */
  fitsOpenSlot: (player: DraftPlayer) => boolean;
  /** Whether a DRAFT action applies to the pick on the clock. */
  canDraft: boolean;
  /** A real commissioner override — relabels the action, as the table does. */
  isCommPick: boolean;
  /** Disables DRAFT while the viewer's own pick is in flight — already
   *  resolved by the board the same way it resolves it for `PlayerCard`. */
  pickLoading: boolean;
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  searchTerm: string;
  onDraftPlayer: (playerId: number) => void;
  onLoadMore: () => void;
}

/** "1B, OF · NYY · 0.340 AVG" — eligible positions (primary first), franchise, then the sport's lead stat,
 *  formatted by the same `STAT_COLUMNS_BY_SPORT` column the Data Table uses. */
function rowMeta(player: DraftPlayer, sport: SportKind): string {
  const lead = STAT_COLUMNS_BY_SPORT[sport][0];
  return [
    formatEligiblePositions(player),
    player.club ?? '—',
    lead ? `${lead.render(player)} ${lead.label}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function DraftPlayerDock({
  sport,
  pickLabel,
  availableLabel,
  openSlotsLabel,
  clockLabel,
  columns,
  tools,
  players,
  fitsOpenSlot,
  canDraft,
  isCommPick,
  pickLoading,
  loading,
  hasMore,
  loadingMore,
  searchTerm,
  onDraftPlayer,
  onLoadMore,
}: DraftPlayerDockProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const toggle = (): void => setOpen((o) => !o);

  return (
    <section
      className="d-dock"
      data-open={open}
      data-testid="draft-player-dock"
      aria-label="Available players"
    >
      <div className="d-dock-bar">
        <div className="d-dock-bar-text">
          <div className="d-dock-label">{pickLabel}</div>
          <div className="d-dock-sub">{`${availableLabel} · ${openSlotsLabel}`}</div>
        </div>
        {clockLabel && <span className="d-dock-sub">{clockLabel}</span>}
        <button
          type="button"
          className="d-dock-cta"
          data-testid="draft-player-dock-cta"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={toggle}
        >
          {canDraft ? 'Pick a player' : 'Browse players'}
        </button>
        <button
          type="button"
          className="d-dock-chev"
          data-testid="draft-player-dock-chevron"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={open ? 'Hide player list' : 'Show player list'}
          onClick={toggle}
        >
          <span aria-hidden="true">▴</span>
        </button>
      </div>

      {/* Always mounted: collapsing animates max-height to 0 instead of
          unmounting, so the list keeps its scroll position (and the search
          field its text) across a close/open. `inert` takes the hidden rows
          out of the tab order and the accessibility tree while collapsed. */}
      <div
        className="d-dock-body"
        id={bodyId}
        data-testid="draft-player-dock-body"
        inert={!open}
      >
        <div className="d-dock-inner">
          <div className="d-dock-tools">{tools}</div>
          <div
            className="d-dock-rows"
            data-cols={columns}
            data-testid="draft-player-dock-rows"
          >
            {players.map((player, idx) => (
              <div
                key={player.id}
                className={`d-dock-prow${fitsOpenSlot(player) ? ' fits' : ''}`}
                data-testid={`draft-player-dock-row-${player.id}`}
              >
                <span className="d-dock-rk">
                  {player.adp != null ? Math.round(player.adp) : idx + 1}
                </span>
                <div className="d-dock-prow-body">
                  <div className="d-dock-nm">{player.name}</div>
                  <div className="d-dock-mt">{rowMeta(player, sport)}</div>
                </div>
                {canDraft && (
                  <button
                    type="button"
                    className="d-dock-go"
                    aria-label={`${isCommPick ? 'Force pick' : 'Draft'} ${player.name}`}
                    disabled={pickLoading}
                    onClick={() => onDraftPlayer(player.id)}
                  >
                    {isCommPick ? 'FORCE PICK' : 'DRAFT'}
                  </button>
                )}
              </div>
            ))}
            {players.length === 0 && !loading && (
              <div className="d-dock-empty">
                {searchTerm
                  ? 'No players match your search'
                  : 'All available players have been drafted'}
              </div>
            )}
            {hasMore && !loading && players.length > 0 && (
              <button
                type="button"
                className="d-dock-more"
                disabled={loadingMore}
                onClick={onLoadMore}
              >
                {loadingMore ? 'Loading…' : 'Load more players'}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default DraftPlayerDock;
