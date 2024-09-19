import axios from 'axios';
import * as React from 'react';
import { Button, ScrollView, Text, TextInput } from 'react-native';
import { Row, Table } from 'react-native-table-component';
import { handleError } from '../../common/utilities/ErrorHandler';

export default function ViewGameLogs(): JSX.Element {
  const [player, setPlayer] = React.useState('');
  const [date, setDate] = React.useState('');
  const [data, setData] = React.useState<
    Record<string, Record<string, string | number>> | undefined
  >(undefined);
  const [stats, setStats] = React.useState<Array<string>>([]);

  const getGameLog = () => {
    axios
      .post<Record<string, Record<string, string | number>>>(
        'https://e57xg24kgi.execute-api.us-east-1.amazonaws.com/default/baseball-game-logs',
        {
          game_date: date,
          player_id: player,
        }
      )
      .then((response) => {
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
      .catch(handleError);
  };

  return (
    <ScrollView>
      <Text>Retrieve stats for a player</Text>

      <TextInput value={player} onChangeText={setPlayer} />
      <TextInput value={date} onChangeText={setDate} />
      <Button onPress={getGameLog} title="Get Player Data" />

      {data ? (
        <Table>
          <Row data={stats} />

          {Object.keys(data).map((gameId) => (
            <Row key={gameId} data={stats.map((s) => data[gameId][s])} />
          ))}
        </Table>
      ) : null}
    </ScrollView>
  );
}
