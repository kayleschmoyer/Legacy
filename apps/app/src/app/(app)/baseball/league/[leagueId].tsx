import { useGlobalSearchParams, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { HeaderTitleProps } from '@react-navigation/elements';
import { StyleSheet, View } from 'react-native';
import { Spinner, Text } from 'tamagui';
import {
  LeagueFragment,
  TeamFragment,
} from '../../../../api/db/graphql.generated';
import { useGetLeagueByIdQuery } from '../../../../api/db/leagues/Leagues.generated';

interface TeamNameProps {
  team: TeamFragment;
  leagueData: LeagueFragment;
  standing: number;
}

function TeamName(props: TeamNameProps): JSX.Element {
  const { team, leagueData, standing } = props;

  const owner = useMemo(() => {
    const member = leagueData.leagueMembers?.nodes.find(
      (m) => m?.teamId === team.id
    );

    if (!member) {
      return undefined;
    }

    return member.user?.username;
  }, [leagueData.leagueMembers, team.id]);

  return (
    <View>
      <Text style={styles.teamCell}>{standing}</Text>
      <Text style={styles.teamCell}>{team.name}</Text>
      <Text style={styles.teamCell}>{owner || ''}</Text>
      <Text style={styles.teamCell}>0-0</Text>
    </View>
  );
}

export default function LeagueId(): JSX.Element {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const params = useLocalSearchParams();
  const leagueId = params.leagueId;

  const leagueIdStr =
    typeof leagueId === 'string'
      ? leagueId
      : Array.isArray(leagueId)
      ? leagueId[0]
      : '';
  const numLeagueId = parseInt(leagueIdStr, 10);

  const { data, loading } = useGetLeagueByIdQuery({
    skip: isNaN(numLeagueId),
    variables: {
      id: numLeagueId,
    },
  });

  if (loading) {
    return <Spinner />;
  }

  const league = data?.league;
  if (!league) {
    return <Text>Could not find league with id {leagueId}</Text>;
  }

  return (
    <View>
      <Text category="h3">Standings</Text>
      <View>
        {league.teams?.nodes.map((t, idx) =>
          t ? (
            <TeamName key={t.id} team={t} standing={idx} leagueData={league} />
          ) : null
        )}
      </View>
    </View>
  );
}

export function LeagueIdHeader(props: HeaderTitleProps): JSX.Element {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const params = useGlobalSearchParams();
  const leagueId = params.leagueId;

  const leagueIdStr =
    typeof leagueId === 'string'
      ? leagueId
      : Array.isArray(leagueId)
      ? leagueId[0]
      : '';
  const numLeagueId = parseInt(leagueIdStr, 10);

  const { data } = useGetLeagueByIdQuery({
    skip: isNaN(numLeagueId),
    variables: {
      id: numLeagueId,
    },
  });

  return <Text category="h3">{data ? data.league?.name : ''}</Text>;
}

const styles = StyleSheet.create({
  teamCell: {
    padding: 15,
  },
});
