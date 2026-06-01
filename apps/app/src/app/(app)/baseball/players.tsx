import { useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native';
import { Button, Text, XStack } from 'tamagui';
import {
  BattingStatsTableWithData,
  FieldingStatsTableWithData,
  PitchingStatsTableWithData,
} from '@legacy-sports/shared-components';
import {
  useGetCareerBattingStatsQuery,
  useGetCareerFieldingStatsQuery,
  useGetCareerPitchingStatsQuery,
} from '../../../api/db/graphql.generated';

enum TableView {
  BATTING,
  PITCHING,
  FIELDING,
}

export default function Players(): React.JSX.Element {
  const [selectedView, setSelectedView] = useState(TableView.BATTING);

  const {
    data: battingData,
    loading: battingLoading,
    error: battingError,
  } = useGetCareerBattingStatsQuery();

  const {
    data: pitchingData,
    loading: pitchingLoading,
    error: pitchingError,
  } = useGetCareerPitchingStatsQuery();

  const {
    data: fieldingData,
    loading: fieldingLoading,
    error: fieldingError,
  } = useGetCareerFieldingStatsQuery();

  const battingNodes = useMemo(
    () =>
      battingData?.careerBattingStats?.edges?.map((e) =>
        e?.node
          ? {
              ab: e.node.atBats,
              h: e.node.hits,
              hr: e.node.homeRuns,
              rbi: e.node.rbi,
              r: e.node.runs,
              sb: e.node.stolenBases,
              bb: e.node.baseOnBalls,
              so: e.node.strikeouts,
              avg: e.node.battingAverage,
              obp: e.node.onBasePercentage,
              slg: e.node.sluggingPercentage,
            }
          : null,
      ),
    [battingData],
  );

  const pitchingNodes = useMemo(
    () =>
      pitchingData?.careerPitchingStats?.map((s) =>
        s
          ? {
              w: s.wins,
              l: s.losses,
              era: s.era != null ? parseFloat(s.era) : null,
              g: s.games,
              gs: s.gamesStarted,
              sv: s.saves,
              h: s.hits,
              er: s.earnedRuns,
              hr: s.homeRuns,
              bb: s.baseOnBalls,
              so: s.strikeouts,
            }
          : null,
      ),
    [pitchingData],
  );

  const fieldingNodes = useMemo(
    () =>
      fieldingData?.careerFieldingStats?.map((s) =>
        s
          ? {
              a: s.assists,
              cg: s.completeGames,
              chances: s.chances,
              cs: s.caughtStealing,
              dpDef: s.doublePlays,
              eDef: s.errors,
              g: s.games,
              gs: s.gamesStarted,
              innDef: s.inningsDefended,
              pickoffs: s.pickoffs,
              po: s.putouts,
              pos: s.positions,
              sb: s.stolenBases,
              wp: s.wildPitches,
            }
          : null,
      ),
    [fieldingData],
  );

  return (
    <SafeAreaView style={{ backgroundColor: '#0A0F1A', flex: 1 }}>
      <XStack borderTopColor="#333333" borderTopWidth={1}>
        <Button
          alignItems="center"
          flex={1}
          height={50}
          justifyContent="center"
          backgroundColor={
            selectedView === TableView.BATTING ? '$blue8' : 'transparent'
          }
          borderRadius={0}
          onPress={() => setSelectedView(TableView.BATTING)}
        >
          <Text color="$color" fontSize="$6" fontWeight="bold">
            Batting
          </Text>
        </Button>
        <Button
          alignItems="center"
          flex={1}
          height={50}
          justifyContent="center"
          backgroundColor={
            selectedView === TableView.PITCHING ? '$blue8' : 'transparent'
          }
          borderRadius={0}
          onPress={() => setSelectedView(TableView.PITCHING)}
        >
          <Text color="$color" fontSize="$6" fontWeight="bold">
            Pitching
          </Text>
        </Button>
        <Button
          alignItems="center"
          flex={1}
          height={50}
          justifyContent="center"
          backgroundColor={
            selectedView === TableView.FIELDING ? '$blue8' : 'transparent'
          }
          borderRadius={0}
          onPress={() => setSelectedView(TableView.FIELDING)}
        >
          <Text color="$color" fontSize="$6" fontWeight="bold">
            Fielding
          </Text>
        </Button>
      </XStack>
      {selectedView === TableView.BATTING && (
        <BattingStatsTableWithData
          data={{ nodes: battingNodes }}
          loading={battingLoading}
          error={battingError}
        />
      )}
      {selectedView === TableView.PITCHING && (
        <PitchingStatsTableWithData
          data={{ nodes: pitchingNodes }}
          loading={pitchingLoading}
          error={pitchingError}
        />
      )}
      {selectedView === TableView.FIELDING && (
        <FieldingStatsTableWithData
          data={{ nodes: fieldingNodes }}
          loading={fieldingLoading}
          error={fieldingError}
        />
      )}
    </SafeAreaView>
  );
}
