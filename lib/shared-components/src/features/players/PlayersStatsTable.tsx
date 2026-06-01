import React, { useMemo, useState } from 'react';
import { Pressable } from 'react-native';
import { Text, YStack } from 'tamagui';
import { PlayerFragment } from './PlayersApi';
// Import the name helpers from their leaf module (not PlayersScreen) to avoid a
// PlayersScreen → PlayersGrid → PlayersStatsTable → PlayersScreen import cycle.
import { fullName, initialsOf } from './playerNameUtils';
import { Platform } from '../../platform-components';
import {
  BG_DARK,
  BRAND_GOLD_LIGHT,
  OUTLINE_SUBTLE,
  POS_UTILITY,
  SURFACE_CARD,
  SURFACE_PANEL,
  TEXT_MUTED,
  TEXT_NEUTRAL_FG3,
  TEXT_PRIMARY,
  WHITE,
  withAlpha,
} from '../../utils/colors';

const FONT_DISPLAY = "'Big Shoulders Display', sans-serif";
const FONT_BODY = "'Literata', serif";

/**
 * Module-level CSS for the .pp-table treatment. Extracted from the render
 * body so the rule set is reviewable in one place and not allocated per
 * render. We use a `<style>` block rather than Tamagui's `styled` because
 * `<table>`/`<th>`/`<td>` are not first-class Tamagui primitives and the
 * design relies on selector-driven state (`:hover`, `:focus-visible`,
 * sticky positioning, `@media`) that Tamagui's runtime style system does
 * not target ergonomically. Mirrors the established `<style>` pattern in
 * PlayersScreen.tsx / PlayersGrid.tsx for the same Players Page feature.
 */
const STATS_TABLE_CSS = `
  .pp-table-wrap {
    overflow-x: auto;
    border-radius: 14px;
    border: 1px solid ${OUTLINE_SUBTLE};
    background: ${SURFACE_CARD};
  }
  .pp-table {
    width: 100%;
    border-collapse: collapse;
  }
  .pp-table thead th {
    font-family: ${FONT_DISPLAY};
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: ${TEXT_MUTED};
    background: ${SURFACE_PANEL};
    padding: 14px 14px;
    text-align: right;
    border-bottom: 1px solid ${OUTLINE_SUBTLE};
    white-space: nowrap;
  }
  .pp-table thead th.player-col {
    text-align: left;
    position: sticky;
    left: 0;
    background: ${SURFACE_PANEL};
    padding-left: 18px;
    z-index: 1;
  }
  .pp-table thead th.sortable {
    cursor: pointer;
    user-select: none;
  }
  .pp-table thead th.sortable:hover {
    color: ${BRAND_GOLD_LIGHT};
  }
  .pp-table thead th.sortable:focus-visible {
    outline: 2px solid ${BRAND_GOLD_LIGHT};
    outline-offset: -2px;
    color: ${BRAND_GOLD_LIGHT};
  }
  .pp-table thead th.sorted {
    color: ${BRAND_GOLD_LIGHT};
    border-bottom-color: ${BRAND_GOLD_LIGHT};
  }
  .pp-table thead th .pp-arrow {
    font-size: 9px;
    margin-left: 4px;
  }
  .pp-table tbody td {
    font-family: ${FONT_BODY};
    font-size: 14px;
    color: ${TEXT_PRIMARY};
    padding: 12px 14px;
    text-align: right;
    border-bottom: 1px solid ${withAlpha(WHITE, 0.04)};
    font-variant-numeric: tabular-nums;
  }
  .pp-table tbody td.player-cell {
    text-align: left;
    padding-left: 18px;
    position: sticky;
    left: 0;
    background: ${SURFACE_CARD};
    border-left: 1px solid transparent;
  }
  .pp-table tbody tr {
    position: relative;
  }
  .pp-table tbody tr:hover td {
    background: ${withAlpha(WHITE, 0.025)};
  }
  .pp-table tbody tr:hover td.player-cell {
    background: ${SURFACE_PANEL};
    border-left-color: ${POS_UTILITY};
  }
  .pp-table tbody tr:last-child td {
    border-bottom: 0;
  }
  .pp-table tbody td.lead {
    color: ${BRAND_GOLD_LIGHT};
    font-weight: 600;
  }
  .pp-table .ppt-row-id {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .pp-table .ppt-name {
    font-family: ${FONT_DISPLAY};
    font-weight: 700;
    font-size: 14px;
    color: ${TEXT_PRIMARY};
    display: flex;
    align-items: center;
    gap: 10px;
    letter-spacing: 0.01em;
  }
  .pp-table .ppt-mug {
    width: 28px;
    height: 28px;
    border-radius: 14px;
    background: ${withAlpha(POS_UTILITY, 0.18)};
    border: 1px solid ${withAlpha(POS_UTILITY, 0.4)};
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: ${FONT_DISPLAY};
    font-weight: 800;
    font-size: 10px;
    color: ${TEXT_PRIMARY};
    letter-spacing: 0.02em;
  }
  .pp-table .ppt-sub {
    font-family: ${FONT_BODY};
    font-style: italic;
    font-size: 12px;
    color: ${TEXT_NEUTRAL_FG3};
    margin-top: 2px;
  }
  @media (max-width: 640px) {
    .pp-table thead th { padding: 10px 10px; font-size: 10px; }
    .pp-table tbody td { padding: 10px; font-size: 13px; }
  }
`;

