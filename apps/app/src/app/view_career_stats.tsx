import * as React from 'react';
import { Button, ScrollView, Text, TextInput } from 'react-native';
import { Table, Row } from 'react-native-table-component';

export default function ViewCareerStats(): JSX.Element {
  const [player, setPlayer] = React.useState('');
  const [data, setData] = React.useState<
    Record<string, Record<string, string | number>> | undefined
  >(undefined);

  const getGameLog = async () => {
    const response = await fetch(
      'https://e57xg24kgi.execute-api.us-east-1.amazonaws.com/default/career-stats',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          player_id: player,
        }),
      }
    );

    const result = await response.json();
    setData(result);
  };

  return (
    <ScrollView>
      <Text>Retrieve career stats for a player</Text>

      <TextInput value={player} onChangeText={setPlayer}></TextInput>
      <Button onPress={getGameLog} title="Get Player Data" />

      {data?.batting ? (
        <Table>
          <Row data={Object.keys(data.batting)} />
          <Row data={Object.values(data.batting)}></Row>
        </Table>
      ) : null}

      {data?.pitching ? (
        <Table>
          <Row data={Object.keys(data.pitching)} />
          <Row data={Object.values(data.pitching)}></Row>
        </Table>
      ) : null}

      {data?.fielding ? (
        <Table>
          <Row data={Object.keys(data.fielding)} />
          <Row data={Object.values(data.fielding)}></Row>
        </Table>
      ) : null}
    </ScrollView>
  );
}
