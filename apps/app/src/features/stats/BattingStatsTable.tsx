import { Row, Rows, Table } from 'react-native-table-component';
import React, { useMemo } from 'react';
import { CareerBattingStatsWithPlayerFragment } from '../../api/db/graphql.generated';

const TABLE_HEADER = [
  'Player',
  'G',
  'PA',
  'AB',
  'R',
  'H',
  '2B',
  '3B',
  'HR',
  'RBI',
  'SB',
  'CS',
  'BB',
  'SO',
  'TB',
  'GIDP',
  'HBP',
  'SH',
  'IBB',
];

export interface BattingStatsTableProps {
  stats: readonly CareerBattingStatsWithPlayerFragment[];
}

export function BattingStatsTable(props: BattingStatsTableProps): JSX.Element {
  const { stats } = props;

  const data = useMemo(() => {
    return stats.map((record) => [
      record.player?.name,
      record.g,
      record.pa,
      record.ab,
      record.r,
      record.h,
      record.doubles,
      record.triples,
      record.hr,
      record.rbi,
      record.sb,
      record.cs,
      record.bb,
      record.so,
      record.tb,
      record.gidp,
      record.hbp,
      record.sh,
      record.ibb,
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
