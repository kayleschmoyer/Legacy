import { Row, Rows, Table } from 'react-native-table-component';
import React, { useMemo } from 'react';
import {
  CareerFieldingStatsWithPlayerFragment,
} from '../../api/db/graphql.generated';

const TABLE_HEADER = [
  'Player',
  'a',
  'cg',
  'chances',
  'cs',
  'dpDef',
  'eDef',
  'g',
  'gs',
  'innDef',
  'pickoffs',
  'po',
  'pos',
  'sb',
  'wp',
];

export interface FieldingStatsTableProps {
  stats: readonly CareerFieldingStatsWithPlayerFragment[];
}

export function FieldingStatsTable(
  props: FieldingStatsTableProps,
): JSX.Element {
  const { stats } = props;

  const data = useMemo(() => {
    return stats.map((record) => [
      record.player?.name,
      record.a,
      record.cg,
      record.chances,
      record.cs,
      record.dpDef,
      record.eDef,
      record.g,
      record.gs,
      record.innDef,
      record.pickoffs,
      record.po,
      record.pos,
      record.sb,
      record.wp,
    ]);
  }, [stats]);

  return (
    <Table borderStyle={{ borderWidth: 2, borderColor: '#c8e1ff' }}>
      <Row data={TABLE_HEADER} />
      <Rows data={data} />
    </Table>
  );
}
