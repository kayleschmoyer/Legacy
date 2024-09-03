import { SafeAreaView, StyleSheet, TouchableOpacity } from 'react-native';
import {  Text, View } from 'tamagui';
import {  useState } from 'react';
import {
  BattingStatsTableWithData,
  FieldingStatsTableWithData,
  PitchingStatsTableWithData,
} from 'apps/app/src/features/stats/UsefulTables';

enum TableView {
  BATTING,
  PITCHING,
  FIELDING,
}

export default function Players(): JSX.Element {
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
    flex: 1,
    backgroundColor: 'lightcyan',
  },
  tabBar: {
    flexDirection: 'row',
    borderTopColor: '#333333',
    borderTopWidth: 1,
  },
  tab: {
    height: 50,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    color: 'darkblue',
    fontSize: 20,
    fontWeight: 'bold',
  },
});
