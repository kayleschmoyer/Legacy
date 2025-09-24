import { SafeAreaView } from 'react-native';
import { useState } from 'react';
import { Button, Text, XStack } from 'tamagui';
import {
  BattingStatsTableWithData,
  FieldingStatsTableWithData,
  PitchingStatsTableWithData,
} from '../../../features/stats/UsefulTables';

enum TableView {
  BATTING,
  PITCHING,
  FIELDING,
}

export default function Players(): React.JSX.Element {
  const [selectedView, setSelectedView] = useState(TableView.BATTING);

  return (
    <SafeAreaView style={{ backgroundColor: 'lightcyan', flex: 1 }}>
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
          <Text color="darkblue" fontSize="$6" fontWeight="bold">
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
          <Text color="darkblue" fontSize="$6" fontWeight="bold">
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
          <Text color="darkblue" fontSize="$6" fontWeight="bold">
            Fielding
          </Text>
        </Button>
      </XStack>
      {selectedView === TableView.BATTING && <BattingStatsTableWithData />}
      {selectedView === TableView.PITCHING && <PitchingStatsTableWithData />}
      {selectedView === TableView.FIELDING && <FieldingStatsTableWithData />}
    </SafeAreaView>
  );
}
