import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Dimensions, Picker } from 'react-native';

// Get device dimensions
const { height, width } = Dimensions.get('window');

type Player = {
  id: number;
  rank: number;
  name: string;
  position: string;
  team: string;
  avg: string;
  homeRuns: number;
  rbi: number;
  runs: number;
  stolenBases: number;
  obp: string;
  slg: string;
  ops: string;
};

type Lineup = {
  [position: string]: Player | null;
};

const defaultLineup: Lineup = {
  '1B': null,
  '2B': null,
  '3B': null,
  'C': null,
  'CF': null,
  'DH': null,
  'OF1': null,
  'OF2': null,
  'OF3': null,
  'SS': null,
};

// Adding more players for the draft pool
const playersList: Player[] = [
  { avg: '.342', homeRuns: 714, id: 1, name: 'Babe Ruth', obp: '.474', ops: '1.164', position: 'OF', rank: 1, rbi: 2214, runs: 2174, slg: '.690', stolenBases: 123, team: 'NYY' },
  { avg: '.366', homeRuns: 117, id: 2, name: 'Ty Cobb', obp: '.433', ops: '.945', position: 'OF', rank: 2, rbi: 1938, runs: 2246, slg: '.512', stolenBases: 897, team: 'DET' },
  { avg: '.340', homeRuns: 493, id: 3, name: 'Lou Gehrig', obp: '.447', ops: '1.080', position: '1B', rank: 3, rbi: 1995, runs: 1888, slg: '.632', stolenBases: 102, team: 'NYY' },
  { avg: '.305', homeRuns: 755, id: 4, name: 'Hank Aaron', obp: '.374', ops: '.928', position: 'OF', rank: 4, rbi: 2297, runs: 2174, slg: '.555', stolenBases: 240, team: 'ATL' },
  { avg: '.302', homeRuns: 660, id: 5, name: 'Willie Mays', obp: '.384', ops: '.941', position: 'OF', rank: 5, rbi: 1903, runs: 2062, slg: '.557', stolenBases: 338, team: 'SFG' },
  { avg: '.298', homeRuns: 536, id: 6, name: 'Mickey Mantle', obp: '.421', ops: '.977', position: 'CF', rank: 6, rbi: 1509, runs: 1676, slg: '.557', stolenBases: 153, team: 'NYY' },
  { avg: '.309', homeRuns: 512, id: 7, name: 'Ted Williams', obp: '.482', ops: '1.116', position: 'OF', rank: 7, rbi: 1839, runs: 1798, slg: '.634', stolenBases: 24, team: 'BOS' },
  { avg: '.301', homeRuns: 452, id: 8, name: 'Carl Yastrzemski', obp: '.379', ops: '.841', position: 'OF', rank: 8, rbi: 1844, runs: 1816, slg: '.462', stolenBases: 168, team: 'BOS' },
  { avg: '.318', homeRuns: 331, id: 9, name: 'Joe DiMaggio', obp: '.398', ops: '.977', position: 'OF', rank: 9, rbi: 1537, runs: 1390, slg: '.579', stolenBases: 30, team: 'NYY' },
  { avg: '.307', homeRuns: 268, id: 10, name: 'Duke Snider', obp: '.380', ops: '.919', position: 'OF', rank: 10, rbi: 1333, runs: 1259, slg: '.553', stolenBases: 99, team: 'BRO' },
  // Add more players as needed
];

