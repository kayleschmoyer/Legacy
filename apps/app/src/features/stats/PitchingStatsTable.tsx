import { Row, Rows, Table } from 'react-native-table-component';
import React, { useMemo } from 'react';
import { CareerPitchingStatsWithPlayerFragment } from '../../api/db/graphql.generated';

const TABLE_HEADER = [
  'Player',
  'bb',
  'bk',
  'batters_faced',
  'cg',
  'er',
  'g',
  'gf',
  'gs',
  'h',
  'hbp',
  'hr',
  'ibb',
  'l',
  'outsRecorded',
  'r',
  'sho',
  'so',
  'sv',
  'w',
  'wp',
];

export interface PitchingStatsTableProps {
  stats: readonly CareerPitchingStatsWithPlayerFragment[];
}

export function PitchingStatsTable(
  props: PitchingStatsTableProps
): JSX.Element {
  const { stats } = props;

  const data = useMemo(() => {
    return stats.map((record) => [
      record.player?.name,
      record.bb,
      record.bk,
      record.battersFaced,
      record.cg,
      record.er,
      record.g,
      record.gf,
      record.gs,
      record.h,
      record.hbp,
      record.hr,
      record.ibb,
      record.l,
      record.outsRecorded,
      record.r,
      record.sho,
      record.so,
      record.sv,
      record.w,
      record.wp,
    ]);
  }, [stats]);

  return (
    <Table
      borderStyle={{
        borderColor: '#c8e1ff',
        borderWidth: 2,
      }}
    >
      <Row data={TABLE_HEADER} />
      <Rows data={data} />
    </Table>
  );
}
