import * as React from 'react';
import { Button, ScrollView, Text, TextInput } from 'react-native';
import { Table, Row } from 'react-native-table-component';

export default function ViewGameLogs(): JSX.Element {
  const [player, setPlayer] = React.useState('');
  const [date, setDate] = React.useState('');
  const [data, setData] = React.useState<
    Record<string, Record<string, string | number>> | undefined
  >(undefined);
  const [stats, setStats] = React.useState<Array<string>>([]);

  const getGameLog = async () => {
    const response = await fetch(
      'https://e57xg24kgi.execute-api.us-east-1.amazonaws.com/default/baseball-game-logs',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          game_date: date,
          player_id: player,
        }),
      }
    );

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
  };

  return (
    <ScrollView>
      <Text>Retrieve stats for a player</Text>

      <TextInput value={player} onChangeText={setPlayer}></TextInput>
      <TextInput value={date} onChangeText={setDate}></TextInput>
      <Button onPress={getGameLog} title="Get Player Data" />

      {data ? (
        <Table>
          <Row data={stats} />

          {Object.keys(data).map((gameId) => (
            <Row key={gameId} data={stats.map((s) => data[gameId][s])}></Row>
          ))}
        </Table>
      ) : null}
    </ScrollView>
  );
}
