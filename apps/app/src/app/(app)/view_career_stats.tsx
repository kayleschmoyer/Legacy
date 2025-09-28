import axios from 'axios';
import * as React from 'react';
import { Button, ScrollView, Text, TextInput } from 'react-native';
import { Row, Table } from 'react-native-table-component';
import { handleError } from '../../common/utilities/ErrorHandler';

export default function ViewCareerStats(): React.JSX.Element {
  const [player, setPlayer] = React.useState('');
  const [data, setData] = React.useState<
    Record<string, Record<string, string | number>> | undefined
  >(undefined);

  const getGameLog = () => {
    axios
      .post<Record<string, Record<string, string | number>>>(
        process.env.EXPO_PUBLIC_STATS_API_URL ||
          'http://localhost:5000/career-stats',
        {
          player_id: player,
        },
      )
      .then((r) => {
        setData(r.data);
      })
      .catch(handleError);
  };

  return (
    <ScrollView>
      <Text>Retrieve career stats for a player</Text>

      <TextInput value={player} onChangeText={setPlayer} />
      <Button onPress={getGameLog} title="Get Player Data" />

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
  );
}
