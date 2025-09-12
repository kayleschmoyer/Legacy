import React from 'react';
import { StatsTable } from './StatsTable';
import { StatsTableColumn, StatsTableRow } from '../../types';

// Define the batting stats table columns
const BATTING_COLUMNS: StatsTableColumn[] = [
  { key: 'player', label: 'Player', sortable: true, type: 'string' },
  { key: 'g', label: 'G', sortable: true, type: 'number' },
  { key: 'pa', label: 'PA', sortable: true, type: 'number' },
  { key: 'ab', label: 'AB', sortable: true, type: 'number' },
  { key: 'r', label: 'R', sortable: true, type: 'number' },
  { key: 'h', label: 'H', sortable: true, type: 'number' },
  { key: 'doubles', label: '2B', sortable: true, type: 'number' },
  { key: 'triples', label: '3B', sortable: true, type: 'number' },
  { key: 'hr', label: 'HR', sortable: true, type: 'number' },
  { key: 'rbi', label: 'RBI', sortable: true, type: 'number' },
  { key: 'sb', label: 'SB', sortable: true, type: 'number' },
  { key: 'cs', label: 'CS', sortable: true, type: 'number' },
  { key: 'bb', label: 'BB', sortable: true, type: 'number' },
  { key: 'so', label: 'SO', sortable: true, type: 'number' },
  { key: 'tb', label: 'TB', sortable: true, type: 'number' },
  { key: 'gidp', label: 'GIDP', sortable: true, type: 'number' },
  { key: 'hbp', label: 'HBP', sortable: true, type: 'number' },
  { key: 'sh', label: 'SH', sortable: true, type: 'number' },
  { key: 'ibb', label: 'IBB', sortable: true, type: 'number' },
];

export interface BattingStatsData {
  player?: { name?: string };
  g?: number;
  pa?: number;
  ab?: number;
  r?: number;
  h?: number;
  doubles?: number;
  triples?: number;
  hr?: number;
  rbi?: number;
  sb?: number;
  cs?: number;
  bb?: number;
  so?: number;
  tb?: number;
  gidp?: number;
  hbp?: number;
  sh?: number;
  ibb?: number;
}

export interface BattingStatsTableProps {
  stats: BattingStatsData[];
  title?: string;
  maxHeight?: number;
  onPlayerPress?: (playerData: BattingStatsData) => void;
}

function BattingStatsTable({ 
  stats,
  title = 'Batting Statistics',
  maxHeight,
  onPlayerPress,
 }: BattingStatsTableProps) {
  // Transform the data to match the table format
  const tableData: StatsTableRow[] = stats.map((record) => ({
    player: record.player?.name || 'Unknown',
    g: record.g ?? 0,
    pa: record.pa ?? 0,
    ab: record.ab ?? 0,
    r: record.r ?? 0,
    h: record.h ?? 0,
    doubles: record.doubles ?? 0,
    triples: record.triples ?? 0,
    hr: record.hr ?? 0,
    rbi: record.rbi ?? 0,
    sb: record.sb ?? 0,
    cs: record.cs ?? 0,
    bb: record.bb ?? 0,
    so: record.so ?? 0,
    tb: record.tb ?? 0,
    gidp: record.gidp ?? 0,
    hbp: record.hbp ?? 0,
    sh: record.sh ?? 0,
    ibb: record.ibb ?? 0,
  }));

  const handleRowPress = onPlayerPress
    ? (row: StatsTableRow, index: number) => {
        onPlayerPress(stats[index]);
      }
    : undefined;

  return (
    <StatsTable
      columns={BATTING_COLUMNS}
      data={tableData}
      title={title}
      maxHeight={maxHeight}
      onRowPress={handleRowPress}
    />
  );
}

export { BattingStatsTable };
