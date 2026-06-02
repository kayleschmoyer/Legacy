import * as React from 'react';
import {
  Button,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
} from 'react-native';
import { Row, Table } from 'react-native-table-component';
import { LOGGER } from '@legacy-sports/logging';
import { axiosInstance } from '../../common/utilities/axiosInstance';
import { useIsMounted } from '../../common/hooks/useIsMounted';

export default function ViewGameLogs(): React.JSX.Element {
  const [player, setPlayer] = React.useState('');
  const [date, setDate] = React.useState('');
  const [data, setData] = React.useState<
    Record<string, Record<string, string | number>> | undefined
  >(undefined);
  const [stats, setStats] = React.useState<Array<string>>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isMounted = useIsMounted();

  const getGameLog = () => {
    setLoading(true);
    setError(null);
    axiosInstance
      .post<Record<string, Record<string, string | number>>>(
        process.env.EXPO_PUBLIC_STATS_API_URL ||
          'http://localhost:5000/baseball-game-logs',
        {
          game_date: date,
          player_id: player,
        },
      )
      .then((response) => {
        if (!isMounted()) return;

        const serverData = response.data;

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
      })
      .catch((err: unknown) => {
        if (!isMounted()) return;
        const message =
          err instanceof Error ? err.message : 'An unexpected error occurred.';
        LOGGER.error('Failed to fetch game logs:', message);
        setError(message);
      })
      .finally(() => {
        if (isMounted()) setLoading(false);
      });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView>
        <Text>Retrieve stats for a player</Text>

        <TextInput value={player} onChangeText={setPlayer} />
        <TextInput value={date} onChangeText={setDate} />
        <Button
          onPress={getGameLog}
          title={loading ? 'Loading...' : 'Get Player Data'}
          disabled={loading}
        />

        {error != null && <Text style={{ color: 'red' }}>{error}</Text>}

        {data ? (
          <Table>
            <Row data={stats} />

            {Object.keys(data).map((gameId) => (
              <Row key={gameId} data={stats.map((s) => data[gameId][s])} />
            ))}
          </Table>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';
