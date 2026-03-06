import React, { useState } from 'react';
import { Button, Input, ScrollView, Spinner, Text, YStack } from 'tamagui';
import { Platform, Table } from '../../platform-components';
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
   * @default 'http://localhost:5000/baseball-game-logs'
   */
  apiEndpoint?: string;
}

function GameLogsTable({
  apiEndpoint = process.env.VITE_STATS_API_URL ||
    'http://localhost:5000/baseball-game-logs',
}: GameLogsTableProps) {
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

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- fetch response.json() returns any
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
    <ScrollView flex={1} padding="$4">
      <Text
        fontSize="$5"
        fontWeight="bold"
        marginBottom="$4"
        textAlign="center"
      >
        Retrieve stats for a player
      </Text>

      <YStack marginBottom="$4">
        <Text fontSize="$4" fontWeight="600" marginBottom="$2">
          Player ID:
        </Text>
        <Input
          borderWidth={1}
          borderColor="$gray8"
          borderRadius="$3"
          padding="$3"
          fontSize="$4"
          backgroundColor="$white"
          value={player}
          onChangeText={setPlayer}
          placeholder="Enter player ID"
          editable={!loading}
        />
      </YStack>

      <YStack marginBottom="$4">
        <Text fontSize="$4" fontWeight="600" marginBottom="$2">
          Date (optional):
        </Text>
        <Input
          borderWidth={1}
          borderColor="$gray8"
          borderRadius="$3"
          padding="$3"
          fontSize="$4"
          backgroundColor="$white"
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          editable={!loading}
        />
      </YStack>

      <Button
        backgroundColor={loading ? '$gray8' : '$blue10'}
        paddingVertical="$3"
        paddingHorizontal="$6"
        borderRadius="$3"
        alignItems="center"
        marginBottom="$4"
        onPress={() => void getGameLog()}
        disabled={loading}
        opacity={loading ? 0.5 : 1}
      >
        {loading ? (
          <Spinner size="small" color="$white" />
        ) : (
          <Text color="$white" fontSize="$4" fontWeight="600">
            Get Player Data
          </Text>
        )}
      </Button>

      {data && stats.length > 0 ? (
        <YStack marginTop="$4">
          <CrossPlatformTable headers={stats} data={tableData} />
        </YStack>
      ) : null}
    </ScrollView>
  );
}

export { GameLogsTable };
export default GameLogsTable;