/** Baseball career stat columns surfaced in the Stats Table view. The
 *  `getValue` extractor returns `null` whenever the field is not yet present on
 *  the Player fragment — rows render an em-dash for missing values, matching
 *  the Featured spotlight scaffold from LS-4646. The `lead` flag marks the
 *  marquee column (AVG) that gets the gold tint per design. */
export type StatColumn = {
  key: string;
  label: string;
  getValue: (player: PlayerFragment) => number | null;
  format?: (value: number) => string;
  lead?: boolean;
};

/** Default baseball stat columns. Mirrors the `BA / HR / R / RBI / SB` set
 *  called out in LS-4653 AC1. Values resolve to `null` until per-player stats
 *  flow through the GraphQL fragment — same scaffold pattern as Featured. */
export const BASEBALL_STAT_COLUMNS: StatColumn[] = [
  {
    key: 'avg',
    label: 'AVG',
    lead: true,
    getValue: () => null,
    format: (v) => v.toFixed(3).replace(/^0/, ''),
  },
  { key: 'hr', label: 'HR', getValue: () => null },
  { key: 'r', label: 'R', getValue: () => null },
  { key: 'rbi', label: 'RBI', getValue: () => null },
  { key: 'sb', label: 'SB', getValue: () => null },
];

export interface PlayersStatsTableProps {
  players: PlayerFragment[];
  /** Stat columns to render (defaults to baseball career columns). */
  columns?: StatColumn[];
  onPlayerSelect?: (player: PlayerFragment) => void;
}

type SortKey = string;
type SortDir = 'asc' | 'desc';

const PLAYER_COLUMN_KEY = 'name';

/** Exported for unit testing — the sort comparator used by PlayersStatsTable. Numeric
 *  columns sort desc-first (highest stat on top) and break ties alphabetically.
 *  The name column sorts ascending by full name. Nulls always sink to the end
 *  regardless of direction so empty rows don't dominate the leaderboard. */
function nameKey(p: PlayerFragment): string {
  // Sort by last name first (conventional for player tables), then first name
  // for tiebreaking siblings (e.g. the Alou brothers).
  return `${p.lastName ?? ''} ${p.firstName ?? ''}`.toLowerCase().trim();
}