export const DraftBoard: React.FC = () => {
  const [teamRosters, setTeamRosters] = useState<{ [teamId: number]: Lineup }>({
    1: { ...defaultLineup },
    2: { ...defaultLineup },
    3: { ...defaultLineup },
  });

  const [players, setPlayers] = useState(playersList);
  const [searchQuery, setSearchQuery] = useState('');
  const [draftHistory, setDraftHistory] = useState<Player[]>([]);
  const [timer, setTimer] = useState(30);
  const [isPicking, setIsPicking] = useState(false);
  const [currentTeam, setCurrentTeam] = useState(1);
  const [viewingTeam, setViewingTeam] = useState(1); // Viewing team
  const [activeTab, setActiveTab] = useState<'draft' | 'roster'>('draft');
  const [isDraftStarted, setIsDraftStarted] = useState(false); // To track draft start

  const positionMap: { [key: string]: string[] } = {
    '1B': ['1B'],
    '2B': ['2B'],
    '3B': ['3B'],
    'C': ['C'],
    'CF': ['CF'],
    'DH': ['DH'],
    'OF': ['OF1', 'OF2', 'OF3'],
    'SS': ['SS'],
  };

  const handlePickPlayer = useCallback(
    (player: Player) => {
      const roster = teamRosters[currentTeam];
      if (!roster) return;
      const availableSlots = positionMap[player.position] || [];
      const positionToFill = availableSlots.find((slot) => !roster[slot]);
      if (positionToFill) {
        const updatedRoster = {
          ...roster,
          [positionToFill]: player,
        };
        setTeamRosters({
          ...teamRosters,
          [currentTeam]: updatedRoster,
        });
        setDraftHistory([...draftHistory, player]);
        setPlayers(players.filter((p) => p.id !== player.id));
        setTimer(30);
        setCurrentTeam(currentTeam === 3 ? 1 : currentTeam + 1);
        setIsPicking(false);
      }
    },
    [currentTeam, draftHistory, players, positionMap, teamRosters]
  );

  const autoPickPlayer = useCallback(() => {
    if (players.length > 0) {
      const playerToPick = players[0];
      handlePickPlayer(playerToPick);
    }
  }, [players, handlePickPlayer]);

  useEffect(() => {
    if (isPicking && timer > 0) {
      const countdown = setTimeout(() => setTimer(timer - 1), 1000);
      return () => clearTimeout(countdown);
    }
    if (timer === 0) {
      autoPickPlayer();
    }
  }, [timer, isPicking, autoPickPlayer]);

  const filteredPlayers = players.filter((player) =>
    player.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const startDraft = () => {
    setIsDraftStarted(true);
    setIsPicking(true);
    setTimer(30);
  };

  return (
    <View style={styles.container}>
      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'draft' && styles.activeTab]}
          onPress={() => setActiveTab('draft')}
        >
          <Text style={styles.tabText}>Draft Board</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'roster' && styles.activeTab]}
          onPress={() => setActiveTab('roster')}
        >
          <Text style={styles.tabText}>Roster</Text>
        </TouchableOpacity>
      </View>

      {/* Team Selector */}
      {activeTab === 'roster' && (
        <View style={styles.teamSelector}>
          <Text style={styles.teamSelectorText}>Viewing Team: </Text>
          <Picker
            selectedValue={viewingTeam}
            onValueChange={(itemValue) => setViewingTeam(itemValue)}
            style={styles.picker}
          >
            <Picker.Item label="Team 1" value={1} />
            <Picker.Item label="Team 2" value={2} />
            <Picker.Item label="Team 3" value={3} />
          </Picker>
        </View>
      )}

      {/* Start Draft Button */}
      {!isDraftStarted && (
        <TouchableOpacity style={styles.startDraftButton} onPress={startDraft}>
          <Text style={styles.startDraftText}>Start Draft</Text>
        </TouchableOpacity>
      )}

      {/* Timer and Team on the Clock */}
      {isDraftStarted && (
        <View style={styles.timerContainer}>
          <Text style={styles.timerText}>Team {currentTeam} is on the clock!</Text>
          <Text style={styles.timerText}>Time left: {timer}s</Text>
        </View>
      )}

      {/* Render based on Active Tab */}
      {activeTab === 'draft' ? (
        <View style={{ flex: 1 }}>
          {/* Draft Board */}
          <TextInput
            style={styles.searchInput}
            placeholder="Search for a player..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <View>
            <View style={styles.tableHeaders}>
              <Text style={styles.rankHeader}>RK</Text>
              <Text style={styles.playerHeader}>Player</Text>
              <Text style={styles.statHeader}>AVG</Text>
              <Text style={styles.statHeader}>HR</Text>
              <Text style={styles.statHeader}>RBI</Text>
              <Text style={styles.statHeader}>SB</Text>
              <Text style={styles.statHeader}>OPS</Text>
            </View>
          </View>

          <FlatList
            data={filteredPlayers}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.playerRow}
                onPress={() => handlePickPlayer(item)}
              >
                <Text style={styles.rankColumn}>{item.rank}</Text>
                <View style={styles.playerColumn}>
                  <Text style={styles.playerName}>{item.name}</Text>
                  <Text style={styles.playerInfo}>
                    {item.position} - {item.team}
                  </Text>
                </View>
                <Text style={styles.statColumn}>{item.avg}</Text>
                <Text style={styles.statColumn}>{item.homeRuns}</Text>
                <Text style={styles.statColumn}>{item.rbi}</Text>
                <Text style={styles.statColumn}>{item.stolenBases}</Text>
                <Text style={styles.statColumn}>{item.ops}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }}>
          {/* Roster */}
          <Text style={styles.rosterTitle}>Team {viewingTeam} Roster</Text>
          <View style={styles.rosterGrid}>
            {Object.entries(teamRosters[viewingTeam]).map(([position, player]) => (
              <View key={position} style={styles.rosterSlot}>
                <Text style={styles.rosterPosition}>{position}</Text>
                <Text style={styles.rosterPlayer}>
                  {player ? `${player.name} (${player.position})` : '---'}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
};

// Styles
const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f7f7f7',
    flex: 1,
    padding: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    padding: 16,
    backgroundColor: '#ddd',
    alignItems: 'center',
    borderRadius: 10,
    marginHorizontal: 5,
  },
  activeTab: {
    backgroundColor: '#007bff',
  },
  tabText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  teamSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: '#f0f0f0',
    padding: 10,
    borderRadius: 10,
  },
  teamSelectorText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  picker: {
    height: 50,
    width: 150,
  },
  searchInput: {
    backgroundColor: '#fff',
    borderColor: '#ccc',
    borderRadius: 25,
    borderWidth: 1,
    fontSize: 16,
    height: 50,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  tableHeaders: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  rankHeader: {
    color: '#333',
    flex: 0.5,
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'left',
  },
  playerHeader: {
    color: '#333',
    flex: 2.5,
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'left',
  },
  statHeader: {
    color: '#333',
    flex: 1,
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  playerRow: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    padding: 16,
  },
  rankColumn: {
    color: '#333',
    flex: 0.5,
    fontSize: 14,
  },
  playerColumn: {
    flex: 2.5,
  },
  playerName: {
    color: '#333',
    fontSize: 16,
    fontWeight: 'bold',
  },
  playerInfo: {
    color: '#888',
    fontSize: 12,
  },
  statColumn: {
    color: '#333',
    flex: 1,
    fontSize: 14,
    textAlign: 'center',
  },
  rosterTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  rosterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
  },
  rosterSlot: {
    width: width / 2.3, // Adjust width dynamically
    marginBottom: 8,
    padding: 16,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  rosterPosition: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  rosterPlayer: {
    fontSize: 14,
    marginTop: 4,
    color: '#555',
  },
  startDraftButton: {
    backgroundColor: '#007bff',
    padding: 16,
    borderRadius: 10,
    marginBottom: 16,
  },
  startDraftText: {
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 16,
  },
  timerContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  timerText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default DraftBoard;
