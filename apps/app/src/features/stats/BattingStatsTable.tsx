import { Row, Rows, Table } from 'react-native-table-component';
import React, { useMemo } from 'react';
import { useTheme } from 'tamagui';
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

export function BattingStatsTable(
  props: BattingStatsTableProps,
): React.JSX.Element {
  const { stats } = props;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const theme = useTheme() as any;

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

  // Disable type safety for Tamagui theme integration
  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
  return (
    <Table
      borderStyle={{
        borderColor: theme.borderColor?.get?.() || '#3a3a5a',
        borderWidth: 1,
      }}
    >
      <Row
        data={TABLE_HEADER}
        style={{
          backgroundColor: theme.color2?.get?.() || '#1a1a2e',
          height: 40,
        }}
        textStyle={{
          color: theme.color12?.get?.() || '#bababaa',
          fontWeight: '600',
          textAlign: 'center',
        }}
      />
      <Rows
        data={data}
        style={{
          backgroundColor: theme.color1?.get?.() || '#0f0f23',
          height: 35,
        }}
        textStyle={{
          color: theme.color11?.get?.() || '#9a9aaa',
          textAlign: 'center',
        }}
      />
    </Table>
  );
  /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
}
