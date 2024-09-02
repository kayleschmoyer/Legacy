import { useGlobalSearchParams, useLocalSearchParams } from 'expo-router';
import {  H3, Label, Spinner, Text, View, XStack, YStack } from 'tamagui';
import { useMemo } from 'react';
import { HeaderTitleProps } from '@react-navigation/elements';
import { StyleSheet } from 'react-native';
import {
  LeaguesWithTeamsAndMembersFragment,
  TeamFragment,
} from '../../../../api/db/graphql.generated';
import { useGetLeagueByIdQuery } from '../../../../api/db/leagues/Leagues.generated';

interface TeamNameProps {
  team: TeamFragment;
  leagueData: LeaguesWithTeamsAndMembersFragment;
  standing: number;
}

function TeamName(props: TeamNameProps): JSX.Element {
  const { team, leagueData, standing } = props;

  const owner = useMemo(() => {
    const member = leagueData.leagueMembers.nodes.find(
      (m) => m?.teamId === team.id,
    );

    if (!member) {
      return undefined;
    }

    return member.user?.username;
  }, [leagueData.leagueMembers, team.id]);

  return (
    <XStack>
      <Label style={styles.teamCell} flexShrink={1}>
        {standing}
      </Label>
      <Label style={styles.teamCell} textAlign="left" flexShrink={1}>
        {team.name}
      </Label>
      <Label
        style={{ ...styles.teamCell, verticalAlign: 'super', fontSize: 10 }}
        textAlign="left"
        flex={1}
      >
        {owner || ''}
      </Label>
      <Label style={styles.teamCell} flexShrink={1}>
        0-0
      </Label>
    </XStack>
  );
}

export default function LeagueId(): JSX.Element {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();

  const numLeagueId = parseInt(leagueId, 10);

  const { data, loading } = useGetLeagueByIdQuery({
    variables: {
      id: numLeagueId,
    },
    skip: isNaN(numLeagueId),
  });

  if (loading) {
    return <Spinner />;
  }

  const league = data?.league;
  if (!league) {
    return <Text>Could not find league with id {leagueId}</Text>;
  }

  return (
    <View alignSelf="center">
      <H3>Standings</H3>
      <YStack maxWidth={500}>
        {league.teams.nodes.map((t, idx) =>
          t ? (
            <TeamName key={t.id} team={t} standing={idx} leagueData={league} />
          ) : null,
        )}
      </YStack>
    </View>
  );
}

export function LeagueIdHeader(props: HeaderTitleProps): JSX.Element {
  const { leagueId } = useGlobalSearchParams<{ leagueId: string }>();

  const numLeagueId = parseInt(leagueId, 10);

  const { data } = useGetLeagueByIdQuery({
    variables: {
      id: numLeagueId,
    },
    skip: isNaN(numLeagueId),
  });

  return <H3>{data ? data.league?.name : null}</H3>;
}

const styles = StyleSheet.create({
  teamCell: {
    padding: 15,
  },
});
