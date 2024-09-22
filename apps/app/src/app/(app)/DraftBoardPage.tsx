import React, { useState } from 'react';
import {
  Dimensions,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
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
  [position: string]: Player | null;
};

const defaultLineup: Lineup = {
  '1B': null,
  '2B': null,
  '3B': null,
  C: null,
  CF: null,
  DH: null,
  OF1: null,
  OF2: null,
  OF3: null,
  SS: null,
  P: null,
};

const DraftBoard = () => {
  const { data: battingStats, loading: loadingBatting, error: errorBatting } = useQuery(GET_CAREER_BATTING_STATS);
  const { data: pitchingStats, loading: loadingPitching, error: errorPitching } = useQuery(GET_CAREER_PITCHING_STATS);

  if (loadingBatting || loadingPitching) return <Text>Loading...</Text>;
  if (errorBatting || errorPitching) return <Text>Error loading data</Text>;

  const playersList: Player[] = [
    ...(battingStats?.players || []),
    ...(pitchingStats?.players || [])
  ];

  const [selectedTeam, setSelectedTeam] = useState<string | undefined>(undefined);
  const [searchText, setSearchText] = useState('');

  const filteredPlayers = playersList.filter(player => {
    const matchesTeam = selectedTeam ? player.team === selectedTeam : true;
    const matchesSearch = player.name.toLowerCase().includes(searchText.toLowerCase());
    return matchesTeam && matchesSearch;
  });

  return (
    <ScrollView>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search Player"
          value={searchText}
          onChangeText={setSearchText}
        />
        <Picker
          selectedValue={selectedTeam}
          style={styles.teamSelector}
          onValueChange={(itemValue: string) => setSelectedTeam(itemValue)}
        >
          <Picker.Item label="All Teams" value={undefined} />
          <Picker.Item label="Yankees" value="NYY" />
          <Picker.Item label="Tigers" value="DET" />
        </Picker>
      </View>

      <FlatList
        data={filteredPlayers}
        renderItem={({ item }) => (
          <View style={styles.playerRow}>
            <Text>{item.rank}. {item.name} ({item.position})</Text>
            <Text>Team: {item.team}</Text>
            {item.avg && (
              <>
                <Text>Avg: {item.avg}</Text>
                <Text>HR: {item.homeRuns}</Text>
                <Text>RBI: {item.rbi}</Text>
              </>
            )}
            {item.era && (
              <>
                <Text>Wins: {item.wins}</Text>
                <Text>Losses: {item.losses}</Text>
                <Text>ERA: {item.era}</Text>
                <Text>Strikeouts: {item.strikeouts}</Text>
              </>
            )}
          </View>
        )}
        keyExtractor={(item) => item.id.toString()}
      />

      <TouchableOpacity style={styles.startDraftButton}>
        <Text style={styles.startDraftText}>Start Draft</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  searchContainer: {
    padding: 10,
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
  teamSelector: {
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    padding: 10,
  },
  playerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 10,
    marginBottom: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  startDraftButton: {
    backgroundColor: '#007bff',
    borderRadius: 10,
    marginBottom: 16,
    padding: 16,
  },
  startDraftText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default DraftBoard;
