// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - react-native-table-component lacks TypeScript definitions
import { Row, Rows, Table } from 'react-native-table-component';
import React, { useMemo } from 'react';
import { useTheme } from 'tamagui';
import { CareerBattingStatsFragment } from '../../api/db/graphql.generated';

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
  stats: readonly CareerBattingStatsFragment[];
}

export function BattingStatsTable(
  props: BattingStatsTableProps,
): React.JSX.Element {
  const { stats } = props;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const theme = useTheme() as any;

  const data = useMemo(() => {
    return stats.map((record) => [
      record.playerId, // Using playerId since there's no player object
      record.games,
      record.plateAppearances,
      record.atBats,
      record.runs,
      record.hits,
      record.doubles,
      record.triples,
      record.homeRuns,
      record.rbi,
      record.stolenBases,
      record.caughtStealing,
      record.baseOnBalls,
      record.strikeouts,
      record.totalBases,
      record.groundedIntoDoublePlays,
      record.hitByPitch,
      record.sacrificeHits,
      record.intentionalBaseOnBalls,
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
