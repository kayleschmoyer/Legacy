import React, { useState, useEffect } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  FlatList,
  Animated,
  Easing,
} from 'react-native';
import { gql, useQuery } from '@apollo/client';

const { width } = Dimensions.get('window');

const GET_CAREER_BATTING_STATS = gql`
  query GetCareerBattingStats {
    players {
      id
      name
      rank
      team
      position
      avg
      homeRuns
      rbi
      runs
      stolenBases
      obp
      slg
      ops
    }
  }
`;

const GET_CAREER_PITCHING_STATS = gql`
  query GetCareerPitchingStats {
    players {
      id
      name
      rank
      team
      position
      wins
      losses
      era
      strikeouts
      whip
    }
  }
`;

export type Player = {
  id: number;
  rank: number;
  name: string;
  position: string;
  team: string;
  avg?: string;
  homeRuns?: number;
  rbi?: number;
  runs?: number;
  stolenBases?: number;
  obp?: string;
  slg?: string;
  ops?: string;
  wins?: number;
  losses?: number;
  era?: string;
  strikeouts?: number;
  whip?: string;
};

type Lineup = {
  C: Player | null;
  '1B': Player | null;
  '2B': Player | null;
  '3B': Player | null;
  SS: Player | null;
  LF: Player | null;
  CF: Player | null;
  RF: Player | null;
  P: Player | null;
};

const defaultTeam = {
  lineup: {
    C: null,
    '1B': null,
    '2B': null,
    '3B': null,
    SS: null,
    LF: null,
    CF: null,
    RF: null,
    P: null,
  },
  bench: [null, null, null],
};

