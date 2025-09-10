import React, { useState } from 'react';
import {
  Table,
  Platform,
  StyleSheet,
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
} from '../../platform-components';
import { handleError } from '../../utils/ErrorHandler';

// Platform-agnostic React components (no React Native imports)
// Using CSS-in-JS for styling instead of StyleSheet

// Cross-platform table implementation
interface TableProps {
  headers: string[];
  data: Array<Array<string | number>>;
  title?: string;
}

const CrossPlatformTable: React.FC<TableProps> = ({ headers, data, title }) => {
  if (Platform.OS === 'web') {
    return (
      <table
        style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}
      >
        <thead>
          <tr>
            {headers.map((header, index) => (
              <th
                key={index}
                style={{
                  padding: 8,
                  border: '1px solid #ddd',
                  backgroundColor: '#f5f5f5',
                  textAlign: 'left',
                }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  style={{
                    padding: 8,
                    border: '1px solid #ddd',
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // React Native implementation
  return <Table headers={headers} data={data} title={title} />;
};

export interface GameLogsTableProps {
  /**
   * API endpoint for fetching game logs
   * @default 'https://e57xg24kgi.execute-api.us-east-1.amazonaws.com/default/baseball-game-logs'
   */
  apiEndpoint?: string;
}

export function GameLogsTable({
  apiEndpoint = 'https://e57xg24kgi.execute-api.us-east-1.amazonaws.com/default/baseball-game-logs',
}: GameLogsTableProps): JSX.Element {
  const [player, setPlayer] = useState('');
  const [date, setDate] = useState('');
  const [data, setData] = useState<
    Record<string, Record<string, string | number>> | undefined
  >(undefined);
  const [stats, setStats] = useState<Array<string>>([]);
  const [loading, setLoading] = useState(false);

  const getGameLog = async () => {
    if (!player.trim()) {
      alert('Please enter a player ID');
      return;
    }

    setLoading(true);
    try {
      // Use fetch for cross-platform compatibility
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          game_date: date,
          player_id: player,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const serverData: Record<
        string,
        Record<string, string | number>
      > = await response.json();

      const games: Record<string, Record<string, string | number>> = {};
      const gameStats: Set<string> = new Set();

      for (const key of Object.keys(serverData)) {
        gameStats.add(key);
        const statData = serverData[key];

        for (const gameNum of Object.keys(statData)) {
          if (!(gameNum in games)) {
            games[gameNum] = {};
          }

          games[gameNum][key] = statData[gameNum];
        }
      }

      setData(games);
      setStats(Array.from(gameStats));
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  };

  // Prepare table data
  const tableData = data
    ? Object.keys(data).map((gameId) => stats.map((s) => data[gameId][s] || ''))
    : [];

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Retrieve stats for a player</Text>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Player ID:</Text>
        <TextInput
          style={styles.input}
          value={player}
          onChangeText={setPlayer}
          placeholder="Enter player ID"
          editable={!loading}
        />
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Date (optional):</Text>
        <TextInput
          style={styles.input}
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          editable={!loading}
        />
      </View>

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={getGameLog}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Loading...' : 'Get Player Data'}
        </Text>
      </TouchableOpacity>

      {data && stats.length > 0 ? (
        <View style={styles.tableWrapper}>
          <CrossPlatformTable headers={stats} data={tableData} />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  tableWrapper: {
    marginTop: 16,
  },
  // React Native table fallback styles
  tableContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
  },
  headerCell: {
    flex: 1,
    padding: 8,
    fontWeight: 'bold',
    borderRightWidth: 1,
    borderRightColor: '#ddd',
  },
  dataRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  dataCell: {
    flex: 1,
    padding: 8,
    borderRightWidth: 1,
    borderRightColor: '#ddd',
  },
  // React Native table component styles
  header: {
    height: 40,
    backgroundColor: '#f5f5f5',
  },
  headerText: {
    textAlign: 'center',
    fontWeight: 'bold',
  },
  row: {
    height: 30,
  },
  text: {
    textAlign: 'center',
  },
});

export default GameLogsTable;
