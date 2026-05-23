import React from 'react';
import { StatsTable } from './StatsTable';
import { StatsTableColumn, StatsTableRow } from '../../types';

const FIELDING_COLUMNS: StatsTableColumn[] = [
  { key: 'player', label: 'Player', sortable: true, type: 'string' },
  { key: 'pos', label: 'Pos', sortable: true, type: 'string' },
  { key: 'g', label: 'G', sortable: true, type: 'number' },
  { key: 'gs', label: 'GS', sortable: true, type: 'number' },
  { key: 'innDef', label: 'Inn', sortable: true, type: 'number' },
  { key: 'po', label: 'PO', sortable: true, type: 'number' },
  { key: 'a', label: 'A', sortable: true, type: 'number' },
  { key: 'eDef', label: 'E', sortable: true, type: 'number' },
  { key: 'dpDef', label: 'DP', sortable: true, type: 'number' },
  { key: 'chances', label: 'TC', sortable: true, type: 'number' },
  { key: 'cg', label: 'CG', sortable: true, type: 'number' },
  { key: 'cs', label: 'CS', sortable: true, type: 'number' },
  { key: 'sb', label: 'SB', sortable: true, type: 'number' },
  { key: 'pickoffs', label: 'PK', sortable: true, type: 'number' },
  { key: 'wp', label: 'WP', sortable: true, type: 'number' },
];

// Generic fielding stats interface to avoid GraphQL dependencies
export interface FieldingStatsRecord {
  player?: {
    name?: string | null;
  } | null;
  a?: number | null;
  cg?: number | null;
  chances?: number | null;
  cs?: number | null;
  dpDef?: number | null;
  eDef?: number | null;
  g?: number | null;
  gs?: number | null;
  innDef?: number | null;
  pickoffs?: number | null;
  po?: number | null;
  pos?: string | null;
  sb?: number | null;
  wp?: number | null;
}

export interface FieldingStatsTableProps {
  stats: readonly FieldingStatsRecord[];
  title?: string;
  maxHeight?: number;
}

function FieldingStatsTable({
  stats,
  title = 'Fielding Statistics',
  maxHeight,
}: FieldingStatsTableProps) {
  const tableData: StatsTableRow[] = stats.map((record, index) => ({
    id: `${record.player?.name ?? 'unknown'}-${record.pos ?? 'pos'}-${index}`,
    player: record.player?.name ?? 'Unknown',
    pos: record.pos ?? '',
    g: record.g ?? 0,
    gs: record.gs ?? 0,
    innDef: record.innDef ?? 0,
    po: record.po ?? 0,
    a: record.a ?? 0,
    eDef: record.eDef ?? 0,
    dpDef: record.dpDef ?? 0,
    chances: record.chances ?? 0,
    cg: record.cg ?? 0,
    cs: record.cs ?? 0,
    sb: record.sb ?? 0,
    pickoffs: record.pickoffs ?? 0,
    wp: record.wp ?? 0,
  }));

  return (
    <StatsTable
      columns={FIELDING_COLUMNS}
      data={tableData}
      title={title}
      maxHeight={maxHeight}
    />
  );
}

export { FieldingStatsTable };
