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

export default function ViewCareerStats(): React.JSX.Element {
  const [player, setPlayer] = React.useState('');
  const [data, setData] = React.useState<
    Record<string, Record<string, string | number>> | undefined
  >(undefined);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isMounted = useIsMounted();

  const getCareerStats = () => {
    setLoading(true);
    setError(null);
    axiosInstance
      .post<Record<string, Record<string, string | number>>>(
        process.env.EXPO_PUBLIC_STATS_API_URL ||
          'http://localhost:5000/career-stats',
        {
          player_id: player,
        },
      )
      .then((r) => {
        if (!isMounted()) return;
        setData(r.data);
      })
      .catch((err: unknown) => {
        if (!isMounted()) return;
        const message =
          err instanceof Error ? err.message : 'An unexpected error occurred.';
        LOGGER.error('Failed to fetch career stats:', message);
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
        <Text>Retrieve career stats for a player</Text>

        <TextInput value={player} onChangeText={setPlayer} />
        <Button
          onPress={getCareerStats}
          title={loading ? 'Loading...' : 'Get Player Data'}
          disabled={loading}
        />

        {error != null && <Text style={{ color: 'red' }}>{error}</Text>}

        {data?.batting ? (
          <Table>
            <Row data={Object.keys(data.batting)} />
            <Row data={Object.values(data.batting)} />
          </Table>
        ) : null}

        {data?.pitching ? (
          <Table>
            <Row data={Object.keys(data.pitching)} />
            <Row data={Object.values(data.pitching)} />
          </Table>
        ) : null}

        {data?.fielding ? (
          <Table>
            <Row data={Object.keys(data.fielding)} />
            <Row data={Object.values(data.fielding)} />
          </Table>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
