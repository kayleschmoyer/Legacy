import React, { useState } from 'react';
import { Button, Text, XStack, YStack } from 'tamagui';
import {
  BattingStatsTableWithData,
  FieldingStatsTableWithData,
  PitchingStatsTableWithData,
} from '../stats/UsefulTables';

enum TableView {
  BATTING,
  PITCHING,
  FIELDING,
}

export interface PlayersOverviewProps {
  /**
   * Initial view to display
   * @default TableView.BATTING
   */
  initialView?: TableView;
  /**
   * Custom styles for the container
   */
  containerStyle?: React.CSSProperties;
  /**
   * Custom styles for tabs
   */
  tabStyle?: React.CSSProperties;
}

function PlayersOverview({
  initialView = TableView.BATTING,
  containerStyle,
  tabStyle: _tabStyle,
}: PlayersOverviewProps) {
  const [selectedView, setSelectedView] = useState(initialView);

  const renderTabButton = (view: TableView, label: string) => (
    <Button
      flex={1}
      height="$5"
      borderRadius={0}
      borderRightWidth={1}
      borderRightColor="$gray7"
      backgroundColor={selectedView === view ? '$blue10' : '$gray2'}
      pressStyle={{
        backgroundColor: selectedView === view ? '$blue9' : '$gray3',
      }}
      onPress={() => setSelectedView(view)}
    >
      <Text
        fontSize="$5"
        fontWeight="bold"
        color={selectedView === view ? '$white' : '$blue10'}
      >
        {label}
      </Text>
    </Button>
  );

  return (
    <YStack flex={1} backgroundColor="$background" style={containerStyle}>
      <XStack
        borderTopColor="$gray8"
        borderTopWidth={1}
        backgroundColor="$white"
        elevation={2}
        shadowColor="$black"
        shadowOffset={{ width: 0, height: 2 }}
        shadowOpacity={0.1}
        shadowRadius={2}
      >
        {renderTabButton(TableView.BATTING, 'Batting')}
        {renderTabButton(TableView.PITCHING, 'Pitching')}
        {renderTabButton(TableView.FIELDING, 'Fielding')}
      </XStack>

      <YStack flex={1} padding="$4">
        {selectedView === TableView.BATTING && <BattingStatsTableWithData />}
        {selectedView === TableView.PITCHING && <PitchingStatsTableWithData />}
        {selectedView === TableView.FIELDING && <FieldingStatsTableWithData />}
      </YStack>
    </YStack>
  );
}

// Export the enum for external use
export { TableView };

export { PlayersOverview };
export default PlayersOverview;