export function sortPlayers(
  players: PlayerFragment[],
  sortKey: SortKey,
  sortDir: SortDir,
  columns: StatColumn[],
): PlayerFragment[] {
  const next = players.slice();
  if (sortKey === PLAYER_COLUMN_KEY) {
    next.sort((a, b) => {
      const cmp = nameKey(a).localeCompare(nameKey(b));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return next;
  }
  const col = columns.find((c) => c.key === sortKey);
  if (!col) return next;
  next.sort((a, b) => {
    const av = col.getValue(a);
    const bv = col.getValue(b);
    if (av == null && bv == null) {
      return nameKey(a).localeCompare(nameKey(b));
    }
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av === bv) return nameKey(a).localeCompare(nameKey(b));
    return sortDir === 'asc' ? av - bv : bv - av;
  });
  return next;
}

/** Format a stat cell value. Em-dash for missing data so the column spacing
 *  still reads as a leaderboard slot. */
function renderCell(col: StatColumn, player: PlayerFragment): string {
  const v = col.getValue(player);
  if (v == null) return '—';
  return col.format ? col.format(v) : String(v);
}

/** PlayersStatsTable — `?view=stats` view mode for the Players Page (LS-4653).
 *
 *  Mirrors `.pp-table` from the design bundle (`players.css` lines 1182-1313):
 *  layered SURFACE_CARD background, sticky Player column, gold tint on the
 *  active sort column, 1px position color stripe on the player cell on hover.
 *  All numeric cells use `font-variant-numeric: tabular-nums` so decimals
 *  align down the column per AGENTS.md brand rules. */
export function PlayersStatsTable({
  players,
  columns = BASEBALL_STAT_COLUMNS,
  onPlayerSelect,
}: PlayersStatsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>(PLAYER_COLUMN_KEY);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sorted = useMemo(
    () => sortPlayers(players, sortKey, sortDir, columns),
    [players, sortKey, sortDir, columns],
  );

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    // Name sorts ascending by default; numeric stats sort descending (highest
    // stat on top) on first click.
    setSortDir(key === PLAYER_COLUMN_KEY ? 'asc' : 'desc');
  };

  // Native fall-back: tables are a web-first treatment; on native we render a
  // minimal stacked summary so the screen still reads. When onPlayerSelect is
  // provided, each row is wrapped in a Pressable so the touch target works
  // (mirrors the web <tr role="button"> contract).
  if (Platform.OS !== 'web') {
    const nativeOnSelect = onPlayerSelect;
    return (
      <YStack gap={12} padding={16} backgroundColor={SURFACE_CARD}>
        {sorted.map((p) => {
          const row = (
            <YStack gap={4}>
              <Text
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: '700',
                  fontSize: 16,
                  color: TEXT_PRIMARY,
                }}
              >
                {fullName(p) || 'Unknown Player'}
              </Text>
              <Text
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 13,
                  color: TEXT_NEUTRAL_FG3,
                }}
              >
                {columns
                  .map((c) => `${c.label} ${renderCell(c, p)}`)
                  .join(' · ')}
              </Text>
            </YStack>
          );
          if (nativeOnSelect) {
            return (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityLabel={`Select ${fullName(p) || 'player'}`}
                onPress={() => nativeOnSelect(p)}
              >
                {row}
              </Pressable>
            );
          }
          return <YStack key={p.id}>{row}</YStack>;
        })}
      </YStack>
    );
  }

  const arrow = sortDir === 'asc' ? '▲' : '▼';

  // Keyboard activation for sortable headers — Enter or Space triggers a sort
  // just like the click handler so keyboard-only users can re-order the table
  // (LS-4653 review: `<th>` lacks native button keybindings).
  const keyHandlerFor = (key: SortKey) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSort(key);
    }
  };

  return (
    <YStack className="pp-table-host">
      <style>{STATS_TABLE_CSS}</style>
      <div
        className="pp-table-wrap"
        role="region"
        aria-label="Player statistics table"
      >
        <table
          className="pp-table"
          style={{ backgroundColor: BG_DARK }}
          aria-rowcount={sorted.length + 1}
        >
          <thead>
            <tr>
              <th
                scope="col"
                role="button"
                tabIndex={0}
                className={
                  'player-col sortable ' +
                  (sortKey === PLAYER_COLUMN_KEY ? 'sorted' : '')
                }
                aria-sort={
                  sortKey === PLAYER_COLUMN_KEY
                    ? sortDir === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
                onClick={() => handleSort(PLAYER_COLUMN_KEY)}
                onKeyDown={keyHandlerFor(PLAYER_COLUMN_KEY)}
              >
                Player
                {sortKey === PLAYER_COLUMN_KEY && (
                  <span className="pp-arrow" aria-hidden="true">
                    {arrow}
                  </span>
                )}
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  role="button"
                  tabIndex={0}
                  className={'sortable ' + (sortKey === c.key ? 'sorted' : '')}
                  aria-sort={
                    sortKey === c.key
                      ? sortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  onClick={() => handleSort(c.key)}
                  onKeyDown={keyHandlerFor(c.key)}
                >
                  {c.label}
                  {sortKey === c.key && (
                    <span className="pp-arrow" aria-hidden="true">
                      {arrow}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((player) => {
              const onSelect = onPlayerSelect;
              return (
                <tr
                  key={player.id}
                  role={onSelect ? 'button' : undefined}
                  tabIndex={onSelect ? 0 : undefined}
                  style={{ cursor: onSelect ? 'pointer' : 'default' }}
                  onClick={onSelect ? () => onSelect(player) : undefined}
                  onKeyDown={
                    onSelect
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelect(player);
                          }
                        }
                      : undefined
                  }
                >
                  <td className="player-cell">
                    <div className="ppt-row-id">
                      <div className="ppt-name">
                        <span className="ppt-mug" aria-hidden="true">
                          {initialsOf(player)}
                        </span>
                        {fullName(player) || 'Unknown Player'}
                      </div>
                      {player.brefId && (
                        <div className="ppt-sub">{player.brefId}</div>
                      )}
                    </div>
                  </td>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={
                        (c.lead ? 'lead' : '') +
                        (sortKey === c.key ? ' sorted' : '')
                      }
                    >
                      {renderCell(c, player)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </YStack>
  );
}