const DraftBoardPage = () => {
  const { data: battingStats, loading: loadingBatting } = useQuery(GET_CAREER_BATTING_STATS);
  const { data: pitchingStats, loading: loadingPitching } = useQuery(GET_CAREER_PITCHING_STATS);

  const [selectedTeam, setSelectedTeam] = useState<string | undefined>(undefined);
  const [searchText, setSearchText] = useState('');
  const [view, setView] = useState<'players' | 'team'>('players');
  const [currentTeam, setCurrentTeam] = useState<{ lineup: Lineup; bench: (Player | null)[] }>(defaultTeam);
  const [draftStarted, setDraftStarted] = useState(false);
  const [timer, setTimer] = useState(30);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [draftPicks, setDraftPicks] = useState<Player[]>([]);
  const animatedValue = useState(new Animated.Value(0))[0];
  const scrollX = useState(new Animated.Value(0))[0];

  useEffect(() => {
    const playersList = [...(battingStats?.players || []), ...(pitchingStats?.players || [])];
    setAvailablePlayers(playersList);
  }, [battingStats, pitchingStats]);

  useEffect(() => {
    Animated.loop(
      Animated.timing(scrollX, {
        toValue: width * 2,
        duration: 35000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [scrollX]);

  const filteredPlayers = availablePlayers.filter((player) => {
    const matchesTeam = selectedTeam ? player.team === selectedTeam : true;
    const matchesSearch = player.name.toLowerCase().includes(searchText.toLowerCase());
    return matchesTeam && matchesSearch;
  });

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (draftStarted && timer > 0) {
      interval = setInterval(() => {
        setTimer((prevTimer) => prevTimer - 1);
        if (timer <= 10) {
          Animated.loop(
            Animated.sequence([
              Animated.timing(animatedValue, {
                toValue: 1,
                duration: 500,
                easing: Easing.ease,
                useNativeDriver: false,
              }),
              Animated.timing(animatedValue, {
                toValue: 0,
                duration: 500,
                easing: Easing.ease,
                useNativeDriver: false,
              }),
            ]),
            { iterations: 3 }
          ).start();
        }
      }, 1000);
    } else if (timer === 0) {
      handleAutoPick();
    }
    return () => clearInterval(interval);
  }, [timer, draftStarted]);

  const handleStartDraft = () => {
    setDraftStarted(true);
    setTimer(30);
    animatedValue.setValue(0);
  };

  const handleAutoPick = () => {
    const player = filteredPlayers[currentPlayerIndex % filteredPlayers.length];
    handleSelectPlayer(player);
    setCurrentPlayerIndex((prevIndex) => prevIndex + 1);
    setTimer(30);
  };

  const handleSelectPlayer = (player: Player) => {
    alert(`Selected Player: ${player.name}`);
    const newLineup = { ...currentTeam.lineup };
    for (const position in newLineup) {
      if (newLineup[position as keyof Lineup] === null) {
        newLineup[position as keyof Lineup] = player;
        break;
      }
    }
    setCurrentTeam({ ...currentTeam, lineup: newLineup });
    setTimer(30);

    setDraftPicks((prevPicks) => [...prevPicks, player]);

    // Remove the selected player from available players
    setAvailablePlayers((prevPlayers) => prevPlayers.filter((p) => p.id !== player.id));
  };

  const handleViewChange = (newView: 'players' | 'team') => {
    setView(newView);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 50 }}>
        <View style={styles.header}>
          <TouchableOpacity
            style={[styles.tab, view === 'players' && styles.activeTab]}
            onPress={() => handleViewChange('players')}
          >
            <Text style={styles.tabText}>Available Players</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, view === 'team' && styles.activeTab]}
            onPress={() => handleViewChange('team')}
          >
            <Text style={styles.tabText}>My Team</Text>
          </TouchableOpacity>
        </View>

        {view === 'players' && (
          <>
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search players by name, team, or position..."
                value={searchText}
                onChangeText={(text) => setSearchText(text)}
              />
            </View>

            {!draftStarted && (
              <TouchableOpacity style={styles.startDraftButton} onPress={handleStartDraft}>
                <Text style={styles.startDraftText}>Start Draft</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {draftStarted && (
          <Animated.Text
            style={[
              styles.timer,
              {
                color: animatedValue.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['#007bff', '#ff0000'],
                }),
              },
            ]}
          >
            Time Left: {timer} seconds
          </Animated.Text>
        )}

        {view === 'players' ? (
          <View style={styles.tableContainer}>
            <View style={styles.tableRow}>
              <Text style={styles.tableHeader}>Rank</Text>
              <Text style={styles.tableHeader}>Player Info</Text>
              <Text style={styles.tableHeader}>AVG</Text>
              <Text style={styles.tableHeader}>HR</Text>
              <Text style={styles.tableHeader}>RBI</Text>
              <Text style={styles.tableHeader}>Runs</Text>
              <Text style={styles.tableHeader}>SB</Text>
              <Text style={styles.tableHeader}>OBP</Text>
              <Text style={styles.tableHeader}>SLG</Text>
              <Text style={styles.tableHeader}>OPS</Text>
              <Text style={styles.tableHeader}>Wins</Text>
              <Text style={styles.tableHeader}>Losses</Text>
              <Text style={styles.tableHeader}>ERA</Text>
              <Text style={styles.tableHeader}>SO</Text>
              <Text style={styles.tableHeader}>WHIP</Text>
            </View>

            <FlatList
              data={filteredPlayers}
              ListEmptyComponent={<Text style={styles.noData}>No Data Available</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => handleSelectPlayer(item)}>
                  <View style={styles.tableRow}>
                    <Text style={styles.tableData}>{item.rank}</Text>
                    <View style={styles.playerInfoContainer}>
                      <Text style={styles.playerName}>{item.name}</Text>
                      <Text style={styles.playerTeam}>{item.team}</Text>
                      <Text style={styles.playerPosition}>{item.position}</Text>
                    </View>
                    <Text style={styles.tableData}>{item.avg || 'N/A'}</Text>
                    <Text style={styles.tableData}>{item.homeRuns || 'N/A'}</Text>
                    <Text style={styles.tableData}>{item.rbi || 'N/A'}</Text>
                    <Text style={styles.tableData}>{item.runs || 'N/A'}</Text>
                    <Text style={styles.tableData}>{item.stolenBases || 'N/A'}</Text>
                    <Text style={styles.tableData}>{item.obp || 'N/A'}</Text>
                    <Text style={styles.tableData}>{item.slg || 'N/A'}</Text>
                    <Text style={styles.tableData}>{item.ops || 'N/A'}</Text>
                    <Text style={styles.tableData}>{item.wins || 'N/A'}</Text>
                    <Text style={styles.tableData}>{item.losses || 'N/A'}</Text>
                    <Text style={styles.tableData}>{item.era || 'N/A'}</Text>
                    <Text style={styles.tableData}>{item.strikeouts || 'N/A'}</Text>
                    <Text style={styles.tableData}>{item.whip || 'N/A'}</Text>
                  </View>
                </TouchableOpacity>
              )}
              keyExtractor={(item) => item.id.toString()}
            />
          </View>
        ) : (
          <View style={styles.teamContainer}>
            <Text style={styles.teamTitle}>Current Team Lineup</Text>
            {Object.keys(currentTeam.lineup).map((position) => (
              <View
                key={position}
                style={[styles.teamRow, currentTeam.lineup[position as keyof Lineup] && styles.filledPosition]}
              >
                <Text style={styles.teamPosition}>{position}</Text>
                <Text style={styles.teamPlayer}>
                  {currentTeam.lineup[position as keyof Lineup]?.name || 'Empty'}
                </Text>
              </View>
            ))}
            <Text style={styles.benchTitle}>Bench</Text>
            {currentTeam.bench.map((player, index) => (
              <View key={index} style={styles.teamRow}>
                <Text style={styles.teamPlayer}>{player?.name || 'Empty'}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.draftHistoryContainer}>
        <Text style={styles.draftHistoryLabel}>Draft History:</Text>

        <Animated.View
          style={[
            styles.draftHistoryScroller,
            { transform: [{ translateX: scrollX.interpolate({ inputRange: [0, width * 2], outputRange: [0, -width * 2] }) }] },
          ]}
        >
          {draftPicks.length > 0 ? (
            <View style={styles.scrollWrapper}>
              {draftPicks.map((pick, index) => (
                <Text key={index} style={styles.draftHistoryText}>
                  {`Pick ${index + 1}: ${pick.name} - ${pick.team} - ${pick.position}   `}
                </Text>
              ))}
            </View>
          ) : (
            <View style={styles.scrollWrapper}>
              <Text style={styles.draftHistoryText}>
                {draftStarted ? "No picks yet." : "Draft has not started."}
              </Text>
            </View>
          )}
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  tab: {
    padding: 10,
    backgroundColor: '#808080',
    borderRadius: 5,
    flex: 1,
    marginHorizontal: 5,
  },
  activeTab: {
    backgroundColor: '#28a745',
  },
  tabText: {
    color: '#ffffff',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  timer: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  startDraftButton: {
    backgroundColor: '#28a745',
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
    textAlign: 'center',
  },
  startDraftText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  searchContainer: {
    marginHorizontal: 10,
    marginBottom: 20,
  },
  searchInput: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 10,
    fontSize: 16,
    elevation: 2,
    borderColor: '#ccc',
    borderWidth: 1,
  },
  tableContainer: {
    marginTop: 20,
    marginHorizontal: 10,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  tableHeader: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  tableData: {
    fontSize: 14,
  },
  playerInfoContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingLeft: 10,
  },
  playerName: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  playerTeam: {
    fontSize: 12,
    color: '#6c757d',
  },
  playerPosition: {
    fontSize: 12,
    color: '#6c757d',
  },
  noData: {
    textAlign: 'center',
    marginVertical: 20,
    color: 'red',
  },
  teamContainer: {
    margin: 10,
    backgroundColor: '#f2f2f2',
  },
  teamTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  teamRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  teamPosition: {
    fontWeight: 'bold',
  },
  teamPlayer: {
    fontSize: 14,
  },
  benchTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 10,
    textAlign: 'center',
  },
  filledPosition: {
    backgroundColor: '#28a745',
    color: '#ffffff',
  },
  draftHistoryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000',
    paddingVertical: 10,
    position: 'absolute',
    bottom: 0,
    width: '100%',
    overflow: 'hidden',
  },
  draftHistoryLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 10,
  },
  draftHistoryScroller: {
    flex: 1,
  },
  scrollWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  draftHistoryText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default DraftBoardPage;
