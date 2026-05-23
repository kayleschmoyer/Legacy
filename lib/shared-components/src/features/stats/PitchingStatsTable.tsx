import React from 'react';
import { StatsTable } from './StatsTable';
import { StatsTableColumn, StatsTableRow } from '../../types';

// Define the pitching stats table columns
const PITCHING_COLUMNS: StatsTableColumn[] = [
  { key: 'player', label: 'Player', sortable: true, type: 'string' },
  { key: 'w', label: 'W', sortable: true, type: 'number' },
  { key: 'l', label: 'L', sortable: true, type: 'number' },
  { key: 'era', label: 'ERA', sortable: true, type: 'number' },
  { key: 'g', label: 'G', sortable: true, type: 'number' },
  { key: 'gs', label: 'GS', sortable: true, type: 'number' },
  { key: 'cg', label: 'CG', sortable: true, type: 'number' },
  { key: 'sho', label: 'SHO', sortable: true, type: 'number' },
  { key: 'sv', label: 'SV', sortable: true, type: 'number' },
  { key: 'ip', label: 'IP', sortable: true, type: 'number' },
  { key: 'h', label: 'H', sortable: true, type: 'number' },
  { key: 'r', label: 'R', sortable: true, type: 'number' },
  { key: 'er', label: 'ER', sortable: true, type: 'number' },
  { key: 'hr', label: 'HR', sortable: true, type: 'number' },
  { key: 'bb', label: 'BB', sortable: true, type: 'number' },
  { key: 'ibb', label: 'IBB', sortable: true, type: 'number' },
  { key: 'so', label: 'SO', sortable: true, type: 'number' },
  { key: 'hbp', label: 'HBP', sortable: true, type: 'number' },
  { key: 'bk', label: 'BK', sortable: true, type: 'number' },
  { key: 'wp', label: 'WP', sortable: true, type: 'number' },
  { key: 'bf', label: 'BF', sortable: true, type: 'number' },
];

export interface PitchingStatsData {
  player?: { name?: string };
  w?: number;
  l?: number;
  era?: number;
  g?: number;
  gs?: number;
  cg?: number;
  sho?: number;
  sv?: number;
  ip?: number;
  h?: number;
  r?: number;
  er?: number;
  hr?: number;
  bb?: number;
  ibb?: number;
  so?: number;
  hbp?: number;
  bk?: number;
  wp?: number;
  bf?: number;
}

export interface PitchingStatsTableProps {
  stats: PitchingStatsData[];
  title?: string;
  maxHeight?: number;
  onPlayerPress?: (playerData: PitchingStatsData) => void;
}

function PitchingStatsTable({
  stats,
  title = 'Pitching Statistics',
  maxHeight,
  onPlayerPress,
}: PitchingStatsTableProps) {
  // Transform the data to match the table format
  const tableData: StatsTableRow[] = stats.map((record, index) => ({
    id: `${record.player?.name ?? 'unknown'}-${index}`,
    player: record.player?.name || 'Unknown',
    w: record.w ?? 0,
    l: record.l ?? 0,
    era: record.era ? Number(record.era.toFixed(2)) : 0,
    g: record.g ?? 0,
    gs: record.gs ?? 0,
    cg: record.cg ?? 0,
    sho: record.sho ?? 0,
    sv: record.sv ?? 0,
    ip: record.ip ? Number(record.ip.toFixed(1)) : 0,
    h: record.h ?? 0,
    r: record.r ?? 0,
    er: record.er ?? 0,
    hr: record.hr ?? 0,
    bb: record.bb ?? 0,
    ibb: record.ibb ?? 0,
    so: record.so ?? 0,
    hbp: record.hbp ?? 0,
    bk: record.bk ?? 0,
    wp: record.wp ?? 0,
    bf: record.bf ?? 0,
  }));

  const handleRowPress = onPlayerPress
    ? (row: StatsTableRow, index: number) => {
        onPlayerPress(stats[index]);
      }
    : undefined;

  return (
    <StatsTable
      columns={PITCHING_COLUMNS}
      data={tableData}
      title={title}
      maxHeight={maxHeight}
      onRowPress={handleRowPress}
    />
  );
}

export { PitchingStatsTable };
