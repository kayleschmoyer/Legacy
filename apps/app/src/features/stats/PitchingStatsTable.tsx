import { Row, Rows, Table } from 'react-native-table-component';
import React, { useMemo } from 'react';
import { useTheme } from 'tamagui';
import { CareerPitchingStatsFragment } from '../../api/db/graphql.generated';

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
  stats: readonly CareerPitchingStatsFragment[];
}

export function PitchingStatsTable(
  props: PitchingStatsTableProps,
): React.JSX.Element {
  const { stats } = props;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const theme = useTheme() as any;

  const data = useMemo(() => {
    return stats.map((record) => [
      record.playerId, // Using playerId since there's no player object
      record.baseOnBalls,
      record.balks,
      record.battersFaced,
      record.completeGames,
      record.earnedRuns,
      record.games,
      record.gamesFinished,
      record.gamesStarted,
      record.hits,
      record.hitByPitch,
      record.homeRuns,
      record.intentionalBaseOnBalls,
      record.losses,
      record.outsRecorded,
      record.runs,
      record.shutouts,
      record.strikeouts,
      record.saves,
      record.wins,
      record.wildPitches,
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
