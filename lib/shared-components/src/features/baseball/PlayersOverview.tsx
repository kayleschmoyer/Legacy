import React, { useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  TouchableOpacity,
  View,
  Text,
  Platform,
} from '../../platform-components';
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
  containerStyle?: any;
  /**
   * Custom styles for tabs
   */
  tabStyle?: any;
}

export function PlayersOverview({
  initialView = TableView.BATTING,
  containerStyle,
  tabStyle,
}: PlayersOverviewProps): JSX.Element {
  const [selectedView, setSelectedView] = useState(initialView);

  const renderTabButton = (view: TableView, label: string) => (
    <TouchableOpacity
      style={[styles.tab, tabStyle, selectedView === view && styles.activeTab]}
      onPress={() => setSelectedView(view)}
    >
      <Text
        style={[styles.tabText, selectedView === view && styles.activeTabText]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const Container = Platform.OS === 'web' ? View : SafeAreaView;

  return (
    <Container style={[styles.container, containerStyle]}>
      <View style={styles.tabBar}>
        {renderTabButton(TableView.BATTING, 'Batting')}
        {renderTabButton(TableView.PITCHING, 'Pitching')}
        {renderTabButton(TableView.FIELDING, 'Fielding')}
      </View>

      <View style={styles.content}>
        {selectedView === TableView.BATTING && <BattingStatsTableWithData />}
        {selectedView === TableView.PITCHING && <PitchingStatsTableWithData />}
        {selectedView === TableView.FIELDING && <FieldingStatsTableWithData />}
      </View>
    </Container>
  );
}

// Export the enum for external use
export { TableView };

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'lightcyan',
    flex: 1,
  },
  tabBar: {
    borderTopColor: '#333333',
    borderTopWidth: 1,
    flexDirection: 'row',
    backgroundColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    height: 50,
    justifyContent: 'center',
    backgroundColor: '#f8f9fa',
    borderRightWidth: 1,
    borderRightColor: '#e9ecef',
  },
  activeTab: {
    backgroundColor: '#007AFF',
  },
  tabText: {
    color: 'darkblue',
    fontSize: 20,
    fontWeight: 'bold',
  },
  activeTabText: {
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
});

export default PlayersOverview;
