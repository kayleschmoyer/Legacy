import { SafeAreaView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useState } from 'react';
import { Text } from 'tamagui';
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
    <SafeAreaView style={styles.container}>
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={styles.tab}
          onPress={() => setSelectedView(TableView.BATTING)}
        >
          <Text style={styles.tabText}>Batting</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tab}
          onPress={() => setSelectedView(TableView.PITCHING)}
        >
          <Text style={styles.tabText}>Pitching</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tab}
          onPress={() => setSelectedView(TableView.FIELDING)}
        >
          <Text style={styles.tabText}>Fielding</Text>
        </TouchableOpacity>
      </View>
      {selectedView === TableView.BATTING && <BattingStatsTableWithData />}
      {selectedView === TableView.PITCHING && <PitchingStatsTableWithData />}
      {selectedView === TableView.FIELDING && <FieldingStatsTableWithData />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'lightcyan',
    flex: 1,
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    height: 50,
    justifyContent: 'center',
  },
  tabBar: {
    borderTopColor: '#333333',
    borderTopWidth: 1,
    flexDirection: 'row',
  },
  tabText: {
    color: 'darkblue',
    fontSize: 20,
    fontWeight: 'bold',
  },
});
