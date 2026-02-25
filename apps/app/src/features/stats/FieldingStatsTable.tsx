import { Row, Rows, Table } from 'react-native-table-component';
import React, { useMemo } from 'react';
import { useTheme } from 'tamagui';
import { CareerFieldingStatsFragment } from '../../api/db/graphql.generated';

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
  stats: readonly CareerFieldingStatsFragment[];
}

export function FieldingStatsTable(
  props: FieldingStatsTableProps,
): React.JSX.Element {
  const { stats } = props;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const theme = useTheme() as any;

  const data = useMemo(() => {
    return stats.map((record) => [
      record.playerId, // Using playerId since there's no player object
      record.assists,
      record.completeGames,
      record.chances,
      record.caughtStealing,
      record.doublePlays,
      record.errors,
      record.games,
      record.gamesStarted,
      record.inningsDefended,
      record.pickoffs,
      record.putouts,
      record.positions,
      record.stolenBases,
      record.wildPitches,
    ]);
  }, [stats]);

  // Disable type safety for Tamagui theme integration
  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
  return (
    <Table
      borderStyle={{
        borderColor: theme.borderColor?.get?.() || '#2F3B53',
        borderWidth: 1,
      }}
    >
      <Row
        data={TABLE_HEADER}
        style={{
          backgroundColor: theme.color2?.get?.() || '#111B2F',
          height: 40,
        }}
        textStyle={{
          color: theme.color12?.get?.() || '#F5F7FA',
          fontWeight: '600',
          textAlign: 'center',
        }}
      />
      <Rows
        data={data}
        style={{
          backgroundColor: theme.color1?.get?.() || '#0D1526',
          height: 35,
        }}
        textStyle={{
          color: theme.color11?.get?.() || '#DEE6FF',
          textAlign: 'center',
        }}
      />
    </Table>
  );
  /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
}
